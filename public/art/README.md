# 岸生 1.0 glTF drop — birds + reeds

Y-up. Face +X. Origin at ground (duck at keel / waterline, dragonfly at thorax). Load at scale 1.

World units = demo units (island radius ~7). Toy bonsai scale, not real-world meters.

## Files

| file | kind | baked size (xyz) |
|---|---|---|
| sparrow.glb | bird | 0.26 x 0.13 x 0.09 |
| sandpiper.glb | bird **鹬** | 0.28 x 0.29 x 0.04 |
| duck.glb | bird | 0.36 x 0.15 x 0.14 |
| heron.glb | bird | 0.31 x 0.69 x 0.11 |
| dragonfly.glb | dragonfly | 0.04 x 0.12 x 0.16 |
| reed.glb | single plant | 0.06 x 0.64 x 0.03 |
| reed-dense.glb | wet-grass clump | ~0.46 x 0.71 x 0.40 |
| reed-sparse.glb | shallow-marsh clump | ~0.46 x 0.59 x 0.49 |

Heron height is ~5.4x sparrow. Duck has no standing legs.

## Materials

Named via extras on the root node (`species`, `kind`, `density`). PBR metallic 0, roughness 0.88.

Stem `#556B38`, head `#A07848` (only warm vegetation). Wings `#C8E0D4` alpha blend.

Do not put `#FFB060` on any mesh. That hex is dusk sun only. No windows, no lanterns.

## Not in this drop

Terrain, water, fog, dish. Wait for programmer slots.

## Repro

`/tmp/artvenv/bin/python /workspace/ansheng-art/gltf/build_glb.py`


## Species names

| file | en | zh |
|---|---|---|
| sparrow.glb | sparrow | 麻雀 |
| sandpiper.glb | sandpiper | 鹬 |
| duck.glb | duck | 鸭 |
| heron.glb | heron | 鹭 |
| dragonfly.glb | dragonfly | 蜻蜓 |

Never 鹜. 鹬 = yellow legs, needle bill, taller than sparrow, thinner than duck.

Dense reeds have 3 soft leaf blobs at the root so wet-grass reads as a mass. Sparse has none.

Bills use grey `#8A8478`, not reed-head `#A07848`. `#FFB060` is dusk sun only, never a mesh.
