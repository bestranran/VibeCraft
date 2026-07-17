"use client";

import { Bounds, OrbitControls, useBounds } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadMinecraftModelPack, type MinecraftModelPack } from "@/lib/minecraft-model-renderer";
import { getBlockColor, SCENE_SIZE } from "@/lib/structure";
import { coordinateKey } from "@/lib/patches";
import type { BlockId, PendingEdit, VoxelBlock, VoxelStructure } from "@/lib/structure";
import { useTheme } from "@/components/redesign/ThemeProvider";

type VoxelCanvasProps = {
  structure: VoxelStructure;
  pendingEdit?: PendingEdit | null;
};

export function VoxelCanvas({ structure, pendingEdit }: VoxelCanvasProps) {
  const { resolved } = useTheme();
  const themeColors = useMemo(() => readCanvasTheme(resolved), [resolved]);
  return (
    <Canvas
      shadows
      camera={{ position: [12, 11, 14], fov: 45 }}
      className="h-full min-h-full w-full"
    >
      <color attach="background" args={[themeColors.background]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[10, 14, 8]} intensity={1.15} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-8, 8, -6]} intensity={0.35} />
      <Bounds fit clip observe margin={1.25} maxDuration={0.8}>
        <VoxelScene structure={structure} pendingEdit={pendingEdit} />
      </Bounds>
      <GridFloor colors={themeColors} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={SCENE_SIZE * 2.5} />
    </Canvas>
  );
}

