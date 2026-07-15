# VibeCraft Studio MVP Execution Plan

## Product Goal

Build a small but complete text-to-Minecraft workflow:

```text
User prompt
-> AI-generated JSON BuildScript
-> deterministic VibeCraft compiler
-> editable VoxelStructure
-> browser preview and diff editing
-> .schem or .mcfunction export
```

The MVP is successful when a user can describe a recognizable building, preview it, make a bounded natural-language edit, and load the exported `.schem` in Minecraft through WorldEdit.

## Architecture Decision

AI generates a declarative JSON BuildScript, not raw per-block output, arbitrary Python, or `.schem` binary data.

```text
AI                       design, proportions, materials, composition
BuildScript compiler     exact geometry and architectural invariants
VoxelStructure           preview, diff, history, and editing source of truth
mcschematic              final .schem serialization only
```

BuildScript is a small VibeCraft-owned API. Its operations compile to the existing primitive voxel tools (`fill`, `remove`, `replace`, `line`, `copy`, and `mirror`). This preserves the current editor and avoids coupling generation to one export format.

## MVP Scope

### Included

- Text-only DeepSeek generation.
- JSON BuildScript v1.
- One bounded `64 x 64 x 64` scene.
- A maximum of approximately `100,000` generated blocks.
- Deterministic local compilation into `VoxelStructure`.
- Existing browser voxel preview.
- Existing natural-language edit preview, Accept/Reject, Undo, and Redo.
- Basic structural validation and one bounded AI repair attempt.
- Minecraft Java Edition 1.20.1 as the initial export target.
- `.schem` export through a server-side mcschematic adapter.
- Existing `.mcfunction` export.

### Deferred

- AI-generated or executed arbitrary Python.
- Resource-pack importing and authentic Minecraft textures.
- Accurate models for stairs, doors, fences, lanterns, and other non-cube blocks.
- Complete block-state and orientation support.
- Multiple Minecraft versions.
- `.schem` import.
- Screenshot or reference-image input.
- Infinite terrain, large districts, and world streaming.
- Multiplayer collaboration and direct server/world modification.
- Model training or hosting.

## BuildScript v1

BuildScript is versioned JSON with explicit bounds, a palette, and an ordered list of high-level building operations.

```ts
type BuildScript = {
  version: 1;
  name: string;
  bounds: { width: 64; depth: 64; maxHeight: 64 };
  palette: Record<string, BlockId>;
  operations: BuildScriptOperation[];
};
```

Example:

```json
{
  "version": 1,
  "name": "japanese-house",
  "bounds": { "width": 64, "depth": 64, "maxHeight": 64 },
  "palette": {
    "foundation": "minecraft:stone_bricks",
    "walls": "minecraft:oak_planks",
    "roof": "minecraft:spruce_planks",
    "accent": "minecraft:dark_oak_planks",
    "glass": "minecraft:glass_pane"
  },
  "operations": [
    {
      "type": "hollowBox",
      "id": "main-house",
      "origin": [20, 1, 22],
      "size": [20, 8, 16],
      "wall": "minecraft:oak_planks",
      "floor": "minecraft:stone_bricks"
    },
    {
      "type": "gableRoof",
      "id": "main-roof",
      "target": "main-house",
      "height": 5,
      "overhang": 2,
      "material": "minecraft:spruce_planks"
    }
  ]
}
```

### Initial Operations

BuildScript v1 should remain deliberately small:

1. `foundation`
2. `hollowBox`
3. `cylinder`
4. `gableRoof`
5. `flatRoof`
6. `entrance`
7. `windows`
8. `porch`
9. `path`
10. `copyMirror`

Each operation must:

- Validate all arguments before compilation.
- Stay inside the scene bounds.
- Use an allowed material.
- Produce deterministic voxel operations.
- Carry a semantic `ownerId` into generated blocks.
- Respect operation, coordinate, and changed-block budgets.
- Report the blocks it added, removed, replaced, or skipped.

## Generation Workflow

The initial generation request follows this pipeline:

```text
User prompt
-> DeepSeek receives BuildScript API documentation, rules, and a few examples
-> DeepSeek returns one complete BuildScript JSON document
-> schema, material, reference, and budget validation
-> compile high-level operations into primitive voxel tool calls
-> execute locally into a candidate VoxelStructure
-> structural validation
-> optional single AI repair attempt with concrete diagnostics
-> return the candidate to the existing 3D editor
```

The model chooses style, dimensions, palette, composition, and operation parameters. The compiler owns coordinate math and guarantees for hollow shells, connected roofs, safe openings, and bounds.

No provider response may directly replace the accepted structure before local validation succeeds.

## Validation and Repair

The MVP validator checks concrete structural failures rather than attempting a complete aesthetic score.

Required checks:

- All operations and blocks remain inside bounds.
- The structure does not exceed block budgets.
- Referenced component IDs exist.
- A requested building has a traversable entrance.
- Main interiors remain hollow.
- Roof geometry is connected.
- The primary structure has an acceptable connected-component ratio.
- Large floating components are rejected.
- The palette contains basic material contrast.
- No duplicate coordinates remain in the compiled structure.

If validation fails after successful compilation, DeepSeek may receive the original BuildScript plus concise diagnostics and return one complete corrected BuildScript. A second failure is shown to the user without replacing their current structure.

## Editing Workflow

The MVP keeps the existing edit system:

