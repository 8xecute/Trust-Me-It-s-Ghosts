import {readFileSync} from 'node:fs';
import type {CaseState} from './case001.js';
import {hasFact} from './caseStory.js';
import {alive51, dialogue51, hostageNames, kaewVoice53, wichaiHere51} from './storyV51.js';

type Question53 = {
 id:string;scene:string;question:string;aliases:string[];answer:string;speaker:string;
 kind:'npc'|'environment'|'document'|'action';requirements:string[];guard_ids:string[];dm_note:string;
 delivery:'npc_dialogue'|'scene_narration'|'evidence_readout'|'dm_action_guidance';
};
const directory=new URL('../../scenarios/case-001/',import.meta.url);
const bank=JSON.parse(readFileSync(new URL('case-001.v5.3.qa.json',directory),'utf8')) as {
 qaCount:number;scenes:{scene:string;questions:Question53[]}[];
};
const contract=JSON.parse(readFileSync(new URL('case-001.v5.3.contract.json',directory),'utf8')) as {
 guardDefinitions:Record<string,{all:{field:string;op:'eq'|'in';value:unknown}[]}>;
};
const bank55=JSON.parse(readFileSync(new URL('case-001.v5.5.qa.json',directory),'utf8')) as typeof bank;
const contract55=JSON.parse(readFileSync(new URL('case-001.v5.5.contract.json',directory),'utf8')) as typeof contract;
const questions=bank.scenes.flatMap(scene=>scene.questions);
if(bank.scenes.length!==31 || questions.length!==bank.qaCount || new Set(questions.map(q=>q.id)).size!==questions.length ||
 bank.scenes.some(scene=>scene.questions.some(q=>q.scene!==scene.scene || q.guard_ids.some(id=>!Object.hasOwn(contract.guardDefinitions,id))))) {
 throw Error('ข้อมูลถามตอบ CASE 001 v5.3 ไม่ครบหรือมีรหัสซ้ำ');
}

export function qaForScene53(scene:string,version='5.3') {
 return (version==='5.5'?bank55:bank).scenes.find(entry=>entry.scene===scene)?.questions ?? [];
}

const normalize=(value:string)=>value.normalize('NFC').replace(/[\p{White_Space}\p{Punctuation}]/gu,'').toLowerCase();

export function availableQa53(state:CaseState) {
 return qaForScene53(state.guided?.scene ?? '',state.guided?.version).filter(question=>
  matchQa53(state,question.question).some(answer=>answer.id===question.id));
}

