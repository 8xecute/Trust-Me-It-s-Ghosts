export interface ScenarioDefinition {
  id: string; title: string;
  scenes: { id: string; name: string }[];
  locations: { id: string; name: string; sceneId: string }[];
  dialogue: { id: string; npcId: string; text: string; choices?: DialogueChoice[] }[];
  npcs: { id: string; name: string; sceneId: string }[];
  evidence: { id: string; name: string }[];
  objectives: { id: string; description: string }[];
  endings: { id: string; description: string }[];
  triggers: ScenarioTrigger[];
}
export type Condition =
  | { type: 'scene'; id: string }
  | { type: 'evidence'; id: string }
  | { type: 'objective'; id: string };
export interface DialogueChoice {
  id: string;
  text: string;
  conditions: Condition[];
}

export type ScenarioAction =
  | { type: 'completeObjective'; id: string }
  | { type: 'grantEvidence'; id: string }
  | { type: 'showDialogue'; id: string }
  | { type: 'end'; id: string };
export interface ScenarioTrigger {
  id: string; event: string; once: boolean; priority?: number; exclusiveGroup?: string; narration?: string; conditions: Condition[]; actions: ScenarioAction[];
}
export interface ScenarioProgress {
  sceneId: string; evidence: string[]; objectives: string[]; firedTriggers: string[]; endingId: string | null; dialogueId?: string | null; narration?: string;
}

/** Validate untrusted scenario input and reject dangling references. */
export function validateScenario(input: unknown): ScenarioDefinition {
  const fail = (message: string): never => { throw new Error(`ข้อมูลฉากไม่ถูกต้อง: ${message}`); };
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('ต้องเป็น object');
    return value as Record<string, unknown>;
  };
  const string = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim()) return fail('ต้องมีข้อความ');
    return value;
  };
  const array = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) return fail('ต้องเป็นรายการ');
    return value;
  };
  const root = object(input); string(root.id); string(root.title);
  const lists = ['scenes','locations','npcs','evidence','objectives','dialogue','endings','triggers'] as const;
  const ids: Record<string, Set<string>> = {};
  for (const name of lists) {
    ids[name] = new Set();
    for (const item of array(root[name])) {
      const entry = object(item); const id = string(entry.id);
      if (ids[name].has(id)) fail(`รหัสซ้ำใน ${name}: ${id}`);
      ids[name].add(id);
      if (name === 'scenes' || name === 'locations' || name === 'npcs' || name === 'evidence') string(entry.name);
      if (name === 'objectives' || name === 'endings') string(entry.description);
    }
  }
  if (!ids.scenes.size) fail('ต้องมีฉากอย่างน้อยหนึ่งฉาก');
  for (const item of array(root.locations)) { const location=object(item); if (!ids.scenes.has(string(location.sceneId))) fail('ไม่พบฉากของสถานที่'); }
  for (const item of array(root.dialogue)) { const line=object(item); string(line.text); if (!ids.npcs.has(string(line.npcId))) fail('ไม่พบ NPC ของบทสนทนา'); }
  for (const item of array(root.npcs)) {
    const npc = object(item); if (!ids.scenes.has(string(npc.sceneId))) fail('ไม่พบฉากของ NPC');
  }
  const conditionLists: Record<string,string> = {scene:'scenes',evidence:'evidence',objective:'objectives'};
  const actionLists: Record<string,string> = {completeObjective:'objectives',grantEvidence:'evidence',showDialogue:'dialogue',end:'endings'};
  function checkConditions(value: unknown) {
    for (const condition of array(value)) {
      const entry = object(condition);
      const type = string(entry.type), id = string(entry.id);
      if (!Object.hasOwn(conditionLists,type) || !ids[conditionLists[type]].has(id)) fail('เงื่อนไขอ้างอิงข้อมูลที่ไม่มี');
    }
  }
  const choiceIds = new Set<string>();
  for (const item of array(root.dialogue)) {
    const line = object(item);
    if (line.choices === undefined) continue;
    for (const item of array(line.choices)) {
      const choice = object(item), id = string(choice.id);
      if (choiceIds.has(id)) fail('รหัสตัวเลือกบทสนทนาซ้ำ');
      choiceIds.add(id);
      string(choice.text);
      checkConditions(choice.conditions);
    }
  }
  for (const item of array(root.triggers)) {
    const trigger = object(item); string(trigger.event);
    if (typeof trigger.once !== 'boolean') fail('once ต้องเป็น boolean');
    if (trigger.priority !== undefined && !Number.isSafeInteger(trigger.priority)) fail('priority ต้องเป็นจำนวนเต็ม');
    if (trigger.exclusiveGroup !== undefined) string(trigger.exclusiveGroup);
    if (trigger.narration !== undefined) string(trigger.narration);
    const event = string(trigger.event);
    if (event.startsWith('choice:') && !choiceIds.has(event.slice(7))) fail('ไม่พบตัวเลือกบทสนทนา');
    checkConditions(trigger.conditions);
    const actions = array(trigger.actions); if (!actions.length) fail('ต้องมี action');
    for (const action of actions) {
      const entry=object(action), type=string(entry.type), id=string(entry.id);
      if (!Object.hasOwn(actionLists,type) || !ids[actionLists[type]].has(id)) fail('action อ้างอิงข้อมูลที่ไม่มี');
    }
  }
  return input as ScenarioDefinition;
}

