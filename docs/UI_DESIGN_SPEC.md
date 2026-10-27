# Prism3MF — UI Architecture & Screen Wireframes

**Design Decisions Applied:**
1. **Viewport Comparison Bar:** `[ Result ]` `[ Original ]` `[ Split View ]` (where `Result` dynamically reflects the simplified or cut model, disabled on raw model load, and activates when an operation is executed).
2. **Model Info Placement (Option B):** Compact 1-line Accordion placed directly at the **top of the left sidebar**. Takes ~36px when collapsed so tool controls are instantly visible without scrolling, and expands on click to reveal dimensions, triangle counts, and the filament color palette.
3. **Multi-Tool Architecture:** Hero landing screen with modular tool cards (`Planar Cut Splitter`, `Color-Preserving Simplifier`, and future tools), plus unified active workspace.

---

## 1. Landing Screen (Empty State / Hero)

When a user visits the app or has no file loaded:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  PRISM 3MF                                                     [ Try Demo Model ]   [ Core SDK ]   [ ★ GitHub ]       │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                        │
│                                           PRISM 3MF TOOLKIT                                                            │
│                           Professional Browser-Based Utilities for Multi-Color 3MF Files                               │
│                                                                                                                        │
│      ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐      │
│      │                                                                                                          │      │
│      │                                   ⬆ Drop your .3MF model here                                            │      │
│      │                                                                                                          │      │
│      │                 [ Browse .3MF File ]        or        [ Load Multi-Color Demo Model ]                    │      │
│      │                                                                                                          │      │
│      │                             100% Client-Side WebAssembly  •  Zero Uploads  •  Private                    │      │
│      └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘      │
│                                                                                                                        │
│   AVAILABLE TOOLS IN THIS SUITE                                                                                        │
│                                                                                                                        │
│   ┌────────────────────────────────────────┐  ┌────────────────────────────────────────┐  ┌────────────────────────┐   │
│   │ ✂️ Planar Cut Splitter                 │  │ 🪄 Color-Preserving Simplifier         │  │ 🧩 Multi-Color Assembly │   │
│   │                                        │  │                                        │  │                        │   │
│   │ Slice large 3MF models to fit your     │  │ Decimate high-poly meshes (QEM) while  │  │ Inspect filament zones,│   │
│   │ build volume. Adds watertight caps,    │  │ strictly preserving painted color      │  │ tweak extruder colors, │   │
│   │ interlocking dowel pins, and dowel     │  │ boundaries and watertight topology.    │  │ and export ready-to-   │   │
│   │ sockets for easy glue-free assembly.   │  │ Up to 90% triangle reduction.          │  │ print 3MF packages.    │   │
│   │                                        │  │                                        │  │                        │   │
│   │ [ Try Cut Tool → ]                     │  │ [ Try Simplifier → ]                   │  │ [ Coming Soon ]        │   │
│   └────────────────────────────────────────┘  └────────────────────────────────────────┘  └────────────────────────┘   │
│                                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Desktop Workspace (Model Loaded)

With **Option B**:
- The **Top Header** stays clean (Brand, Action buttons, Export).
- The **Left Sidebar** has the **Model Info Accordion at the very top (36px)**.
- Directly beneath it sits the **Tool Switcher** (`[ ✂️ Split / Cut ] [ 🪄 Simplify ]`) and the active tool's controls.
- The **Viewport** features `[ Result ] [ Original ] [ Split View ]`.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [◇ Prism3MF]                                                             [ Load Demo ]   [ Core SDK ]   [ 📥 Download .3MF ]│
├───────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┤
│ ┌─── MODEL INFO (COLLAPSED 36px) ───┐ │ [ Result ]    [ Original ]    [ Split View ]        [ ⛶ Wireframe ] [ 🎨 Seams ] │
│ │ 📄 bulbasaur.3mf • 24.8k tris  [▾]│ │                                                                                │
│ └───────────────────────────────────┘ │                                                                                │
│                                       │                                  ┌─────────────┐                               │
│ ┌─── TOOL SELECTOR ─────────────────┐ │                                 ╱             ╱│                               │
│ │ [ ✂️ Split / Cut ] [ 🪄 Simplify ] │ │                                ┌─────────────┐ │                               │
│ └───────────────────────────────────┘ │                                │             │ │                               │
│                                       │                                │    PART A   │ │                               │
│ ┌─── ACTIVE TOOL CONTROLS ──────────┐ │                                │             │ │                               │
│ │ ✂️ PLANAR CUT SPLITTER             │ │                      ══════════│═════════════│═│════════════ Slicing Plane     │
│ │                                   │ │                                │  [•]  [•]   │ │                               │
│ │ Cut Height (Z):                   │ │                                │             │ │      (Dowel Sockets)          │
│ │ [━━━●━━━━━━━━━━━━━━━━━] 25.0 mm   │ │                                └─────────────┘ ┘                               │
│ │                                   │ │                                  ┌─────────────┐                               │
│ │ Rotation Tilt (X/Y):              │ │                                 ╱             ╱│                               │
│ │ X: 0.0°   Y: 0.0°      [Reset]    │ │                                ┌─────────────┐ │                               │
│ │                                   │ │                                │   ▲  ▲      │ │      (Dowel Pins)             │
│ │ [x] Cap Cut Cross-Sections        │ │                                │   PART B    │ │                               │
│ │                                   │ │                                └─────────────┘ ┘                               │
│ │ Interlocking Connectors:          │ │                                                                                │
│ │ [x] Enable Dowel Pins & Sockets   │ │                                                                                │
│ │ Style: [ Dowel Pins (Circular) ▾] │ │                                                                                │
│ │ Diameter: 5.0 mm   Length: 8.0 mm │ │                                                                                │
│ │ Tolerance: 0.2 mm                 │ │                                                                                │
│ │                                   │ │                                                                                │
│ │ Exploded Part Preview:            │ │                                                                                │
│ │ [━━━━━━━●━━━━━━━━━━━━━] 18.0 mm   │ │                                                                                │
│ │                                   │ │                                                                                │
│ │ [  ✂️ Perform Planar Cut  ]        │ │                                                                                │
│ └───────────────────────────────────┘ │                                                                                │
│                                       │                                                                                │
│ ┌─── SIMPLIFY CUT PARTS (OPTIONAL) ─┐ │                                                                                │
│ │ Target Reduction: [ 50% ] [ 25% ] │ │                                                                                │
│ │ [ ⚡ Reduce Part A & B (QEM) ]    │ │                                                                                │
│ └───────────────────────────────────┘ │                                                                                │
└───────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Option B — Model Info Accordion in Detail

