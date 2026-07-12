# VibeCraft Studio

See [PRODUCT_RULES.md](./PRODUCT_RULES.md) for the product positioning and architectural boundaries, and [PLAN.md](./PLAN.md) for the phased execution plan.

VibeCraft Studio is an open source MVP for a browser-based Minecraft-style 3D voxel building editor. Type a building prompt, generate a small mock structure, inspect it in 3D, then export the build as a `.mcfunction` file full of `setblock` commands.

Edits can be planned by DeepSeek and are then executed by the local deterministic voxel engine. It does not connect to Minecraft yet.

## Features

- Prompt panel with example prompts and one-click generation.
- DeepSeek-planned initial generation using a validated `BuildingSpec` and deterministic parameterized builder.
- Mock prompt-to-structure generator for medieval cottages, Japanese tea houses, desert sandstone towers, and a default cottage.
- React Three Fiber voxel preview with orbit, pan, zoom, lighting, shadows, block outlines, and grid floor.
- Inspector panel with size, block count, and used block palette.
- `.mcfunction` export using relative coordinates such as `setblock ~0 ~0 ~0 minecraft:stone_bricks`.
- Iterative local edits with deterministic roof, window, chimney, path, floor, palette, and feature-removal operations.
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

To enable the real AI planner, enter a DeepSeek API key in the connection dialog shown on first launch, or use the key button in the canvas toolbar. The browser option keeps the key only in `sessionStorage` and sends it to this app's server for edit requests. For a shared deployment, you can instead create `.env.local` from `.env.example`, set `DEEPSEEK_API_KEY`, and restart the server. Without a key, or when DeepSeek is unavailable, edits use the local parser; the editor shows which planner handled the latest request.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Project Structure

```text
app/page.tsx
app/api/generate/route.ts
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
lib/structure-analysis.ts
```

## MVP Scope

This MVP focuses on the core creative loop:

1. Enter a prompt.
2. Generate a recognizable Minecraft-style structure using a local mock generator.
3. Preview it in a 3D browser canvas.
4. Preview a local, deterministic edit and accept or reject it.
5. Undo, redo, and continue editing without regenerating the building.
6. Export the accepted version as a Minecraft-compatible `.mcfunction` file.

The generated buildings are small and deterministic by design, but they include hollow interiors, doors, windows, roof layers, paths, decorative blocks, and block palettes.

## Roadmap

- DeepSeek-powered initial prompt-to-structure generation (editing is already supported).
- Screenshot/reference image input.
- `.schem` export.
- Minecraft mod/plugin bridge.
- OpenAI or Claude planner implementations behind the existing planner interface.
- Direct block placement editing.
- Saved projects and shareable structure presets.
