# VibeCraft MVP Evaluation

Date: 2026-07-15  
Minecraft target: Java 1.20.1  
Schematic engine: `mcschematic 11.4.4`

## Result

Automated release gates pass. Final release remains pending one manual import check in a real Minecraft + WorldEdit environment.

| Style | Blocks | Size | Structure | Determinism | Style | `.schem` |
| --- | ---: | --- | --- | --- | --- | --- |
| Medieval cottage | 1,418 | 22 × 14 × 20 | Pass | Pass | Pass | Pass |
| Japanese house | 1,434 | 22 × 12 × 20 | Pass | Pass | Pass | Pass |
| Desert tower | 1,110 | 22 × 15 × 20 | Pass | Pass | Pass | Pass |
| Modern villa | 1,266 | 22 × 9 × 20 | Pass | Pass | Pass | Pass |
| Cyberpunk shop | 1,337 | 22 × 12 × 23 | Pass | Pass | Pass | Pass |

## Automated Metrics

- Compilation success: 100%
- Structural validation success: 100%
- Determinism: 100%
- Style-adherence checks: 100%
- Schematic generation: 100%
- Distinct silhouette signatures: 5/5
- Entrance validity: 5/5
- Hollow interior validity: 5/5
- Connected roof validity: 5/5
- Material contrast: 5/5
- Edit, diff, accept, undo, and redo round trip: Pass
- `mcschematic` save plus NBT reload checks: Pass

## Remaining Manual Gate

Import at least one representative generated `.schem` into Minecraft Java 1.20.1 using WorldEdit, then verify:

1. `//schem load <name>` succeeds without warnings.
2. Width, height, depth, and paste origin match the browser build.
3. Foundation, entrance, roof, glass, and sparse air regions paste correctly.
4. Only the accepted structure is present; an unaccepted preview is absent.

After this check, set `externalWorldEditVerified` to `true` when running the MVP evaluation to satisfy the final release gate.
