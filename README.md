# Ansheng / Before the City

Tiny Glade-style decompression toy. You only draw water; a Jiangnan canal town grows on the banks.

> he only drew a river, the town grew itself.

## Run

```
npm install
npm run dev
```

Binds 0.0.0.0:5173.

Open http://localhost:5173  (also http://127.0.0.1:5173)
Desktop Chrome, mouse.

- Left drag: draw water (erase if the 擦 button is on)
- Right drag: orbit
- Scroll: zoom
- Ctrl/Cmd+Z: undo

## The three magics

1. Release the pen, banks grow themselves in about 1s.
   Bricks rise first, then windows pop, laundry and bollards, a small boat slides into the bend.
   This is the prototype pass/fail.

2. Drag the water-level slider (枯潮 ebb to 满潮 flood). The town reskins.
   One slider only. Ebb: mudflats, mud steps, boat hulls grounded.
   Flood: water almost over the bricks, swallows one story, first floor becomes a gallery (廊下), lanterns drop into the water.
   Same place, two faces.

3. 黄昏 lights the windows; water carries reflections of the town.

## Width character

- 流巷 narrow: alley brick, looking-out windows, laundry lines across the ditch
- 河 river: broader quay, dock steps, a boat slides into the bend
- 港 harbor: stilt houses (吊脚楼), bollards, more boats, longer reflections

- Two channels crossing: plaza AND a bridge
- Dead-end canal: still-water courtyard (not an error)
- Disconnected stroke: pond; connected to existing water: river

## Frozen v1

Player only draws / edits / erases water, and sets width, tide, and time of day.
No placing houses, no trees, no scores, no tutorial copy.
World start: one bonsai island, a shallow central pond, no city.
