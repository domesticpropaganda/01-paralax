import { run } from "~/src/utils";

export const CHUNK_SIZE = 160;
export const RENDER_DISTANCE_X = 5;   // wider for 8:1 aspect ratio
export const RENDER_DISTANCE_YZ = 2;
export const CHUNK_FADE_MARGIN = 1;
export const MAX_VELOCITY = 3.2;
export const DEPTH_NEAR_FADE = 30;
export const DEPTH_FADE_START = 140;
export const DEPTH_FADE_END = 260;
export const INVIS_THRESHOLD = 0.01;
export const KEYBOARD_SPEED = 0.18;
export const VELOCITY_LERP = 0.16;
export const VELOCITY_DECAY = 0.9;
export const INITIAL_CAMERA_Z = 50;

export type ChunkOffset = {
  dx: number;
  dy: number;
  dz: number;
  dist: number;
};

export const CHUNK_OFFSETS: ChunkOffset[] = run(() => {
  const maxX = RENDER_DISTANCE_X + CHUNK_FADE_MARGIN;
  const maxYZ = RENDER_DISTANCE_YZ + CHUNK_FADE_MARGIN;
  const offsets: ChunkOffset[] = [];
  for (let dx = -maxX; dx <= maxX; dx++) {
    for (let dy = -maxYZ; dy <= maxYZ; dy++) {
      for (let dz = -maxYZ; dz <= maxYZ; dz++) {
        offsets.push({ dx, dy, dz, dist: Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) });
      }
    }
  }
  return offsets;
});