export function matchesScenarioConditions(conditions: Condition[], progress: ScenarioProgress): boolean {
  return conditions.every(condition => {
    switch (condition.type) {
      case 'scene': return progress.sceneId === condition.id;
      case 'evidence': return progress.evidence.includes(condition.id);
      case 'objective': return progress.objectives.includes(condition.id);
    }
  });
}

/** Higher priority runs first. Equal priorities retain data order. Each group fires at most once per event. */
export function applyScenarioEvent(scenario: ScenarioDefinition, progress: ScenarioProgress, event: string): ScenarioProgress {
  const next: ScenarioProgress = { ...progress, evidence:[...progress.evidence], objectives:[...progress.objectives], firedTriggers:[...progress.firedTriggers] };
  if (next.endingId) return progress;
  let fired = false;
  const claimed = new Set<string>();
  const candidates = scenario.triggers
    .filter(trigger => trigger.event === event)
    .sort((a,b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const trigger of candidates) {
    if (trigger.once && next.firedTriggers.includes(trigger.id)) continue;
    if (trigger.exclusiveGroup && claimed.has(trigger.exclusiveGroup)) continue;
    if (!matchesScenarioConditions(trigger.conditions, next)) continue;
    fired = true;
    if (trigger.exclusiveGroup) claimed.add(trigger.exclusiveGroup);
    if (trigger.narration) next.narration = trigger.narration;
    if (trigger.once) next.firedTriggers.push(trigger.id);
    for (const action of trigger.actions) {
      if (action.type === 'grantEvidence' && !next.evidence.includes(action.id)) next.evidence.push(action.id);
      if (action.type === 'completeObjective' && !next.objectives.includes(action.id)) next.objectives.push(action.id);
      if (action.type === 'showDialogue') next.dialogueId = action.id;
      if (action.type === 'end') { next.endingId = action.id; break; }
    }
    if (next.endingId) break;
  }
  return fired ? next : progress;
}

export function parseScenarioJSON(json: string): ScenarioDefinition {
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error('รูปแบบ JSON ไม่ถูกต้อง'); }
  return validateScenario(data);
}

export interface ScriptedDmView {
  title: string;
  narration?: string;
  dialogue: { id: string; speaker: string; text: string; choices: {id: string; text: string}[] } | null;
  objectives: { id: string; description: string; complete: boolean }[];
  ending: string | null;
}

export function getScriptedDmView(scenario: ScenarioDefinition, progress: ScenarioProgress): ScriptedDmView {
  const line = scenario.dialogue.find(entry => entry.id === progress.dialogueId);
  const choices = progress.endingId || !line ? [] : (line.choices ?? [])
    .filter(choice => matchesScenarioConditions(choice.conditions, progress)
      && applyScenarioEvent(scenario, progress, 'choice:' + choice.id) !== progress)
    .map(({id,text}) => ({id,text}));
  return {
    title: scenario.title,
    narration: progress.narration,
    dialogue: line ? {id:line.id,speaker:scenario.npcs.find(npc => npc.id === line.npcId)!.name,text:line.text,choices} : null,
    objectives: scenario.objectives.map(objective => ({...objective,complete:progress.objectives.includes(objective.id)})),
    ending: scenario.endings.find(ending => ending.id === progress.endingId)?.description ?? null,
  };
}
