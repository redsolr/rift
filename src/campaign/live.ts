/**
 * Per-frame campaign state that must NOT live in React state (it changes 60×/s): the player's world position and
 * heading. Written by the scene controller every frame, read by HTML overlays (the minimap) in their own rAF loop.
 */
export const live = { x: 0, z: 0, heading: 0 };
