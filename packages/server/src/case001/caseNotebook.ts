import { learnedStoryInformation } from './storyDice.js';
import {readFileSync} from 'node:fs';
import {matchesScenarioConditions,type Condition,type CaseNotebookView} from '@baan/shared';
import {caseContext,v4} from './caseStory.js';
import type {CaseState} from './case001.js';
type Item={id:string;text:string;source:string;status:'confirmed'|'suspected'|'unknown';when:Condition[];unless?:Condition[]};
const content=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.journal.json',import.meta.url),'utf8')) as {items:Item[];goals:{text:string;when:Condition[]}[]};
const definition=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.story.json',import.meta.url),'utf8'));
const refs:Record<string,Set<string>>={scene:new Set(definition.scenes.map((e:{id:string})=>e.id)),evidence:new Set(definition.evidence.map((e:{id:string})=>e.id)),objective:new Set([...definition.objectives.map((e:{id:string})=>e.id),'case-closed','captives-located','ritual-known'])};
const ids=new Set<string>();
if(!Array.isArray(content.items)||!Array.isArray(content.goals)||!content.goals.some(g=>Array.isArray(g.when)&&g.when.length===0))throw Error('สมุดคดีต้องมีรายการและเป้าหมายเริ่มต้น');
const entries:{text:string;when:Condition[];id?:string;status?:string;source?:string;unless?:Condition[]}[]=[...content.items,...content.goals];
for(const entry of entries) {
 if(typeof entry.text!=='string'||!entry.text.trim()||!Array.isArray(entry.when))throw Error('ข้อความสมุดคดีไม่ถูกต้อง');
 if(entry.id!==undefined){if(ids.has(entry.id)||!['confirmed','suspected','unknown'].includes(entry.status ?? '')||typeof entry.source!=='string')throw Error('รายการสมุดคดีไม่ถูกต้อง');ids.add(entry.id);}
 for(const c of [...entry.when,...(entry.unless??[])])if(!refs[c.type]?.has(c.id))throw Error('สมุดคดีอ้างอิงเงื่อนไขที่ไม่มี');
}
export function caseNotebook(s:CaseState):CaseNotebookView {
 if(s.v51) {
  const labels:Record<string,string>={E01:'ร่องรอยหลังบ้านดล',E02:'สมุดดล',E03:'ร่องรอยพิธีที่ศาล',E04:'ด้ายดำและป้ายชื่อคนหาย',E05:'กำไลสลักชื่อแก้ว',E06:'รอยล้อไปเรือนไม้',E07:'เอกสารเหตุปี 2534 ที่ทีมเก็บไว้',E08:'คำให้การต้น ต้องเทียบหลักฐานอื่น'};
  return {objective:'ช่วยคนหาย ตรวจหลักฐาน และหยุดพิธี',confirmed:s.evidence.map(id=>({id,text:labels[id] ?? id,source:'สิ่งที่ทีมพบจริง'})),
   suspected:learnedStoryInformation(s),unknown:(s.guided?.questions ?? []).map((text,i)=>({id:'question:'+i,text,source:'คำถามของทีม'}))};
 }
 const p=caseContext(s);
 if(s.report)p.objectives.push('case-closed');
 if(s.opened)p.objectives.push('captives-located');
 if(s.understood || s.seals.some(Boolean))p.objectives.push('ritual-known');
 const allowed=content.items.filter(item=>matchesScenarioConditions(item.when,p)&&!(item.unless??[]).some(c=>matchesScenarioConditions([c],p)));
 const project=(status:Item['status'])=>allowed.filter(i=>i.status===status).map(({id,text,source})=>({id,text:s.storyVersion===4 ? v4.journal[id] ?? text : text,source}));
 return {objective:content.goals.find(goal=>matchesScenarioConditions(goal.when,p))!.text,confirmed:project('confirmed'),suspected:[...project('suspected'),...learnedStoryInformation(s)],unknown:project('unknown')};
}
