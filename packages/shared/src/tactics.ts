import { spendAP, type CheckOutcome, type TurnState } from './turn.js';

export function resolveCheck(
  options: { dc: number; attribute: number; equipment?: number; help?: boolean; boost?: 'focus' | 'background'; partial?: boolean },
  roll: () => number,
): { die: number; total: number; outcome: CheckOutcome; critical: boolean } {
  if(options.boost==='background') throw Error('ระบบภูมิหลังถูกยกเลิกแล้ว');
  const die = roll();
  if (!Number.isInteger(die) || die < 1 || die > 20) throw Error('ผลทอยไม่ถูกต้อง');
  const total = die + options.attribute + (options.equipment ?? 0) + (options.help ? 2 : 0) + (options.boost ? 2 : 0);
  const outcome = die === 1 ? 'failure' : die === 20 || total >= options.dc ? 'success' :
    options.partial && total >= options.dc - 3 ? 'partial' : 'failure';
  return { die, total, outcome, critical: die === 20 };
}

export function manifestationDamage(outcome: CheckOutcome, critical: boolean, armor: number) {
  const damage = outcome==='success' ? (critical?3:2) : outcome==='partial' ? 1 : 0;
  return Math.max(0,damage-armor);
}

export function ghostMovementBudget(base: number, immobilized: boolean, boss: boolean) {
  return immobilized ? (boss ? Math.max(0,base-2) : 0) : base;
}

export function spendAction(turn: TurnState, focus: number, cost: { ap: number; focus: number }) {
  const next = spendAP(turn, cost.ap);
  if (!next || !Number.isInteger(cost.focus) || cost.focus < 0 || focus < cost.focus) return null;
  return { turn: next, focus: focus - cost.focus };
}