function VoxelScene({ structure, pendingEdit }: VoxelCanvasProps) {
  const boundsApi = useBounds();
  const scene = useMemo(() => {
    if (!pendingEdit) return { normal: structure.blocks, added: [] as VoxelBlock[], removed: [] as VoxelBlock[] };
    const changedKeys = new Set(pendingEdit.patch.changes.map((change) => coordinateKey(change.type === "replace" ? change.after : change.block)));
    const normal = pendingEdit.preview.blocks.filter((block) => !changedKeys.has(coordinateKey(block)));
    const added = pendingEdit.patch.changes.flatMap((change) => change.type === "add" ? [change.block] : change.type === "replace" ? [change.after] : []);
    const removed = pendingEdit.patch.changes.flatMap((change) => change.type === "remove" ? [change.block] : []);
    return { normal, added, removed };
  }, [pendingEdit, structure.blocks]);
  const groups = useMemo(() => groupBlocks(scene.normal), [scene.normal]);
  const blockIds = useMemo(() => [...new Set(groups.map((group) => group.id))].sort(), [groups]);
  const blockIdKey = blockIds.join("|");
  const [modelPackState, setModelPackState] = useState<{ key: string; pack: MinecraftModelPack | null } | null>(null);
  const modelPack = modelPackState?.key === blockIdKey ? modelPackState.pack : null;
  useEffect(() => {
    let active = true;
    void loadMinecraftModelPack(blockIds).then((pack) => {
      if (active) setModelPackState({ key: blockIdKey, pack });
    });
    return () => { active = false; };
  // blockIdKey is the stable palette identity; blockIds is recreated with the same contents as blocks move.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdKey]);
  const center = useMemo(() => {
    const blocks = pendingEdit?.preview.blocks ?? structure.blocks;
    if (!blocks.length) return [0, 0.5, 0] as const;
    const xs = blocks.map((block) => block.x); const zs = blocks.map((block) => block.z);
    return [-((Math.min(...xs) + Math.max(...xs)) / 2), 0.5, -((Math.min(...zs) + Math.max(...zs)) / 2)] as const;
  }, [pendingEdit, structure.blocks]);
  const fitKey = useMemo(() => {
    const blocks = pendingEdit?.preview.blocks ?? structure.blocks;
    if (!blocks.length) return "empty";
    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (const block of blocks) {
      minX = Math.min(minX, block.x); minY = Math.min(minY, block.y); minZ = Math.min(minZ, block.z);
      maxX = Math.max(maxX, block.x); maxY = Math.max(maxY, block.y); maxZ = Math.max(maxZ, block.z);
    }
    return `${blocks.length}:${minX},${minY},${minZ}:${maxX},${maxY},${maxZ}`;
  }, [pendingEdit, structure.blocks]);
  useLayoutEffect(() => {
    if (fitKey === "empty") return;
    boundsApi.refresh().clip().fit();
  }, [boundsApi, fitKey, modelPack]);

  if (structure.blocks.length === 0 && !pendingEdit) {
    return null;
  }

  return (
    <group position={center}>
      {groups.map((group) => (
        <InstancedBlocks
          key={group.key}
          id={group.id}
          blocks={group.blocks}
          properties={group.properties}
          modelPack={modelPack}
        />
      ))}
      {scene.added.length > 0 && <PreviewBlocks blocks={scene.added} color="#41d69a" opacity={0.72} />}
      {scene.removed.length > 0 && <PreviewBlocks blocks={scene.removed} color="#ef655a" opacity={0.5} />}
    </group>
  );
}

function PreviewBlocks({ blocks, color, opacity }: { blocks: VoxelBlock[]; color: string; opacity: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    blocks.forEach((block, index) => {
      dummy.position.set(block.x, block.y, block.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [blocks, dummy]);
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]} castShadow>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.14} transparent opacity={opacity} roughness={0.45} depthWrite={false} />
    </instancedMesh>
  );
}

function InstancedBlocks({ id, blocks, properties, modelPack }: {
  id: BlockId;
  blocks: VoxelBlock[];
  properties: Record<string, string>;
  modelPack: MinecraftModelPack | null;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const propertyKey = Object.entries(properties).sort().map(([key, value]) => `${key}=${value}`).join(",");
  const geometry = useMemo(
    () => modelPack?.getGeometry(id, properties) ?? null,
    // propertyKey is a stable serialization of the inferred block state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, modelPack, propertyKey],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    blocks.forEach((block, index) => {
      dummy.position.set(block.x, block.y, block.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [blocks, dummy, geometry]);

  return (
    <instancedMesh ref={meshRef} args={[geometry ?? undefined, undefined, blocks.length]} castShadow receiveShadow>
      {!geometry && <boxGeometry args={[0.98, 0.98, 0.98]} />}
      {geometry && modelPack ? (
        <meshStandardMaterial
          map={modelPack.atlasTexture}
          vertexColors
          alphaTest={0.02}
          transparent
          opacity={id === "minecraft:water" ? 0.72 : 1}
          emissive={isEmissiveBlock(id) ? "#ffffff" : "#000000"}
          emissiveMap={isEmissiveBlock(id) ? modelPack.atlasTexture : null}
          emissiveIntensity={isEmissiveBlock(id) ? 0.32 : 0}
          roughness={0.9}
          metalness={0}
        />
      ) : (
        <meshStandardMaterial color={getBlockColor(id)} roughness={0.82} metalness={0.02} />
      )}
    </instancedMesh>
  );
}

function isEmissiveBlock(id: BlockId) {
  return /(?:lantern|glowstone|shroomlight|froglight|magma|lava|redstone_lamp|sea_pickle)/.test(id);
}

function GridFloor({ colors }: { colors: CanvasTheme }) {
  return (
    <group>
      <gridHelper args={[SCENE_SIZE + 16, SCENE_SIZE + 16, colors.gridMajor, colors.gridMinor]} position={[0, -0.02, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[SCENE_SIZE + 16, SCENE_SIZE + 16]} />
        <meshStandardMaterial color={colors.floor} roughness={1} />
      </mesh>
    </group>
  );
}

type CanvasTheme = { background: string; gridMajor: string; gridMinor: string; floor: string };

function readCanvasTheme(_resolvedTheme: "light" | "dark"): CanvasTheme {
  if (typeof document === "undefined") {
    return { background: "#1e1c2c", gridMajor: "#4a4752", gridMinor: "#35323c", floor: "#211f29" };
  }
  const styles = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: value("--canvas-background", "#1e1c2c"),
    gridMajor: value("--canvas-grid-major", "#4a4752"),
    gridMinor: value("--canvas-grid-minor", "#35323c"),
    floor: value("--canvas-floor", "#211f29"),
  };
}

type RenderGroup = {
  key: string;
  id: BlockId;
  properties: Record<string, string>;
  blocks: VoxelBlock[];
};

function groupBlocks(blocks: VoxelBlock[]): RenderGroup[] {
  const occupied = new Set(blocks.map((block) => `${block.x},${block.y},${block.z}`));
  const groups = new Map<string, RenderGroup>();
  for (const block of blocks) {
    const properties = inferredConnectionProperties(block, occupied);
    const state = Object.entries(properties).sort().map(([key, value]) => `${key}=${value}`).join(",");
    const key = `${block.id}[${state}]`;
    let group = groups.get(key);
    if (!group) {
      group = { key, id: block.id, properties, blocks: [] };
      groups.set(key, group);
    }
    group.blocks.push(block);
  }
  return [...groups.values()];
}

function inferredConnectionProperties(block: VoxelBlock, occupied: Set<string>): Record<string, string> {
  const id = block.id;
  const isPaneOrFence = id === "minecraft:iron_bars" || id.endsWith("_pane") || id.endsWith("_fence");
  const isWall = id.endsWith("_wall");
  if (!isPaneOrFence && !isWall) return {};
  const neighbors = {
    north: occupied.has(`${block.x},${block.y},${block.z - 1}`),
    east: occupied.has(`${block.x + 1},${block.y},${block.z}`),
    south: occupied.has(`${block.x},${block.y},${block.z + 1}`),
    west: occupied.has(`${block.x - 1},${block.y},${block.z}`),
  };
  if (isWall) {
    return {
      north: neighbors.north ? "low" : "none",
      east: neighbors.east ? "low" : "none",
      south: neighbors.south ? "low" : "none",
      west: neighbors.west ? "low" : "none",
      up: "true",
    };
  }
  return Object.fromEntries(Object.entries(neighbors).map(([direction, connected]) => [direction, connected ? "true" : "false"]));
}
