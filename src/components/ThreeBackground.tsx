"use client";

import { Grid } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const BOX_COUNT = 25;
const COLORS = ["#1e40af", "#ea580c", "#3b82f6", "#f1f5f9", "#f59e0b"];
const DUMMY = new THREE.Object3D();

function MovingContainers() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const boxData = useMemo(
    () =>
      Array.from({ length: BOX_COUNT }).map(() => ({
        x: (Math.random() - 0.5) * 30,
        z: (Math.random() - 0.5) * 40,
        speed: 0.04 + Math.random() * 0.06,
      })),
    [],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    COLORS.forEach((color, ci) => {
      const start = Math.floor((ci / COLORS.length) * BOX_COUNT);
      const end = Math.floor(((ci + 1) / COLORS.length) * BOX_COUNT);
      const c = new THREE.Color(color);
      for (let i = start; i < end; i++) {
        meshRef.current!.setColorAt(i, c);
      }
    });
    meshRef.current.instanceColor!.needsUpdate = true;
  }, []);

  useFrame(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < BOX_COUNT; i++) {
      boxData[i].z += boxData[i].speed;
      if (boxData[i].z > 20) boxData[i].z = -30;
      DUMMY.position.set(boxData[i].x, 0.5, boxData[i].z);
      DUMMY.updateMatrix();
      meshRef.current.setMatrixAt(i, DUMMY.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BOX_COUNT]}>
      <boxGeometry args={[1, 1, 2.5]} />
      <meshStandardMaterial roughness={0.3} metalness={0.6} />
    </instancedMesh>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#020617"]} />
      <fog attach="fog" args={["#020617", 15, 40]} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 5]} intensity={1.5} />
      <pointLight position={[-10, 10, -10]} intensity={2} color="#3b82f6" />
      <pointLight position={[10, 5, 10]} intensity={2} color="#ea580c" />

      <MovingContainers />

      <Grid
        infiniteGrid
        fadeDistance={35}
        sectionColor="#334155"
        cellColor="#1e293b"
        cellSize={1}
        sectionSize={5}
        position={[0, 0, 0]}
      />
    </>
  );
}

function isWebGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("webgl2"))
    );
  } catch {
    return false;
  }
}

export default function ThreeBackground() {
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isWebGLAvailable());
    setReady(true);
  }, []);

  if (!ready || !supported) {
    return (
      <div className="absolute inset-0 -z-10 w-full h-full bg-[#020617]" />
    );
  }

  return (
    <div className="absolute inset-0 -z-10 w-full h-full bg-[#020617] overflow-hidden">
      <Canvas
        camera={{ position: [0, 8, 15], fov: 45 }}
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
