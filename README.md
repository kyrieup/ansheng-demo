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
URL flags `shot`, `river`, `empty`, `drawn` skip loading that save. 重置 clears it.

## Art slots

Logic is not bound to BoxGeometry. Drop glTF into `public/art/` (served as `/art/`):

| file | use |
| --- | --- |
| `reed-dense.glb` | 湿草 / lush / narrow cluster |
| `reed-sparse.glb` | 浅沼 / river cluster |
| `reed.glb` | single-plant fallback |
| `sparrow.glb` | sparrow |
| `sandpiper.glb` | 鹬 |
| `duck.glb` | duck (origin at waterline) |
| `heron.glb` | heron |
| `dragonfly.glb` | dragonfly (origin at thorax; flap `wing_l1` `wing_l2` `wing_r1` `wing_r2` if present) |
| `terrain.png` | optional island map |
| `water.png` | optional water map |

Load at scale 1, Y-up, face +X, origin at feet. Missing files fall back to greybox primitives. `#FFB060` is dusk sun only — never on a mesh. Dish `#5C564C`. Reed-head warm point `#A07848`. Bills `#8A8478`.
