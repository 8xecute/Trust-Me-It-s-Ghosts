/** Data contracts shared by the client and server. */
export interface Scenario {
  id: string;
  title: string;
  description: string;
}

export interface GameSnapshot {
  scenarioId: string;
}
