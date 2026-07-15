# VibeCraft Studio

See [PRODUCT_RULES.md](./PRODUCT_RULES.md) for the product positioning and architectural boundaries, and [PLAN.md](./PLAN.md) for the phased execution plan.

VibeCraft Studio is an open source MVP for a browser-based Minecraft-style 3D voxel building editor. Type a building prompt, generate a validated BuildScript structure, inspect it in 3D, then export it as a WorldEdit `.schem` or Minecraft `.mcfunction` file.

General edits can be planned by DeepSeek from component-aware context and are then executed by the local deterministic voxel engine. It does not connect to Minecraft yet.

## Features

- Prompt panel with example prompts and one-click generation.
- DeepSeek initial generation using one complete BuildScript v1 document, deterministic local compilation, structural validation, and at most one repair attempt.
- BuildScript operations for foundations, hollow shells, cylinders, roofs, entrances, windows, porches, paths, copying, and mirroring.
- Project documents retain the source BuildScript, original prompt, deterministic seed, provider, compiler version, validation warnings, and generation counts.
- DeepSeek-assisted `64×64` world planning with deterministic road/lot geometry, validation, seeds, and a top-down preview.
- Mock prompt-to-structure generator for medieval cottages, Japanese tea houses, desert sandstone towers, and a default cottage.
- React Three Fiber voxel preview with orbit, pan, zoom, lighting, shadows, block outlines, and grid floor.
- Inspector panel with size, block count, and used block palette.
- Server-side Sponge `.schem` v2 export for WorldEdit on Minecraft Java 1.20.1, including palette, sparse-air, origin, and offset handling.
- `.mcfunction` export using relative coordinates such as `setblock ~0 ~0 ~0 minecraft:stone_bricks`.
- Component-aware conversational edits using bounded fill, remove, replace, line, copy, and mirror tools across buildings and non-building subjects.
- A clearly labeled limited local building-edit fallback when no DeepSeek API key is available.
- Green/red instanced-mesh patch previews with Accept and Reject controls.
- Immutable edit history with Undo and Redo.
- Structure quality score, duplicate detection, and isolated-block warnings.
- Clear scene action that also resets pending edits and history.
- Responsive editor layout for desktop and mobile.

## Tech Stack

- Next.js
- TypeScript
- React Three Fiber / Three.js
- Tailwind CSS
- Local React state for MVP structure state

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js, usually `http://localhost:3000`.

To enable AI generation and editing, enter a DeepSeek API key in the connection dialog shown on first launch, or use the key button in the canvas toolbar. The browser option keeps the key only in `sessionStorage` and sends it to this app's server. For a shared deployment, you can instead create `.env.local` from `.env.example`, set `DEEPSEEK_API_KEY`, and restart the server. Without a key, initial generation uses the local offline fixture and edits use the local parser. Provider or validation failures preserve the current building.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:mvp
```

The `.schem` API prefers the project-local `mcschematic` adapter and falls back to the built-in Sponge v2 encoder if Python is unavailable. Install the adapter runtime with:

```bash
python3 -m venv services/schematic-exporter/.venv
services/schematic-exporter/.venv/bin/python -m pip install -r services/schematic-exporter/requirements.txt
```

See [MVP_EVALUATION.md](./MVP_EVALUATION.md) for the fixed-prompt release report and final WorldEdit verification gate.

## Project Structure

```text
app/page.tsx
app/api/generate/route.ts
app/api/export/schem/route.ts
app/api/world/plan/route.ts
components/StudioShell.tsx
components/VoxelCanvas.tsx
components/PromptPanel.tsx
components/InspectorPanel.tsx
lib/structure.ts
lib/generator.ts
lib/building-spec.ts
lib/parameterized-generator.ts
lib/exporters.ts
lib/building-operations.ts
lib/building-document.ts
lib/building-planner.ts
lib/deepseek-building-planner.ts
lib/operation-validation.ts
lib/local-edit-parser.ts
lib/patches.ts
lib/voxel-tools.ts
lib/voxel-edit-context.ts
lib/deepseek-voxel-edit-planner.ts
lib/build-script.ts
lib/build-script-compiler.ts
lib/build-script-structure-validator.ts
lib/deepseek-build-script-planner.ts
lib/schematic-exporter.ts
lib/mcschematic-adapter.ts
lib/world-planner.ts
lib/structure-analysis.ts
```

## MVP Scope

This MVP focuses on the core creative loop:

1. Enter a prompt.
2. Generate a recognizable Minecraft-style structure from a validated AI BuildScript or the local offline fallback.
3. Preview it in a 3D browser canvas.
4. Preview a local, deterministic edit and accept or reject it.
5. Undo, redo, and continue editing without regenerating the building.
6. Export the accepted version as a WorldEdit `.schem` or Minecraft `.mcfunction` file.

The generated buildings are small and deterministic by design, but they include hollow interiors, doors, windows, roof layers, paths, decorative blocks, and block palettes.

## Roadmap

- Fixed-prompt MVP evaluation and in-game WorldEdit compatibility checks.
- Screenshot/reference image input.
- Minecraft mod/plugin bridge.
- OpenAI or Claude planner implementations behind the existing planner interface.
- Direct block placement editing.
- Saved projects and shareable structure presets.
