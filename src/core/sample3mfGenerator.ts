import { zipSync, strToU8 } from 'fflate';
import { encodePaintState } from './paintColorCodec';

/**
 * Generates a realistic, high-poly multi-color painted 3MF model (similar to a MakerWorld
 * 4-color AMS figurine/sculpt with eyes, belly patch, stripes, and base) entirely in memory
 * so the user can test and verify the color-preserving simplifier with one click.
 *
 * Includes both whole-triangle `paint_color` assignments AND recursive subdivided
 * `paint_color` boundary triangles (testing `TriangleSelector` subdivision decoding).
 */
export function generateSampleMakerWorld3MF(): ArrayBuffer {
  const rings = 90;
  const segments = 120;
  const radius = 28;

  const vertices: number[] = [];
  const triangles: { v1: number; v2: number; v3: number; paint: string }[] = [];

  // Generate an organic sculpted character body (deformed sphere + ears/crest)
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI; // 0 (top) to PI (bottom)

    for (let s = 0; s < segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      // Add subtle organic sculpt ripples + cute ears near top-sides
      const earBump =
        Math.exp(-Math.pow((phi - 0.85) * 4.5, 2)) *
        Math.exp(-Math.pow((Math.abs( cosTheta ) - 0.75) * 6.0, 2)) *
        8.5;

      const snoutBump =
        Math.exp(-Math.pow((phi - 1.45) * 3.8, 2)) *
        Math.exp(-Math.pow(theta - Math.PI, 2) * 3.5) *
        5.5;

      const localR = radius + earBump + snoutBump;

      const x = localR * sinPhi * cosTheta;
      const y = localR * sinPhi * sinTheta;
      // Flatten bottom slightly so it sits on the print bed z = 0
      const rawZ = localR * cosPhi + radius;
      const z = Math.max(0, rawZ);

      vertices.push(x, y, z);
    }
  }

  // Helper to evaluate what color a 3D point on the sculpt is painted:
  // Slot 1 (#10B981 Emerald): Base body color
  // Slot 2 (#F8FAFC White): Belly oval + eye whites
  // Slot 3 (#1E293B Obsidian Black): Eye pupils + decorative rings
  // Slot 4 (#F97316 Bambu Orange): Ear tips + crest badge
  function getPointPaintSlot(x: number, y: number, z: number): number {
    // Left and right eyes on the front (-x side, around z=32..38)
    const leftEyeDist = Math.hypot(y - 9.5, z - 35.5);
    const rightEyeDist = Math.hypot(y + 9.5, z - 35.5);
    if (x < -12) {
      if (leftEyeDist < 3.4 || rightEyeDist < 3.4) {
        return 3; // Slot 3: Black pupil
      }
      if (leftEyeDist < 6.2 || rightEyeDist < 6.2) {
        return 2; // Slot 2: White sclera
      }
    }

    // Belly patch on front (-x)
    const bellyDist = Math.hypot(y / 14.0, (z - 19.0) / 13.0);
    if (x < -8 && bellyDist < 1.0) {
      return 2; // Slot 2: White belly
    }

    // Crest / Ear tips at high Z
    if (z > 49.5) {
      return 4; // Slot 4: Orange tips
    }

    // Decorative belt band
    if (z > 10.5 && z < 13.5 && x >= -8) {
      return 4; // Slot 4: Orange band
    }

    return 1; // Slot 1: Default body color
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const nextS = (s + 1) % segments;
      const i0 = r * segments + s;
      const i1 = (r + 1) * segments + s;
      const i2 = (r + 1) * segments + nextS;
      const i3 = r * segments + nextS;

      const addTri = (a: number, b: number, c: number) => {
        const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
        const bx = vertices[b * 3], by = vertices[b * 3 + 1], bz = vertices[b * 3 + 2];
        const cx = vertices[c * 3], cy = vertices[c * 3 + 1], cz = vertices[c * 3 + 2];

        const sa = getPointPaintSlot(ax, ay, az);
        const sb = getPointPaintSlot(bx, by, bz);
        const sc = getPointPaintSlot(cx, cy, cz);

        // If all 3 corners have the same slot, encode whole-triangle paint_color
        if (sa === sb && sb === sc) {
          triangles.push({
            v1: a,
            v2: b,
            v3: c,
            paint: sa === 1 ? '' : encodePaintState(sa),
          });
        } else {
          // Straddles a paint border! Let's encode an actual 4-child subdivided paint_color tree
          // (root nibble '3' = split_sides 3, special_side 0) so the user can see recursive
          // subdivision resolution in action!
          const m01 = getPointPaintSlot(0.5 * (ax + bx), 0.5 * (ay + by), 0.5 * (az + bz));
          const m12 = getPointPaintSlot(0.5 * (bx + cx), 0.5 * (by + cy), 0.5 * (bz + cz));
          const m20 = getPointPaintSlot(0.5 * (cx + ax), 0.5 * (cy + ay), 0.5 * (cz + az));
          const center = getPointPaintSlot(
            (ax + bx + cx) / 3,
            (ay + by + cy) / 3,
            (az + bz + cz) / 3
          );

          // Child states: c0=sa, c1=sb, c2=sc, c3=center
          // Stream is packed in reverse child order: child3, child2, child1, child0, then root '3'
          const encLeaf = (st: number) => (st <= 1 ? '0' : encodePaintState(st));
          const treeHex =
            encLeaf(sa) +
            encLeaf(sb) +
            encLeaf(sc) +
            encLeaf(center || m01 || m12 || m20) +
            '3';
          triangles.push({
            v1: a,
            v2: b,
            v3: c,
            paint: treeHex,
          });
        }
      };

      if (r > 0) addTri(i0, i1, i2);
      if (r < rings - 1) addTri(i0, i2, i3);
    }
  }

  // Build 3D/3dmodel.model XML
  const vLines = vertices
    .reduce<string[]>((acc, _, idx) => {
      if (idx % 3 === 0) {
        acc.push(
          `     <vertex x="${vertices[idx].toFixed(4)}" y="${vertices[idx + 1].toFixed(4)}" z="${vertices[idx + 2].toFixed(4)}"/>`
        );
      }
      return acc;
    }, [])
    .join('\n');

  const tLines = triangles
    .map((t) =>
      t.paint
        ? `     <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}" paint_color="${t.paint}"/>`
        : `     <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`
    )
    .join('\n');

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
 <metadata name="Application">BambuStudio-01.09.05.51</metadata>
 <resources>
  <object id="1" name="MakerWorld_Painted_Companion" type="model">
   <mesh>
    <vertices>
${vLines}
    </vertices>
    <triangles>
${tLines}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0" printable="1"/>
 </build>
</model>`;

  const projectSettingsJson = JSON.stringify(
    {
      filament_colour: ['#10B981', '#F8FAFC', '#1E293B', '#F97316'],
      filament_type: ['PLA', 'PLA', 'PLA', 'PLA'],
      filament_settings_id: [
        'Bambu PLA Basic Jade Green',
        'Bambu PLA Matte Ivory White',
        'Bambu PLA Matte Charcoal',
        'Bambu PLA Basic Mandarin Orange',
      ],
    },
    null,
    2
  );

  const modelSettingsXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="MakerWorld_Painted_Companion.3mf"/>
    <metadata key="extruder" value="1"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="MakerWorld_Painted_Companion"/>
      <metadata key="extruder" value="1"/>
      <mesh_stat face_count="${triangles.length}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>
</config>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="config" ContentType="text/xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const zipped = zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(relsXml),
    '3D/3dmodel.model': strToU8(modelXml),
    'Metadata/project_settings.config': strToU8(projectSettingsJson),
    'Metadata/model_settings.config': strToU8(modelSettingsXml),
  });

  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength
  ) as ArrayBuffer;
}
