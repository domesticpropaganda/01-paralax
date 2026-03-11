import * as THREE from "three";
import { hashString, seededRandom } from "~/src/utils";
import { CHUNK_SIZE } from "./constants";
import type { PlaneData } from "./types";

const MAX_PLANE_CACHE = 256;
const planeCache = new Map<string, PlaneData[]>();

const touchPlaneCache = (key: string) => {
  const v = planeCache.get(key);
  if (!v) {
    return;
  }

  planeCache.delete(key);
  planeCache.set(key, v);
};

const evictPlaneCache = () => {
  while (planeCache.size > MAX_PLANE_CACHE) {
    const firstKey = planeCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    planeCache.delete(firstKey);
  }
};

export const getChunkUpdateThrottleMs = (isZooming: boolean, zoomSpeed: number): number => {
  if (zoomSpeed > 1.0) {
    return 500;
  }

  if (isZooming) {
    return 400;
  }

  return 100;
};

export const getMediaDimensions = (media: HTMLImageElement | undefined) => {
  const width = media instanceof HTMLImageElement ? media.naturalWidth || media.width : undefined;
  const height = media instanceof HTMLImageElement ? media.naturalHeight || media.height : undefined;
  return { width, height };
};

// 9:16, 3:4, 1:1, 4:3, 16:9
const PLANE_ASPECT_RATIOS = [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9];
const CORNER_RADII = [0.15, 0.30, 0.45, 1.0];

export const generateChunkPlanes = (
  cx: number,
  cy: number,
  cz: number,
  planeDensity = 5,
  planeSpread = 1,
): PlaneData[] => {
  const planes: PlaneData[] = [];
  const seed = hashString(`${cx},${cy},${cz}`);

  for (let i = 0; i < planeDensity; i++) {
    const s = seed + i * 1000;
    const r = (n: number) => seededRandom(s + n);
    const baseHeight = 24 + r(4) * 14;
    const aspectIndex = Math.floor(r(6) * PLANE_ASPECT_RATIOS.length);
    const aspect = PLANE_ASPECT_RATIOS[aspectIndex] ?? 1;

    // Spread positions around chunk center; planeSpread scales the scatter radius
    const centerX = (cx + 0.5) * CHUNK_SIZE;
    const centerY = (cy + 0.5) * CHUNK_SIZE;
    const centerZ = (cz + 0.5) * CHUNK_SIZE;
    const half = CHUNK_SIZE * 0.5 * planeSpread;

    planes.push({
      id: `${cx}-${cy}-${cz}-${i}`,
      position: new THREE.Vector3(
        centerX + (r(0) - 0.5) * 2 * half,
        centerY + (r(1) - 0.5) * 2 * half,
        centerZ + (r(2) - 0.5) * 2 * half,
      ),
      scale: new THREE.Vector3(baseHeight * aspect, baseHeight, 1),
      mediaIndex: Math.floor(r(5) * 1_000_000),
      cornerRadius: CORNER_RADII[Math.floor(r(7) * CORNER_RADII.length)] ?? 0.15,
    });
  }

  return planes;
};

export const generateChunkPlanesCached = (
  cx: number,
  cy: number,
  cz: number,
  planeDensity = 5,
  planeSpread = 1,
): PlaneData[] => {
  const key = `${cx},${cy},${cz},${planeDensity},${planeSpread.toFixed(2)}`;
  const cached = planeCache.get(key);
  if (cached) {
    touchPlaneCache(key);
    return cached;
  }

  const planes = generateChunkPlanes(cx, cy, cz, planeDensity, planeSpread);
  planeCache.set(key, planes);
  evictPlaneCache();
  return planes;
};

export const shouldThrottleUpdate = (lastUpdateTime: number, throttleMs: number, currentTime: number): boolean => {
  return currentTime - lastUpdateTime >= throttleMs;
};