### State 1: Collapsed (Default — only 36px tall)
Keeps the sidebar clean and gives 90% of sidebar space to tool sliders:
```
┌────────────────────────────────────────────────────────┐
│ 📄 bulbasaur.3mf • 24.8k tris • 🎨 4 colors        [▾] │
└────────────────────────────────────────────────────────┘
```

### State 2: Expanded (Clicked)
Expands downward with a smooth animation to reveal full model telemetry and interactive filament color pickers:
```
┌────────────────────────────────────────────────────────┐
│ 📄 bulbasaur.3mf • 24.8k tris • 🎨 4 colors        [▴] │
├────────────────────────────────────────────────────────┤
│ FILE METRICS                                           │
│ Size: 3.42 MB          Triangles: 24,812               │
│ Dimensions: 54.2 × 52.0 × 85.0 mm                      │
│ Bounding Box: X [-27, +27]  Y [-26, +26]  Z [0, 85]    │
│                                                        │
│ FILAMENT PALETTE (4 colors)                            │
│ [ 🟢 #28a745 Teal Skin  ]    [ 🔴 #dc3545 Red Eyes   ] │
│ [ ⚪ #f8f9fa Claws      ]    [ 🟤 #6c757d Spots      ] │
│                                                        │
│ [ Close Details ]                                      │
└────────────────────────────────────────────────────────┘
```

---

## 4. Viewport Result Switcher Behavior

The top-left viewport bar dynamically manages comparison states:

### Phase 1: On Fresh Load (Unmodified Model)
```
┌────────────────────────────────────────────────────────┐
│ [ Result ] (disabled)  │  [● Original ] (active)  │  [ Split View ] (disabled) │
└────────────────────────────────────────────────────────┘
```
- Tooltip on `Result`: *"Execute Cut or Simplification to view result"*
- The canvas displays the clean original model.

### Phase 2: After Cut or Simplification Executed
```
┌────────────────────────────────────────────────────────┐
│ [● Result ] (active)   │  [ Original ]            │  [ Split View ] (unlocked) │
└────────────────────────────────────────────────────────┘
```
- Automatically switches to **`Result`**.
- User can click **`Original`** to instantly toggle back to the raw source mesh.
- User can click **`Split View`** to see side-by-side Before & After comparison.

---

## 5. Mobile Responsive Screen

On phones (touchscreens, portrait 390×844px):

```
┌───────────────────────────────────────────┐
│ ☰ Prism3MF        bulbasaur.3mf      [📥] │  ← Compact Top Header
├───────────────────────────────────────────┤
│                                           │
│                                           │
│   [ Result ]  [ Original ]  [ Split ]     │  ← Viewport mode pill
│                                           │
│                 3D CANVAS                 │
│             (Orbited with touch)          │
│                                           │
│                                           │
│               [ ⤢ Reset Camera ]          │
│                                           │
├───────────────────────────────────────────┤
│ ═══════════════════════ (drag bar) ══════ │  ← Bottom Sheet Header
│ 📄 bulbasaur.3mf • 24.8k tris         [▾] │  ← Option B Accordion
├───────────────────────────────────────────┤
│ [ ✂️ Split / Cut ]     [ 🪄 Simplify ]     │  ← Tool Switcher Tabs
├───────────────────────────────────────────┤
│ Cut Height:                               │
│ [━━━━━━━●━━━━━━━━━━━━━━━━] 25.0 mm        │
│                                           │
│ [x] Cap Faces      [x] Dowel Pins (5mm)   │
│                                           │
│ [       ✂️ Perform Planar Cut       ]     │  ← Primary Action (Sticky)
└───────────────────────────────────────────┘
```

### Mobile Bottom Sheet States:
1. **Peek (64px):** Shows drag handle, tool tabs, and primary action button. Gives ~85% of screen to 3D canvas manipulation.
2. **Half (45% screen):** Shows key sliders (Height, Dowels, Simplification Ratio).
3. **Full (85% screen):** Swipes up to access full settings, tolerance adjustments, and filament palette.
