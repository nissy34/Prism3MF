import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import {
  FilamentInfo,
  Parsed3MFArchive,
  ParsedMeshObject,
  SimplifiedMeshResult,
  CutMeshResult,
  CutPartMesh,
} from './types';
import {
  encodePaintState,
  expandPaintedMesh,
  decodeDominantPaintState,
  isPaintSubdivided,
} from './paintColorCodec';

const DEFAULT_PALETTE = [
  '#10B981', // Slot 1: Emerald Green
  '#F97316', // Slot 2: Bambu Orange
  '#3B82F6', // Slot 3: Royal Blue
  '#EF4444', // Slot 4: Crimson Red
  '#FACC15', // Slot 5: Warm Yellow
  '#EC4899', // Slot 6: Magenta Pink
  '#A855F7', // Slot 7: Violet
  '#06B6D4', // Slot 8: Cyan
  '#F8FAFC', // Slot 9: Pure White
  '#334155', // Slot 10: Charcoal
];

function parseFilamentPalette(files: Record<string, Uint8Array>): FilamentInfo[] {
  const filaments: FilamentInfo[] = [];

  for (const [path, bytes] of Object.entries(files)) {
    const lower = path.toLowerCase();
    if (lower.endsWith('project_settings.config')) {
      try {
        const text = strFromU8(bytes).trim();
        if (text.startsWith('{')) {
          const json = JSON.parse(text);
          const colors: string[] =
            json.filament_colour ||
            json.default_filament_colour ||
            [];
          const types: string[] = json.filament_type || [];
          const names: string[] = json.filament_settings_id || [];

          if (Array.isArray(colors) && colors.length > 0) {
            for (let i = 0; i < colors.length; i++) {
              let hex = String(colors[i] || '').trim();
              if (!hex.startsWith('#')) hex = '#' + hex;
              if (hex.length === 9) hex = hex.slice(0, 7);
              filaments.push({
                id: i + 1,
                color: /^#[0-9A-Fa-f]{6}$/.test(hex)
                  ? hex
                  : DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
                type: types[i] || 'PLA',
                name: names[i] || `Filament ${i + 1}`,
              });
            }
            return filaments;
          }
        } else {
          const match = text.match(/filament_colour\s*=\s*([^\r\n]+)/);
          if (match) {
            const parts = match[1].split(';').map((s) => s.trim());
            parts.forEach((hex, idx) => {
              if (hex) {
                filaments.push({
                  id: idx + 1,
                  color: hex.startsWith('#') ? hex.slice(0, 7) : `#${hex.slice(0, 6)}`,
                  type: 'PLA',
                  name: `Filament ${idx + 1}`,
                });
              }
            });
            if (filaments.length > 0) return filaments;
          }
        }
      } catch {
        // Fallback
      }
    }
  }

  for (const [path, bytes] of Object.entries(files)) {
    const lower = path.toLowerCase();
    if (lower.endsWith('.config')) {
      const text = strFromU8(bytes);
      const match = text.match(/filament_colour\s*=\s*([^\r\n]+)/);
      if (match) {
        const parts = match[1].split(';').map((s) => s.trim());
        parts.forEach((hex, idx) => {
          if (hex) {
            filaments.push({
              id: idx + 1,
              color: hex.startsWith('#') ? hex.slice(0, 7) : `#${hex.slice(0, 6)}`,
              type: 'PLA',
              name: `Filament ${idx + 1}`,
            });
          }
        });
        if (filaments.length > 0) return filaments;
      }
    }
  }

  return filaments;
}

/**
 * Extracts per-object or per-part default extruder and name from `Metadata/model_settings.config`
 */
