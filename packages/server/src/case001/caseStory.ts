import { readFileSync } from 'node:fs';
import { matchesScenarioConditions, applyScenarioEvent, validateScenario, type Condition, type ScenarioProgress } from '@baan/shared';
import { emitCaseBeat, type CaseState, type Site } from './case001.js';

type Topic={id:string;label:string;minutes:number};
type NpcPlacement={id:string;name:string;sceneId:Site;sites?:Site[];presence?:'wichai'|'spirit'};
type DmScript={script:string;secret:string};
type ScriptVariant={
 version:string;status:string;
 evidence:{id:string;name:string}[];
 scenes:Record<Site,string>;
 locations:Record<Site,string>;
 journal:Record<string,string>;
 dm:Record<Site,DmScript>;
 npcs:Record<string,Partial<Omit<NpcPlacement,'id'>>>;
 objectives:Record<string,string>;
 objectiveOverrides:Record<string,string>;
 dialogue:Record<string,{npc:string;topic:string;label:string;text:string;when:Condition[];effects:string[];minutes:number;triggerId:string}>;
 events:Record<string,{when:Condition[];text?:string}>;
 beats:Record<string,string>;
 encounters:Record<string,{start:string;end:string;escaped?:string;pacified?:string}>;
 phases:Record<string,string>;
 finalArrival:Record<'won'|'fled'|'talked',string>;
 endings:Record<'A'|'B'|'C'|'D',{title:string;text:string}>;
};
export const v4=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.v4.json',import.meta.url),'utf8')) as ScriptVariant;
export const gmGuide = JSON.parse(readFileSync(
 new URL('../../scenarios/case-001/case-001.gm-guide.json',import.meta.url),'utf8',
)) as {id:string;title:string;goal:string;beats:{id:string;title:string;when:string;read:string[];track?:'main'|'support'}[]}[];
const script=readFileSync(new URL('../../scenarios/case-001/case-001.v4.1.script.md',import.meta.url),'utf8');
const scriptSections=new Map(Array.from(script.matchAll(/^### ((?:[A-F]\d+|H1|ENDING [A-D])) — [^\n]+\n([\s\S]*?)(?=^#{2,3} |$(?![\s\S]))/gm),
 ([,id,text])=>[id,text.trim()]));
export const gmGuideV41=gmGuide.map(chapter=>({...chapter,beats:chapter.beats.map(beat=>{
 const fullScript=scriptSections.get(beat.id);
 if(!fullScript) throw Error('บท CASE 001 v4.1 ไม่ครบ: '+beat.id);
 return {...beat,fullScript};
})}));
const raw=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.story.json',import.meta.url),'utf8')) as {
 topics:Topic[]; npcs:NpcPlacement[]; dm:Record<Site,DmScript>;
 epilogues:Record<'confession'|'bribe'|'incomplete'|'teaser',string>;
 endingNarration:Record<'A'|'B'|'C'|'D',string>;
};
const legacyScenario=validateScenario(raw);
const npcIds=new Set([...raw.npcs.map(npc=>npc.id),...Object.keys(v4.npcs)]);
const npcs=[...npcIds].map(id=>({...raw.npcs.find(npc=>npc.id===id),...v4.npcs[id],id} as NpcPlacement));
const replaced=Object.values(v4.dialogue);
const dialogue=replaced.map(({topic,npc,text})=>({id:topic,npcId:npc,text}));
const topics=replaced.map(({topic,label,minutes})=>({id:topic,label,minutes}));
const v4Scenario=validateScenario({
 ...legacyScenario,
 npcs,evidence:v4.evidence,
 objectives:[...legacyScenario.objectives.map(objective=>({...objective,description:v4.objectiveOverrides[objective.id] ?? objective.description})),
  ...Object.entries(v4.objectives).map(([id,description])=>({id,description}))],
 dialogue,
 triggers:[
  ...legacyScenario.triggers.filter(trigger=>!trigger.event.startsWith('talk:')).map(trigger=>{
   const event=v4.events[trigger.id];
   return event ? {...trigger,conditions:event.when,narration:event.text} : trigger;
  }),
  ...replaced.map(({topic,triggerId,when,effects})=>({
   id:triggerId,event:'talk:'+topic,once:true,conditions:when,
   actions:[{type:'showDialogue',id:topic},...effects.map(id=>id.startsWith('evidence:') ?
    {type:'grantEvidence',id:id.slice(9)} : {type:'completeObjective',id})],
  })),
  ...Object.entries(v4.events).filter(([id])=>!legacyScenario.triggers.some(trigger=>trigger.id===id))
   .map(([id,event])=>({id,event:id,once:true,conditions:event.when,actions:[{type:'completeObjective',id:event.when[0].id}],narration:event.text})),
 ],
});
const definition=(s:CaseState)=>s.storyVersion===4 ? v4Scenario : legacyScenario;
const topicList=(s:CaseState)=>s.storyVersion===4 ? topics : raw.topics;

