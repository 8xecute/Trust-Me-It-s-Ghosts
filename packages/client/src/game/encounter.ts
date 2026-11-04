import { startTurn, spendAP, focus, skillCheck, type TurnState } from '@baan/shared';
import type { Cell } from '../data/location';
import { isBlocked, type Grid } from './movement';

export type Mode = 'exploration' | 'encounter';
export interface Token { id: string; position: Cell }
export function canPlace(grid: Grid, tokens: readonly Token[], id: string, cell: Cell): boolean {
  return !isBlocked(grid, cell) && !tokens.some(t => t.id !== id && t.position.x === cell.x && t.position.y === cell.y);
}
export class Encounter {
  mode: Mode = 'exploration';
  turn: TurnState = startTurn();
  constructor(public readonly tokens: Token[]) {}
  setMode(mode: Mode) { if (mode !== this.mode) { this.mode = mode; this.turn = startTurn(); } }
  endTurn() { if (this.mode === 'encounter') this.turn = startTurn(); }
  focus() { const next = focus(this.turn); if (next) this.turn = next; return !!next; }
  check(roll: () => number) { const result = skillCheck(this.turn, 12, 0, roll); if (result) this.turn = result.state; return result; }
  move(grid: Grid, id: string, target: Cell): boolean {
    const token = this.tokens.find(t => t.id === id);
    if (!token || (this.mode === 'encounter' && this.turn.ap < 1) || Math.abs(token.position.x-target.x)+Math.abs(token.position.y-target.y) !== 1 || !canPlace(grid,this.tokens,id,target)) return false;
    token.position = {...target};
    if (this.mode === 'encounter') this.turn = spendAP(this.turn, 1)!;
    return true;
  }
}