export function matchQa53(state:CaseState,query:string) {
 const scene=state.guided?.scene;
 if(!state.guided || !['5.3','5.5'].includes(state.guided.version) || !scene || !state.v51 || !state.guided.presented.includes(scene)) return [];
 const key=normalize(query);
 if(!key)return [];
 const speakers=new Set(dialogue51(state,true).map(line=>line.speaker));
 const v=state.v51,arrived=v.wichaiArrival53;
 const execution=v.pending?.kind==='execution' && v.pending.announced && wichaiHere51(state,true) && !v.KAEW_TEMP_DISPERSED;
 const fields:Record<string,unknown>={
  SCENE_ACTIVE:scene,
  WICHAI_STATUS:state.v51.WICHAI_STATUS,
  WICHAI_LOCATION:state.wichai?.site==='E'?'abandoned_house':undefined,
  WICHAI_ARRIVAL_EVENT:arrived?.arrived?(arrived.reason==='called'?'called_and_arrived':'followed_and_arrived'):undefined,
  E5_TRIGGERED:arrived?.arrived===true,
  RITUAL_STATUS:state.v51.RITUAL_STATUS,
  KAEW_D_RESULT:state.v51.KAEW_D_RESULT,
  KAEW_TEMP_DISPERSED:state.v51.KAEW_TEMP_DISPERSED,
  KAEW_COMMUNICATION_AVAILABLE:speakers.has('แม่แก้ว') || kaewVoice53(state),
  B4_FILE_OPENED:state.v51.floodSources53?.archive===true,
  E4_BOOK_READ:state.v51.ritualBook53===true,
  FLOOD_GATE_OPERATION_RECORD_READ:state.v51.floodSources53?.gate===true,
  FLOOD_SHELTER_ARRIVAL_LOG_READ:state.v51.floodSources53?.shelter===true,
  F4_TRIGGERED:!!state.v51.memory53,
  F4_TRIGGER_REASON:state.v51.memory53,
  F6_TRIGGERED:state.v51.backlashOccurred53===true,
  WRONG_MANIPULATION_EXECUTED:state.v51.backlashOccurred53===true,
  RITUAL_WARNING_GIVEN:state.v51.coreWarningDelivered===true,
  WICHAI_ALIVE:v.WICHAI_STATUS!=='dead',
  WICHAI_IN_REACH:execution,
  KAEW_PHYSICAL_REACH:execution,
  F5_EXECUTION_ATTEMPT_CONFIRMED:execution,
 };
 const matches=qaForScene53(scene,state.guided.version).filter(q=>[q.question,...q.aliases].some(label=>normalize(label)===key));
 // Ambiguous aliases and requirements without a confirmed runtime mapping go to the DM.
 if(matches.length!==1)return [];
 return matches.filter(q=>{
  if(q.delivery==='dm_action_guidance') return false;
  if(!q.guard_ids.every(id=>state.guided!.version==='5.5' && id==='F4_OCCURRED'?v.finalPhaseTwo55===true:(state.guided!.version==='5.5'?contract55:contract).guardDefinitions[id]?.all.every(rule=>
   Object.hasOwn(fields,rule.field) && (rule.op==='eq'?fields[rule.field]===rule.value:
    rule.op==='in' && Array.isArray(rule.value) && rule.value.includes(fields[rule.field])))))return false;
  if(q.delivery==='npc_dialogue' && !speakers.has(q.speaker))return false;
  const hostagePresent=(name:string)=>state.opened && alive51(state,name) &&
   !state.evacuated.includes(name) && !state.escorts.includes(name);
  if(state.guided!.version==='5.5') {
   if(scene==='E3') {
    if(!hostageNames.every(hostagePresent))return false;
    if(q.id==='E3_Q007')return state.evidence.includes('E02');
    // Showing a book and opening an additional document need explicit observations.
    if(['E3_Q002','E3_Q003'].includes(q.id))return false;
    return q.kind==='environment' && q.requirements.length===0;
   }
   if(scene==='E5') {
    if(!wichaiHere51(state))return false;
    const land=state.evidence.includes('E02') || v.LAND_EVIDENCE_COLLECTED;
    const guards:Record<string,boolean>={
     E5_Q001:land,E5_Q002:hasFact(state,'current-testimony'),E5_Q003:!!v.ritualBook53,
     E5_Q004:!!v.ritualBook53,E5_Q005:state.storyChecks?.E5_WICHAI_NEGOTIATE?.at(-1)?.outcome==='full',
     E5_Q006:!!v.e5Threat,E5_Q008:land || v.SUSPECT_WICHAI==='confirmed',E5_Q009:!!v.ritualBook53,
    };
    return guards[q.id]===true;
   }
   if(scene==='H1') {
    const compared=v.floodSources53?.compared===true;
    const guards:Record<string,boolean>={
     H1_Q001:!!v.floodSources53?.gate,H1_Q003:!!v.floodSources53?.shelter,
     H1_Q004:compared,H1_Q005:!!v.floodSources53?.gate,H1_Q008:compared,
     H1_Q009:state.storyChecks?.H1_FLOOD_TIMELINE?.some(roll=>roll.outcome==='full')===true ||
      state.storyChecks?.C5_EVACUATION_RECORDS?.some(roll=>roll.outcome==='full')===true,
    };
    return guards[q.id]===true;
   }
  }
  if(hostageNames.some(name=>name===q.speaker) && scene!=='E1' && !hostagePresent(q.speaker))return false;
  if(['E2_Q004','E2_Q005','E2_Q006','E3_Q008'].includes(q.id))return hostageNames.every(hostagePresent);
  if(q.id==='E2_Q007')return hostagePresent('เพิ่ม') && v.RITUAL_TETHER_INTACT.เพิ่ม;
  if(q.id==='B3_Q002' || q.id==='B3_Q003')return v.TON_TRUST==='high' && hasFact(state,'v43-ton-protected');
  if(['B3_Q001','B3_Q005','B4_Q006'].includes(q.id))return true;
  if(['D3_Q004','D3_Q005','D3_Q006','D3_Q007'].includes(q.id))return fields.KAEW_COMMUNICATION_AVAILABLE===true;
  if(q.id==='D3_Q008')return fields.KAEW_COMMUNICATION_AVAILABLE===true && v.RITUAL_STATUS!=='stopped';
  if(['E2_Q001','E2_Q002','E2_Q003','E3_Q001','E3_Q003','E3_Q004','E3_Q005'].includes(q.id))return hostagePresent(q.speaker);
  if(['E4_Q002','E4_Q006'].includes(q.id))return v.bagSearched===true;
  if(q.id==='E5_Q004')return wichaiHere51(state);
  if(q.id==='E5_Q005')return state.storyChecks?.E5_WICHAI_NEGOTIATE?.at(-1)?.outcome==='full';
  if(q.id==='E5_Q006')return v.e5Threat===true;
  if(['H1_Q001','H1_Q002','H1_Q006'].includes(q.id))return hasFact(state,'confessed');
  if(q.id==='H1_Q003')return state.site==='C' && v.floodSources53?.shelter===true;
  if(q.id==='F1_Q001')return fields.KAEW_COMMUNICATION_AVAILABLE===true && ['active','weakened'].includes(v.RITUAL_STATUS);
  if(q.id==='F2_Q001')return v.KAEW_D_RESULT!=='not_met' && fields.KAEW_COMMUNICATION_AVAILABLE===true;
  if(q.id==='F2_Q004')return kaewVoice53(state);
  if(['F5_Q001','F5_Q002','F5_Q005','F5_Q006'].includes(q.id))return v.RITUAL_STATUS==='stopped' && fields.KAEW_COMMUNICATION_AVAILABLE===true;
  if(q.id==='F5_Q003')return execution;
  if(q.id==='F6_Q002')return v.backlashOccurred53===true && fields.KAEW_COMMUNICATION_AVAILABLE===true;
  if(q.delivery==='evidence_readout') {
   if(q.id==='B4_Q005')return fields.B4_FILE_OPENED===true;
   if(q.id==='C5_Q009')return fields.FLOOD_SHELTER_ARRIVAL_LOG_READ===true;
   if(['E4_Q001','E4_Q003','E4_Q005','E4_Q008'].includes(q.id))return state.key && fields.E4_BOOK_READ===true;
   if(['H1_Q004','H1_Q009'].includes(q.id))return v.floodSources53?.compared===true;
   if(q.id==='H1_Q005')return hasFact(state,'confessed');
   if(q.id==='H1_Q008')return v.floodSources53?.shelter===true;
   return false;
  }
  if(q.id==='E4_Q004')return state.key && state.v51!.coreApproached===true;
  return q.requirements.length===0;
 });
}