function present(s:CaseState,npcId:string) {
 const npc=(s.storyVersion===4 ? npcs : raw.npcs).find(n=>n.id===npcId);
 if(!npc) return false;
 if(npc.presence==='wichai') return s.wichai?.site===s.site;
 if(npc.presence==='spirit' && ['hidden','bound','freed','sealed'].includes(s.ghost)) return false;
 return (npc.sites ?? [npc.sceneId]).includes(s.site);
}
function response(s:CaseState,p:ScenarioProgress,id:string) {
 const scenario=definition(s);
 const next=applyScenarioEvent(scenario,p,'talk:'+id);
 const line=scenario.dialogue.find(d=>d.id===next.dialogueId);
 return next!==p && line && present(s,line.npcId) ? next : p;
}
export const storyEndingNarration=raw.endingNarration;
export const storyEpilogues=raw.epilogues;
export const dmSceneScript=(s:CaseState)=> (s.storyVersion===4 ? v4.dm : raw.dm)[s.site];
export const newStory=():ScenarioProgress=>({sceneId:'A',evidence:[],objectives:[],firedTriggers:[],endingId:null});
export const hasFact=(s:CaseState,fact:string)=>s.story?.objectives.includes(fact) ?? false;

export function addFact(s:CaseState,fact:string) {
  if(s.story && !hasFact(s,fact)) s.story.objectives.push(fact);
}

export function caseContext(s:CaseState):ScenarioProgress {
  const p={...(s.story ?? newStory()),sceneId:s.site,evidence:[...s.evidence]};
  const facts=new Set(p.objectives.filter(fact=>!['trusted','guarded','spirit-present','witchai-at-e','warning','history-ready','gate-topic-ready','witness-ready','wichai-free','history-intro-needed','prasert-present','available-don','available-nid','available-phoem','investigated-arrival','drowned-warning','ritual-room','rescued-room','final-crisis','ritual-entrenched','kaew-freed-choice','a-lead','wichai-arrival'].includes(fact)));
  const add=(condition:boolean,fact:string)=>{if(condition) facts.add(fact);};
  add(true,'arrived');
  add(!p.firedTriggers.includes('dialogue-history') && !p.firedTriggers.includes('dialogue-history-intro'),'history-intro-needed');
  add(s.evidence.includes('E02') || s.evidence.includes('E07') || facts.has('past-flood') || facts.has('gate-truth'),'history-ready');
  add(s.evidence.includes('E02') || s.evidence.includes('E07') || facts.has('past-flood') || facts.has('memory-basis') || facts.has('memory-fragment'),'gate-topic-ready');
  add(p.firedTriggers.includes('dialogue-black-bundle') || p.firedTriggers.includes('dialogue-cart') || s.evidence.includes('E02') || s.evidence.includes('E07'),'witness-ready');
  add(s.wichai?.status!=='detained','wichai-free');
  add(s.site==='C','visited-c');
  add(s.milestones.includes('00:00'),'apparition');
  add(s.ghost!=='hidden' && s.ghost!=='bound','spirit-present');
  add(s.milestones.includes('kaew-attacked'),'attacked-kaew');
  add(s.trust>=2,'trusted');
  add(s.trust<2,'guarded');
  add(s.site==='E' && (s.opened || s.milestones.includes('approached-cellar') || (s.storyVersion!==4 && s.key)),'cellar');
  add(s.seals[2],'ritual-stopped');
  add(s.ghost==='freed','freed');
  add(s.report?.ending==='D','failed');
  add(s.wichai?.status==='detained','detained');
  add(s.evacuated.length===3,'rescued');
  add(s.haunt>=9,'crisis');
  add(s.evidence.includes('E07'),'gate-basis');
  if(s.storyVersion===4) {
   add(s.site==='A' || s.site==='B','prasert-present');
   add(s.site==='A' && s.milestones.includes('arrival-investigated'),'investigated-arrival');
   add(s.site==='A' && p.firedTriggers.includes('dialogue-arrival'),'a-lead');
   add(s.site==='E' && s.wichai?.site==='E' && s.wichai.status==='traveling','wichai-arrival');
   add(s.site==='C' && (s.evidence.includes('E01') || s.evidence.includes('E02')),'drowned-warning');
   add(s.evidence.includes('E07') && facts.has('gate-testimony'),'corroborated-flood');
   add(s.site==='E' && s.key,'ritual-room');
   add(s.site==='E' && s.opened,'rescued-room');
   add((s.site==='E' && s.opened && !s.escorts.includes('ดล') && !s.evacuated.includes('ดล')) || s.site==='A' && s.evacuated.includes('ดล'),'available-don');
   add((s.site==='E' && s.opened && !s.escorts.includes('นิด') && !s.evacuated.includes('นิด')) || s.site==='A' && s.evacuated.includes('นิด'),'available-nid');
   add((s.site==='E' && s.opened && !s.escorts.includes('เพิ่ม') && !s.evacuated.includes('เพิ่ม')) || s.site==='A' && s.evacuated.includes('เพิ่ม'),'available-phoem');
   add(s.site==='E' && !s.seals[2] && (s.minute>=210 || s.milestones.includes('unsafe-bracelet')),'final-crisis');
   add(!s.seals[2] && s.minute>=240,'ritual-entrenched');
   add(s.site==='E' && s.seals[2] && s.ghost!=='sealed' && s.ghost!=='freed','kaew-freed-choice');
  }
  add(s.understood && !!s.report && (s.storyVersion!==4 || s.key),'teaser');
  add(s.minute>=210 && !s.seals[2] && !s.report,'warning');
  add(s.wichai?.site==='E' && s.wichai.status!=='detained','witchai-at-e');
  return {...p,objectives:[...facts]};
}

