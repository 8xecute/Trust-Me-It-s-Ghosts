export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const ORIGIN = { x: 480, y: 145 };

export function gridToScreen(x: number, y: number) {
  return { x: ORIGIN.x + (x - y) * TILE_WIDTH / 2, y: ORIGIN.y + (x + y) * TILE_HEIGHT / 2 };
}

/** Fractional grid coordinates; round each axis for the nearest tile center. */
export function screenToGrid(x: number, y: number) {
  const dx = (x - ORIGIN.x) / (TILE_WIDTH / 2);
  const dy = (y - ORIGIN.y) / (TILE_HEIGHT / 2);
  return { x: (dx + dy) / 2, y: (dy - dx) / 2 };
}
