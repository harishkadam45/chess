"use client";
import { Environment, Lightformer, MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { BoardTheme } from "@/lib/boardTheme";

function GlowRing({ radius, color, speed, y }: { radius: number; color: string; speed: number; y: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    ref.current.rotation.z += dt * speed;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <torusGeometry args={[radius, 0.025, 8, 160, Math.PI * 1.55]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** The frame, glowing edges, floor and atmosphere around the board. */
export function Arena({ high, look }: { high: boolean; look: BoardTheme["arena"] }) {
  return (
    <>
      <color attach="background" args={[look.background]} />
      <fog attach="fog" args={[look.fog, 20, 52]} />

      {/* keyed: the environment is baked once (frames=1), so rebuild it when the theme changes */}
      <Environment key={look.lightA + look.lightB} resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} color={look.lightA} position={[-8, 4, 4]} scale={[10, 4, 1]} rotation-y={Math.PI / 2.5} />
        <Lightformer form="rect" intensity={3} color={look.lightB} position={[8, 4, -4]} scale={[10, 4, 1]} rotation-y={-Math.PI / 2.5} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 9, 0]} scale={6} rotation-x={Math.PI / 2} />
      </Environment>

      <ambientLight intensity={look.ambient} />
      <directionalLight
        position={[4, 11, 7]}
        intensity={1.4}
        castShadow={high}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
      />
      <pointLight position={[-7, 3.5, 5]} color={look.lightA} intensity={look.pointIntensity} distance={22} decay={2} />
      <pointLight position={[7, 3.5, -5]} color={look.lightB} intensity={look.pointIntensity} distance={22} decay={2} />
      <pointLight position={[0, 2.5, 0]} color={look.lightCenter} intensity={10} distance={9} decay={2} />

      {/* board slab + glowing edge: one colour on White's side, another on Black's */}
      <mesh position={[0, -0.33, 0]} receiveShadow>
        <boxGeometry args={[9, 0.42, 9]} />
        <meshStandardMaterial color={look.slab.color} metalness={look.slab.metalness} roughness={look.slab.roughness} />
      </mesh>
      {[
        { p: [0, -0.1, 4.46], s: [9.1, 0.07, 0.07], c: look.edges[0] },
        { p: [0, -0.1, -4.46], s: [9.1, 0.07, 0.07], c: look.edges[1] },
        { p: [4.46, -0.1, 0], s: [0.07, 0.07, 9.1], c: look.edges[2] },
        { p: [-4.46, -0.1, 0], s: [0.07, 0.07, 9.1], c: look.edges[2] },
      ].map((e, i) => (
        <mesh key={i} position={e.p as [number, number, number]}>
          <boxGeometry args={e.s as [number, number, number]} />
          <meshBasicMaterial color={e.c} toneMapped={false} />
        </mesh>
      ))}

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.56, 0]}>
        <planeGeometry args={[90, 90]} />
        {high ? (
          <MeshReflectorMaterial
            blur={[260, 80]}
            resolution={512}
            mixBlur={1}
            mixStrength={28}
            roughness={0.9}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.3}
            color={look.floor}
            metalness={0.6}
            mirror={0.5}
          />
        ) : (
          <meshStandardMaterial color={look.floor} metalness={0.7} roughness={0.5} />
        )}
      </mesh>

      {look.rings.map((c, i) => (
        <GlowRing key={c + i} radius={[7.2, 8.1, 9.2][i] ?? 9.2} color={c} speed={[0.25, -0.18, 0.1][i] ?? 0.1} y={-0.5} />
      ))}

      <Sparkles key={look.sparkles[0]} count={high ? 110 : 30} scale={[15, 6, 15]} position={[0, 2.5, 0]} size={2.4} speed={0.35} color={look.sparkles[0]} />
      {high && <Sparkles key={look.sparkles[1]} count={70} scale={[15, 6, 15]} position={[0, 2.5, 0]} size={2.2} speed={0.3} color={look.sparkles[1]} />}
    </>
  );
}
