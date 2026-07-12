# VibeCraft Studio Execution Plan

This plan turns the principles in [PRODUCT_RULES.md](./PRODUCT_RULES.md) into an incremental delivery sequence.

## Product Goal

Build the editing and interoperability layer for AI-assisted Minecraft creation:

```text
Import or generate a build
-> select what matters
-> describe a change
-> inspect the voxel diff
-> accept, reject, undo, or redo
-> export to a real Minecraft workflow
```

The near-term priority is control over existing builds. Improving one-shot generation is secondary and can be handled by interchangeable providers.

## Phase 0: Stabilize the Current Prototype

Status: next

### Goals

- Stop malformed procedural output from reaching the accepted document.
- Make provider behavior and failures visible.
- Establish fixtures for visual and structural regression testing.

### Work

- Add structural validators for entrances, hollow interiors, connected roofs, closed gables, supported decorations, and disconnected components.
- Run validation before showing a generated candidate or edit preview.
- Reject or repair invalid results instead of assigning a misleading single quality score.
- Add deterministic generator fixtures and screenshot tests for desktop and mobile.
- Add cancellation and clear progress states for DeepSeek requests.
- Separate generation errors from edit errors and preserve the current accepted structure on failure.

### Acceptance

- No roof layer can float away from the building.
- A generated house has a two-block-high traversable entrance.
- Invalid AI output cannot modify the accepted document.
- The main workflows pass TypeScript, lint, unit, build, and visual regression checks.

## Phase 1: Versioned Block Registry

### Goals

- Replace the hard-coded 12-block union with a Minecraft-version-aware registry.
- Allow the application to understand the complete block ID set without redistributing Mojang assets.

### Work

- Introduce `BlockRef` with block ID and optional block-state properties.
- Add `BlockRegistry` APIs for search, categories, state definitions, model metadata, and fallback colors.
- Select and persist a target Minecraft Java version per project.
- Import block metadata from an open data source or user-supplied version data.
- Add a resource-pack importer for user-provided textures, blockstates, and models.
- Render unknown or unsupported models with an explicit fallback material.
- Replace the palette list with searchable categories and recently used blocks.
- Keep proprietary textures out of Git.

### Acceptance

- A project can load the complete registry for one supported Java version.
- Users can search and select any valid block ID from that version.
- Valid unsupported models remain exportable and are visibly marked in preview.
- Existing structures migrate without losing their block IDs.

## Phase 2: Real Structure Import and Export

### Goals

- Let users bring existing work into VibeCraft.
- Make `.schem` the primary interchange format while retaining `.mcfunction`.

### Work

- Implement Sponge `.schem` parsing and writing.
- Preserve dimensions, palette, block states, offsets, and metadata.
- Add drag-and-drop import with format and version diagnostics.
- Add export validation and compatibility warnings.
- Evaluate `.litematic` support after `.schem` is stable.
- Add fixture files from permissively licensed or original test structures.

### Acceptance

- Importing and re-exporting a fixture preserves every coordinate, block ID, and supported state.
- Imported builds appear correctly centered and framed in 3D.
- Export always uses the accepted document, never a pending preview.
- Corrupt or unsupported files fail with useful messages and do not clear the current project.

## Phase 3: Selection and Direct Editing

### Goals

- Give users precise control over the scope of AI and manual edits.
- Make the editor useful even without an AI provider.

### Work

- Add click, box, layer, connected-component, and semantic-region selection.
- Add move, copy, delete, fill, replace, mirror, and rotate tools.
- Add keyboard-accessible tool modes and clear selection overlays.
- Store selection separately from `VoxelStructure`.
- Convert every manual operation into the same reversible patch history used by AI edits.
- Add orthographic front, side, and top views.

### Acceptance

- Users can select a roof or arbitrary box without selecting the rest of the build.
- Manual edits produce diff previews and support undo/redo.
- Selection remains stable while orbiting and changing views.
- Large selections use instancing and do not create one React component per block.

