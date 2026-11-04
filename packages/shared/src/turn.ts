export const MAX_AP = 3;
export const FOCUS_BONUS = 2;
export type TurnState = { ap: number; focused: boolean };
export type CheckOutcome = 'success' | 'partial' | 'failure';
export const startTurn = (): TurnState => ({ ap: MAX_AP, focused: false });
export function spendAP(state: TurnState, cost: number): TurnState | null {
  if (!Number.isInteger(cost) || cost < 0 || state.ap < cost) return null;
  return { ...state, ap: state.ap - cost };
}
/** Focus costs one AP and grants +2 to the next skill check this turn. */
export function focus(state: TurnState): TurnState | null {
  if (state.focused) return null;
  const next = spendAP(state, 1);
  return next && { ...next, focused: true };
}
/** Checks cost one AP; a total within three of the DC is a partial success. */
export function skillCheck(state: TurnState, dc: number, modifier: number, roll: () => number): { state: TurnState; die: number; total: number; outcome: CheckOutcome } | null {
  const next = spendAP(state, 1);
  if (!next) return null;
  if (!Number.isInteger(dc) || !Number.isInteger(modifier)) throw new Error('DC and modifier must be integers');
  const die = roll();
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error('D20 roll must be an integer from 1 to 20');
  const total = die + modifier + (state.focused ? FOCUS_BONUS : 0);
  return { state: { ...next, focused: false }, die, total, outcome: total >= dc ? 'success' : total >= dc - 3 ? 'partial' : 'failure' };
}
