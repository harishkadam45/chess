"use client";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Spark explosion where a piece is captured. */
export function Burst({ x, z, color, onDone }: { x: number; z: number; color: string; onDone: () => void }) {
  const N = 90;
  const pts = useRef<THREE.Points>(null!);
  const age = useRef(0);
  const { positions, vel } = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = 1.2 + Math.random() * 3.2;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = 1.5 + up * 3.5;
      vel[i * 3 + 2] = Math.sin(a) * sp;
      positions[i * 3 + 1] = 0.3 + Math.random() * 0.5;
    }
    return { positions, vel };
  }, []);

  useFrame((_, dt) => {
    age.current += dt;
    const attr = pts.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      vel[i * 3 + 1] -= 9 * dt;
      attr.array[i * 3] += vel[i * 3] * dt;
      attr.array[i * 3 + 1] = Math.max(0, attr.array[i * 3 + 1] + vel[i * 3 + 1] * dt);
      attr.array[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    attr.needsUpdate = true;
    (pts.current.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age.current / 1.1);
    if (age.current > 1.1) onDone();
  });

  return (
    <points ref={pts} position={[x, 0, z]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.14}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        sizeAttenuation
      />
    </points>
  );
}

/** Expanding ring where a piece lands. */
export function Shockwave({ x, z, color, delay = 0.4 }: { x: number; z: number; color: string; delay?: number }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  useEffect(() => {
    const m = mesh.current;
    m.scale.setScalar(0.01);
    mat.current.opacity = 0;
    const tl = gsap.timeline({ delay });
    tl.set(mat.current, { opacity: 0.95 })
      .to(m.scale, { x: 5, y: 5, z: 5, duration: 0.8, ease: "power2.out" }, 0)
      .to(mat.current, { opacity: 0, duration: 0.8, ease: "power1.in" }, 0);
    return () => {
      tl.kill();
    };
  }, [delay]);
  return (
    <mesh ref={mesh} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.18, 0.24, 64]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
