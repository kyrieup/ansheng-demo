# 岸生

Tiny Glade-style decompression toy. You only soak the ground; a wetland grows on the wet edge.

> he soaked a patch of ground, birds came by themselves.

## Run

```
npm install
npm run dev
```

Binds 0.0.0.0:5173.

Open http://localhost:5173  (also http://127.0.0.1:5173)
Desktop Chrome, mouse.

- Left drag: soak the ground (erase if the 擦 button is on)
- Right drag: orbit
- Scroll: zoom
- Ctrl/Cmd+Z: undo

## The three magics

1. Release the pen, the ground darkens and reeds sprout from the wet edge in about 1s.
   A stain, not a canal. Grow, not pop. This is the prototype pass/fail.

2. Drag the dry↔wet slider (干 to 满). The same marsh reskins.
   One slider only. Dry: mudflat, waders. Full: mirror water.
   Same patch, two faces.

3. Birds fly in from offscreen and land on reed, mud, or water matching the soak kind.
   Morning mist is good for birds. Erase the wetness and they leave.

## Wetness kinds

- 湿草: reeds + dragonflies
- 浅沼: mudflat + sandpipers / 鹜
- 水面: ducks + reflections

A disconnected short stroke is a seep or pool, not a well.
More winding shoreline and more of the three kinds → more different species.
Sparrows and ducks first; herons only after the shoreline is complex.
No counts, no dex, no labels.

## Frozen v1

Player only draws / edits / erases wetness, and sets kind, dry↔wet, and time of day.
No placing objects, no quests, no scores, no tutorial copy.
World start: one bonsai grass island, a small shallow dip, no city, no birds.

Local save (`ansheng-v1`) keeps strokes, nextId, tide, and tod across refresh.
URL flags `shot`, `river`, `empty`, `drawn`, `mood` skip loading that save. 重置 clears it.

New game and **重置** default to dusk (`tod = 0.85`). A saved `tod` is restored as-is and is not overwritten on load.

Lights are hemisphere + directional sun only (no AmbientLight). PCF soft shadows: island and dish receive; reeds, birds, and the dish lip cast. `#FFB060` is dusk sun/highlight only — never a mesh.

## Screenshot looks

| look | URL | sliders |
| --- | --- | --- |
| dusk + dry mud | `/?shot&mood=dry-dusk` | 干 ≈ 12, 黄昏 85 |
| dawn + full tide | `/?shot&mood=dawn-full` | 满 100, 晨 0 |

`shot` hides the HUD. `mood` skips `localStorage` so a previous save cannot replace the look. Aliases: `dusk-dry`, `full-dawn`.

Without flags, a fresh session is dusk 0.85 and tide 0.52 (or whatever the save last wrote). Noon is available on the 晨↔黄昏 slider (~50) and can be bright; it is not the default.

## Art slots

Required files in `public/art/` (served as `/art/`). Loaded directly — no 404→greybox swap for these slots.

- `/art/{sparrow,sandpiper,duck,heron,dragonfly,reed,reed-dense,reed-sparse,dish}.glb` — clone at scale 1, Y-up, face +X
- `/art/terrain.png` — multiply with vertex dry/wet soak colors
- `/art/water.png` — multiply with tide tint (`#6B8F6A` → `#2A6B68`)
- `/art/sky-fog.json` — dawn/day/dusk/night `{ color, density }` under `sky_fog`

| file | use |
| --- | --- |
| `terrain.png` | olive grain. **Multiply** with island vertex soak. Does not replace dry/wet. |
| `water.png` | soft rings. **Multiply** with `waterMat.color` tide lerp `#6B8F6A` → `#2A6B68`. |
| `dish.glb` | Y-up, scale 1, lip radius 7.55, dish `#5C564C`. |
| `sky-fog.json` | dawn/day/dusk/night fog `{ color, density }`. |
| `reed-dense.glb` | 湿草 / lush / narrow cluster |
| `reed-sparse.glb` | 浅沼 / river cluster |
| `reed.glb` | single plant (水面), not a box cluster |
| `sparrow.glb` | sparrow |
| `sandpiper.glb` | 鹬 |
| `duck.glb` | duck (origin at waterline) |
| `heron.glb` | heron |
| `dragonfly.glb` | dragonfly (origin at thorax; flap `wing_l1` `wing_l2` `wing_r1` `wing_r2` if present) |

Factories clone glTF at scale 1. Load failure logs loudly in the console and does not swap a box bird.

Island vertex soak lerp (texture multiplies these, never replaces them):

- grass dry `#7A8B4E` / grass wet `#4E6A38`
- mud dry `#8A6E4C` / mud wet `#3E2C20`

Sky/fog (`fog.color = scene.background`, no sky texture). Defaults, overridable by `/art/sky-fog.json`:

```json
{
  "dawn":  { "color": "#C5D4C8", "density": 0.062 },
  "day":   { "color": "#B4C8BC", "density": 0.03 },
  "dusk":  { "color": "#C4A080", "density": 0.04 },
  "night": { "color": "#1B1A24", "density": 0.03 }
}
```

`#FFB060` is dusk sun only — never on a mesh. Reed-head warm point `#A07848`. Bills `#8A8478`.
