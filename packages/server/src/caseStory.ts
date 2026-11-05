import { readFileSync } from 'node:fs';
import { applyScenarioEvent, validateScenario, type ScenarioProgress } from '@baan/shared';
import type { CaseState, Site } from './case001.js';

const raw=JSON.parse(readFileSync(new URL('../scenarios/case-001.story.json',import.meta.url),'utf8')) as {
  topics:{id:string;label:string;minutes:number}[];
  dm:Record<Site,{script:string;secret:string}>;
  epilogues:Record<'confession'|'bribe'|'incomplete'|'teaser',string>;
  endingNarration:Record<'A'|'B'|'C'|'D',string>;
};
const scenario=validateScenario(raw);
export const storyEndingNarration=raw.endingNarration;
export const storyEpilogues=raw.epilogues;
export const dmSceneScript=(site:Site)=>raw.dm[site];
export const newStory=():ScenarioProgress=>({sceneId:'A',evidence:[],objectives:[],firedTriggers:[],endingId:null});
export const hasFact=(s:CaseState,fact:string)=>s.story?.objectives.includes(fact) ?? false;

export function addFact(s:CaseState,fact:string) {
  if(s.story && !hasFact(s,fact)) s.story.objectives.push(fact);
}

function context(s:CaseState):ScenarioProgress {
  const p={...(s.story ?? newStory()),sceneId:s.site,evidence:[...s.evidence]};
  const facts=new Set(p.objectives.filter(fact=>!['trusted','guarded','spirit-present','witchai-at-e','warning'].includes(fact)));
  const add=(condition:boolean,fact:string)=>{if(condition) facts.add(fact);};
  add(true,'arrived');
  add(s.site==='C','visited-c');
  add(s.ghost!=='hidden','apparition');
  add(s.ghost!=='hidden' && s.ghost!=='bound','spirit-present');
  add(s.milestones.includes('kaew-attacked'),'attacked-kaew');
  add(s.trust>=2,'trusted');
  add(s.trust<2,'guarded');
  add(s.site==='E' && (s.key || s.opened || s.milestones.includes('approached-cellar')),'cellar');
  add(s.seals[2],'ritual-stopped');
  add(s.ghost==='freed','freed');
  add(s.report?.ending==='D','failed');
  add(s.wichai?.status==='detained','detained');
  add(s.evacuated.length===3,'rescued');
  add(s.haunt>=9,'crisis');
  add(s.evidence.includes('E07'),'gate-basis');
  add(s.understood && !!s.report,'teaser');
  add(s.minute>=210 && !s.seals[2] && !s.report,'warning');
  add(s.wichai?.site==='E' && s.wichai.status!=='detained','witchai-at-e');
  return {...p,objectives:[...facts]};
}

export function advanceStory(s:CaseState) {
  if(!s.story) return;
  let p=context(s);
  const ids=['EV10','EV08','EV09','EV12','EV15','EV16','EV17','EV18','EV13','EV01','EV02','EV03','EV04','EV05','EV06','EV07','EV11','EV14'];
  const narration:string[]=[];
  for(const id of ids) {
    const previous=p;
    p=applyScenarioEvent(scenario,{...p,narration:undefined},id);
    if(p.firedTriggers.length!==previous.firedTriggers.length && p.narration) narration.push(p.narration);
  }
  s.story=p;
  if(narration.length) s.notice+=' · '+narration.join(' · ');
}

export function storyTopics(s:CaseState) {
  if(!s.story || s.report) return [];
  const p=context(s);
  return raw.topics.filter(({id})=>applyScenarioEvent(scenario,p,'talk:'+id)!==p);
}

export function speak(s:CaseState,id:string) {
  const p=context(s);
  const next=applyScenarioEvent(scenario,p,'talk:'+id);
  if(next===p) throw Error('หัวข้อนี้ยังใช้ไม่ได้');
  const line=scenario.dialogue.find(entry=>entry.id===next.dialogueId)!;
  const npc=scenario.npcs.find(entry=>entry.id===line.npcId)!;
  s.story=next;
  s.evidence=next.evidence;
  s.notice=npc.name+' · '+line.text;
}
