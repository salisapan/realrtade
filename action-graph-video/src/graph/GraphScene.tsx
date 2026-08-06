import { PerspectiveCamera } from "@react-three/drei";
import React, { useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { buildGraph, foldEnvelope, project4to3, rotate4 } from "./build";

const ACCENT = new THREE.Color("#3B74FF");
const ACCENT2 = new THREE.Color("#8FB4FF");
const EXPERT = new THREE.Color("#F3F7FF");
const FAR = new THREE.Color("#1B2C56");

function lerpColor(a: THREE.Color, b: THREE.Color, t: number) {
  return a.clone().lerp(b, Math.max(0, Math.min(1, t)));
}

export const GraphScene: React.FC<{
  readonly loop?: boolean;
  readonly assemble?: boolean;
}> = ({ loop = false, assemble = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const graph = useMemo(() => buildGraph(), []);
  const t = frame / fps;
  const durSec = durationInFrames / fps;

  const azw = t * 0.22;
  const axw = t * 0.15;

  // fold envelope: rest -> scattered "4D" formation -> rest. Sine period keeps it loop-safe.
  const fold = foldEnvelope(t, durSec, loop, interpolate, Easing);

  const assembleT = assemble
    ? interpolate(t, [0.15, 2.6], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 1;

  const camAngle = t * 0.12;
  const camRadius = 4.6 - fold * 0.5;
  const camY = 0.55 + Math.sin(t * 0.1) * 0.22;
  const camX = Math.sin(camAngle) * camRadius;
  const camZ = Math.cos(camAngle) * camRadius;

  const positions = useMemo(() => {
    return graph.nodes.map((n) => {
      const layerDelay = assemble ? (n.layer + 1) * 0.12 : 0;
      const localAssemble = assemble
        ? Math.max(0, Math.min(1, (assembleT - layerDelay) / 0.5))
        : 1;

      const rx = n.mx + (n.cx - n.mx) * fold;
      const ry = n.my + (n.cy - n.my) * fold;
      const rz = n.mz + (n.cz - n.mz) * fold;
      const rw = n.mw + (n.cw - n.mw) * fold;

      const rotated = rotate4(rx, ry, rz, rw, azw, axw);
      const p = project4to3(rotated.x, rotated.y, rotated.z, rotated.w);

      // assembly: nodes drift in from the apex before locking to their position
      const ax = n.mx * localAssemble;
      const ay = -0.4 + (n.my + 0.4) * localAssemble;
      const az = n.mz * localAssemble;

      return {
        x: assemble ? p.x * localAssemble + ax * (1 - localAssemble) : p.x,
        y: assemble ? p.y * localAssemble + ay * (1 - localAssemble) : p.y,
        z: assemble ? p.z * localAssemble + az * (1 - localAssemble) : p.z,
        scale: 0.3 + localAssemble * 0.7,
        opacity: localAssemble,
        depth: rotated.w,
      };
    });
  }, [graph.nodes, fold, azw, axw, assemble, assembleT]);

  const edgeGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array(graph.edges.length * 6);
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    return g;
  }, [graph.edges.length]);

  useMemo(() => {
    const arr = edgeGeometry.attributes.position.array as Float32Array;
    graph.edges.forEach(([a, b], i) => {
      const pa = positions[a];
      const pb = positions[b];
      arr[i * 6 + 0] = pa.x;
      arr[i * 6 + 1] = pa.y;
      arr[i * 6 + 2] = pa.z;
      arr[i * 6 + 3] = pb.x;
      arr[i * 6 + 4] = pb.y;
      arr[i * 6 + 5] = pb.z;
    });
    edgeGeometry.attributes.position.needsUpdate = true;
  }, [edgeGeometry, positions, graph.edges]);

  const edgeOpacity = 0.22 + fold * 0.25;

  return (
    <>
      <color attach="background" args={["#04060c"]} />
      <fog attach="fog" args={["#04060c", 4, 9]} />
      <PerspectiveCamera makeDefault position={[camX, camY, camZ]} fov={36} near={0.1} far={20} />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 2, 0]} intensity={2} color="#6E9BFF" />

      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial
          color={ACCENT}
          transparent
          opacity={edgeOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {positions.map((p, i) => {
        const n = graph.nodes[i];
        const depth = Math.max(0, Math.min(1, (p.z + 1.4) / 2.8));
        const color = n.expert ? EXPERT : n.apex ? lerpColor(FAR, ACCENT2, 0.8) : lerpColor(FAR, ACCENT2, depth);
        const baseSize = n.expert ? 0.075 : n.apex ? 0.045 : 0.03;
        const pulse = n.expert ? 1 + Math.sin(t * 2.6) * 0.18 : 1;
        return (
          <mesh key={i} position={[p.x, p.y, p.z]} scale={p.scale * pulse}>
            <sphereGeometry args={[baseSize, 12, 12]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={p.opacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
};
