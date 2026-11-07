/** Combat Lite v1.1 playtest calculations. Not connected to existing rooms. */
export type LiteStats = { BODY:number; PER:number; INT:number; SOC:number; SPI:number; RES:number };
export type LiteDefense = 'PDEF' | 'MDEF';
export type LiteManifestation = 'MANIFESTED' | 'INCORPOREAL' | 'HUMAN';

export function liteDefense(stats: LiteStats, kind: LiteDefense, guard = false): number {
  return 10 + (kind === 'PDEF' ? stats.BODY : stats.RES) + (guard ? 2 : 0);
}

export function liteGhostHP(baseHP: number, players: number): number {
  if (!Number.isInteger(baseHP) || baseHP < 1 || !Number.isInteger(players) || players < 2 || players > 6) {
    throw new Error('Invalid Combat Lite enemy HP or party size');
  }
  return Math.ceil(baseHP * players / 2);
}

export function liteAttack(input: {
  roll: number; bonus: number; defense: number; damage: number;
  physical: boolean; manifestation: LiteManifestation;
}): { hit: boolean; damage: number } {
  const {roll, bonus, defense, damage, physical, manifestation} = input;
  if (!Number.isInteger(roll) || roll < 1 || roll > 20 ||
      !Number.isInteger(bonus) || !Number.isInteger(defense) ||
      !Number.isInteger(damage) || damage < 0) throw new Error('Invalid Combat Lite attack');
  const hit = roll + bonus >= defense && !(physical && manifestation === 'INCORPOREAL');
  return {hit, damage: hit ? damage : 0};
}
