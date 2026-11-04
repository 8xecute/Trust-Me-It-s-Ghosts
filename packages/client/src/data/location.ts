export type Cell = { x: number; y: number };

// Coordinates describe the map, independent of its projection.
export const location = {
  width: 10, height: 10,
  walls: Array.from({ length: 10 }, (_, x) => ({ x, y: 0 })),
  obstacles: [{ x: 1, y: 4 }, { x: 2, y: 7 }, { x: 8, y: 5 }, { x: 7, y: 8 }],
  house: { x: 3, y: 2, width: 4, depth: 3 },
};
