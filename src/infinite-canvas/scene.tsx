import { KeyboardControls, Stats, useKeyboardControls, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { DepthOfField, EffectComposer } from "@react-three/postprocessing";
import * as React from "react";
import * as THREE from "three";
import { useIsTouchDevice } from "~/src/use-is-touch-device";
import { clamp, lerp } from "~/src/utils";
import {
  CHUNK_FADE_MARGIN,
  CHUNK_OFFSETS,
  CHUNK_SIZE,
  DEPTH_FADE_END,
  DEPTH_FADE_START,
  DEPTH_NEAR_FADE,
  INITIAL_CAMERA_Z,
  INVIS_THRESHOLD,
  MAX_VELOCITY,
  RENDER_DISTANCE_X,
  RENDER_DISTANCE_YZ,
  VELOCITY_LERP,
} from "./constants";
import styles from "./style.module.css";
import { getCoverTexture, getTexture } from "./texture-manager";
import type { ChunkData, InfiniteCanvasProps, MediaItem, PlaneData } from "./types";
import { generateChunkPlanesCached, getChunkUpdateThrottleMs, shouldThrottleUpdate } from "./utils";

const geometryCache = new Map<string, THREE.BufferGeometry>();

function getPlaneGeometry(aspect: number, radius: number): THREE.BufferGeometry {
  const r = Math.min(Math.max(0, radius), aspect / 2, 0.5);
  const key = `${aspect.toFixed(4)}_${r.toFixed(4)}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  let geo: THREE.BufferGeometry;

  if (r <= 0) {
    geo = new THREE.PlaneGeometry(aspect, 1);
  } else {
    const w = aspect, h = 1;
    const x0 = -w / 2, y0 = -h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x0 + r, y0);
    shape.lineTo(x0 + w - r, y0);
    shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    shape.lineTo(x0 + w, y0 + h - r);
    shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    shape.lineTo(x0 + r, y0 + h);
    shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    shape.lineTo(x0, y0 + r);
    shape.quadraticCurveTo(x0, y0, x0 + r, y0);
    geo = new THREE.ShapeGeometry(shape, 8);
    // ShapeGeometry UVs = raw vertex positions; remap to [0,1]
    const uvs = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvs.count; i++) {
      uvs.setXY(i, (uvs.getX(i) + w / 2) / w, (uvs.getY(i) + h / 2) / h);
    }
    uvs.needsUpdate = true;
  }

  geometryCache.set(key, geo);
  return geo;
}

// Default auto-scroll speed (can be overridden via prop)
const DEFAULT_SCROLL_SPEED = 0.35;

const KEYBOARD_MAP = [
  { name: "forward", keys: ["ArrowUp"] },
  { name: "backward", keys: ["ArrowDown"] },
  { name: "left", keys: ["ArrowLeft"] },
  { name: "right", keys: ["ArrowRight"] },
];

type KeyboardKeys = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};


type CameraGridState = {
  cx: number;
  cy: number;
  cz: number;
  camZ: number;
  globalOpacity: number;
};

function MediaPlane({
  position,
  scale,
  media,
  chunkCx,
  chunkCy,
  chunkCz,
  cameraGridRef,
  planeScale,
  cornerRadius,
}: {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  media: MediaItem;
  chunkCx: number;
  chunkCy: number;
  chunkCz: number;
  cameraGridRef: React.RefObject<CameraGridState>;
  planeScale: number;
  cornerRadius: number;
}) {
  const isColorPlane = Boolean(media.color);
  const planeAspect = scale.x / scale.y;
  const geometry = React.useMemo(() => getPlaneGeometry(planeAspect, cornerRadius), [planeAspect, cornerRadius]);

  const meshRef = React.useRef<THREE.Mesh>(null);
  const materialRef = React.useRef<THREE.MeshBasicMaterial>(null);
  const localState = React.useRef({ opacity: 0, frame: 0, ready: isColorPlane });

  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);
  const [isReady, setIsReady] = React.useState(isColorPlane);

  useFrame(() => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    const state = localState.current;

    if (!material || !mesh) {
      return;
    }

    state.frame = (state.frame + 1) & 1;

    if (state.opacity < INVIS_THRESHOLD && !mesh.visible && state.frame === 0) {
      return;
    }

    const cam = cameraGridRef.current;
    // Normalize x distance by ratio so both axes hit their fade boundary at the same normalized value
    const scaledDx = Math.abs(chunkCx - cam.cx) * (RENDER_DISTANCE_YZ / RENDER_DISTANCE_X);
    const dist = Math.max(scaledDx, Math.abs(chunkCy - cam.cy), Math.abs(chunkCz - cam.cz));
    const absDepth = Math.abs(position.z - cam.camZ);

    if (absDepth > DEPTH_FADE_END + 50) {
      state.opacity = 0;
      material.opacity = 0;
      material.depthWrite = false;
      mesh.visible = false;
      return;
    }

    const gridFade =
      dist <= RENDER_DISTANCE_YZ ? 1 : Math.max(0, 1 - (dist - RENDER_DISTANCE_YZ) / Math.max(CHUNK_FADE_MARGIN, 0.0001));

    const depthFade =
      absDepth <= DEPTH_FADE_START
        ? 1
        : Math.max(0, 1 - (absDepth - DEPTH_FADE_START) / Math.max(DEPTH_FADE_END - DEPTH_FADE_START, 0.0001));

    const nearFade = absDepth < DEPTH_NEAR_FADE ? absDepth / DEPTH_NEAR_FADE : 1;
    const target = Math.min(gridFade, depthFade * depthFade, nearFade) * cam.globalOpacity;

    state.opacity = target < INVIS_THRESHOLD && state.opacity < INVIS_THRESHOLD ? 0 : lerp(state.opacity, target, 0.18);

    const isFullyOpaque = state.opacity > 0.99;
    material.opacity = isFullyOpaque ? 1 : state.opacity;
    material.depthWrite = isFullyOpaque;
    mesh.visible = state.opacity > INVIS_THRESHOLD;
  });

  // Load texture (or clear it for color planes)
  React.useEffect(() => {
    const state = localState.current;
    const material = materialRef.current;

    if (isColorPlane) {
      // Clear any leftover texture from a previous image state
      if (material) {
        material.map = null;
        material.needsUpdate = true;
      }
      state.ready = true;
      setIsReady(true);
      return;
    }

    state.ready = false;
    state.opacity = 0;
    setIsReady(false);

    if (material) {
      material.opacity = 0;
      material.depthWrite = false;
      material.map = null;
    }

    const tex = getTexture(media, () => {
      state.ready = true;
      setIsReady(true);
    });

    setTexture(tex);
  }, [media, isColorPlane]);

  // Apply texture when ready (skipped for color planes)
  React.useEffect(() => {
    if (isColorPlane) return;

    const material = materialRef.current;
    const mesh = meshRef.current;
    const state = localState.current;

    if (!material || !mesh || !texture || !isReady || !state.ready) {
      return;
    }

    material.map = getCoverTexture(media, planeAspect) ?? texture;
    material.opacity = state.opacity;
    material.depthWrite = state.opacity >= 1;
    mesh.scale.set(scale.y * planeScale, scale.y * planeScale, 1);
  }, [scale, texture, isReady, isColorPlane, media, planeScale, planeAspect]);

  if (!isColorPlane && (!texture || !isReady)) {
    return null;
  }

  return (
    <mesh ref={meshRef} position={position} scale={[scale.y * planeScale, scale.y * planeScale, 1]} visible={false} geometry={geometry}>
      <meshBasicMaterial ref={materialRef} transparent opacity={0} color={media.color ?? "#ffffff"} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Chunk({
  cx,
  cy,
  cz,
  media,
  cameraGridRef,
  planeScale,
  planeDensity,
  planeSpread,
}: {
  cx: number;
  cy: number;
  cz: number;
  media: MediaItem[];
  cameraGridRef: React.RefObject<CameraGridState>;
  planeScale: number;
  planeDensity: number;
  planeSpread: number;
}) {
  const [planes, setPlanes] = React.useState<PlaneData[] | null>(null);

  React.useEffect(() => {
    let canceled = false;
    const run = () => !canceled && setPlanes(generateChunkPlanesCached(cx, cy, cz, planeDensity, planeSpread));

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 100 });

      return () => {
        canceled = true;
        cancelIdleCallback(id);
      };
    }

    const id = setTimeout(run, 0);
    return () => {
      canceled = true;
      clearTimeout(id);
    };
  }, [cx, cy, cz, planeDensity, planeSpread]);

  if (!planes) {
    return null;
  }

  return (
    <group>
      {planes.map((plane) => {
        const mediaItem = media[plane.mediaIndex % media.length];

        if (!mediaItem) {
          return null;
        }

        return (
          <MediaPlane
            key={plane.id}
            position={plane.position}
            scale={plane.scale}
            media={mediaItem}
            chunkCx={cx}
            chunkCy={cy}
            chunkCz={cz}
            cameraGridRef={cameraGridRef}
            planeScale={planeScale}
            cornerRadius={plane.cornerRadius}
          />
        );
      })}
    </group>
  );
}

type ControllerState = {
  velocity: { x: number; y: number; z: number };
  targetVel: { x: number; y: number; z: number };
  basePos: { x: number; y: number; z: number };
  lastChunkKey: string;
  lastChunkUpdate: number;
  pendingChunk: { cx: number; cy: number; cz: number } | null;
};

const createInitialState = (camZ: number): ControllerState => ({
  velocity: { x: 0, y: 0, z: 0 },
  targetVel: { x: 0, y: 0, z: 0 },
  basePos: { x: 0, y: 0, z: camZ },
  lastChunkKey: "",
  lastChunkUpdate: 0,
  pendingChunk: null,
});

function SceneController({
  media,
  onTextureProgress,
  onScrollStart,
  autoScrollSpeed = DEFAULT_SCROLL_SPEED,
  planeScale = 1,
  planeDensity = 5,
  planeSpread = 1,
}: {
  media: MediaItem[];
  onTextureProgress?: (progress: number) => void;
  onScrollStart?: () => void;
  autoScrollSpeed?: number;
  planeScale?: number;
  planeDensity?: number;
  planeSpread?: number;
}) {
  const { camera } = useThree();
  const [, getKeys] = useKeyboardControls<keyof KeyboardKeys>();

  const state = React.useRef<ControllerState>(createInitialState(INITIAL_CAMERA_Z));
  const cameraGridRef = React.useRef<CameraGridState>({ cx: 0, cy: 0, cz: 0, camZ: INITIAL_CAMERA_Z, globalOpacity: 0 });

  // velX/velZ: scroll direction unit vector, set by arrow keys
  const scrollStartFired = React.useRef(false);

  const introRef = React.useRef<{ phase: "intro" | "scroll"; velX: number; velZ: number; startTime: number; scrollStartTime: number }>(
    Math.random() < 0.5
      ? { phase: "intro", velX: 1, velZ: 0, startTime: -1, scrollStartTime: -1 }
      : { phase: "intro", velX: 0, velZ: -1, startTime: -1, scrollStartTime: -1 }
  );

  const [chunks, setChunks] = React.useState<ChunkData[]>([]);

  const { progress } = useProgress();
  const maxProgress = React.useRef(0);

  React.useEffect(() => {
    const rounded = Math.round(progress);

    if (rounded > maxProgress.current) {
      maxProgress.current = rounded;
      onTextureProgress?.(rounded);
    }
  }, [progress, onTextureProgress]);

  useFrame(() => {
    const s = state.current;
    const now = performance.now();
    const intro = introRef.current;

    // --- Intro fade phase: camera is still, shapes fade in, then scroll begins ---
    const INTRO_DURATION = 2500; // ms
    if (intro.phase === "intro") {
      if (intro.startTime < 0) intro.startTime = now;
      const t = Math.min((now - intro.startTime) / INTRO_DURATION, 1);
      const eased = t * t; // ease-in: slow appear, then faster

      if (t >= 1) {
        intro.phase = "scroll";
        if (!scrollStartFired.current) {
          scrollStartFired.current = true;
          onScrollStart?.();
        }
      }

      const cx = Math.floor(s.basePos.x / CHUNK_SIZE);
      const cy = Math.floor(s.basePos.y / CHUNK_SIZE);
      const cz = Math.floor(s.basePos.z / CHUNK_SIZE);
      cameraGridRef.current = { cx, cy, cz, camZ: s.basePos.z, globalOpacity: eased };
      return;
    }

    // Arrow keys change scroll direction and skip any remaining ramp
    const SCROLL_RAMP_DURATION = 2500; // ms
    if (intro.scrollStartTime < 0) intro.scrollStartTime = now;

    const { forward, backward, left, right } = getKeys();
    if (forward)        { intro.velX = 0;  intro.velZ = -1; intro.scrollStartTime = now - SCROLL_RAMP_DURATION; }
    else if (backward)  { intro.velX = 0;  intro.velZ =  1; intro.scrollStartTime = now - SCROLL_RAMP_DURATION; }
    else if (left)      { intro.velX = -1; intro.velZ =  0; intro.scrollStartTime = now - SCROLL_RAMP_DURATION; }
    else if (right)     { intro.velX =  1; intro.velZ =  0; intro.scrollStartTime = now - SCROLL_RAMP_DURATION; }

    // Ease-in ramp: starts still, accelerates to full speed
    const rampT = Math.min((now - intro.scrollStartTime) / SCROLL_RAMP_DURATION, 1);
    const rampFactor = rampT * rampT;

    s.targetVel.x = intro.velX * autoScrollSpeed * rampFactor;
    s.targetVel.z = intro.velZ * autoScrollSpeed * rampFactor;

    s.targetVel.x = clamp(s.targetVel.x, -MAX_VELOCITY, MAX_VELOCITY);
    s.targetVel.z = clamp(s.targetVel.z, -MAX_VELOCITY, MAX_VELOCITY);

    s.velocity.x = lerp(s.velocity.x, s.targetVel.x, VELOCITY_LERP);
    s.velocity.z = lerp(s.velocity.z, s.targetVel.z, VELOCITY_LERP);

    s.basePos.x += s.velocity.x;
    s.basePos.z += s.velocity.z;

    camera.position.set(s.basePos.x, s.basePos.y, s.basePos.z);

    const cx = Math.floor(s.basePos.x / CHUNK_SIZE);
    const cy = Math.floor(s.basePos.y / CHUNK_SIZE);
    const cz = Math.floor(s.basePos.z / CHUNK_SIZE);

    cameraGridRef.current = { cx, cy, cz, camZ: s.basePos.z, globalOpacity: 1 };

    const key = `${cx},${cy},${cz}`;
    if (key !== s.lastChunkKey) {
      s.pendingChunk = { cx, cy, cz };
      s.lastChunkKey = key;
    }

    const isZooming = Math.abs(s.velocity.z) > 0.05;
    const throttleMs = getChunkUpdateThrottleMs(isZooming, Math.abs(s.velocity.z));

    if (s.pendingChunk && shouldThrottleUpdate(s.lastChunkUpdate, throttleMs, now)) {
      const { cx: ucx, cy: ucy, cz: ucz } = s.pendingChunk;
      s.pendingChunk = null;
      s.lastChunkUpdate = now;

      setChunks(
        CHUNK_OFFSETS.map((o) => ({
          key: `${ucx + o.dx},${ucy + o.dy},${ucz + o.dz}`,
          cx: ucx + o.dx,
          cy: ucy + o.dy,
          cz: ucz + o.dz,
        }))
      );
    }
  });

  React.useEffect(() => {
    const s = state.current;
    s.basePos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };

    setChunks(
      CHUNK_OFFSETS.map((o) => ({
        key: `${o.dx},${o.dy},${o.dz}`,
        cx: o.dx,
        cy: o.dy,
        cz: o.dz,
      }))
    );
  }, [camera]);

  return (
    <>
      {chunks.map((chunk) => (
        <Chunk key={chunk.key} cx={chunk.cx} cy={chunk.cy} cz={chunk.cz} media={media} cameraGridRef={cameraGridRef} planeScale={planeScale} planeDensity={planeDensity} planeSpread={planeSpread} />
      ))}
    </>
  );
}

export function InfiniteCanvasScene({
  media,
  onTextureProgress,
  showFps = false,
  showControls = false,
  cameraFov = 60,
  cameraNear = 1,
  cameraFar = 500,
  fogNear = 120,
  fogFar = 320,
  backgroundColor = "#ffffff",
  fogColor = "#ffffff",
  dofWorldFocusDistance = 8,
  dofWorldFocusRange = 15,
  dofBokehScale = 4,
  autoScrollSpeed = DEFAULT_SCROLL_SPEED,
  planeScale = 1,
  planeDensity = 5,
  planeSpread = 1,
}: InfiniteCanvasProps) {
  const isTouchDevice = useIsTouchDevice();
  const dpr = Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.25 : 1.5);
  const [hintVisible, setHintVisible] = React.useState(false);

  const handleScrollStart = React.useCallback(() => {
    setHintVisible(true);
    setTimeout(() => setHintVisible(false), 5000);
  }, []);

  if (!media.length) {
    return null;
  }

  return (
    <KeyboardControls map={KEYBOARD_MAP}>
      <div className={styles.wrapper}>
        <div className={styles.container}>
        <Canvas
          camera={{ position: [0, 0, INITIAL_CAMERA_Z], fov: cameraFov, near: cameraNear, far: cameraFar }}
          dpr={dpr}
          flat
          gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
          className={styles.canvas}
        >
          <color attach="background" args={[backgroundColor]} />
          <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
          <SceneController media={media} onTextureProgress={onTextureProgress} onScrollStart={handleScrollStart} autoScrollSpeed={autoScrollSpeed} planeScale={planeScale} planeDensity={planeDensity} planeSpread={planeSpread} />
          <EffectComposer multisampling={0}>
            <DepthOfField
              worldFocusDistance={dofWorldFocusDistance}
              worldFocusRange={dofWorldFocusRange}
              bokehScale={dofBokehScale}
            />
          </EffectComposer>
          {showFps && <Stats className={styles.stats} />}
        </Canvas>

          {showControls && (
            <div className={styles.controlsPanel}>
              {isTouchDevice ? (
                <>
                  <b>Drag</b> Pan · <b>Pinch</b> Zoom
                </>
              ) : (
                <>
                  <b>WASD</b> Move · <b>QE</b> Up/Down · <b>Scroll/Space</b> Zoom
                </>
              )}
            </div>
          )}
        </div>
        <div className={`${styles.hint} ${hintVisible ? styles.hintVisible : ""}`}>
          Use arrow keys to change direction · Press spacebar to toggle images
        </div>
      </div>
    </KeyboardControls>
  );
}
