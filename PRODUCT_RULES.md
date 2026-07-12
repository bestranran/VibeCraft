# VibeCraft Studio Product Rules

## Positioning

VibeCraft Studio is an AI-assisted editing workspace for Minecraft builds, not another one-shot prompt-to-building model.

Its job is to make generated and existing builds controllable after the first result:

```text
Bring a build -> describe a change -> preview the diff -> accept or reject -> export anywhere
```

The product should feel like vibe coding for Minecraft building: conversational, iterative, inspectable, and reversible.

## Core User Promise

A user can bring or create a build, describe a local change in natural language, understand exactly what will change, and safely continue editing without losing unrelated work.

The quality of the product is measured by control after generation, not by claiming that one model can create every building from scratch.

## Product Pillars

### 1. Bring Your Build

- Accept structures created by users, mods, procedural tools, and external models.
- Treat `.schem`, `.litematic`, `.mcfunction`, and provider output as inputs to one shared document format.
- Preserve source metadata where practical.

### 2. Vibe Edit

- Natural-language edits should be local by default.
- Every edit produces a visible block-level diff before it changes the accepted document.
- Accept, reject, undo, and redo are mandatory parts of the editing loop.
- Selection, regions, and semantic parts such as roof, wall, path, and room should constrain edits.
- Ambiguous destructive requests must ask for clarification or produce a preview, never silently rebuild everything.

### 3. Send It Anywhere

- Export the accepted version, never an unaccepted preview.
- Support open interchange formats before building a proprietary format.
- Keep the browser editor independent from any one Minecraft mod or server implementation.

## Architecture Rules

### Stable Intermediate Representation

`VoxelStructure` remains the shared block-level format. Higher-level document metadata may describe regions, components, selections, versions, and edit history, but exporters and renderers should not depend on a specific AI provider.

### Providers, Not Lock-In

- Diffusion models, LLM agents, procedural generators, imported structures, and game mods are providers.
- No single generation provider is the product.
- Provider failures must not corrupt the current document.
- AI credentials stay server-side or in the current browser session and are never committed.

### Hybrid Editing

Use the best tool for each job:

- AI for intent, planning, style, decomposition, and critique.
- Voxel tools for exact placement, fill, replace, mirror, copy, and removal.
- Parametric components as optional shortcuts, not the limit of possible buildings.
- Validators for bounds, collisions, unsupported blocks, disconnected parts, entrances, and roof continuity.

AI may use constrained voxel operations, but raw unvalidated model output must never directly replace the accepted structure.

### Patch-First Changes

- Every edit is represented as a `StructurePatch`.
- Patches must be deterministic to apply and invert.
- Unchanged coordinates must remain unchanged.
- New edits clear the redo stack only after acceptance.
- Large or destructive patches require explicit confirmation.

### Versioned Block Registry

- Block IDs are loaded from a Minecraft-version-specific registry, not maintained as a small hard-coded union.
- Rendering assets come from user-provided game resources or resource packs; copyrighted Mojang textures are not committed to the open-source repository.
- Unsupported models use a clear fallback representation and remain exportable when their IDs are valid for the selected version.
- Block states and orientation must eventually be represented separately from the base block ID.

## Build Quality Rules

- Buildings must have a traversable entrance when an entrance is requested.
- Interiors should be hollow unless the request explicitly calls for a solid object.
- Roof surfaces, ridges, eaves, and gables must be connected and closed.
- Decorative blocks require support unless the Minecraft block intentionally allows otherwise.
- Features must not overwrite doors, critical structure, or unrelated selected regions.
- Validation runs after every generated candidate and edit preview.
- A failed quality check should trigger repair, another candidate, or a clear warning.
- Visual appeal cannot be reduced to one score; silhouette, proportions, palette, rhythm, detail density, and structural validity should be reported separately.

## Interaction Rules

- The first screen is the working editor, not a landing page.
- The current accepted structure, pending preview, provider, selection, and export state must always be understandable.
- Added, removed, and replaced blocks use distinct preview treatments.
- Long-running AI actions show progress and remain cancellable when possible.
- Errors are written for builders, not API developers.
- Desktop should prioritize dense three-panel work; mobile may stack panels without hiding core actions.

## Scope Discipline

VibeCraft Studio should not:

- Compete with diffusion research on raw one-shot generation quality.
- Rebuild the full Minecraft client renderer before validating the editing workflow.
- Pretend a fixed template library is general AI creation.
- Couple saved projects to DeepSeek, OpenAI, Claude, or any single provider.
- Execute unreviewed AI changes directly inside a Minecraft world.
- Redistribute proprietary Minecraft textures in the repository.

## Near-Term Roadmap

1. Import and export `.schem` with version-aware block IDs.
2. Replace the hard-coded palette with a versioned `BlockRegistry` and resource-pack importer.
3. Add box, brush, and semantic region selection.
4. Expose safe voxel tools to an AI editing agent.
5. Add orthographic views and structural validation feedback.
6. Import results from external generators and diffusion providers.
7. Build a Minecraft mod/plugin bridge with ghost preview and explicit confirmation.

## Definition of Success

The key validation scenario is:

```text
Import an existing build
-> select the roof
-> request a material and shape change
-> preview only the intended block diff
-> accept, undo, and redo
-> export a valid structure without damaging the rest of the build
```

If this workflow is faster and more controllable than rebuilding generated output by hand, VibeCraft Studio is doing useful work.
