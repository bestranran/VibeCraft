# VibeCraft Studio Execution Plan

This plan follows the selected direction: a text-only AI building agent powered by external APIs. VibeCraft will not train a model and will not require image understanding for the first product milestone.

## Product Goal

Create a Minecraft building workspace where a user can describe a scene, receive a structured voxel build, and continue changing bounded parts through natural language:

```text
Text prompt
-> AI world plan
-> staged voxel tools
-> structural validation
-> 3D diff preview
-> accept, reject, undo, or redo
-> Minecraft export
```

The first target is a coherent, editable `64×64` themed district, not an infinite world and not a one-shot screenshot recreation.

## Scope Rules

### Included

- Text-only DeepSeek API integration.
- One `64×64` scene with bounded height.
- District, road, lot, building, bridge, pipe, sign, and lighting concepts.
- Tool-based construction instead of raw per-block model output.
- Multi-stage generation with progress.
- Region-aware follow-up edits.
- Diff preview, Accept/Reject, Undo/Redo, and export.

### Deferred

- Screenshot or reference-image input.
- Training or hosting custom models.
- Infinite terrain and world streaming.
- Fully generated interiors for every building.
- Multiplayer collaboration.
- Direct world modification through a mod.
- Photorealistic Minecraft rendering.

## Core Architecture

### 1. World Plan

DeepSeek converts the user's prompt into a bounded semantic plan. It does not output thousands of block coordinates.

```ts
type WorldPlan = {
  id: string;
  name: string;
  theme: ThemeSpec;
  bounds: { width: 64; depth: 64; maxHeight: number };
  roads: RoadSpec[];
  lots: LotSpec[];
  landmarks: LandmarkSpec[];
  connections: ConnectionSpec[];
};

type LotSpec = {
  id: string;
  bounds: Box2D;
  purpose: "residential" | "commercial" | "industrial" | "utility";
  building: BuildingSpec;
  locked?: boolean;
};
```

The accepted `WorldPlan` is stored alongside `VoxelStructure`. Semantic IDs allow later requests such as “keep the central tower” or “make the west residential area denser.”

### 2. Voxel Tool Protocol

The model plans with high-level and batch tools. TypeScript implementations perform exact coordinate work.

Initial tool set:

```ts
type VoxelToolCall =
  | CreateFoundation
  | CreateBuildingShell
  | CreateGableRoof
  | CreateFlatRoof
  | CutEntrance
  | AddWindows
  | AddBalcony
  | AddFacadePattern
  | CreateRoad
  | CreateBridge
  | AddPipes
  | AddNeonSign
  | PlaceLights
  | ReplaceRegion
  | ClearRegion;
```

Every tool must:

- Validate arguments before execution.
- Stay inside scene and selection bounds.
- Produce a deterministic `StructurePatch`.
- Report actual blocks added, removed, skipped, or replaced.
- Be invertible through the existing history system.
- Refuse unsupported materials or oversized operations.

### 3. Staged Build Pipeline

Generation runs in visible stages:

1. Plan theme, roads, lots, and landmarks.
2. Build ground and roads.
3. Build shells and roofs.
4. Cut entrances and windows.
5. Add facades, bridges, pipes, signs, and lights.
6. Validate and repair.
7. Present one complete pending preview.

The accepted structure remains untouched until the user accepts the final patch.

### 4. Region-Aware Editing

Each generated block should be traceable to a semantic owner such as `road-main`, `lot-west-2`, or `landmark-central-tower`.

Follow-up editing flow:

```text
User command
-> resolve target region and locked regions
-> plan tool calls
-> enforce bounds and locks
-> execute against a copy
-> validate
-> show diff
```

Locked or explicitly preserved regions must not change.

## Milestone 1: Agent Foundation

### Goal

Replace the current fixed generation path with a safe tool execution foundation while preserving the existing editor workflow.

### Work

- Define `WorldPlan`, scene bounds, semantic regions, and tool-call schemas.
- Implement primitive tools: `fill`, `remove`, `replace`, `line`, `copy`, and `mirror`.
- Implement tool budgets for calls, coordinates, and changed blocks.
- Combine tool patches into one pending transaction.
- Add unit tests for bounds, collisions, determinism, inversion, and locked regions.
- Keep the existing local generator as an offline fixture, not the primary product path.

### Acceptance

- A deterministic tool plan creates the same patch every time.
- A tool cannot write outside `64×64` or above the height limit.
- Locked regions remain byte-for-byte unchanged.
- A multi-tool preview supports Accept, Reject, Undo, and Redo.

## Milestone 2: World Planner

### Goal

Convert one text prompt into a valid city layout before placing blocks.

### Work