## Phase 4: Voxel Tool Agent

### Goals

- Move beyond fixed building operations without allowing unchecked coordinate dumps.
- Let AI construct and edit novel geometry through safe batch tools.

### Work

- Define validated tools: `set`, `fill`, `replace`, `remove`, `line`, `copy`, `mirror`, and `rotate`.
- Give the planner project metadata, registry search, selection bounds, orthographic summaries, and recent history.
- Execute plans in stages with block, coordinate, and operation budgets.
- Return actual tool results and validation findings to the model for repair.
- Require a patch preview before acceptance.
- Support provider adapters for DeepSeek and future local or hosted models.
- Log plans and tool results locally for debugging without logging API keys.

### Acceptance

- The agent can modify a selected roof while leaving all out-of-selection blocks unchanged.
- A multi-step request can use several tools in one preview.
- Invalid IDs, coordinates, or oversized operations are rejected before execution.
- Repeating the same accepted tool plan produces the same patch.

## Phase 5: Visual Feedback and Candidate Repair

### Goals

- Let the agent evaluate actual geometry rather than relying only on text summaries.
- Improve results through critique and repair instead of a single generation attempt.

### Work

- Render consistent front, side, top, and perspective snapshots.
- Add structural metrics for silhouette, proportions, palette balance, repetition, support, and connectivity.
- Allow providers with vision support to critique snapshots.
- Generate a small number of bounded candidates for high-impact changes.
- Rank candidates with structural checks and present meaningful differences to the user.
- Add an explicit repair pass for failed validation.

### Acceptance

- The system detects and repairs a known open-gable fixture.
- Candidate generation never alters the accepted version until the user confirms one.
- Users can compare candidates by both image and block-level change summary.

## Phase 6: Minecraft Bridge

### Goals

- Preview and apply accepted changes inside Minecraft.
- Keep world modification explicit and reversible.

### Work

- Choose an initial bridge target after user research: Fabric mod or Paper plugin.
- Define a local authenticated protocol for project metadata and patches.
- Render ghost blocks before placement.
- Apply changes in bounded batches with progress and cancellation.
- Record inverse patches for in-game undo.
- Handle version and registry mismatches before sending blocks.

### Acceptance

- A browser patch can be previewed in a test world without modifying it.
- Confirmation applies exactly the accepted coordinates and block states.
- Undo restores the previous world state for the applied patch.
- The bridge refuses mismatched versions rather than silently substituting blocks.

## Provider Strategy

VibeCraft should integrate providers rather than bet the product on one model:

- Existing deterministic generator: development fallback and fixtures.
- DeepSeek: natural-language planning and early voxel-tool agent.
- External diffusion or structure-generation services: optional initial-build providers.
- Imported `.schem` and `.litematic`: first-class sources.
- Future local models: privacy-friendly provider option.

All providers must output a validated structure, specification, or tool plan through a shared adapter boundary.

## Immediate Milestone

The next shippable milestone combines the smallest useful parts of Phases 0–2:

1. Support one explicit Minecraft Java version.
2. Introduce the dynamic block registry and remove the hard-coded `BlockId` union.
3. Add user-provided resource-pack import with texture fallbacks.
4. Import and export a minimal Sponge `.schem` fixture.
5. Validate entrance, connected roof, gable closure, and disconnected blocks.
6. Preserve the current diff, Accept/Reject, and Undo/Redo workflow.

The milestone is complete when a user can import a real small house, inspect its full palette, make a bounded material edit, undo it, and export a structurally equivalent `.schem`.

## Decisions Needed

- Initial Minecraft Java version to support.
- First bridge target: Fabric or Paper.
- Block metadata source and licensing review.
- Whether resource packs are stored only in browser storage or optionally on a self-hosted server.
- First external generation provider worth integrating after import/edit workflows are validated.
