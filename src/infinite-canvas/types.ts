import type * as THREE from "three";

export type MediaItem = {
  url: string;
  width: number;
  height: number;
  color?: string;
};

export type InfiniteCanvasProps = {
  media: MediaItem[];
  onTextureProgress?: (progress: number) => void;
  showFps?: boolean;
  showControls?: boolean;
  cameraFov?: number;
  cameraNear?: number;
  cameraFar?: number;
  fogNear?: number;
  fogFar?: number;
  backgroundColor?: string;
  fogColor?: string;
  // Depth of Field (world-space units)
  dofWorldFocusDistance?: number;
  dofWorldFocusRange?: number;
  dofBokehScale?: number;
  // Auto-scroll
  autoScrollSpeed?: number;
  // Image scale multiplier
  planeScale?: number;
  // Planes per chunk (density) and scatter radius multiplier (spread)
  planeDensity?: number;
  planeSpread?: number;
};

export type ChunkData = {
  key: string;
  cx: number;
  cy: number;
  cz: number;
};

export type PlaneData = {
  id: string;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  mediaIndex: number;
  cornerRadius: number;
};