export function advanceStory(s:CaseState) {
  if(!s.story) return;
  const scenario=definition(s);
  let p=caseContext(s);
  const ids=['EV10','EV08','EV09','EV12','EV15','EV16','EV17','EV18','EV13','EV01','EV02','EV03','EV04','EV05','EV06','EV07','EV11','EV14'];
  if(s.storyVersion===4) ids.push(...Object.keys(v4.events).filter(id=>!ids.includes(id)));
  const narration:string[]=[];
  for(const id of ids) {
    const previous=p;
    p=applyScenarioEvent(scenario,{...p,narration:undefined},id);
    if(p.firedTriggers.length!==previous.firedTriggers.length && p.narration) { narration.push(p.narration); emitCaseBeat(s,id,p.narration,['EV08','EV09','EV10','EV12','EV17','EV18','ritual-entrenched'].includes(id)?'party':'local'); }
  }
  s.story=p;
  if(narration.length) s.notice+=' · '+narration.join(' · ');
}

export function sceneSpeakers(s:CaseState) {
 return storyTopics(s).map(topic=>topic.speaker).filter((speaker,index,list)=>list.indexOf(speaker)===index);
}

export function storyTopics(s:CaseState) {
  if(!s.story || s.report) return [];
  const p=caseContext(s);
  const scenario=definition(s);
  return topicList(s).flatMap(topic=>{
    const next=response(s,p,topic.id);
    if(next===p) return [];
    const line=scenario.dialogue.find(entry=>entry.id===next.dialogueId)!;
    const speaker=scenario.npcs.find(npc=>npc.id===line.npcId)!.name;
    return [{...topic,speaker}];
  });
}

function dialogueResponse(s:CaseState,id:string) {
  const scenario=definition(s);
  const p=caseContext(s);
  const next=response(s,p,id);
  if(next===p) return undefined;
  const line=scenario.dialogue.find(entry=>entry.id===next.dialogueId)!;
  const npc=scenario.npcs.find(entry=>entry.id===line.npcId)!;
  return {next,text:npc.name+' · '+line.text};
}

export function previewDialogue(s:CaseState,id:string) {
  return dialogueResponse(s,id)?.text;
}

export function speak(s:CaseState,id:string) {
  const answer=dialogueResponse(s,id);
  if(!answer) throw Error('หัวข้อนี้ยังใช้ไม่ได้');
  s.story=answer.next;
  s.evidence=answer.next.evidence;
  s.notice=answer.text;
}

/** Private DM diagnostics; never include this in player snapshots. */
export function dmEventPreviews(s:CaseState) {
 const scenario=definition(s);
 const p=caseContext(s);
 return scenario.triggers.map(trigger=>{
  const line=scenario.dialogue.find(d=>trigger.actions.some(a=>a.type==='showDialogue'&&a.id===d.id));
  const reasons:string[]=[];
  const fired=trigger.once&&p.firedTriggers.includes(trigger.id);
  if(s.report) reasons.push('คดีสิ้นสุดแล้ว');
  for(const condition of trigger.conditions) if(!matchesScenarioConditions([condition],p)) {
   reasons.push(condition.type==='scene'?'ผู้สืบสวนไม่ได้อยู่ในสถานที่ของบทนี้':condition.type==='evidence'?'ยังไม่พบหลักฐาน '+condition.id:'ยังขาด: '+(scenario.objectives.find(o=>o.id===condition.id)?.description ?? 'บริบทที่บทนี้ต้องใช้'));
  }
  if(line&&!present(s,line.npcId)) reasons.push('ผู้พูดไม่อยู่ในสถานที่นี้หรือไม่อยู่ในสถานะที่สนทนาได้');
  if(!fired&&!reasons.length&&trigger.exclusiveGroup&&scenario.triggers.some(other=>other.id!==trigger.id&&other.event===trigger.event&&other.exclusiveGroup===trigger.exclusiveGroup&&(other.priority??0)>(trigger.priority??0)&&!(other.once&&p.firedTriggers.includes(other.id))&&matchesScenarioConditions(other.conditions,p))) reasons.push('มีบทตอบลำดับสูงกว่าที่ตรงเงื่อนไข');
  return {id:trigger.id,label:topicList(s).find(t=>'talk:'+t.id===trigger.event)?.label ?? 'เหตุการณ์คดี '+trigger.id,text:line?.text ?? trigger.narration ?? 'บันทึกความคืบหน้าคดี',status:fired?'fired' as const:reasons.length?'blocked' as const:'ready' as const,reasons:fired?['เหตุการณ์ครั้งเดียวนี้เกิดขึ้นแล้ว']:reasons};
 });
}
