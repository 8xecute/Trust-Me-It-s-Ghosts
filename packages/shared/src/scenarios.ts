import type { Scenario } from './types.js';

/** Placeholder content, kept separate from rules and rendering. */
export const placeholderScenario: Scenario = {
  id: 'rueang-phi-wai-jai-phom',
  title: 'บริษัท เรื่องผีไว้ใจผม จำกัด',
  description: 'A quiet house awaits investigation.',
};

import { validateScenario } from './scenario.js';

export const sampleScenario = validateScenario({
  id: 'sample-house', title: 'เรือนเงียบ',
  scenes: [{ id: 'yard', name: 'ลานบ้าน' }],
  locations: [{ id: 'yard-location', name: 'ลานบ้าน', sceneId: 'yard' }],
  dialogue: [{ id: 'greeting', npcId: 'caretaker', text: 'ยินดีต้อนรับ' }],
  npcs: [{ id: 'caretaker', name: 'ผู้ดูแล', sceneId: 'yard' }],
  evidence: [{ id: 'note', name: 'บันทึกเก่า' }],
  objectives: [{ id: 'investigate', description: 'สำรวจลานบ้าน' }, { id: 'discover', description: 'ค้นหาบันทึก' }],
  endings: [{ id: 'resolved', description: 'การสำรวจเสร็จสิ้น' }],
  triggers: [
    { id: 'arrive', event: 'enter-yard', once: true, conditions: [{type:'scene',id:'yard'}], actions: [{type:'completeObjective',id:'investigate'}] },
    { id: 'find-note', event: 'inspect-box', once: true, conditions: [{type:'objective',id:'investigate'}], actions: [{type:'grantEvidence',id:'note'},{type:'completeObjective',id:'discover'}] },
    { id: 'finish', event: 'finish-investigation', once: true, conditions: [{type:'evidence',id:'note'},{type:'objective',id:'discover'}], actions: [{type:'end',id:'resolved'}] },
  ],
});