```text
Accepted VoxelStructure
-> user edit command
-> AI or local planner selects bounded edit operations
-> deterministic local execution
-> block-level diff preview
-> Accept or Reject
-> exact Undo and Redo
```

Generated blocks keep `ownerId` values such as `main-house`, `main-roof`, or `front-porch`. Full semantic region editing is deferred, but these IDs create a stable upgrade path for later commands such as “change only the main roof.”

BuildScript source should be stored with generated project metadata for reproducibility. `VoxelStructure` remains the source of truth for current preview, accepted edits, history, and export.

## Minecraft Export

`.schem` export happens after generation and editing; it is not an AI output format.

```text
Accepted VoxelStructure
-> validate block IDs and dimensions
-> normalize origin and offsets
-> server-side mcschematic adapter
-> return .schem binary
```

Suggested layout:

```text
app/api/export/schem/route.ts
services/schematic-exporter/export_schem.py
services/schematic-exporter/requirements.txt
```

The export menu offers:

```text
Export
|- WorldEdit Schematic (.schem)
`- Minecraft Function (.mcfunction)
```

The MVP exports base block IDs. Accurate orientation and complete BlockState preservation remain deferred until the core generation loop is validated.

## Milestone 1: BuildScript Foundation

### Work

- Add BuildScript v1 TypeScript types.
- Implement schema and cross-reference validation.
- Implement `foundation`, `hollowBox`, `gableRoof`, and `flatRoof`.
- Compile these operations into the existing voxel tool protocol.
- Preserve semantic owner IDs.
- Add deterministic compiler fixtures and budget tests.

### Acceptance

- The same BuildScript always creates the same blocks.
- Invalid references, materials, dimensions, or bounds are rejected before execution.
- A basic hollow building with either roof type compiles without duplicate coordinates.
- Existing primitive voxel-tool tests remain green.

## Milestone 2: Complete BuildScript v1

### Work

- Implement `cylinder`, `entrance`, `windows`, `porch`, `path`, and `copyMirror`.
- Prevent windows from overwriting entrances and critical supports.
- Ensure roof and entrance helpers derive their geometry from target components.
- Add structural validation for entrances, hollow interiors, connectivity, and floating components.

### Acceptance

- The compiler can express medieval, Japanese, desert, modern, and cyberpunk test buildings.
- Every building fixture has a traversable entrance and hollow main interior.
- Roof fixtures are connected and remain inside bounds.
- Mirrored or copied components remain deterministic and preserve ownership metadata.

## Milestone 3: DeepSeek BuildScript Planner

### Work

- Replace staged low-level generation output with one complete BuildScript JSON response.
- Provide the model with concise API documentation and two to four varied examples.
- Validate provider output before compilation.
- Return concrete validation diagnostics.
- Allow one complete-script repair attempt.
- Preserve the existing local generator as an offline fallback and test fixture.

### Acceptance

- Fixed evaluation prompts usually compile on the first attempt or after one repair.
- Provider errors never replace the current accepted structure.
- Different architectural prompts produce meaningfully different geometry, not only palette changes.
- The UI reports provider, operation count, block count, and validation warnings.

## Milestone 4: Editor Integration

### Work

- Return the compiled `VoxelStructure` through the existing generation API.
- Reuse the current Three.js preview and inspector.
- Preserve current edit preview, Accept/Reject, Undo, and Redo behavior.
- Store BuildScript source, seed, provider, and compiler version as project metadata.
- Keep generated `ownerId` values through patches and history.

### Acceptance

- A generated building can be edited without regenerating the full structure.
- Reject leaves the accepted structure unchanged.
- Accept, Undo, and Redo reproduce exact block states.
- Generation and editing failures preserve the current document.

## Milestone 5: `.schem` Export

### Work

- Add the server-side mcschematic adapter.
- Add coordinate normalization, version selection, temporary-file cleanup, and response headers.
- Add `.schem` to the export UI while retaining `.mcfunction`.
- Add exporter fixtures for negative coordinates and sparse palettes.
- Validate representative files in Minecraft with WorldEdit.

### Acceptance

- WorldEdit loads the exported `.schem` successfully.
- Width, height, depth, origin, materials, and base block placement match the browser structure.
- Export always uses the accepted structure, never an unaccepted preview.
- Export failures do not modify the project.

## Milestone 6: MVP Evaluation and Release

Use a fixed prompt set covering:

- Medieval cottage.
- Japanese house.
- Desert tower.
- Modern villa.
- Cyberpunk shop.

Evaluate:

- Prompt and style adherence.
- Recognizable silhouette.
- Entrance validity.
- Hollow interior validity.
- Roof connectivity.
- Material contrast.
- Compilation success rate.
- Determinism for the same script and seed.
- Edit, diff, and history correctness.
- Successful WorldEdit import.

The MVP is release-ready when:

- Most evaluation prompts compile on the first attempt or after one repair.
- All accepted results stay within bounds and budgets.
- The five styles are structurally distinct.
- A generated build can be edited, undone, redone, and exported.
- Representative `.schem` files load correctly in Minecraft.

## Delivery Order

Implement sequentially and avoid unrelated feature expansion:

1. BuildScript types and validation.
2. Core shell and roof operations.
3. Openings, details, and mirroring.
4. Structural validation.
5. DeepSeek BuildScript generation and one repair attempt.
6. Editor and metadata integration.
7. `.schem` export.
8. Fixed-prompt evaluation and WorldEdit verification.

Do not add authentic resource rendering, multi-version support, `.schem` import, districts, or additional AI providers until this vertical slice works reliably.
