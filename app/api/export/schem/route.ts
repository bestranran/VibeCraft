import { NextResponse } from "next/server";
import { exportSchematic, SchematicExportError, toSchematicFilename } from "@/lib/schematic-exporter";
import { exportWithMcschematic } from "@/lib/mcschematic-adapter";
import type { VoxelStructure } from "@/lib/structure";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { structure?: unknown; minecraftVersion?: unknown };
    if (!body.structure || typeof body.structure !== "object") {
      return NextResponse.json({ error: "An accepted voxel structure is required." }, { status: 400 });
    }
    if (body.minecraftVersion !== undefined && body.minecraftVersion !== "1.20.1") {
      return NextResponse.json({ error: "Only Minecraft Java 1.20.1 is supported." }, { status: 400 });
    }
    const structure = body.structure as VoxelStructure;
    let binary: Buffer;
    let engine: "mcschematic" | "builtin";
    try {
      const exported = await exportWithMcschematic(structure);
      binary = exported.binary;
      engine = exported.engine;
    } catch (error) {
      console.warn("mcschematic adapter unavailable; using built-in Sponge v2 exporter.", error);
      binary = exportSchematic(structure, { minecraftVersion: "1.20.1" });
      engine = "builtin";
    }
    return new NextResponse(new Uint8Array(binary), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${toSchematicFilename(typeof structure.name === "string" ? structure.name : "vibecraft-structure")}"`,
        "Content-Length": String(binary.length),
        "Cache-Control": "no-store",
        "X-Minecraft-Version": "1.20.1",
        "X-Schematic-Format": "Sponge-v2",
        "X-Schematic-Engine": engine
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Schematic export failed.";
    return NextResponse.json({ error: message }, { status: error instanceof SchematicExportError ? 422 : 500 });
  }
}
