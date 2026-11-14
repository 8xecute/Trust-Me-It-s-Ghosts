import { readFileSync } from 'node:fs';
import {brief55} from './dmPresentation55.js';
import {landDocumentDisclosureId} from './disclosureEvidence.js';
import {availableQa53} from './qa53.js';
import { randomUUID } from 'node:crypto';
import type { World } from '../world.js';
import { addFact, advanceStory, hasFact, v4 } from './caseStory.js';
import { emitCaseBeat, tick, type CaseState, type Site } from './case001.js';
import { caseOpportunity, syncCaseBattle, travelCaseMap } from './caseBattle.js';
import { caseGrid } from '@baan/shared';
import { noTimer, sceneBrief52, storyContent } from './v51Content.js';
import { alive51, command51, delivered51, dialogue51, historySources52, hostageNames, presentScene51, sceneCue51, speak51, wichaiHere51 } from './storyV51.js';

type Phase='A'|'B'|'C'|'D'|'E'|'FINAL'|'ENDING';
type Scene={id:string;phase:Phase;entry_cue:string;entry_read?:string;suggested_questions:string[];optional_check_id:string|null;forward_bridge:string};
type PhaseInfo={title:string;hints:string[];lead:string;missed:string[];exit:string};
export type GuidedState={
 version:'4.3'|'5.1'|'5.2'|'5.3'|'5.5';prasertContact?:boolean;cellarPending?:boolean;phase:Phase;scene:string;observed:string[];presented:string[];
 hints:Partial<Record<Phase,number>>;questions:string[];
 journals:{phase:Phase;known_facts:string[];open_questions:string[];next_destination_rationale:string}[];
 transition?:{id:string;from:Phase;to:Phase;known_facts:string[];open_questions:string[];next_destination_rationale:string};
};
const root=new URL('../../scenarios/case-001/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('case-001.v4.3.GuidedScenes.json',root),'utf8')) as {
 phase_order:Phase[];phases:Record<Exclude<Phase,'ENDING'>,PhaseInfo>;scenes:Record<string,Scene>;
};
const travelMinutes=(JSON.parse(readFileSync(new URL('case-001.json',root),'utf8')) as {travelMinutes:number}).travelMinutes;
const flow=JSON.parse(readFileSync(new URL('case-001.v4.3.StoryFlow.json',root),'utf8')) as {scenes:{id:string;phase:Phase}[]};
const script=readFileSync(new URL('case-001.v4.3.script.md',root),'utf8');
export const guidedScripts=Object.fromEntries(Array.from(script.matchAll(/^### ([A-F]\d+|H1|ENDING [A-D]) — [^\n]+\n([\s\S]*?)(?=^#{2,3} |$(?![\s\S]))/gm),([,id,text])=>[id,text.trim()]));
if(Object.keys(data.scenes).length!==31 || flow.scenes.some(scene=>!data.scenes[scene.id]) ||
 Object.values(data.scenes).some(scene=>scene.suggested_questions.length>3 || !guidedScripts[scene.id])) throw Error('ข้อมูลฉาก v4.3 ไม่ครบ');
function authoredRead(section:string, label:string) {
 const beforeDice=section.split(/^#### .*ทอยเต๋า/m)[0];
 const match=beforeDice.match(new RegExp('^\\*\\*\\['+label+'\\]\\*\\*\\s*\\n+((?:>[^\\n]*(?:\\n|$))+)', 'm'));
 return match?.[1].replace(/^> ?/gm,'').trim();
}
export const guidedCellarRead=authoredRead(guidedScripts.E2,'DM อ่านเมื่อเปิด');
if(!guidedCellarRead) throw Error('ไม่พบบทเปิดห้อง E2');
export const newGuided=(version:'4.3'|'5.1'|'5.2'|'5.3'|'5.5'='4.3'):GuidedState=>({version,phase:'A',scene:'A1',observed:[],presented:[],hints:{},questions:[],journals:[]});
export function guidedScript(s:import('./case001.js').CaseState,id:string) {
 return s.v51 ? id.startsWith('ENDING ') ? storyContent(s).endings[id.slice(-1)]?.script : storyContent(s).scenes[id]?.sourceMarkdown : guidedScripts[id];
}
function sceneData(s:import('./case001.js').CaseState):Record<string,Scene> {
 return s.v51 ? Object.fromEntries(Object.values(storyContent(s).scenes).map(scene=>[scene.id,{id:scene.id,phase:scene.phase as Phase,entry_cue:sceneCue51(s,scene.id),suggested_questions:scene.questions,optional_check_id:scene.checkId,forward_bridge:scene.nextSceneHandoff}])) : data.scenes;
}

export function guidedEndingText(ending:string) {
 const section=guidedScripts['ENDING '+ending];
 const bridge=section?.split('**[สะพานบทสรุป')[1];
 const paragraph=bridge?.match(/^> (.+)$/m)?.[1];
 if(!paragraph) throw Error('บทสรุป v4.3 ไม่ครบ');
 return paragraph;
}

export function allowedGuidedScenes(w:World) {
 const s=w.case001!,g=s.guided;
 if(!g) return [];
 if(g.version==='5.5' && !s.report) return Object.values(sceneData(s));
 if(s.report) return [{id:'ENDING '+s.report.ending,phase:'ENDING' as Phase,entry_cue:s.report.title,suggested_questions:[],optional_check_id:null,forward_bridge:''}];
 return Object.values(sceneData(s)).filter(scene=>{
  if(s.v51) {
   const v=s.v51;
   if(scene.id==='H1') return ['B','C','E','FINAL'].includes(g.phase) && (noTimer(s)?historySources52(s):s.evidence.includes('E07') && hasFact(s,'gate-testimony'));
   if(noTimer(s) && scene.id==='F6')return ['E','FINAL'].includes(g.phase) && s.site==='E' && !!v.backlash && v.RITUAL_STATUS!=='stopped';
   if(scene.phase!==g.phase && !(noTimer(s) && g.phase==='FINAL' && scene.phase==='E')) return false;
   if(scene.id==='A2')return g.presented.includes('A1');
   if(noTimer(s) && ['B3','B4'].includes(scene.id))return g.presented.includes('B1');
   if(noTimer(s) && scene.id==='E6')return s.opened || s.key;
   if(scene.id==='B2') return g.presented.includes('B1') && wichaiHere51(s);
   if(scene.id==='E5') return wichaiHere51(s) && s.site==='E';
   if(noTimer(s) && scene.id==='E2')return s.opened || g.version==='5.5' && !!v.doorAccess55;
   if(scene.id==='E3') return noTimer(s)
    ?g.presented.includes('E2') && hostageNames.some(n=>alive51(s,n) && !s.evacuated.includes(n) && !s.escorts.includes(n))
    :s.opened && s.evacuated.length<3;
   if(scene.id==='C4') return g.observed.includes('C4') || w.caseMap?.battle?.id==='EN01' || !!w.caseMap && caseOpportunity(s,w.caseMap)==='EN01';
   if(scene.id==='D3') return ['cautious','hostile','pacified'].includes(s.ghost) && !v.KAEW_TEMP_DISPERSED;
   if(scene.id==='D4') return w.caseMap?.battle?.id==='EN02';
   if(scene.id==='F1'||scene.id==='F2') return (g.version!=='5.5' || !!v.finalDefense55) &&
    v.RITUAL_STATUS!=='stopped' && (!noTimer(s) || !!v.coreApproached && (scene.id==='F1' || g.presented.includes('F1')));
   if(scene.id==='F3') return w.caseMap?.battle?.id==='EN04';
   if(scene.id==='F4') return g.version==='5.5'?!!v.finalPhaseTwo55:['5.3','5.5'].includes(g.version ?? '')?!!v.memory53:w.caseMap?.battle?.id==='EN04' && w.caseMap.battle.phase==='flood_memory';
   if(scene.id==='F5') return v.RITUAL_STATUS==='stopped';
   if(scene.id==='F6') return s.minute>=240 && v.RITUAL_STATUS!=='stopped';
   return true;
  }
  if(scene.id==='H1') return s.evidence.includes('E07') && (hasFact(s,'gate-testimony') || hasFact(s,'v43-evacuation-records'));
  if(scene.phase!==g.phase) return false;
  if(scene.id==='E5') return s.wichai?.site==='E' && s.wichai.status!=='detained';
  if(scene.id==='E3') return s.opened && s.evacuated.length<3;
  if(scene.id==='C4') return g.observed.includes('C4') || w.caseMap?.battle?.id==='EN01' || !!w.caseMap && caseOpportunity(s,w.caseMap)==='EN01';
  if(scene.id==='D3') return ['cautious','hostile','pacified'].includes(s.ghost);
  if(scene.id==='D4') return w.caseMap?.battle?.id==='EN02';
  if(scene.id==='F2') return !hasFact(s,'kaew-dispersed') && !s.seals[2] && s.ghost!=='hidden';
  if(scene.id==='F3' || scene.id==='F4') return !!w.caseMap?.battle;
  if(scene.id==='F5') return s.seals[2];
  if(scene.id==='F6') return s.minute>=240 && !s.seals[2];
  return true;
 });
}
function canObserveDuringBattle(w:World,id:string) {
 if(w.caseMap?.battle?.final55 && ['F1','F2','F3','F4'].includes(id))return true;
 return !w.caseMap?.battle || ['C4','D4','F3','F4'].includes(id) || noTimer(w.case001!) && id==='F6';
}

export function canOpenGuidedScene(w:World,id:string) {
 if(w.case001?.guided?.version==='5.5')return !w.caseMap?.battle;
 return canObserveDuringBattle(w,id) && (!w.case001?.guided?.cellarPending || id==='E2');
}

export function observeGuidedScene(w:World,id:string) {
 const s=w.case001!,g=s.guided!;
 if(!allowedGuidedScenes(w).some(scene=>scene.id===id)) throw Error('ฉากนี้ยังเปิดไม่ได้');
 if(!canObserveDuringBattle(w,id)) throw Error('จบการเผชิญหน้าก่อนเปลี่ยนฉากย่อย');
 g.scene=id;
 if(g.observed.includes(id) && !(noTimer(s) && id==='F6' && !s.v51?.backlash?.announced))return;
 if(!g.observed.includes(id))g.observed.push(id);
 if(s.v51) {
  if(!w.dmSession) {if(!g.presented.includes(id))g.presented.push(id);presentScene51(s,id);delivered51(s,'guided-cue:'+id);}
  emitCaseBeat(s,'guided-cue:'+id,sceneCue51(s,id),'party',s.site);
  return;
 }
 if(!w.dmSession) g.presented.push(id);
 const evidence=(key:string)=>{if(!s.evidence.includes(key))s.evidence.push(key);};
 if(id==='B4') {addFact(s,'v41-photo');evidence('E07');}
 if(id==='C2') evidence('E02');
 if(id==='C5') addFact(s,'met-boonmee');
 if(id==='D2') {evidence('E04');evidence('E03');s.ghost=s.ghost==='hidden'?'cautious':s.ghost;}
 if(id==='D5') evidence('E06');
 if(id==='E4') {s.key=true;evidence('E05');evidence('E07');addFact(s,'v43-evacuation-records');}
 const scene=data.scenes[id];
 emitCaseBeat(s,'guided-cue:'+id,id==='E2' && s.opened ? guidedCellarRead! : scene.entry_read ?? authoredRead(guidedScripts[id],'DM อ่าน') ?? scene.entry_cue,'party',s.site);
 // Recover facts through their authored new sources, without moving past NPCs.
 advanceStory(s);
}
function disclosureOptions53(s:CaseState) {
 const g=s.guided,v=s.v51;
 if(!g || !['5.3','5.5'].includes(g.version) || g.scene!=='F5' || !g.presented.includes('F5') || s.report ||
    v?.RITUAL_STATUS!=='stopped' || v.pastDisclosed || !hasFact(s,'gate-truth') ||
    !v.FLOOD_EVIDENCE_COLLECTED || !s.evidence.includes('E07'))return [];
 return [{id:'E07',label:'บันทึกประตูน้ำและหลักฐานปี 2534'},
  ...(v.LAND_EVIDENCE_COLLECTED && (g.version==='5.5' || s.evidence.includes('E08'))?[{id:g.version==='5.5'?landDocumentDisclosureId:'E08',label:'หลักฐานหนี้และซื้อขายที่ดิน'}]:[])];
}

export function guidedView(w:World) {
 const s=w.case001!,g=s.guided;
 if(!g) return;
 const seen=g.phase!=='ENDING' && g.presented.includes(g.scene);
 const scene=sceneData(s)[g.scene];
 return {version:g.version,phase:g.phase,scene:g.scene,
  title:seen && noTimer(s)?storyContent(s).scenes[g.scene]?.title:undefined,
  previousLead:noTimer(s)?g.journals.at(-1)?.next_destination_rationale:undefined,
  cue:seen?noTimer(s) && w.dmSession ? w.dmSession.sent?.['guided-cue:'+g.scene]?.text : scene.entry_cue:undefined,
  prompts:seen && !w.caseMap?.battle ? ['5.3','5.5'].includes(g.version ?? '')?availableQa53(s).map(question=>question.question):scene.suggested_questions:[],
  questionOptions:!noTimer(s) && seen && !w.caseMap?.battle && !s.report ? guidedDialogue(s).filter(line=>line.label.startsWith('ถาม') || s.v51 && 'field' in line && line.field==='responses' && line.label.endsWith('?')).map(line=>({label:line.label,speaker:line.speaker})) : [],
  disclosureOptions:disclosureOptions53(s),canAnalyzeHistory:!noTimer(s) && g.scene==='H1' && seen && !hasFact(s,'gate-truth'),escorting:s.escorts.length,journals:g.journals,transition:g.transition};
}
export function sharedCaseStory(w:World) {
 const players=Object.keys(w.players).filter(id=>id!==w.humanDmId && !!w.characters?.[id] && !w.inactivePlayers?.includes(id));
 return (w.narrative?.records ?? []).filter(beat=>players.length>0 && players.every(id=>beat.recipients.includes(id)))
  .map(({recipients,...beat})=>beat);
}

function summary(w:World) {
 const g=w.case001!.guided!;
 const facts=sharedCaseStory(w).filter(beat=>beat.eventId!=='guided-hint' && beat.eventId!=='guided-handoff' &&
  (!noTimer(w.case001!) || !beat.phase || beat.phase===g.phase)).slice(-4).map(beat=>beat.text);
 const seen=guidedView(w)?.cue;
 if(w.case001!.v51) {
  const lead:Record<string,string>={A:'ตรวจแฟ้มที่บ้านผู้ใหญ่',B:'ตรวจสมุดที่บ้านดลตามแผนที่',C:'ตรวจศาลตามสมุดดลหรือคำชี้ทางที่ได้รับ',D:'ตามรอยล้อไปเรือนไม้',E:'จัดการกำไลและประเมินความปลอดภัยตามสิ่งที่ทีมพบ'};
  return {known_facts:facts.length?facts:seen?[seen]:[],open_questions:g.questions.slice(-3),next_destination_rationale:lead[g.phase]};
 }
 return {known_facts:facts.length?facts:seen?[seen]:[],open_questions:g.questions.slice(-3),
  next_destination_rationale:g.phase==='C' && !g.observed.includes('C5') ? data.scenes.C2.entry_cue : data.phases[g.phase as Exclude<Phase,'ENDING'>].lead};
}
const chapterLeads:Partial<Record<Phase,string[]>>={A:['A3'],B:['B5'],C:['C2','C5'],D:['D5'],E:['E1']};

function chapterExit(w:World) {
 const s=w.case001!,g=s.guided!;
 const to=data.phase_order[data.phase_order.indexOf(g.phase)+1];
 const required=chapterLeads[g.phase] ?? [];
 const leadSent=required.some(id=>g.presented.includes(id));
 const blocked=g.cellarPending ? 'ส่งบทเปิดห้องให้ทีมก่อนเปลี่ยนฉาก' :
  s.v51?.pending || s.v51?.backlash ? 'ให้ทีมรับมือเหตุคุกคามก่อนปิดบท' :
  w.caseMap?.battle ? 'จบการเผชิญหน้าก่อนเปลี่ยนบท' : undefined;
 const reason=blocked ?? (g.version==='5.5' && g.phase==='E' && s.v51?.RITUAL_STATUS!=='stopped' && !s.v51?.finalDefense55 ? 'ให้ทีมเริ่มลงมือปลดกำไลในฉาก E6 เพื่อเข้าสู่ช่วงสุดท้าย' :
  g.phase==='FINAL' ? 'ช่วงสุดท้าย ให้ผู้สืบสวนสรุปผลและปิดคดีเมื่อพร้อม' :
  !leadSent ? 'เล่าเบาะแสจุดหมายก่อนจากฉาก '+required.join(' หรือ ') : undefined);
 return {to,leadScenes:!leadSent && !blocked ? required : [],canPropose:!reason && !g.transition,reason};
}

export function guidedBackup(w:World) {
 const s=w.case001,g=s?.guided;
 if(!s || !g || g.phase==='ENDING' || s.report) return undefined;
 const phase=data.phases[g.phase];
 const currentScene=g.version==='5.5'?storyContent(s).scenes[g.scene]:undefined;
 const brief=currentScene?brief55(g.scene,currentScene.sourceMarkdown):noTimer(s)?sceneBrief52(g.scene):undefined;
 const players=Object.keys(w.players).filter(id=>id!==w.humanDmId && !!w.characters?.[id]);
 const delivered=(w.narrative?.records ?? []).filter(beat=>players.length>0 && players.every(id=>beat.recipients.includes(id))).slice(-5).map(beat=>({sequence:beat.sequence,text:beat.text}));
 const progression=chapterExit(w);
 const blockers=g.transition ? ['DM ยืนยันเปิดบทถัดไป หรือเลือกดำเนินฉากเดิมต่อ'] : progression.reason ? [progression.reason] : [];
 return {phase:g.phase,scene:g.scene,title:phase.title,opened:!!g.presented.includes(g.scene),hints:brief?[brief[0]]:phase.hints,alternatives:brief?[brief[1]]:phase.missed,exit:brief?.[1] ?? phase.exit,delivered,blockers,progression,battle:!!w.caseMap?.battle};
}

export function guidedCommand(w:World,player:string,command:string,target?:string) {
 const s=w.case001!,g=s?.guided;
 if(!g || s.report) throw Error('ไม่มีบทนำทางที่กำลังดำเนินอยู่');
 const dmControl=noTimer(s) && player===w.humanDmId;
 if(g.version==='5.5' && !dmControl)throw Error('DM เป็นผู้ควบคุมฉากและผลการกระทำ');
 if(command==='select-disclosure') {
  const options=disclosureOptions53(s);
  if(!dmControl && (player===w.humanDmId || !w.characters?.[player]?.hp || w.caseMap?.sites[player]!==s.site) ||
     w.caseMap?.battle || !options.length || typeof target!=='string' || target.length>500) throw Error('ยังเลือกหลักฐานส่งมอบไม่ได้');
  let selection: {evidence?:unknown;recipient?:unknown}|undefined;
  try {selection=JSON.parse(target);} catch {throw Error('ข้อมูลการส่งมอบไม่ถูกต้อง');}
  const evidence=selection?.evidence, recipient=selection?.recipient;
  if(!Array.isArray(evidence) || !evidence.includes('E07') ||
     evidence.some(id=>!options.some(option=>option.id===id)) ||
     typeof recipient!=='string' || !recipient.trim() || recipient.trim().length>120) throw Error('เลือกหลักฐานปี 2534 และระบุผู้รับ');
  s.v51!.disclosure53={evidence:[...new Set(evidence)],recipient:recipient.trim()};
  return;
 }
 if(command.startsWith('v51:')) {
  if(!s.v51 || player!==w.humanDmId) throw Error('เฉพาะผู้ดำเนินเรื่องของบทนี้');
  command51(w,command.slice(4));
  if(command==='v51:ritual-release')syncCaseBattle(w);
  if(command.startsWith('v51:flood-memory:'))observeGuidedScene(w,'F4');
  if(noTimer(s) && command==='v51:wichai-risk')observeGuidedScene(w,'F6');
  return;
 }
 if(command==='hint') throw Error('ระบบขอคำใบ้ถูกปิดแล้ว ให้พูดคุยกับผู้ดำเนินเรื่อง');
 if(command==='evacuate') {
  if(!dmControl && (player===w.humanDmId || !w.characters?.[player]?.hp) || !['E','FINAL'].includes(g.phase) ||
   w.caseMap?.battle || !s.escorts.length) throw Error('ยังพาผู้สูญหายไปจุดปลอดภัยไม่ได้');
  if(s.v51?.pending?.kind==='crossfire') throw Error('ต้องช่วยตัวประกันจากมีดตามกติกาก่อน');
  const names=[...s.escorts].filter(n=>!s.v51 || s.v51.HOSTAGE_FATE[n as 'ดล'|'นิด'|'เพิ่ม']==='alive');
  if(s.v51?.protectedHostages53)s.v51.protectedHostages53=s.v51.protectedHostages53.filter(name=>!names.includes(name));
  s.evacuated.push(...names.filter(name=>!s.evacuated.includes(name)));
  s.escorts=[];
  tick(s,travelMinutes);
  emitCaseBeat(s,'guided-rescue','พาผู้สูญหายถึงจุดปลอดภัย · '+names.join(' / '),'party',s.site);
  return;
 }
 if(command==='history') {
  if(noTimer(s))throw Error('ใช้การเทียบหลักฐานใน H1 หรือการ์ดทอยของฉาก');
  if(g.scene!=='H1' || !g.presented.includes('H1') || !s.evidence.includes('E07') ||
   (!hasFact(s,'gate-testimony') && !hasFact(s,'v43-evacuation-records'))) throw Error('ยังไม่มีข้อมูลประกอบเพียงพอ');
  if(hasFact(s,'gate-truth')) throw Error('อ่านข้อมูลชุดนี้แล้ว');
  addFact(s,'gate-truth');addFact(s,'v41-flood-evidence');
  if(s.v51) {
   s.v51.FLOOD_TRUTH='evidence';
   emitCaseBeat(s,'guided-history',storyContent(s).scenes.H1.cue,'party',s.site);return;
  }
  emitCaseBeat(s,'guided-history',v4.events.EV15.text!,'party',s.site);
  return;
 }
 if(command==='cancel') {delete g.transition;return;}
 if(command==='confirm') {
  if(!dmControl && (player===w.humanDmId || !w.characters?.[player]?.hp) || !g.transition || g.transition.id!==target) throw Error('ยืนยันสรุปบทล่าสุดก่อนเปลี่ยนฉาก');
  const transition=g.transition;
  if(s.v51 && g.phase==='A') s.v51.CASE_ACCEPTED=true;
  g.journals.push({phase:g.phase,known_facts:transition.known_facts,open_questions:transition.open_questions,next_destination_rationale:transition.next_destination_rationale});
  g.phase=transition.to;
  delete g.transition;
  if(g.phase==='ENDING') throw Error('ใช้ผลลัพธ์คดีเพื่อปิดบท');
  const nextSite=g.phase==='FINAL'?'E':g.phase as Site;
  const travellers=Object.keys(w.players).filter(id=>id!==w.humanDmId);
  for(const id of travellers) travelCaseMap(w,id,nextSite,caseGrid(nextSite));
  s.site=nextSite;
  tick(s,transition.to==='FINAL'?0:travelMinutes);
  if(noTimer(s) && g.phase==='FINAL' && !s.seals[2] && !s.v51!.coreApproached)return;
  observeGuidedScene(w,g.phase==='FINAL'?(s.seals[2]?'F5':'F1'):g.phase+'1');
  return;
 }
 if(player!==w.humanDmId) throw Error('เฉพาะผู้ดำเนินเรื่อง');
 if(command==='scene' && g.version==='5.5') {
  if(w.caseMap?.battle)throw Error('จบการเผชิญหน้าก่อนเปลี่ยนฉาก');
  const scene=sceneData(s)[target ?? ''];
  if(!scene || scene.phase==='ENDING' || !w.caseMap)throw Error('ไม่พบฉากที่เลือก');
  const site=scene.phase==='FINAL'?'E':scene.id==='H1'?s.site:scene.phase as Site;
  for(const id of Object.keys(w.players).filter(id=>id!==w.humanDmId))travelCaseMap(w,id,site,caseGrid(site));
  s.site=site;g.phase=scene.phase;delete g.transition;delete g.cellarPending;
  observeGuidedScene(w,scene.id);return;
 }
 if(g.cellarPending && (command==='propose' || command==='scene' && target!=='E2')) throw Error('ส่งบทเปิดห้องให้ทีมก่อนเปลี่ยนฉาก');
 if(command==='contactPrasert') {
  const contactScene=g.version==='5.5'?'F5':'H1';
  if(g.scene!==contactScene || !g.presented.includes(contactScene) || !hasFact(s,'gate-truth') || w.caseMap?.battle ||
    g.version==='5.5' && s.v51?.RITUAL_STATUS!=='stopped') throw Error(g.version==='5.5'?'หยุดพิธีและวิเคราะห์หลักฐานให้ครบก่อนติดต่อประเสริฐ':'วิเคราะห์หลักฐานใน H1 ก่อนติดต่อประเสริฐ');
  if(g.prasertContact || w.dmSession?.narration.some(beat=>beat.eventId==='guided-contact-prasert')) throw Error('ติดต่อประเสริฐแล้วหรือมีบทติดต่อรอส่ง');
  emitCaseBeat(s,'guided-contact-prasert','ทีมโทรหาประเสริฐและนำข้อสงสัยจากเอกสารน้ำท่วมไปถาม เขารับสายและเงียบไปครู่หนึ่ง','party',s.site);
  if(!w.dmSession) g.prasertContact=true;
  return;
 }
 if(command==='protect') {
  if(g.scene!=='B3') throw Error('จัดความปลอดภัยได้ในฉากต้นเท่านั้น');
  if(s.v51){s.v51.TON_TRUST='high';if(g.version==='5.5')s.v51.tonAllowed55=true;}
  addFact(s,'v43-ton-protected');return;
 }
 if(command==='ton-withhold' && g.version==='5.5') {
  if(g.scene!=='B3')throw Error('ตัดสินการสนทนากับต้นได้ในฉากต้นเท่านั้น');
  s.v51!.tonAllowed55=false;return;
 }
 if(command==='scene') {observeGuidedScene(w,target ?? '');return;}
 if(command==='propose') {
  const {to,reason}=chapterExit(w);
  if(reason)throw Error(reason);
  if(g.transition) return;
  g.transition={id:randomUUID(),from:g.phase,to,...summary(w)};
  if(g.version==='5.5')return guidedCommand(w,player,'confirm',g.transition.id);
  return;
 }
 throw Error('ไม่รู้จักคำสั่งนำทาง');
}

type AuthoredLine={id:string;scene:string;speaker:string;label:string;text:string};
const authored=JSON.parse(readFileSync(new URL('case-001.v4.3.dialogue.json',root),'utf8')) as AuthoredLine[];
if(new Set(authored.map(line=>line.id)).size!==authored.length || authored.some(line=>!data.scenes[line.scene] || !script.includes(line.text))) throw Error('บทพูด v4.3 ไม่ตรงกับต้นฉบับ');
export function guidedDialogue(s:import('./case001.js').CaseState) {
 if(s.v51)return dialogue51(s);
 const g=s.guided;
 if(!g || !g.presented.includes(g.scene)) return [];
 return authored.filter(line=>{
  if(line.scene!==g.scene) return false;
  if(line.speaker==='วิชัย' && (s.wichai?.site!==s.site || s.wichai.status==='detained')) return false;
  if(line.speaker==='แม่แก้ว' && !['cautious','hostile','pacified'].includes(s.ghost)) return false;
  if(line.speaker==='ประเสริฐ' && !['A','B'].includes(s.site) && !(line.scene==='H1' && g.prasertContact)) return false;
  if(line.label.includes('คำรับสารภาพ') && !hasFact(s,'confessed')) return false;
  if(line.label.includes('พาวิชัย') && s.wichai?.site!==s.site) return false;
  if(line.label.includes('ยายบุญมีฝาก') && !hasFact(s,'v43-boonmee-apology')) return false;
  if(line.speaker==='ต้น' && line.label==='คุยตามลำพังและทำให้ปลอดภัย' && !hasFact(s,'v43-ton-protected')) return false;
  if(line.speaker==='ต้น' && line.label==='ถามต่อหน้าวิชัย' && hasFact(s,'v43-ton-protected')) return false;
  if(line.scene==='E2') {
   if(line.label.includes('ดลจากในห้อง')) return false; // Included in the opening narration.
   if(line.label==='หากทีมยืนยันเป็นบริษัท') return !s.opened && !g.cellarPending;
   if(!s.opened || g.cellarPending) return false;
  }
  if(line.label.includes('เคยช่วยชีวิต') && !hasFact(s,'v43-wichai-saved') && !s.story?.firedTriggers.includes('dialogue-boonmee-child')) return false;
  if(line.label.includes('แสดงสมุด') && !s.evidence.includes('E02')) return false;
  if(line.id==='E5-debt-evidence' && !s.evidence.some(id=>id==='E02' || id==='E05')) return false;
  if(line.label.includes('ปราบแม่แก้ว') && !hasFact(s,'kaew-dispersed')) return false;
  return true;
 });
}
export function speakGuided(s:import('./case001.js').CaseState,id:string) {
 if(s.v51){speak51(s,id);return;}
 const line=guidedDialogue(s).find(line=>'guided-talk:'+line.id===id);
 if(!line) throw Error('บทนี้ยังพูดไม่ได้');
 if(line.speaker==='ประเสริฐ' && line.scene==='H1') addFact(s,'confessed');
 if(line.speaker==='ต้น' && line.label==='คุยตามลำพังและทำให้ปลอดภัย' && !s.evidence.includes('E08')) s.evidence.push('E08');
 if(line.speaker==='ยายบุญมี' && line.label==='ขอให้ยายเข้าป่าด้วย') addFact(s,'v43-boonmee-apology');
 if(line.speaker==='ดล' && line.label==='ถามที่ดิน') addFact(s,'current-testimony');
 if(line.speaker==='ดล' && line.scene==='E2' && line.label==='ดล พูดหลัก') addFact(s,'current-testimony');
 if(line.speaker==='ยายบุญมี' && line.label==='ถามประตูน้ำ') addFact(s,'gate-testimony');
 if(line.speaker==='แม่แก้ว' && line.label.includes('ควบคุม')) addFact(s,'v43-kaew-controller-blocked');
 if(line.speaker==='ยายบุญมี' && line.label==='ถามชื่อเด็ก') addFact(s,'v43-wichai-saved');
 s.notice=line.speaker+(line.scene==='H1' && !['A','B'].includes(s.site)?' (ทางโทรศัพท์)':'')+' · '+line.text;
 emitCaseBeat(s,id,s.notice,'party',s.site);
 advanceStory(s);
}
