import { parseEditCommand } from "./local-edit-parser";
import type { BuildingOperation, VoxelStructure } from "./structure";

export interface BuildingPlanner {
  planEdit(input: { command: string; structureSummary: string; availableOperations: string[] }, structure: VoxelStructure): Promise<BuildingOperation[]>;
}

export class LocalBuildingPlanner implements BuildingPlanner {
  async planEdit(input: { command: string; structureSummary: string; availableOperations: string[] }, structure: VoxelStructure) {
    return parseEditCommand(input.command, structure);
  }
}

// Future providers implement BuildingPlanner on the server; no SDK or API key is needed yet.
export type OpenAIBuildingPlanner = BuildingPlanner;
export type ClaudeBuildingPlanner = BuildingPlanner;
