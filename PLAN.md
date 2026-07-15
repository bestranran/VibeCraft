# VibeCraft Studio Product Execution Plan

> Status: Milestones 1-6 are implemented. The active plan starts at Milestone 7 and focuses on general conversational editing.

## Product Goal

Build a small but complete conversational text-to-Minecraft workflow:

```text
User prompt
-> AI-generated JSON BuildScript
-> deterministic VibeCraft compiler
-> editable VoxelStructure
-> natural-language voxel edits
-> browser diff preview, Accept/Reject, Undo/Redo
-> .schem or .mcfunction export
```

The product succeeds when a user can describe a recognizable building or object, preview it, correct specific parts through normal conversation, and load the accepted result in Minecraft through WorldEdit.

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

The active product direction replaces the legacy seven-operation building editor with general voxel-tool editing:

```text
Accepted VoxelStructure
-> user edit command
-> component-aware structure summary
-> AI returns bounded voxel tool calls
-> deterministic local execution
-> block-level diff preview
-> Accept or Reject
-> exact Undo and Redo
```

Generated blocks keep `ownerId` values such as `left-arm`, `fountain-basin`, `main-house`, or `front-porch`. The editor summarizes each owner group by bounds, block count, and materials so the AI can target named parts without receiving every voxel as prompt text.

BuildScript source should be stored with generated project metadata for reproducibility. `VoxelStructure` remains the source of truth for current preview, accepted edits, history, and export.

The editable tool set is deliberately generic:

- `fill`
- `remove`
- `replace`
- `line`
- `copy`
- `mirror`

The system enforces only execution safety: scene bounds, coordinate validity, materials, locked regions, call budgets, and changed-block budgets. It does not classify the subject or force doors, roofs, foundations, grounding, or architectural semantics.

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

## Milestone 7: General Conversational Editing

### Goal

Make generation quality recoverable through conversation. A user should be able to keep the current result and correct one part without regenerating the whole scene.

### Work

1. Add a component-aware edit context derived from the accepted `VoxelStructure`:
   - Overall scene bounds and palette.
   - Per-`ownerId` bounds, materials, and block count.
   - Generation metadata and BuildScript operation IDs when available.
   - Optional writable selection bounds when the UI later provides a selection.
2. Add a DeepSeek voxel-edit planner that receives the current context and the user's exact instruction.
3. Make the planner return validated `fill`, `remove`, `replace`, `line`, `copy`, and `mirror` calls.
4. Allow one repair attempt only for invalid JSON or invalid tool-call format.
5. Replace the legacy building-operation path in `/api/edit` with the general planner.
6. Execute returned calls through the existing deterministic voxel engine.
7. Convert the execution into the existing pending diff preview.
8. Reuse Accept, Reject, Undo, Redo, history, locked regions, and export without changing their semantics.
9. Keep the local seven-operation parser only as an explicitly labeled limited fallback when no AI key is available.

### Safety Rules

- Never mutate the accepted document before the user accepts the preview.
- Never silently regenerate the full scene for an edit request.
- Reject out-of-bounds coordinates and invalid tool schemas.
- Enforce call, visited-coordinate, and changed-block budgets.
- Preserve unrelated owner groups unless the user's instruction explicitly affects them.
- Provider or planning failures leave the accepted structure byte-for-byte unchanged.

### Acceptance

- On a robot, “make the left arm two blocks thicker” changes the left arm without changing the torso or right arm.
- On a fountain, “expand the basin and make the water blue” does not add a roof, door, or building facade.
- On a building, “remove the chimney” removes the chimney without regenerating the building.
- “Copy the right tower to the left” produces a bounded copy or mirror edit.
- Every successful edit appears as a diff preview before it can affect the accepted structure.
- Accept, Reject, Undo, and Redo remain lossless across several consecutive general edits.
- Robot, fountain, and building fixtures all pass edit-scope and history tests.

### Explicit Non-Goals

- No manual subject classification.
- No forced building semantics.
- No multi-candidate generation.
- No automatic aesthetic ranking.
- No requirement that the first generation be final-quality.

## Milestone 8: Project Persistence and Recovery

### Work

- Persist the accepted structure, generation metadata, semantic regions, history, future stack, and pending preview locally.
- Restore the latest project after refresh.
- Add a clear recovery path for incompatible or corrupted saved data.
- Keep DeepSeek API keys in session-only storage; never persist them with the project.

### Acceptance

- Refresh restores the accepted project and edit history.
- Undo and Redo still work after restoration.
- A pending preview is either restored safely or discarded explicitly; it is never silently accepted.
- Clearing a project removes its persisted local data.

## Milestone 9: Conversational Workflow Evaluation

Test complete user journeys rather than only first-generation quality:

1. Generate a robot, make two localized geometry edits, change one material, undo, redo, and export.
2. Generate a fountain, resize the basin, remove one decoration, and export.
3. Generate a building, modify the roof and facade, reject one preview, accept another, and export.

Release criteria:

- At least 80% of the fixed edit prompts produce a valid preview without manual JSON repair.
- No accepted edit changes coordinates outside the intended component or declared writable region in scope-controlled fixtures.
- Failed edits never replace the accepted structure.
- Restored projects export identically to the same project before refresh.
- Representative exported `.schem` files still load in WorldEdit.

## Active Delivery Order

Implement sequentially and avoid unrelated feature expansion:

1. Component-aware edit context.
2. DeepSeek general voxel-edit planner.
3. `/api/edit` migration and deterministic tool execution.
4. Existing preview/history UI integration.
5. Cross-subject edit-scope tests.
6. Local persistence and recovery.
7. Complete conversational workflow evaluation.

Do not add authentic resource rendering, multi-version support, `.schem` import, multi-candidate generation, aesthetic ranking, or additional AI providers until the conversational edit loop works reliably.
