import * as THREE from "three";
import type { MediaItem } from "./types";

const textureCache = new Map<string, THREE.Texture>();
const loadCallbacks = new Map<string, Set<(tex: THREE.Texture) => void>>();
const loader = new THREE.TextureLoader();

const isTextureLoaded = (tex: THREE.Texture): boolean => {
  const img = tex.image as HTMLImageElement | undefined;
  return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
};

export const getTexture = (item: MediaItem, onLoad?: (texture: THREE.Texture) => void): THREE.Texture => {
  const key = item.url;
  const existing = textureCache.get(key);

  if (existing) {
    if (onLoad) {
      if (isTextureLoaded(existing)) {
        onLoad(existing);
      } else {
        loadCallbacks.get(key)?.add(onLoad);
      }
    }
    return existing;
  }

  const callbacks = new Set<(tex: THREE.Texture) => void>();
  if (onLoad) callbacks.add(onLoad);
  loadCallbacks.set(key, callbacks);

  const texture = loader.load(
    key,
    (tex) => {
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;

      loadCallbacks.get(key)?.forEach((cb) => {
        try {
          cb(tex);
        } catch (err) {
          console.error(`Callback failed: ${JSON.stringify(err)}`);
        }
      });
      loadCallbacks.delete(key);
    },
    undefined,
    (err) => console.error("Texture load failed:", key, err)
  );

  textureCache.set(key, texture);
  return texture;
};

// Cover-fit clone cache keyed by `${url}_${planeAspect}` — at most images × 5 ratios entries
const coverCache = new Map<string, THREE.Texture>();

export const getCoverTexture = (item: MediaItem, planeAspect: number): THREE.Texture | null => {
  const base = textureCache.get(item.url);
  if (!base) return null;

  const key = `${item.url}_${planeAspect.toFixed(4)}`;
  const cached = coverCache.get(key);
  if (cached) return cached;

  const clone = base.clone();
  const imageAspect = item.width / item.height;

  if (imageAspect > planeAspect) {
    // image wider than plane: crop sides
    const s = planeAspect / imageAspect;
    clone.repeat.set(s, 1);
    clone.offset.set((1 - s) / 2, 0);
  } else {
    // image taller than plane: crop top/bottom
    const s = imageAspect / planeAspect;
    clone.repeat.set(1, s);
    clone.offset.set(0, (1 - s) / 2);
  }
  clone.needsUpdate = true;

  coverCache.set(key, clone);
  return clone;
};
