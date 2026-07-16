import { calculateStructureSize, normalizeStructure } from "./patches";
import type { BuildingSpec } from "./building-spec";
import type { BlockId, VoxelBlock, VoxelStructure } from "./structure";

export function generateFromSpec(spec: BuildingSpec): VoxelStructure {
  const map = new Map<string, VoxelBlock>();
  const set = (x: number, y: number, z: number, id: BlockId) => map.set(`${x},${y},${z}`, { x, y, z, id });
  const remove = (x: number, y: number, z: number) => map.delete(`${x},${y},${z}`);
  const hx = Math.floor(spec.width / 2);
  const hz = Math.floor(spec.depth / 2);
  const wallTop = Math.max(spec.wallHeight, spec.floors * 3 + 1);

  for (let x = -hx; x <= hx; x += 1) for (let z = -hz; z <= hz; z += 1) set(x, 0, z, spec.palette.foundation);
  for (let y = 1; y <= wallTop; y += 1) {
    for (let x = -hx; x <= hx; x += 1) { set(x, y, -hz, spec.palette.walls); set(x, y, hz, spec.palette.walls); }
    for (let z = -hz + 1; z < hz; z += 1) { set(-hx, y, z, spec.palette.walls); set(hx, y, z, spec.palette.walls); }
  }
  for (const [x, z] of [[-hx,-hz],[hx,-hz],[-hx,hz],[hx,hz]] as const) for (let y = 1; y <= wallTop + 1; y += 1) set(x, y, z, spec.palette.accent);
  remove(0, 1, -hz); remove(0, 2, -hz);
  for (let floor = 0; floor < spec.floors; floor += 1) {
    const y = Math.min(wallTop - 1, 2 + floor * 3);
    for (const x of [-Math.max(2, hx - 2), Math.max(2, hx - 2)]) { set(x, y, -hz, "minecraft:glass_pane"); set(x, y, hz, "minecraft:glass_pane"); }
    set(-hx, y, 0, "minecraft:glass_pane"); set(hx, y, 0, "minecraft:glass_pane");
  }

  if (spec.roof.type === "gable") addGableRoof(set, hx, hz, wallTop, spec);
  else if (spec.roof.type === "hip") addHipRoof(set, hx, hz, wallTop, spec);
  else addFlatRoof(set, hx, hz, wallTop, spec);

  if (spec.features.includes("porch")) {
    for (let x = -2; x <= 2; x += 1) for (let z = -hz - 2; z < -hz; z += 1) set(x, 0, z, spec.palette.foundation);
    for (const x of [-2, 2]) for (let y = 1; y <= 3; y += 1) set(x, y, -hz - 2, spec.palette.accent);
  }
  if (spec.features.includes("path")) for (let z = -hz - 1; z >= -hz - 7; z -= 1) set(0, 0, z, "minecraft:cobblestone");
  if (spec.features.includes("lanterns")) { set(-1, 3, -hz - 1, "minecraft:lantern"); set(1, 3, -hz - 1, "minecraft:lantern"); }
  if (spec.features.includes("chimney")) {
    const x = Math.max(1, hx - 2); const z = 1; const top = wallTop + spec.roof.height + 2;
    for (let y = wallTop; y <= top; y += 1) set(x, y, z, y === top ? "minecraft:cobblestone" : "minecraft:bricks");
  }

  const blocks = Array.from(map.values());
  return normalizeStructure({ name: slug(spec.name), size: calculateStructureSize(blocks), blocks });
}

function addGableRoof(set: (x:number,y:number,z:number,id:BlockId)=>void, hx:number, hz:number, wallTop:number, spec:BuildingSpec) {
  const run = hz + spec.roof.overhang;
  let previousY = wallTop + 1;
  for (let step = 0; step <= run; step += 1) {
    const zA = -run + step; const zB = run - step;
    const topY = wallTop + 1 + Math.round((step / Math.max(1, run)) * spec.roof.height);
    for (const z of new Set([zA, zB])) for (let x = -hx - spec.roof.overhang; x <= hx + spec.roof.overhang; x += 1) {
      for (let y = previousY; y <= topY; y += 1) set(x, y, z, spec.palette.roof);
    }
    previousY = topY;
  }
}

function addHipRoof(set: (x:number,y:number,z:number,id:BlockId)=>void, hx:number, hz:number, wallTop:number, spec:BuildingSpec) {
  const layers = Math.min(hx, hz) + spec.roof.overhang;
  for (let layer = 0; layer <= layers; layer += 1) {
    const x0 = -hx - spec.roof.overhang + layer, x1 = hx + spec.roof.overhang - layer;
    const z0 = -hz - spec.roof.overhang + layer, z1 = hz + spec.roof.overhang - layer;
    const y = wallTop + 1 + Math.round((layer / Math.max(1, layers)) * spec.roof.height);
    if (x0 > x1 || z0 > z1) break;
    for (let x=x0;x<=x1;x+=1) { set(x,y,z0,spec.palette.roof); set(x,y,z1,spec.palette.roof); }
    for (let z=z0;z<=z1;z+=1) { set(x0,y,z,spec.palette.roof); set(x1,y,z,spec.palette.roof); }
  }
}

function addFlatRoof(set: (x:number,y:number,z:number,id:BlockId)=>void, hx:number, hz:number, wallTop:number, spec:BuildingSpec) {
  for(let x=-hx-spec.roof.overhang;x<=hx+spec.roof.overhang;x+=1) for(let z=-hz-spec.roof.overhang;z<=hz+spec.roof.overhang;z+=1) set(x,wallTop+1,z,spec.palette.roof);
}

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vibecraft-build"; }
