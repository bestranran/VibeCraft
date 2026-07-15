import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { normalizeSchematicStructure } from "./schematic-exporter";
import type { VoxelStructure } from "./structure";

export type McSchematicExport = {
  binary: Buffer;
  engine: "mcschematic";
};

export class McSchematicAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McSchematicAdapterError";
  }
}

export function mcschematicPaths(cwd = process.cwd()) {
  return {
    python: process.env.MCSCHEMATIC_PYTHON || path.join(cwd, "services", "schematic-exporter", ".venv", "bin", "python"),
    script: path.join(cwd, "services", "schematic-exporter", "export_schem.py")
  };
}

export async function isMcschematicAvailable(cwd = process.cwd()) {
  const paths = mcschematicPaths(cwd);
  try {
    await Promise.all([access(paths.python), access(paths.script)]);
    return true;
  } catch {
    return false;
  }
}

export async function exportWithMcschematic(structure: VoxelStructure, options: { cwd?: string; timeoutMs?: number } = {}): Promise<McSchematicExport> {
  normalizeSchematicStructure(structure);
  const cwd = options.cwd ?? process.cwd();
  const paths = mcschematicPaths(cwd);
  if (!(await isMcschematicAvailable(cwd))) {
    throw new McSchematicAdapterError("The project mcschematic runtime is not installed.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(paths.python, [paths.script], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error, binary?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ binary: binary!, engine: "mcschematic" });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new McSchematicAdapterError("mcschematic export timed out."));
    }, options.timeoutMs ?? 30_000);
    child.on("error", (error) => finish(new McSchematicAdapterError(`Could not start mcschematic: ${error.message}`)));
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 64 * 1024 * 1024) {
        child.kill("SIGKILL");
        finish(new McSchematicAdapterError("mcschematic output exceeded 64 MB."));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 500);
        finish(new McSchematicAdapterError(`mcschematic failed (${code ?? "signal"})${detail ? `: ${detail}` : "."}`));
        return;
      }
      const binary = Buffer.concat(stdout);
      if (binary.length < 2 || binary[0] !== 0x1f || binary[1] !== 0x8b) {
        finish(new McSchematicAdapterError("mcschematic returned an invalid gzip payload."));
        return;
      }
      finish(undefined, binary);
    });
    child.stdin.end(JSON.stringify({ minecraftVersion: "1.20.1", blocks: structure.blocks.map(({ x, y, z, id }) => ({ x, y, z, id })) }));
  });
}
