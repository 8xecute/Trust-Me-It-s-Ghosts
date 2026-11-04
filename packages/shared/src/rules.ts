import type { GameSnapshot, Scenario } from './types.js';

/** Pure initial-state boundary; game mechanics can be added here later. */
export function createInitialSnapshot(scenario: Scenario): GameSnapshot {
  return { scenarioId: scenario.id };
}
