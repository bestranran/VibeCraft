"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BLOCK_COLORS } from "@/lib/structure";
import { coordinateKey } from "@/lib/patches";
import type { BlockId, PendingEdit, VoxelBlock, VoxelStructure } from "@/lib/structure";

type VoxelCanvasProps = {
  structure: VoxelStructure;
  pendingEdit?: PendingEdit | null;
};

export function VoxelCanvas({ structure, pendingEdit }: VoxelCanvasProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [12, 11, 14], fov: 45 }}
      className="h-full min-h-[52vh] w-full lg:min-h-screen"
    >
      <color attach="background" args={["#1d1d1a"]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[10, 14, 8]} intensity={1.15} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-8, 8, -6]} intensity={0.35} />
      <VoxelScene structure={structure} pendingEdit={pendingEdit} />
      <GridFloor />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={42} />
    </Canvas>
  );
}

function VoxelScene({ structure, pendingEdit }: VoxelCanvasProps) {
  const scene = useMemo(() => {
    if (!pendingEdit) return { normal: structure.blocks, added: [] as VoxelBlock[], removed: [] as VoxelBlock[] };
    const changedKeys = new Set(pendingEdit.patch.changes.map((change) => coordinateKey(change.type === "replace" ? change.after : change.block)));
    const normal = pendingEdit.preview.blocks.filter((block) => !changedKeys.has(coordinateKey(block)));
    const added = pendingEdit.patch.changes.flatMap((change) => change.type === "add" ? [change.block] : change.type === "replace" ? [change.after] : []);
    const removed = pendingEdit.patch.changes.flatMap((change) => change.type === "remove" ? [change.block] : []);
    return { normal, added, removed };
  }, [pendingEdit, structure.blocks]);
  const groups = useMemo(() => groupBlocks(scene.normal), [scene.normal]);

  if (structure.blocks.length === 0 && !pendingEdit) {
    return null;
  }

  return (
    <group position={[0, 0.5, 0]}>
      {Object.entries(groups).map(([id, blocks]) => (
        <InstancedBlocks key={id} id={id as BlockId} blocks={blocks} />
      ))}
      <InstancedEdges blocks={scene.normal} />
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
    mesh.computeBoundingSphere();
  }, [blocks, dummy]);
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]} castShadow>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.14} transparent opacity={opacity} roughness={0.45} depthWrite={false} />
    </instancedMesh>
  );
}

function InstancedBlocks({ id, blocks }: { id: BlockId; blocks: VoxelBlock[] }) {
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
    mesh.computeBoundingSphere();
  }, [blocks, dummy]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]} castShadow receiveShadow>
      <boxGeometry args={[0.98, 0.98, 0.98]} />
      <meshStandardMaterial color={BLOCK_COLORS[id]} roughness={0.82} metalness={0.02} />
    </instancedMesh>
  );
}

function InstancedEdges({ blocks }: { blocks: VoxelBlock[] }) {
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
    mesh.computeBoundingSphere();
  }, [blocks, dummy]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]}>
      <boxGeometry args={[1.005, 1.005, 1.005]} />
      <meshBasicMaterial color="#17120d" wireframe transparent opacity={0.22} />
    </instancedMesh>
  );
}

function GridFloor() {
  return (
    <group>
      <gridHelper args={[32, 32, "#6f7f4f", "#36352f"]} position={[0, -0.02, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[32, 32]} />
        <meshStandardMaterial color="#202018" roughness={1} />
      </mesh>
    </group>
  );
}

function groupBlocks(blocks: VoxelBlock[]) {
  return blocks.reduce<Record<BlockId, VoxelBlock[]>>((acc, block) => {
    acc[block.id].push(block);
    return acc;
  }, {
    "minecraft:oak_planks": [],
    "minecraft:spruce_planks": [],
    "minecraft:stone_bricks": [],
    "minecraft:cobblestone": [],
    "minecraft:glass_pane": [],
    "minecraft:oak_log": [],
    "minecraft:spruce_stairs": [],
    "minecraft:brick": [],
    "minecraft:sandstone": [],
    "minecraft:red_sandstone": [],
    "minecraft:dark_oak_planks": [],
    "minecraft:lantern": []
  });
}
