import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { World } from '../world.js';
import { addFact, advanceStory, hasFact, v4 } from './caseStory.js';
import { emitCaseBeat, tick, type Site } from './case001.js';
import { travelCaseMap } from './caseBattle.js';
import { caseGrid } from '@baan/shared';
import { scenes51, endings51 } from './v51Content.js';
import { command51, dialogue51, presentScene51, sceneCue51, speak51, wichaiHere51 } from './storyV51.js';

type Phase='A'|'B'|'C'|'D'|'E'|'FINAL'|'ENDING';
type Scene={id:string;phase:Phase;entry_cue:string;suggested_questions:string[];optional_check_id:string|null;forward_bridge:string};
type PhaseInfo={title:string;hints:string[];lead:string};
export type GuidedState={
 version:'4.3'|'5.1';phase:Phase;scene:string;observed:string[];presented:string[];
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
export const newGuided=(version:'4.3'|'5.1'='4.3'):GuidedState=>({version,phase:'A',scene:'A1',observed:[],presented:[],hints:{},questions:[],journals:[]});
export function guidedScript(s:import('./case001.js').CaseState,id:string) {
 return s.v51 ? id.startsWith('ENDING ') ? endings51[id.slice(-1)]?.script : scenes51[id]?.sourceMarkdown : guidedScripts[id];
}
function sceneData(s:import('./case001.js').CaseState):Record<string,Scene> {
 return s.v51 ? Object.fromEntries(Object.values(scenes51).map(scene=>[scene.id,{id:scene.id,phase:scene.phase as Phase,entry_cue:sceneCue51(s,scene.id),suggested_questions:scene.questions,optional_check_id:scene.checkId,forward_bridge:scene.nextSceneHandoff}])) : data.scenes;
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
 if(s.report) return [{id:'ENDING '+s.report.ending,phase:'ENDING' as Phase,entry_cue:s.report.title,suggested_questions:[],optional_check_id:null,forward_bridge:''}];
 return Object.values(sceneData(s)).filter(scene=>{
  if(s.v51) {
   const v=s.v51;
   if(scene.id==='H1') return ['B','C','E','FINAL'].includes(g.phase) && s.evidence.includes('E07') && hasFact(s,'gate-testimony');
   if(scene.phase!==g.phase) return false;
   if(scene.id==='A2') return g.presented.includes('A1');
   if(scene.id==='B2') return g.presented.includes('B1') && wichaiHere51(s);
   if(scene.id==='E5') return wichaiHere51(s) && s.site==='E';
   if(scene.id==='E3') return s.opened && s.evacuated.length<3;
   if(scene.id==='C4') return w.caseMap?.battle?.id==='EN01';
   if(scene.id==='D3') return ['cautious','hostile','pacified'].includes(s.ghost) && !v.KAEW_TEMP_DISPERSED;
   if(scene.id==='D4') return w.caseMap?.battle?.id==='EN02';
   if(scene.id==='F1'||scene.id==='F2') return v.RITUAL_STATUS!=='stopped';
   if(scene.id==='F3') return w.caseMap?.battle?.id==='EN04';
   if(scene.id==='F4') return w.caseMap?.battle?.id==='EN04' && w.caseMap.battle.phase==='flood_memory';
   if(scene.id==='F5') return v.RITUAL_STATUS==='stopped';
   if(scene.id==='F6') return s.minute>=240 && v.RITUAL_STATUS!=='stopped';
   return true;
  }
  if(scene.id==='H1') return s.evidence.includes('E07') && (hasFact(s,'gate-testimony') || hasFact(s,'v43-evacuation-records'));
  if(scene.phase!==g.phase) return false;
  if(scene.id==='E5') return s.wichai?.site==='E' && s.wichai.status!=='detained';
  if(scene.id==='E3') return s.opened && s.evacuated.length<3;
  if(scene.id==='C4') return !!w.caseMap?.battle && w.caseMap.battle.id==='EN01';
  if(scene.id==='D3') return ['cautious','hostile','pacified'].includes(s.ghost);
  if(scene.id==='D4') return w.caseMap?.battle?.id==='EN02';
  if(scene.id==='F2') return !hasFact(s,'kaew-dispersed') && !s.seals[2] && s.ghost!=='hidden';
  if(scene.id==='F3' || scene.id==='F4') return !!w.caseMap?.battle;
  if(scene.id==='F5') return s.seals[2];
  if(scene.id==='F6') return s.minute>=240 && !s.seals[2];
  return true;
 });
}
export function observeGuidedScene(w:World,id:string) {
 const s=w.case001!,g=s.guided!;
 if(!allowedGuidedScenes(w).some(scene=>scene.id===id)) throw Error('ฉากนี้ยังเปิดไม่ได้');
 if(w.caseMap?.battle && !['C4','D4','F3','F4'].includes(id)) throw Error('จบการเผชิญหน้าก่อนเปลี่ยนฉากย่อย');
 g.scene=id;
 if(g.observed.includes(id)) return;
 g.observed.push(id);
 if(s.v51) {
  if(!w.dmSession) {g.presented.push(id);presentScene51(s,id);}
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
 if(id==='E2') s.opened=true;
 if(id==='E4') {s.key=true;evidence('E05');evidence('E07');addFact(s,'v43-evacuation-records');}
 const scene=data.scenes[id];
 emitCaseBeat(s,'guided-cue:'+id,scene.entry_cue,'party',s.site);
 // Recover facts through their authored new sources, without moving past NPCs.
 advanceStory(s);
}
export function guidedView(w:World) {
 const s=w.case001!,g=s.guided;
 if(!g) return;
 const seen=g.phase!=='ENDING' && g.presented.includes(g.scene);
 const scene=sceneData(s)[g.scene];
 return {version:g.version,phase:g.phase,scene:g.scene,
  cue:seen?scene.entry_cue:undefined,prompts:seen?scene.suggested_questions:[],lethal:s.v51?.lethal,
  canAnalyzeHistory:g.scene==='H1' && seen && !hasFact(s,'gate-truth'),escorting:s.escorts.length,journals:g.journals,transition:g.transition};
}
function summary(w:World) {
 const g=w.case001!.guided!;
 // Only information delivered to the whole team belongs in its shared journal.
 const players=Object.keys(w.players).filter(id=>id!==w.humanDmId);
 const facts=(w.narrative?.records ?? []).filter(beat=>beat.eventId!=='guided-hint' && beat.eventId!=='guided-handoff' && players.every(id=>beat.recipients.includes(id))).slice(-4).map(beat=>beat.text);
 const seen=guidedView(w)?.cue;
 if(w.case001!.v51) {
  const lead:Record<string,string>={A:'ตรวจแฟ้มที่บ้านผู้ใหญ่',B:'ตรวจสมุดที่บ้านดลตามแผนที่',C:'ตรวจศาลตามสมุดดลหรือคำชี้ทางที่ได้รับ',D:'ตามรอยล้อไปเรือนไม้',E:'จัดการกำไลและประเมินความปลอดภัยตามสิ่งที่ทีมพบ'};
  return {known_facts:facts.length?facts:seen?[seen]:[],open_questions:g.questions.slice(-3),next_destination_rationale:lead[g.phase]};
 }
 return {known_facts:facts.length?facts:seen?[seen]:[],open_questions:g.questions.slice(-3),
  next_destination_rationale:g.phase==='C' && !g.observed.includes('C5') ? data.scenes.C2.entry_cue : data.phases[g.phase as Exclude<Phase,'ENDING'>].lead};
}
export function guidedCommand(w:World,player:string,command:string,target?:string) {
 const s=w.case001!,g=s?.guided;
 if(!g || s.report) throw Error('ไม่มีบทนำทางที่กำลังดำเนินอยู่');
 if(command.startsWith('v51:')) {
  if(!s.v51 || player!==w.humanDmId) throw Error('เฉพาะผู้ดำเนินเรื่อง v5.1');
  command51(w,command.slice(4));return;
 }
 if(command==='hint') throw Error('ระบบขอคำใบ้ถูกปิดแล้ว ให้พูดคุยกับผู้ดำเนินเรื่อง');
 if(command==='evacuate') {
  if(player===w.humanDmId || !w.characters?.[player]?.hp || !['E','FINAL'].includes(g.phase) ||
   w.caseMap?.battle || !s.escorts.length) throw Error('ยังพาผู้สูญหายไปจุดปลอดภัยไม่ได้');
  if(s.v51?.pending?.kind==='crossfire') throw Error('ต้องช่วยตัวประกันจากมีดตามกติกาก่อน');
  const names=[...s.escorts].filter(n=>!s.v51 || s.v51.HOSTAGE_FATE[n as 'ดล'|'นิด'|'เพิ่ม']==='alive');
  s.evacuated.push(...names.filter(name=>!s.evacuated.includes(name)));
  s.escorts=[];
  tick(s,travelMinutes);
  emitCaseBeat(s,'guided-rescue','พาผู้สูญหายถึงจุดปลอดภัย · '+names.join(' / '),'party',s.site);
  return;
 }
 if(command==='history') {
  if(g.scene!=='H1' || !g.presented.includes('H1') || !s.evidence.includes('E07') ||
   (!hasFact(s,'gate-testimony') && !hasFact(s,'v43-evacuation-records'))) throw Error('ยังไม่มีข้อมูลประกอบเพียงพอ');
  if(hasFact(s,'gate-truth')) throw Error('อ่านข้อมูลชุดนี้แล้ว');
  addFact(s,'gate-truth');addFact(s,'v41-flood-evidence');
  if(s.v51) {
   s.v51.FLOOD_TRUTH='evidence';
   emitCaseBeat(s,'guided-history',scenes51.H1.cue,'party',s.site);return;
  }
  emitCaseBeat(s,'guided-history',v4.events.EV15.text!,'party',s.site);
  return;
 }
 if(command==='cancel') {delete g.transition;return;}
 if(command==='confirm') {
  if(player===w.humanDmId || !w.characters?.[player]?.hp || !g.transition || g.transition.id!==target) throw Error('ให้ผู้สืบสวนยืนยันสรุปบทล่าสุด');
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
  observeGuidedScene(w,g.phase==='FINAL'?(s.seals[2]?'F5':'F1'):g.phase+'1');
  return;
 }
 if(player!==w.humanDmId) throw Error('เฉพาะผู้ดำเนินเรื่อง');
 if(command==='protect') {
  if(g.scene!=='B3') throw Error('จัดความปลอดภัยได้ในฉากต้นเท่านั้น');
  if(s.v51)s.v51.TON_TRUST='high';
  addFact(s,'v43-ton-protected');return;
 }
 if(command==='scene') {observeGuidedScene(w,target ?? '');return;}
 if(command==='propose') {
  if(s.v51?.pending)throw Error('ให้ทีมรับมือเหตุคุกคามก่อนปิดบท');
  const required={A:['A3'],B:['B5'],C:['C2','C5'],D:['D5'],E:['E1']}[g.phase as Site];
  if(!required?.some(scene=>g.presented.includes(scene))) throw Error('เล่าเบาะแสจุดหมายในบทปัจจุบันก่อน');
  if(w.caseMap?.battle || g.phase==='FINAL') throw Error('ยังเปลี่ยนบทไม่ได้');
  if(g.transition) return;
  const to=data.phase_order[data.phase_order.indexOf(g.phase)+1];
  g.transition={id:randomUUID(),from:g.phase,to,...summary(w)};
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
  if(line.speaker==='ประเสริฐ' && !['A','B'].includes(s.site)) return false;
  if(line.label.includes('คำรับสารภาพ') && !hasFact(s,'confessed')) return false;
  if(line.label.includes('พาวิชัย') && s.wichai?.site!==s.site) return false;
  if(line.label.includes('ยายบุญมีฝาก') && !hasFact(s,'v43-boonmee-apology')) return false;
  if(line.speaker==='ต้น' && line.label==='คุยตามลำพังและทำให้ปลอดภัย' && !hasFact(s,'v43-ton-protected')) return false;
  if(line.speaker==='ต้น' && line.label==='ถามต่อหน้าวิชัย' && hasFact(s,'v43-ton-protected')) return false;
  if(line.label.includes('ดลจากในห้อง') || line.label==='หากทีมยืนยันเป็นบริษัท') return false; // E2's cue already opens the room.
  if(line.label.includes('เคยช่วยชีวิต') && !hasFact(s,'v43-wichai-saved') && !s.story?.firedTriggers.includes('dialogue-boonmee-child')) return false;
  if(line.label.includes('แสดงสมุด') && !s.evidence.includes('E02')) return false;
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
 s.notice=line.speaker+' · '+line.text;
 emitCaseBeat(s,id,s.notice,'party',s.site);
 advanceStory(s);
}