function parseModelSettings(
  files: Record<string, Uint8Array>
): Map<string, { name?: string; extruder?: number }> {
  const map = new Map<string, { name?: string; extruder?: number }>();

  for (const [path, bytes] of Object.entries(files)) {
    if (path.toLowerCase().endsWith('model_settings.config')) {
      const xml = strFromU8(bytes);

      // Parse <object> blocks and their nested <part> blocks separately
      const objRegex = /<object\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/object>/gi;
      let om: RegExpExecArray | null;
      while ((om = objRegex.exec(xml)) !== null) {
        const objId = om[1];
        const objInner = om[2];

        const objWithoutParts = objInner.replace(/<part\b[\s\S]*?<\/part>/gi, '');
        const objNameMatch = objWithoutParts.match(/<metadata\b[^>]*key=["']name["'][^>]*value=["']([^"']+)["']/i);
        const objExtMatch = objWithoutParts.match(/<metadata\b[^>]*key=["']extruder["'][^>]*value=["'](\d+)["']/i);

        const objName = objNameMatch ? objNameMatch[1] : undefined;
        const objExtruder = objExtMatch ? parseInt(objExtMatch[1], 10) : 1;

        map.set(objId, { name: objName, extruder: objExtruder });

        const partRegex = /<part\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/part>/gi;
        let pm: RegExpExecArray | null;
        while ((pm = partRegex.exec(objInner)) !== null) {
          const partId = pm[1];
          const partInner = pm[2];
          const pNameMatch = partInner.match(/<metadata\b[^>]*key=["']name["'][^>]*value=["']([^"']+)["']/i);
          const pExtMatch = partInner.match(/<metadata\b[^>]*key=["']extruder["'][^>]*value=["'](\d+)["']/i);

          const info = {
            name: pNameMatch ? pNameMatch[1] : objName,
            extruder: pExtMatch ? parseInt(pExtMatch[1], 10) : objExtruder,
          };
          map.set(partId, info);
        }
      }
    }
  }
  return map;
}

/**
 * High-speed streaming parser for `<mesh>...</mesh>` inside `.model` XML files.
 * Uses pre-allocated growable TypedArrays (`Float32Array` and `Uint32Array`) instead of
 * untyped JS `number[]` arrays so 1.8M+ triangle MakerWorld models parse in ~400ms
 * without V8 array resizing or string limit crashes.
 */
function parseModelXmlMeshes(
  modelPath: string,
  xmlText: string,
  modelSettings: Map<string, { name?: string; extruder?: number }>,
  skipAutoExpansion = false
): ParsedMeshObject[] {
  const results: ParsedMeshObject[] = [];

  let searchPos = 0;
  while (true) {
    const objOpenIdx = xmlText.indexOf('<object', searchPos);
    if (objOpenIdx === -1) break;
    const objOpenEnd = xmlText.indexOf('>', objOpenIdx);
    if (objOpenEnd === -1) break;
    const objCloseIdx = xmlText.indexOf('</object>', objOpenEnd);
    if (objCloseIdx === -1) break;

    searchPos = objCloseIdx + 9;

    const objAttrs = xmlText.slice(objOpenIdx + 7, objOpenEnd);
    const meshOpenIdx = xmlText.indexOf('<mesh', objOpenEnd);
    if (meshOpenIdx === -1 || meshOpenIdx > objCloseIdx) continue;

    const idMatch = objAttrs.match(/\bid=["']([^"']+)["']/i);
    const nameMatch = objAttrs.match(/\bname=["']([^"']+)["']/i);
    const objectId = idMatch ? idMatch[1] : '1';

    const settingsInfo = modelSettings.get(objectId);
    const objectName =
      nameMatch?.[1] ||
      settingsInfo?.name ||
      `${modelPath.split('/').pop()} #${objectId}`;
    const defaultExtruder = settingsInfo?.extruder || 1;

    const vertsStart = xmlText.indexOf('<vertices', meshOpenIdx);
    const vertsEnd = xmlText.indexOf('</vertices>', vertsStart);
    if (vertsStart === -1 || vertsEnd === -1 || vertsEnd > objCloseIdx) continue;

    const trisStart = xmlText.indexOf('<triangles', vertsEnd);
    const trisEnd = xmlText.indexOf('</triangles>', trisStart);
    if (trisStart === -1 || trisEnd === -1 || trisEnd > objCloseIdx) continue;

    // Parse vertices directly into a growable Float32Array
    let vertCap = 65536;
    let vertBuf = new Float32Array(vertCap * 3);
    let vertCount = 0;

    const vertRegex = /<vertex\b[^>]*?\bx=["']([^"']+)["'][^>]*?\by=["']([^"']+)["'][^>]*?\bz=["']([^"']+)["']/gi;
    vertRegex.lastIndex = vertsStart;
    let vm: RegExpExecArray | null;
    while ((vm = vertRegex.exec(xmlText)) !== null) {
      if (vm.index > vertsEnd) break;
      if (vertCount >= vertCap) {
        vertCap *= 2;
        const next = new Float32Array(vertCap * 3);
        next.set(vertBuf);
        vertBuf = next;
      }
      const b = vertCount * 3;
      vertBuf[b] = parseFloat(vm[1]);
      vertBuf[b + 1] = parseFloat(vm[2]);
      vertBuf[b + 2] = parseFloat(vm[3]);
      vertCount++;
    }

    const rawVertices = vertBuf.subarray(0, vertCount * 3);

    // Parse triangles & paint attributes into a growable Uint32Array
    let triCap = 131072;
    let triBuf = new Uint32Array(triCap * 3);
    let triCount = 0;
    const rawPaintAttrs: string[] = [];
    let paintAttrName: 'paint_color' | 'slic3rpe:mmu_segmentation' = 'paint_color';

    const triTagRegex = /<triangle\b([^>]*)\/?>/gi;
    triTagRegex.lastIndex = trisStart;
    let tm: RegExpExecArray | null;
    while ((tm = triTagRegex.exec(xmlText)) !== null) {
      if (tm.index > trisEnd) break;
      const attrs = tm[1];
      const v1m = attrs.match(/\bv1=["'](\d+)["']/);
      const v2m = attrs.match(/\bv2=["'](\d+)["']/);
      const v3m = attrs.match(/\bv3=["'](\d+)["']/);
      if (!v1m || !v2m || !v3m) continue;

      if (triCount >= triCap) {
        triCap *= 2;
        const next = new Uint32Array(triCap * 3);
        next.set(triBuf);
        triBuf = next;
      }
      const b = triCount * 3;
      triBuf[b] = parseInt(v1m[1], 10);
      triBuf[b + 1] = parseInt(v2m[1], 10);
      triBuf[b + 2] = parseInt(v3m[1], 10);
      triCount++;

      let paintVal = '';
      const pm = attrs.match(/\bpaint_color=["']([^"']+)["']/);
      if (pm) {
        paintVal = pm[1];
        paintAttrName = 'paint_color';
      } else {
        const sm = attrs.match(/\bslic3rpe:mmu_segmentation=["']([^"']+)["']/);
        if (sm) {
          paintVal = sm[1];
          paintAttrName = 'slic3rpe:mmu_segmentation';
        }
      }
      rawPaintAttrs.push(paintVal);
    }

    const rawTriangles = triBuf.subarray(0, triCount * 3);
    if (rawTriangles.length === 0) continue;

    // On massive models (> 350k base triangles), triangles are already micro-sized (< 0.05mm),
    // so expanding 125,000+ deep recursive paint_color trees would multiply the mesh to 5M+ triangles.
    // For meshes <= 350k triangles we perform full geometric tree expansion + T-junction stitching;
    // for ultra-dense meshes (> 350k triangles) we decode each triangle's dominant paint state directly!
    let expanded: {
      vertices: Float32Array;
      triangles: Uint32Array;
      paintStates: Uint8Array;
      subdividedCount: number;
    };

    if (!skipAutoExpansion && triCount <= 350000) {
      expanded = expandPaintedMesh(rawVertices, rawTriangles, rawPaintAttrs);
    } else {
      const paintStates = new Uint8Array(triCount);
      let subdividedCount = 0;
      for (let i = 0; i < triCount; i++) {
        const attr = rawPaintAttrs[i];
        if (attr) {
          if (isPaintSubdivided(attr)) subdividedCount++;
          paintStates[i] = decodeDominantPaintState(attr);
        }
      }
      expanded = {
        vertices: rawVertices,
        triangles: rawTriangles,
        paintStates,
        subdividedCount,
      };
    }

    results.push({
      modelPath,
      objectId,
      name: objectName,
      defaultExtruder,
      rawVertices,
      rawTriangles,
      rawPaintAttrs,
      paintAttrName,
      subdividedTriangleCount: expanded.subdividedCount,
      expandedVertices: expanded.vertices,
      expandedTriangles: expanded.triangles,
      expandedPaintStates: expanded.paintStates,
    });
  }

  return results;
}

export function parse3MFArchive(
  buffer: ArrayBuffer,
  fileName: string
): Parsed3MFArchive {
  const uint8 = new Uint8Array(buffer);
  const files = unzipSync(uint8);

  const filaments = parseFilamentPalette(files);
  const modelSettings = parseModelSettings(files);

  const meshes: ParsedMeshObject[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (path.toLowerCase().endsWith('.model')) {
      const xmlText = strFromU8(bytes);
      const parsedMeshes = parseModelXmlMeshes(path, xmlText, modelSettings);
      meshes.push(...parsedMeshes);
    }
  }

  let maxPaintState = filaments.length;
  let totalRawTriangles = 0;
  let totalExpandedTriangles = 0;
  let totalPaintedTriangles = 0;

  for (const m of meshes) {
    totalRawTriangles += m.rawTriangles.length / 3;
    totalExpandedTriangles += m.expandedTriangles.length / 3;
    for (let i = 0; i < m.expandedPaintStates.length; i++) {
      const st = m.expandedPaintStates[i];
      if (st > 0) {
        totalPaintedTriangles++;
        if (st > maxPaintState) maxPaintState = st;
      }
    }
    if (m.defaultExtruder > maxPaintState) {
      maxPaintState = m.defaultExtruder;
    }
  }

  while (filaments.length < Math.max(maxPaintState, 2)) {
    const nextId = filaments.length + 1;
    filaments.push({
      id: nextId,
      color: DEFAULT_PALETTE[(nextId - 1) % DEFAULT_PALETTE.length],
      type: 'PLA',
      name: `Filament ${nextId}`,
    });
  }

  return {
    fileName,
    fileSize: buffer.byteLength,
    files,
    filaments,
    meshes,
    totalRawTriangles,
    totalExpandedTriangles,
    totalPaintedTriangles,
  };
}

/**
 * Encodes `<object>` mesh XML directly into UTF-8 `Uint8Array` chunks in 16,384-element batches,
 * avoiding V8's `RangeError: Invalid string length` on 100MB–500MB+ `.model` files!
 */
function buildObjectMeshBytes(
  sm: { vertices: Float32Array; triangles: Uint32Array; paintStates: Uint8Array },
  attrName: 'paint_color' | 'slic3rpe:mmu_segmentation'
): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  const BATCH_SIZE = 16384;

  chunks.push(strToU8('<mesh>\n    <vertices>\n'));

  const verts = sm.vertices;
  const numV = verts.length / 3;
  let batchLines: string[] = [];

  for (let i = 0; i < numV; i++) {
    const x = Number(verts[i * 3].toFixed(5));
    const y = Number(verts[i * 3 + 1].toFixed(5));
    const z = Number(verts[i * 3 + 2].toFixed(5));
    batchLines.push(`     <vertex x="${x}" y="${y}" z="${z}"/>\n`);
    if (batchLines.length >= BATCH_SIZE) {
      chunks.push(strToU8(batchLines.join('')));
      batchLines = [];
    }
  }
  if (batchLines.length > 0) {
    chunks.push(strToU8(batchLines.join('')));
    batchLines = [];
  }

  chunks.push(strToU8('    </vertices>\n    <triangles>\n'));

  const tris = sm.triangles;
  const states = sm.paintStates;
  const numT = tris.length / 3;

  for (let i = 0; i < numT; i++) {
    const v1 = tris[i * 3];
    const v2 = tris[i * 3 + 1];
    const v3 = tris[i * 3 + 2];
    const st = states[i];
    if (st > 0) {
      const hexCode = encodePaintState(st);
      batchLines.push(
        `     <triangle v1="${v1}" v2="${v2}" v3="${v3}" ${attrName}="${hexCode}"/>\n`
      );
    } else {
      batchLines.push(`     <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>\n`);
    }
    if (batchLines.length >= BATCH_SIZE) {
      chunks.push(strToU8(batchLines.join('')));
      batchLines = [];
    }
  }
  if (batchLines.length > 0) {
    chunks.push(strToU8(batchLines.join('')));
    batchLines = [];
  }

  chunks.push(strToU8('    </triangles>\n   </mesh>'));
  return chunks;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLen += chunks[i].byteLength;
  }
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    out.set(chunks[i], offset);
    offset += chunks[i].byteLength;
  }
  return out;
}

/**
 * Rebuilds a valid `.3mf` archive with the simplified meshes and their `paint_color` attributes,
 * using chunked UTF-8 byte assembly so it never hits `RangeError: Invalid string length` on huge models.
 */
export function exportSimplified3MF(
  archive: Parsed3MFArchive,
  simplifiedMeshes: SimplifiedMeshResult[]
): Uint8Array {
  const outFiles: Record<string, Uint8Array> = { ...archive.files };

  const byModelPath = new Map<string, Map<string, SimplifiedMeshResult>>();
  for (const sm of simplifiedMeshes) {
    let objMap = byModelPath.get(sm.modelPath);
    if (!objMap) {
      objMap = new Map();
      byModelPath.set(sm.modelPath, objMap);
    }
    objMap.set(sm.objectId, sm);
  }

  for (const [modelPath, objMap] of byModelPath.entries()) {
    const origBytes = outFiles[modelPath];
    if (!origBytes) continue;
    const xmlText = strFromU8(origBytes);

    const outByteChunks: Uint8Array[] = [];
    let cursor = 0;

    while (true) {
      const objOpenIdx = xmlText.indexOf('<object', cursor);
      if (objOpenIdx === -1) break;
      const objOpenEnd = xmlText.indexOf('>', objOpenIdx);
      if (objOpenEnd === -1) break;
      const objCloseIdx = xmlText.indexOf('</object>', objOpenEnd);
      if (objCloseIdx === -1) break;

      const objAttrs = xmlText.slice(objOpenIdx + 7, objOpenEnd);
      const idMatch = objAttrs.match(/\bid=["']([^"']+)["']/i);
      const objectId = idMatch ? idMatch[1] : '1';
      const sm = objMap.get(objectId);

      const meshStartIdx = xmlText.indexOf('<mesh', objOpenEnd);
      const meshCloseIdx = xmlText.indexOf('</mesh>', meshStartIdx);

      if (
        sm &&
        meshStartIdx !== -1 &&
        meshCloseIdx !== -1 &&
        meshCloseIdx < objCloseIdx
      ) {
        // Slice everything before `<mesh...>`
        outByteChunks.push(strToU8(xmlText.slice(cursor, meshStartIdx)));

        const origMesh = archive.meshes.find(
          (m) => m.modelPath === modelPath && m.objectId === objectId
        );
        const attrName = origMesh?.paintAttrName || 'paint_color';

        // Stream the new `<mesh>...</mesh>` directly as byte chunks
        const meshChunks = buildObjectMeshBytes(sm, attrName);
        for (let c = 0; c < meshChunks.length; c++) {
          outByteChunks.push(meshChunks[c]);
        }

        cursor = meshCloseIdx + 7; // Advance past `</mesh>`
      } else {
        outByteChunks.push(strToU8(xmlText.slice(cursor, objCloseIdx + 9)));
        cursor = objCloseIdx + 9;
      }
    }

    if (cursor < xmlText.length) {
      outByteChunks.push(strToU8(xmlText.slice(cursor)));
    }

    outFiles[modelPath] = concatUint8Arrays(outByteChunks);
  }

  // Update `face_count` inside `Metadata/model_settings.config`
  const totalSimplifiedTris = simplifiedMeshes.reduce(
    (acc, m) => acc + m.simplifiedTriangles,
    0
  );
  for (const [path, bytes] of Object.entries(outFiles)) {
    if (path.toLowerCase().endsWith('model_settings.config')) {
      let configXml = strFromU8(bytes);
      configXml = configXml.replace(
        /\bface_count=["']\d+["']/gi,
        `face_count="${totalSimplifiedTris}"`
      );
      outFiles[path] = strToU8(configXml);
    }
  }

  return zipSync(outFiles, { level: 6 });
}

/**
 * Packages a planar cut result (Part A, Part B, and optional Dowel Pin) into a valid .3mf archive
 * ready for Bambu Studio / OrcaSlicer / PrusaSlicer.
 * Objects are placed side-by-side on the build plate so they don't intersect.
 */
export function exportCut3MF(
  archive: Parsed3MFArchive,
  cutResult: CutMeshResult,
  options?: {
    plateSpacingMm?: number;
  }
): Uint8Array {
  const outFiles: Record<string, Uint8Array> = { ...archive.files };
  const spacing = options?.plateSpacingMm ?? 20;
  const modelPath = archive.meshes[0]?.modelPath || '3D/3dmodel.model';
  const attrName = archive.meshes[0]?.paintAttrName || 'paint_color';

  const parts: CutPartMesh[] = [cutResult.partA, cutResult.partB];
  if (cutResult.dowelPin) {
    parts.push(cutResult.dowelPin);
  }

  let curX = 0;
  const transforms: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const width = part.bounds.max[0] - part.bounds.min[0];
    const offsetX = curX - part.bounds.min[0];
    transforms.push(`1 0 0 0 1 0 0 0 1 ${offsetX.toFixed(4)} 0 0`);
    curX += width + spacing;
  }

  const chunks: Uint8Array[] = [];
  chunks.push(
    strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\n' +
        ' <metadata name="Application">Prism3MF</metadata>\n' +
        ' <resources>\n'
    )
  );

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const objId = String(i + 1);
    chunks.push(strToU8(`  <object id="${objId}" name="${part.name}" type="model">\n`));
    const meshChunks = buildObjectMeshBytes(part, attrName);
    for (let c = 0; c < meshChunks.length; c++) {
      chunks.push(meshChunks[c]);
    }
    chunks.push(strToU8('\n  </object>\n'));
  }

  chunks.push(strToU8(' </resources>\n <build>\n'));
  for (let i = 0; i < parts.length; i++) {
    const objId = String(i + 1);
    chunks.push(strToU8(`  <item objectid="${objId}" transform="${transforms[i]}" />\n`));
  }
  chunks.push(strToU8(' </build>\n</model>'));

  outFiles[modelPath] = concatUint8Arrays(chunks);

  const totalTris = parts.reduce((acc, p) => acc + p.triangleCount, 0);
  for (const [path, bytes] of Object.entries(outFiles)) {
    if (path.toLowerCase().endsWith('model_settings.config')) {
      let configXml = strFromU8(bytes);
      configXml = configXml.replace(
        /\bface_count=["']\d+["']/gi,
        `face_count="${totalTris}"`
      );
      outFiles[path] = strToU8(configXml);
    }
  }

  return zipSync(outFiles, { level: 6 });
}

/**
 * Exports an individual cut part as a standalone .3mf archive.
 */
export function exportCutPart3MF(
  archive: Parsed3MFArchive,
  part: CutPartMesh
): Uint8Array {
  const outFiles: Record<string, Uint8Array> = { ...archive.files };
  const modelPath = archive.meshes[0]?.modelPath || '3D/3dmodel.model';
  const attrName = archive.meshes[0]?.paintAttrName || 'paint_color';

  const chunks: Uint8Array[] = [];
  chunks.push(
    strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\n' +
        ' <metadata name="Application">Prism3MF</metadata>\n' +
        ' <resources>\n' +
        `  <object id="1" name="${part.name}" type="model">\n`
    )
  );

  const meshChunks = buildObjectMeshBytes(part, attrName);
  for (let c = 0; c < meshChunks.length; c++) {
    chunks.push(meshChunks[c]);
  }
  chunks.push(
    strToU8(
      '\n  </object>\n </resources>\n <build>\n  <item objectid="1" />\n </build>\n</model>'
    )
  );

  outFiles[modelPath] = concatUint8Arrays(chunks);
  return zipSync(outFiles, { level: 6 });
}
