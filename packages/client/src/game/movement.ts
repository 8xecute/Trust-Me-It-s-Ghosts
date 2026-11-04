import type { Cell } from '../data/location';

export interface Grid { width: number; height: number; blocked: readonly Cell[] }
const key = (c: Cell) => `${c.x},${c.y}`;
export function isBlocked(grid: Grid, cell: Cell): boolean {
  return !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.y < 0 || cell.x >= grid.width || cell.y >= grid.height || grid.blocked.some(c => c.x === cell.x && c.y === cell.y);
}
const directions = [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
/** Shortest four-direction route, excluding the start; null means unreachable. */
export function findPath(grid: Grid, start: Cell, goal: Cell): Cell[] | null {
  if (isBlocked(grid, start) || isBlocked(grid, goal)) return null;
  const queue = [start];
  const parents = new Map<string, Cell | null>([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (key(current) === key(goal)) {
      const path: Cell[] = [];
      let step: Cell | null = current;
      while (step && key(step) !== key(start)) { path.push(step); step = parents.get(key(step)) ?? null; }
      return path.reverse();
    }
    for (const d of directions) {
      const next = {x: current.x+d.x, y: current.y+d.y};
      if (!isBlocked(grid, next) && !parents.has(key(next))) { parents.set(key(next), current); queue.push(next); }
    }
  }
  return null;
}
export class Movement {
  position: Cell;
  private route: Cell[] = [];
  constructor(private readonly grid: Grid, start: Cell) {
    if (isBlocked(grid, start)) throw new Error('Blocked starting cell');
    this.position = { ...start };
  }
  moveTo(target: Cell): boolean {
    const path = findPath(this.grid, this.position, target);
    if (!path) return false;
    this.route = path; return true;
  }
  stepDirection(dx: number, dy: number): boolean {
    this.route = [];
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    const next = {x:this.position.x+dx,y:this.position.y+dy};
    if (isBlocked(this.grid,next)) return false;
    this.position = next; return true;
  }
  cancel(): void { this.route = []; }
  advance(): void { const next = this.route.shift(); if (next && !isBlocked(this.grid,next)) this.position = next; }
}