- Add `/api/world/plan` using DeepSeek structured JSON output.
- Validate road widths, lot bounds, overlap, density, height, and material choices.
- Implement deterministic road and lot subdivision.
- Add a 2D plan preview or top-down overlay before voxel generation.
- Let users regenerate the plan without spending time compiling voxels.
- Store provider, prompt, seed, and plan version in the project document.

### Acceptance

Given:

```text
Create a compact cyberpunk district with one main road, six buildings of varied height,
a neon corporate tower, and two elevated walkways.
```

The planner returns:

- One connected main road.
- Six non-overlapping buildable lots.
- One clearly identified central landmark.
- Two valid bridge connections.
- All geometry inside `64×64` bounds.

## Milestone 3: District Compiler

### Goal

Compile a valid `WorldPlan` into a recognizable, navigable voxel district.

### Work

- Implement `createRoad`, `createFoundation`, `createBuildingShell`, `createFlatRoof`, and `createGableRoof`.
- Implement entrances, windows, facade patterns, balconies, and roof equipment.
- Implement cyberpunk details: pipes, signs, lights, vents, and elevated walkways.
- Add deterministic variation through project seeds.
- Associate generated blocks with semantic region IDs.
- Group instanced rendering by block and preview state.

### Acceptance

- The district contains six visually distinguishable buildings.
- Every required building has a traversable entrance.
- Roofs and bridges are connected and supported.
- Roads connect scene boundaries to the central area.
- The central tower reads as the dominant landmark.
- The same plan and seed produce the same blocks.

## Milestone 4: Validation and Repair

### Goal

Prevent obvious structural failures before a preview reaches the user.

### Work

- Detect disconnected components, floating roof layers, open gables, blocked entrances, unsupported bridges, collisions, and unreachable roads.
- Report separate metrics for structural validity, proportions, material balance, repetition, and detail density.
- Implement deterministic repairs for common failures.
- Allow DeepSeek one bounded repair-planning pass when deterministic repair is insufficient.
- Keep failed candidates out of the accepted document.

### Acceptance

- Known malformed fixtures are rejected or repaired.
- Validation identifies the semantic region responsible for each error.
- Repair cannot modify locked regions.
- The quality panel explains concrete problems instead of showing only one score.

## Milestone 5: Vibe Editing Loop

### Goal

Support useful regional follow-up commands without rebuilding the whole district.

### Work

- Add `/api/world/edit` with current plan summary, semantic regions, locks, and available tools.
- Resolve references such as east, west, central tower, residential area, and main road.
- Add region selection and lock/unlock controls in the editor.
- Show affected regions and estimated block changes before execution.
- Add staged progress, cancellation, and provider diagnostics.

### Acceptance

After generating the district, this command must work:

```text
Keep the central tower. Make the west residential area denser,
add more pipes, and connect its two tallest buildings with a bridge.
```

Success means:

- The central tower has zero block changes.
- Only west-region lots and the new connection change.
- The new bridge is supported and connects valid facades.
- Reject restores the original preview; Accept, Undo, and Redo are exact.

## Milestone 6: Minecraft Compatibility

### Goal

Make the district useful outside the browser.

### Work

- Introduce a Minecraft-version-specific `BlockRegistry`.
- Replace the small hard-coded `BlockId` union.
- Add user-provided resource-pack texture loading with fallback rendering.
- Implement Sponge `.schem` import and export.
- Preserve block states and offsets.
- Keep `.mcfunction` export for simple builds and debugging.

### Acceptance

- The selected Java version exposes its valid block registry.
- A generated district exports to `.schem` without losing supported states.
- Importing the exported fixture reproduces the same structure.
- No proprietary Minecraft textures are committed to the repository.

## Suggested Delivery Order

Work in this order and avoid parallel feature expansion:

1. Tool schemas and executor.
2. Locked semantic regions.
3. World planner.
4. Roads, lots, shells, and roofs.
5. Entrances and validation.
6. Cyberpunk detail tools.
7. Regional follow-up edits.
8. Versioned registry and `.schem`.

## First Vertical Slice

The first public demo should do exactly this:

```text
Prompt: Build a dense 64×64 cyberpunk district with six buildings,
a central neon tower, one main road, pipes, signs, and two skybridges.

Result: A structurally valid district appears in 3D.

Edit: Keep the central tower. Make the west side denser and add more pipes.

Result: Only the west region changes, with a diff preview and exact undo.
```

Do not add screenshot input, infinite worlds, or additional providers until this slice works reliably.

## Decisions Before Implementation

- Maximum scene height: recommended `64` blocks.
- Initial cyberpunk palette before the complete registry is available.
- Whether the plan preview is a lightweight 2D overlay or a top-down 3D mode.
- The first supported Minecraft Java version for `.schem` export.
