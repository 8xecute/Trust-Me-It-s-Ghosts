import type { CaseState } from './case001.js';
import {readFileSync} from 'node:fs';
import type { World } from '../world.js';
import { emitCaseBeat } from './case001.js';
import { addFact, hasFact } from './caseStory.js';
import { noTimer, readerLabel, storyContent, type V51Line } from './v51Content.js';

export const hostageNames=['ดล','นิด','เพิ่ม'] as const;
type Hostage=typeof hostageNames[number];
type Ritual='active'|'weakened'|'stopped'|'entrenched';
export type State51={
 lethal:boolean;CASE_ACCEPTED:boolean;KNOWN_MISSING_NAMES:boolean;
 LOCATION_B_KNOWN:boolean;LOCATION_C_KNOWN:boolean;LOCATION_D_KNOWN:boolean;LOCATION_E_KNOWN:boolean;
 TON_TRUST:'low'|'high';SUSPECT_WICHAI:'unknown'|'suspected'|'confirmed';FLOOD_TRUTH:'unknown'|'partial'|'evidence';KNOWS_WICHAI_SAVED:boolean;
 GHOST_ENCOUNTER:'not_started'|'won'|'pacified'|'escaped'|'lost';GHOST_CLUE:'none'|'trace'|'vision';
 KAEW_TRUST:'low'|'neutral'|'high';KAEW_D_RESULT:'not_met'|'talked'|'won'|'fled'|'lost';KAEW_TEMP_DISPERSED:boolean;
 HOSTAGES_FOUND:number;HOSTAGE_FATE:Record<Hostage,'alive'|'dead'>;DEATH_CAUSE:Record<Hostage,null|'ritual_toll'|'crossfire_wichai'>;
 WICHAI_STATUS:'free'|'captured'|'escaped'|'dead';WICHAI_DEATH_CAUSE:null|'kaew_execution';
 RITUAL_STATUS:Ritual;RITUAL_PLAN:'unknown'|'basic'|'prepared';RITUAL_TETHER_INTACT:Record<Hostage,boolean>;
 RITUAL_0300_PRESTATE?:Ritual|null;RITUAL_0300_FULL_POWER?:boolean;
 bagSearched?:boolean;coreApproached?:boolean;coreWarningDelivered?:boolean;boonmeeCallPending?:boolean;
 backlash?:{actor:'player'|'wichai';announced:boolean};
 e5Threat?:boolean;f5Question?:'pending'|'delivered';
 wichaiArrival53?:{reason:'called'|'followed';arrived:boolean};
 disclosure53?:{evidence:string[];recipient:string};
 floodSources53?:{gate?:true;shelter?:true;archive?:true;compared?:true;peopleProven?:true};
 ritualBook53?:true;
 kaewVoice53?:true;
 protectedHostages53?:Hostage[];
 memory53?:'investigate_memory'|'ritual_memory_reaction';
 backlashOccurred53?:true;
 doorAccess55?:true;doorOpened55?:true;dolUngagged55?:true;finalBody55?:'embodied'|'dispersed';finalReleaseCommitted55?:true;finalDefense55?:true;finalPhaseTwo55?:true;
 KAEW_FINAL:null|'calm'|'hostile'|'sealed'|'departed'|'controlled';ENDING_MODIFIER:string|null;
 LAND_EVIDENCE_COLLECTED:boolean;FLOOD_EVIDENCE_COLLECTED:boolean;PLAYER_DEATHS:number;
 // These are DM observations of real actions, not new evidence sufficiency rules.
 humanCaseSupported:boolean|null;pastDisclosed:boolean;disclosurePlan:boolean|null;
 contextConfirmed:string[];deathKnown:Record<string,Hostage[]>;
 pending?:{kind:'crossfire';target:Hostage;announced:boolean}|{kind:'execution';announced:boolean};
 adjudications:{event:string;minute?:number;label?:string;effect?:string}[];
};
const actionHelp=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.dm-action-help.json',import.meta.url),'utf8')) as Record<string,{when:string;effect:string}>;
export function newState51(lethal=false,eventDriven=false):State51 {
 return {lethal,CASE_ACCEPTED:false,KNOWN_MISSING_NAMES:false,LOCATION_B_KNOWN:false,LOCATION_C_KNOWN:false,LOCATION_D_KNOWN:false,LOCATION_E_KNOWN:false,
 TON_TRUST:'low',SUSPECT_WICHAI:'unknown',FLOOD_TRUTH:'unknown',KNOWS_WICHAI_SAVED:false,GHOST_ENCOUNTER:'not_started',GHOST_CLUE:'none',
 KAEW_TRUST:'neutral',KAEW_D_RESULT:'not_met',KAEW_TEMP_DISPERSED:false,HOSTAGES_FOUND:0,
 HOSTAGE_FATE:{ดล:'alive',นิด:'alive',เพิ่ม:'alive'},DEATH_CAUSE:{ดล:null,นิด:null,เพิ่ม:null},
 WICHAI_STATUS:'free',WICHAI_DEATH_CAUSE:null,RITUAL_STATUS:'active',RITUAL_PLAN:'unknown',RITUAL_TETHER_INTACT:{ดล:true,นิด:true,เพิ่ม:true},
 ...(eventDriven?{bagSearched:false,coreApproached:false,coreWarningDelivered:false}:{RITUAL_0300_PRESTATE:null,RITUAL_0300_FULL_POWER:false}),KAEW_FINAL:null,ENDING_MODIFIER:null,
 LAND_EVIDENCE_COLLECTED:false,FLOOD_EVIDENCE_COLLECTED:false,PLAYER_DEATHS:0,humanCaseSupported:null,pastDisclosed:false,disclosurePlan:null,
 contextConfirmed:[],deathKnown:{},adjudications:[]};
}
export const alive51=(s:CaseState,name:string)=>!s.v51 || s.v51.HOSTAGE_FATE[name as Hostage]!=='dead';
export function contract51(s:CaseState) {
 const v=s.v51!;
 return {...v,PHASE:s.guided!.phase,...(noTimer(s)?{}:{TIME_MINUTES:s.minute}),HOSTAGES_SAFE:safeHostages51(s).length,
 HOSTAGES_DEAD:hostageNames.filter(n=>!alive51(s,n)).length,WICHAI_COOPERATING:hasFact(s,'v41-wichai-cooperating'),BRIBE_ACCEPTED:hasFact(s,'bribe-accepted'),
 CHECK_RESULTS:Object.fromEntries(Object.entries(s.storyChecks ?? {}).filter(([,rolls])=>rolls.length).map(([id,rolls])=>[id,rolls.at(-1)!.outcome]))};
}
export function safeHostages51(s:CaseState) {
 return hostageNames.filter(name=>alive51(s,name) && (s.evacuated.includes(name) ||
  ['5.3','5.5'].includes(s.guided?.version ?? '') && s.v51?.protectedHostages53?.includes(name) &&
  !(s.v51.pending?.kind==='crossfire' && s.v51.pending.target===name)));
}
export const kaewVoice53=(s:CaseState)=>['5.3','5.5'].includes(s.guided?.version ?? '') && s.v51?.kaewVoice53===true;
export function wichaiHere51(s:CaseState,includeCaptured=false) {
 if(['5.3','5.5'].includes(s.guided?.version ?? '') && s.site==='E' && !s.v51?.wichaiArrival53?.arrived)return false;
 return s.wichai?.site===s.site && (s.v51?.WICHAI_STATUS==='free' || includeCaptured && s.v51?.WICHAI_STATUS==='captured');
}
export function stopRitual51(s:CaseState) {
 s.seals[2]=true;
 s.v51!.RITUAL_STATUS='stopped';
 if(noTimer(s)) {
  for(const name of hostageNames)s.v51!.RITUAL_TETHER_INTACT[name]=false;
  delete s.v51!.backlash;
 }
}
export function killHostage51(s:CaseState,name:Hostage,cause:NonNullable<State51['DEATH_CAUSE'][Hostage]>) {
 const v=s.v51!;
 if(v.HOSTAGE_FATE[name]==='dead') return false;
 v.HOSTAGE_FATE[name]='dead';v.DEATH_CAUSE[name]=cause;
 s.evacuated=s.evacuated.filter(n=>n!==name);s.escorts=s.escorts.filter(n=>n!==name);
 if(v.protectedHostages53)v.protectedHostages53=v.protectedHostages53.filter(n=>n!==name);
 if(v.pending?.kind==='crossfire' && v.pending.target===name) delete v.pending;
 return true;
}
export function clock51(s:CaseState,previous:number) {
 const v=s.v51;
 if(!v || noTimer(s) || previous>=240 || s.minute<240 || v.RITUAL_0300_PRESTATE!==null) return;
 v.RITUAL_0300_PRESTATE=v.RITUAL_STATUS;
 v.RITUAL_0300_FULL_POWER=v.RITUAL_STATUS==='active';
 if(v.lethal && v.RITUAL_0300_FULL_POWER && v.RITUAL_TETHER_INTACT.เพิ่ม && alive51(s,'เพิ่ม')) {
  killHostage51(s,'เพิ่ม','ritual_toll');
  // A remote death is not delivered as eyewitness knowledge to people at E.
  emitCaseBeat(s,'v51:toll-echo','เสียงสะท้อนผ่านกำไลดับไปหนึ่งสาย','local','E');
 }
 if(v.RITUAL_STATUS!=='stopped') {
  v.RITUAL_STATUS='entrenched';
  // Preserve the existing v4.3 deadline severity; add no new DC or damage.
  if(!s.milestones.includes('ritual-entrenched'))s.milestones.push('ritual-entrenched');
  s.haunt=10;
  if(!v.KAEW_TEMP_DISPERSED)s.ghost='hostile';
 }
 v.adjudications.push({event:'03:00',minute:s.minute});
}
export function sceneCue51(s:CaseState,id:string) {
 const v=s.v51!,scene=storyContent(s).scenes[id];
 if(s.guided?.version==='5.5' && id==='E2' && !s.opened)return storyContent(s).scenes.E1.cue;
 if(s.guided?.version==='5.5' && id==='F2') {
  const rows=scene.dmReadAloud.split('\n').filter(row=>row.trim().startsWith('-'));
  const key=v.KAEW_D_RESULT;
  if(key==='talked' && v.KAEW_TRUST!=='high')return '';
  const row=rows.find(row=>row.includes(key==='fled'||key==='lost'?'fled':key)) ?? rows[0];
  return row?.match(/“([^”]+)”/)?.[1] ?? '';
 }
 if(s.guided?.version==='5.5' && ['E2','E3'].includes(id) && hostageNames.some(name=>!alive51(s,name)))return 'ผู้รอดชีวิตที่อยู่ตรงหน้าพยายามตั้งสติ';
 if(s.guided?.version==='5.5' && id==='E6')return scene.cue;
 if(s.guided?.version==='5.5' && id==='H1')return scene.cue.replaceAll('**','');

 if(['5.3','5.5'].includes(s.guided?.version ?? '') && id==='F5' && (!v.KAEW_TEMP_DISPERSED || kaewVoice53(s))) {
  const openings=scene.dmReadAloud.split('\n').filter(line=>line.startsWith('> **['));
  return (openings[v.KAEW_TEMP_DISPERSED?1:0] ?? '')
   .replace(/^> \*\*\[[^\]]+\]\*\* /,'').replace(/ \(ถ้ายังไม่เคยปลดสายใดให้เห็นทั้งสามเส้นคลายพร้อมกัน\)/,'')
   .split(' — **')[0];
 }
 if(['5.3','5.5'].includes(s.guided?.version ?? '') && id==='B3' && !wichaiHere51(s,true)) {
  return scene.cue.replace(/^ต้นเหลือบมองแขนเสื้อและหลังมือวิชัย ก่อนรีบหันมาหาพวกคุณ /,'ต้นหันมาหาพวกคุณ ');
 }
 if(id==='F2') {
  if(v.KAEW_TEMP_DISPERSED && !kaewVoice53(s)) return 'เสียงยังอยู่';
  const key=v.KAEW_D_RESULT;
  const row=scene.dmReadAloud.split('\n').find(line=>key==='not_met'?line.includes('`not_met`'):key==='fled'||key==='lost'?line.includes('`fled`'):
   line.includes('`'+key+'`') || line.includes('`KAEW_D_RESULT='+key+'`'));
  if(!row) throw Error('ตรวจ State D ก่อนเปิด F2');
  return row.match(/“([^”]+)”/)![1];
 }
 if(['5.3','5.5'].includes(s.guided?.version ?? '') && id==='F1' && v.KAEW_TEMP_DISPERSED && !kaewVoice53(s))return scene.cue.split(' เสียงร้อง')[0];
 if(noTimer(s) && id==='F6' && v.KAEW_TEMP_DISPERSED)return scene.cue.split(' เสียงแม่แก้ว')[0];
 if(!noTimer(s) && id==='F6' && v.KAEW_TEMP_DISPERSED)return scene.cue.split('แม่แก้วทรุดลง')[0].trim();
 if(id==='F5' && v.KAEW_TEMP_DISPERSED)return 'วงพิธีดับราวกับมีคนเป่าเทียน';
 if(['5.3','5.5'].includes(s.guided?.version ?? '') && id==='H1')return scene.cue.split(' — **')[0].replaceAll('**','');
 if(noTimer(s) && id==='H1')return 'บันทึกฉบับหนึ่งมีเวลา «เปิดประตูผันน้ำ» ทีมมีคำบอกเล่าว่าคนในสวนยังออกมาไม่ครบ';
 if(id==='H1')return 'บันทึกฉบับหนึ่งมีเวลา «เปิดประตูผันน้ำ»\n'+(hasFact(s,'gate-testimony')?'ยายบุญมีให้ข้อมูลว่าไม่ได้เห็นคนเปิดประตูกับตา และมีคนยังออกมาไม่ครบ':'');
 if(id==='E2' && hostageNames.some(n=>!alive51(s,n))) return 'กลอนคลายออกพร้อมกลิ่นอับและเหงื่อค้าง';
 if(noTimer(s) && id==='E3' && !hostageNames.every(n=>hostageReachable52(s,n)))return 'เมื่อทีมกันพื้นที่ให้หายใจได้ ผู้ที่ยังอยู่ตรงหน้าพยายามตั้งสติและเล่าเฉพาะสิ่งที่ตนจำได้';
 if(id==='E3' && (hostageNames.some(n=>!alive51(s,n)) || s.evacuated.length || s.escorts.length)) return 'ผู้รอดชีวิตมองจุดว่างที่อีกคนเคยนั่ง';
 if(id==='E6' && v.RITUAL_STATUS==='stopped') return 'วงพิธีดับราวกับมีคนเป่าเทียน';
 if(id==='E6' && s.evacuated.length) return scene.cue.split('ขณะที่ใต้ถุน')[0].trim();
 if(noTimer(s) && id==='E5') {
  const opening=scene.cue.split(' หากตัวประกัน')[0];
  return s.key?opening:opening.replace('เมื่อเห็นกล่องพิธีอยู่กับทีม','เมื่อเห็นทีมในเรือน');
 }
 if(noTimer(s) && id==='E6')return (v.RITUAL_STATUS==='stopped'?'วงพิธีดับราวกับมีคนเป่าเทียน':scene.cue.split(' ขณะที่ใต้ถุน')[0]);
 if(id==='E5' && (!s.opened || s.evacuated.length+s.escorts.length===3)) return scene.cue.split('เขากวาดสายตา')[0].trim();
 return scene.cue.replace(/\*\*\[[^\]]+\]\*\*\s*/g,'').replace(/\*\*ให้บรรยาย[^*]+\*\*/g,'').replace('—**เฉพาะคนที่ยังอยู่ในระยะจริง**—','').replaceAll('**','').trim();
}
export function presentScene51(s:CaseState,id:string) {
 const v=s.v51!;
 if(id[1]==='1' && ['B','C','D','E'].includes(id[0]))v[('LOCATION_'+id[0]+'_KNOWN') as 'LOCATION_B_KNOWN']=true;
 if(id==='A1'||id==='B1') {v.KNOWN_MISSING_NAMES=true;v.LOCATION_B_KNOWN=true;}
 if(id==='A3') v.LOCATION_B_KNOWN=true;
 if(id==='B1'||id==='B5') v.LOCATION_C_KNOWN=true;
 if(id==='C2') {if(!s.evidence.includes('E02'))s.evidence.push('E02');v.LOCATION_D_KNOWN=true;}
 if(noTimer(s) && id==='B4')addFact(s,'v41-photo');
 if(id==='C5') addFact(s,'met-boonmee');
 if(id==='D2') {for(const key of ['E03','E04'])if(!s.evidence.includes(key))s.evidence.push(key);if(s.ghost==='hidden')s.ghost='cautious';}
 if(id==='D5') {v.LOCATION_E_KNOWN=true;if(!s.evidence.includes('E06'))s.evidence.push('E06');}
 if(id==='E2' && (s.guided?.version!=='5.5' || s.opened)) {s.opened=true;v.HOSTAGES_FOUND=3;}
 if(id==='E4') {s.key=true;if(!s.evidence.includes('E05'))s.evidence.push('E05');}
 if(id==='F2' && !v.KAEW_TEMP_DISPERSED) s.ghost='cautious';
 if(id==='F5' && !v.KAEW_TEMP_DISPERSED && !['pacified','freed','sealed'].includes(s.ghost)) s.ghost='cautious';
}

function hardLineAllowed(s:CaseState,line:V51Line) {
 const v=s.v51!,c=line.context,t=line.text;
 if(s.guided?.version==='5.5') {
  if(['นิด','เพิ่ม'].includes(line.speaker))return false;
  if(line.speaker==='ดล' && !v.dolUngagged55)return false;
  if(line.speaker==='ประเสริฐ' && line.scene==='H1' && v.RITUAL_STATUS!=='stopped')return false;
 }

 if(hostageNames.includes(line.speaker as Hostage) && (!alive51(s,line.speaker) || !s.opened && line.scene!=='E1' || s.evacuated.includes(line.speaker))) return false;
 if(noTimer(s)) {
  if(line.scene==='E4' && /กระเป๋า|ทวงหนี้|พลิกดู/.test(c) && !v.bagSearched)return false;
  if(line.scene==='H1' && line.speaker==='ประเสริฐ' && (!hasFact(s,'gate-truth') || !['B'].includes(s.site) && !s.guided?.prasertContact ||
   /พบวิชัย/.test(c) && !hasFact(s,'current-testimony')))return false;
  if(line.scene==='F6' && (!v.backlash?.announced ||
   line.speaker==='วิชัย' && v.backlash.actor!=='wichai' ||
   hostageNames.includes(line.speaker as Hostage) && !hostageReachable52(s,line.speaker as Hostage)))return false;
 }
 if(line.scene==='F2' && line.context!==(v.KAEW_D_RESULT==='fled'||v.KAEW_D_RESULT==='lost'?'fled_lost':v.KAEW_D_RESULT))return false;
 if(line.speaker==='วิชัย' && !wichaiHere51(s,line.scene==='F5')) return false;
 if(line.speaker==='ต้น' && s.site!=='B') return false;
 if(line.speaker==='ยายบุญมี' && line.scene!=='C5') return false;
 if(line.speaker==='ประเสริฐ' && !['A','B'].includes(s.site) && !(noTimer(s) && line.scene==='H1' && s.guided?.prasertContact)) return false;
 if(line.speaker==='แม่แก้ว' && (v.KAEW_TEMP_DISPERSED || !['cautious','hostile','pacified'].includes(s.ghost)) &&
   !(kaewVoice53(s) && ['F1','F2','F5'].includes(line.scene)) && line.scene!=='E6' &&
   !(noTimer(s) && ['F1','F6'].includes(line.scene) && !v.KAEW_TEMP_DISPERSED)) return false;
 if(line.scene==='E6' && v.RITUAL_STATUS==='stopped') return false;
 if(line.scene==='E3' && t==='อย่าให้มันรอดไปได้' && v.WICHAI_STATUS==='captured')return false;
 if(line.scene==='E3' && t==='อย่าให้มันปฏิเสธได้' && v.WICHAI_STATUS!=='captured')return false;
 if(line.scene==='B3' && /ส่วนตัว|รถเข็นหนัก/.test(line.label) && v.TON_TRUST!=='high') return false;
 if(['5.3','5.5'].includes(s.guided?.version ?? '') && line.scene==='B3' && /ส่วนตัว|รถเข็นหนัก/.test(line.label) && !hasFact(s,'v43-ton-protected'))return false;
 if(line.scene==='B3' && line.label.includes('ต่อหน้าวิชัย') && !wichaiHere51(s)) return false;
 if(c.includes('ฝากคำขอโทษยาย') && !hasFact(s,'v43-boonmee-apology')) return false;
 if((c.includes('แสดง E02') || c.includes('แสดงสมุด')) && !s.evidence.includes('E02')) return false;
 if(c.includes('หลังทีมชนะ D4') && v.KAEW_D_RESULT!=='won') return false;
 if(line.scene==='F5' && c.includes('วิชัยถูกนำมา') && (!wichaiHere51(s,true) || v.KAEW_FINAL!=='calm')) return false;
 if(line.scene==='F5' && line.speaker==='วิชัย' && (v.pending?.kind!=='execution' || !v.pending.announced))return false;
 if(line.scene==='F6' && /ดล|นิด/.test(line.speaker) && !v.deathKnown[line.speaker]?.includes('เพิ่ม')) return false;
 if(line.scene==='F6' && /เมื่อกี้ยังหายใจ|มันเอาเขาไปแล้ว/.test(t) && !v.contextConfirmed.includes('witness:'+line.speaker+':เพิ่ม')) return false;
 if(line.scene==='F6' && /เขาอยู่คนเดียวไหม|ตอนนั้นมีใคร/.test(t) && v.contextConfirmed.includes('witness:'+line.speaker+':เพิ่ม')) return false;
 if(line.scene==='E5' && /อีกก้าวเดียว/.test(t) && v.pending?.kind!=='crossfire') return false;
 if(line.scene==='E5' && /สุดท้าย|แขวนชื่อ|ลักพาตัว/.test(line.label) && !hasFact(s,'current-testimony') && !v.LAND_EVIDENCE_COLLECTED) return false;
 return true;
}
export function dialogue51(s:CaseState,includeUnconfirmed=false) {
 const g=s.guided!;
 if(!g.presented.includes(g.scene)) return [];
 return (storyContent(s).scenes[g.scene]?.dialogue ?? []).filter(line=>hardLineAllowed(s,line) &&
  (includeUnconfirmed || automaticLine51(line) || s.v51!.contextConfirmed.includes(line.id)));
}
function automaticLine51(line:V51Line) {
 return line.scene==='F2' || line.field==='npcLines' && line.label==='บทหลัก' &&
  new RegExp('^'+line.speaker+'(?: \\([^)]*\\))?:').test(line.context);
}
export function speak51(s:CaseState,id:string) {
 const line=dialogue51(s).find(line=>'guided-talk:'+line.id===id);
 if(!line) throw Error('บทนี้ไม่ตรงสถานะหรือตำแหน่งจริง');
 const v=s.v51!;
 if(line.scene==='D3' && line.speaker==='แม่แก้ว') v.KAEW_D_RESULT='talked';
 if(line.scene==='C5' && /วิชัย ผู้ช่วย/.test(line.text)) v.KNOWS_WICHAI_SAVED=true;
 if(line.scene==='D3' && /ข้าจำเด็กที่เคยดึง/.test(line.text))v.KNOWS_WICHAI_SAVED=true;
 if(line.scene==='C5' && /ไม่ได้เห็นคนเปิดประตู/.test(line.text)) addFact(s,'gate-testimony');
 if(line.scene==='C5' && /ฝากบอกแก้ว/.test(line.text)) addFact(s,'v43-boonmee-apology');
 if(line.scene==='B3' && /พี่วิชัย/.test(line.text) && v.TON_TRUST==='high') {if(!s.evidence.includes('E08'))s.evidence.push('E08');v.SUSPECT_WICHAI='suspected';}
 if(['E2','E3'].includes(line.scene) && ['ดล','นิด'].includes(line.speaker) && /วิชัย|คนจับฉัน/.test(line.text)) {addFact(s,'current-testimony');v.SUSPECT_WICHAI='confirmed';}
 if(line.scene==='D3' && /ข้าช่วย|ข้าเคยช่ว|วะ—/.test(line.text)) addFact(s,'v43-kaew-controller-blocked');
 if(noTimer(s) && line.scene==='H1' && line.speaker==='ประเสริฐ' && /ร่วมตัดสินใจให้เปิด/.test(line.text))addFact(s,'confessed');
 s.notice=line.speaker+(noTimer(s) && line.scene==='H1' && line.speaker==='ประเสริฐ' && s.site!=='B'?' (ทางโทรศัพท์)':'')+' · '+line.text.replaceAll('**','');
 emitCaseBeat(s,id,s.notice,'party');
}

export function resolveEnding51(s:CaseState):'A'|'B'|'C'|'D' {
 const v=s.v51!,c=contract51(s);
 v.ENDING_MODIFIER=null;
 if(v.PLAYER_DEATHS>=1) {v.ENDING_MODIFIER='fallen_agent';return 'D';}
 if(v.RITUAL_STATUS!=='stopped') return 'D';
 if(c.HOSTAGES_DEAD) {v.ENDING_MODIFIER='bloodstained_rescue';return 'C';}
 if(c.HOSTAGES_SAFE===3 && v.WICHAI_DEATH_CAUSE==='kaew_execution') {v.ENDING_MODIFIER='vigilante_ghost';return 'B';}
 if(c.HOSTAGES_SAFE!==3 || v.WICHAI_STATUS==='escaped' || v.humanCaseSupported!==true) return 'C';
 if(v.KAEW_FINAL==='hostile' || noTimer(s) && v.KAEW_FINAL==='sealed') return 'B';
 if((v.KAEW_FINAL==='calm' || ['5.3','5.5'].includes(s.guided?.version ?? '') && v.KAEW_FINAL==='departed') && v.pastDisclosed && v.WICHAI_STATUS!=='dead') return 'A';
 return 'C';
}
export function endingText51(s:CaseState,ending:string) {
 const v=s.v51!,c=contract51(s),paragraphs=storyContent(s).endings[ending].paragraphs;
 // Bloodied templates contain fixed counts. Preserve their full source in the
 // DM reader; generate the public report from actual counts and causes.
 const opening=ending==='A'?paragraphs[0]:ending==='C'?paragraphs[0]:ending==='B'?
  v.ENDING_MODIFIER==='vigilante_ghost'?paragraphs[1].split('เจ้าหน้าที่')[0]:paragraphs[0]:
  v.ENDING_MODIFIER==='fallen_agent' && v.PLAYER_DEATHS!==1?'เจ้าหน้าที่เสียชีวิตระหว่างปฏิบัติหน้าที่':paragraphs[v.ENDING_MODIFIER==='fallen_agent'?1:0];
 const rituals:Record<Ritual,string>={active:'ยังทำงาน',weakened:'อ่อนลง',stopped:'หยุดแล้ว',entrenched:'ฝังแน่น'};
 const statuses={free:'ยังเป็นอิสระ',captured:'ถูกควบคุมตัว',escaped:'หลบหนีสำเร็จ',dead:'เสียชีวิต'};
 const causes={ritual_toll:'เสียชีวิตจากพิธีเวลา 03:00',crossfire_wichai:'เสียชีวิตจากการลงมีดของวิชัย'};
 return [opening,'ผู้สูญหายปลอดภัย '+c.HOSTAGES_SAFE+'/3 · เสียชีวิต '+c.HOSTAGES_DEAD+' · เจ้าหน้าที่เสียชีวิต '+v.PLAYER_DEATHS,
 'พิธี '+rituals[v.RITUAL_STATUS]+' · วิชัย '+statuses[v.WICHAI_STATUS],
 ...hostageNames.filter(n=>!alive51(s,n)).map(n=>n+' · '+causes[v.DEATH_CAUSE[n]!]),
 v.WICHAI_DEATH_CAUSE?'วิชัย · เสียชีวิตจากการลงมือของแม่แก้ว':'',
 'หลักฐานคดีมนุษย์ '+(v.humanCaseSupported===true?'DM ยืนยันเพียงพอ':'ยังไม่ยืนยันเพียงพอ')+' · อดีตปี 2534 '+(v.pastDisclosed?'เปิดเผยแล้ว':'ยังไม่เปิดเผย')].filter(Boolean).join('\n');
}

export function recordCheck51(s:CaseState,id:string,outcome:'full'|'partial'|'failure') {
 const v=s.v51;if(!v)return;
 if(outcome==='full') {
  if(['B2_WICHAI_TELL','B3_TON_DISCLOSURE','C2_LAND_PATTERN'].includes(id) && v.SUSPECT_WICHAI!=='confirmed') v.SUSPECT_WICHAI='suspected';
  if(['B4_FLOOD_PHOTO','C5_EVACUATION_RECORDS'].includes(id) && (!noTimer(s) || v.FLOOD_TRUTH==='unknown'))v.FLOOD_TRUTH='partial';
  if(id==='C4_DROWNED_ECHO_VISION')v.GHOST_CLUE='vision';
  if(id==='H1_FLOOD_TIMELINE')v.FLOOD_TRUTH='evidence';
  if(id==='D3_KAEW_CONTACT' && s.trust>=2)v.KAEW_TRUST='high';
  if(id==='E4_BRACELET_DECODE')v.RITUAL_PLAN='prepared';
  if(id==='F5_KAEW_RECONCILE' && v.humanCaseSupported===true && v.disclosurePlan===true && hasFact(s,'gate-truth')) {v.KAEW_FINAL='calm';s.ghost='pacified';}
 }
 if(outcome==='partial') {
  if(id==='C4_DROWNED_ECHO_VISION' && v.GHOST_CLUE==='none')v.GHOST_CLUE='trace';
  if(id==='E4_BRACELET_DECODE' && v.RITUAL_PLAN==='unknown')v.RITUAL_PLAN='basic';
  if(id==='H1_FLOOD_TIMELINE' && v.FLOOD_TRUTH==='unknown')v.FLOOD_TRUTH='partial';
 }
}

export function storySummary51(s:CaseState) {
 const v=s.v51!,phase=s.guided!.phase;
 const safe=safeHostages51(s).length;
 const dead=hostageNames.filter(name=>!alive51(s,name));
 const summary=[v.HOSTAGES_FOUND===0?'ยังไม่พบผู้สูญหาย':'พบผู้สูญหาย '+v.HOSTAGES_FOUND+'/3 คน · พาไปจุดปลอดภัยแล้ว '+safe+' คน'];
 if(dead.length)summary.push('ผู้เสียชีวิต: '+dead.join(', '));
 if(s.key || v.RITUAL_STATUS==='stopped') {
  const ritual={active:'ยังทำงาน',weakened:'อ่อนลงแต่ยังทำงาน',stopped:'หยุดแล้ว',entrenched:'ฝังแน่นและยังทำงาน'};
  summary.push('พิธี'+ritual[v.RITUAL_STATUS]);
 }
 if(v.WICHAI_STATUS!=='free') {
  const status={captured:'ถูกควบคุมตัว',escaped:'หนีไปแล้ว',dead:'เสียชีวิต'};
  summary.push('วิชัย'+status[v.WICHAI_STATUS]);
 }
 if(['E','FINAL'].includes(phase)) {
  if(v.pastDisclosed)summary.push('ทีมเปิดเผยหลักฐานปี 2534 แล้ว');
  else if(v.FLOOD_EVIDENCE_COLLECTED)summary.push('ทีมเก็บเอกสารปี 2534 แล้ว ยังไม่ได้เปิดเผย');
  if(v.KAEW_FINAL==='calm')summary.push('แม่แก้วยอมยุติภัยแล้ว');
 }
 if(['5.3','5.5'].includes(s.guided?.version ?? ''))for(const entry of v.adjudications.filter(entry=>entry.label).slice(-3))
  summary.push('บันทึกแล้ว · '+entry.label+(entry.effect?' — '+entry.effect:''));
 return summary;
}

export const lethalAnnouncement51=(s:CaseState)=>noTimer(s)
 ?'คดีนี้มีเหตุที่อาจถึงตาย เมื่อมีภัยตรงหน้า ทีมจะได้จังหวะรับมือก่อนรู้ผล'
 :'คดีนี้มีเหตุที่อาจถึงตาย หากถึงตีสามและพิธียังทำงานเต็มกำลัง คนที่ถูกผูกชื่ออาจเสียชีวิต เมื่อมีภัยตรงหน้า ทีมจะได้จังหวะรับมือก่อนรู้ผล';

export function hostageReachable52(s:CaseState,name:Hostage) {
 return s.site==='E' && s.opened && alive51(s,name) && !safeHostages51(s).includes(name) && !s.escorts.includes(name);
}

export function historySources52(s:CaseState) {
 if(['5.3','5.5'].includes(s.guided?.version ?? ''))return !!(s.v51?.floodSources53?.gate && s.v51.floodSources53.shelter);
 return !!s.v51?.FLOOD_EVIDENCE_COLLECTED && hasFact(s,'gate-testimony');
}

export function startBacklash52(s:CaseState,actor:'player'|'wichai') {
 const v=s.v51!;
 if(s.site!=='E' || !s.key || v.backlash || v.RITUAL_STATUS==='stopped')throw Error('ยังไม่มีเหตุเสี่ยงที่แกนพิธี');
 v.backlash={actor,announced:false};
}

export function dmOptions51(s:CaseState) {
 const v=s.v51!,g=s.guided!,out:{id:string;label:string;detail?:string;when?:string;effect?:string}[]=[];
 const add=(id:string,label:string,detail?:string)=>out.push({id,label,detail});
 if(g.version==='5.5' && s.site==='E' && ['E1','E2'].includes(g.scene) && g.presented.includes(g.scene) && !s.opened) {
  if(!v.doorAccess55)add('door-access55','ยืนยันทีมเคลียร์กระสอบและเข้าถึงบานประตูได้แล้ว');
  if(v.doorAccess55 && !v.doorOpened55)add('door-tools55','ยืนยันทีมปลดกลอนด้วยเครื่องมือจริงสำเร็จแล้ว');
  if(v.doorOpened55)add('enter-room55','ยืนยันทีมเปิดบานประตูและเข้าไปเห็นผู้สูญหายจริงแล้ว');
 }
 if(g.version==='5.5' && ['E2','E3'].includes(g.scene) && s.opened && alive51(s,'ดล') && !v.dolUngagged55)
  add('ungag-dol','ยืนยันทีมแก้ผ้าปากและดลมีสติพอให้คำตอบแล้ว');

 if(g.phase==='A' && !v.lethal) add('enable-lethal','เปิดเหตุเสี่ยงถึงตายสำหรับคดีนี้',lethalAnnouncement51(s));
 if(g.scene==='D4' && v.KAEW_TRUST!=='low')add('unnecessary-attack','ยืนยันทีมโจมตีแม่แก้วโดยไม่จำเป็นจริงแล้ว');
 if(g.presented.includes(g.scene)) for(const line of dialogue51(s,true)) if(!v.contextConfirmed.includes(line.id) && !automaticLine51(line)) add('context:'+line.id,line.speaker+' · '+(readerLabel(line.label).replace(/^บทหลัก$/,'บทพูดตามสถานการณ์') || 'บทพูดตามสถานการณ์'),line.text);
 if(g.scene==='E4' && g.presented.includes('E4') && (!noTimer(s) || v.bagSearched)) {
  if(!v.LAND_EVIDENCE_COLLECTED)add('collect-land','ทีมเก็บเอกสารหนี้และซื้อขายแล้ว');
  if(!v.FLOOD_EVIDENCE_COLLECTED)add('collect-flood','ทีมเก็บบันทึกเปิดประตูน้ำแล้ว');
 }
 if(noTimer(s)) {
  if(['5.3','5.5'].includes(g.version ?? '') && s.wichai && v.WICHAI_STATUS==='free' && ['B','C','D','E'].includes(s.site) && g.presented.includes(g.scene)) {
   if(!v.wichaiArrival53) {
    add('wichai-route:called','ยืนยันทีมติดต่อหรือนัดวิชัยจริงแล้ว');
    add('wichai-route:followed','ยืนยันทีมเห็นร่องรอยว่าวิชัยตามมาจริง');
   } else if(!v.wichaiArrival53.arrived && s.site==='E') {
    add('wichai-arrived','ยืนยันวิชัยเดินทางมาถึงเรือนจริงแล้ว');
   }
  }
  if(g.version==='5.3' && s.site==='E' && s.key && v.coreApproached && v.coreWarningDelivered &&
    !v.backlash && v.RITUAL_STATUS!=='stopped' && ['E4','F1','F3'].includes(g.scene) && g.presented.includes(g.scene)) {
   add('ritual-release','ยืนยันว่าทีมปลดกำไลอย่างควบคุมและพิธีหยุดแล้วตามกติกาเดิม');
  }
  if(['5.3','5.5'].includes(g.version ?? '') && g.presented.includes(g.scene)) {
   const sources=v.floodSources53;
   if(g.scene==='B4' && !sources?.archive)add('read-gate:B4','ยืนยันว่าทีมเปิดแฟ้มเก่าและอ่านบันทึกเวรประตูน้ำจริง');
   if(g.scene==='E4' && v.bagSearched && !sources?.gate)add('read-gate:E4','ยืนยันว่าทีมอ่านบันทึกเวรประตูน้ำจากกระเป๋าแล้ว');
   if(g.scene==='C5' && !sources?.shelter)add('read-shelter','ยืนยันว่าทีมตรวจสมุดยายที่จดผู้มาถึงศูนย์อพยพแล้ว');
   if(g.scene==='H1' && historySources52(s) && !sources?.peopleProven)
    add('flood-people-proven','ยืนยันว่าทีมตรวจพยานตรงหรือบันทึกตำแหน่งที่พิสูจน์ว่ามีคนอยู่ในสวนขณะเปิดประตู');
   if(g.scene==='E4' && !v.ritualBook53 && s.key)add('read-ritual-book','ยืนยันว่าทีมเปิดอ่านตำราข้างกำไลแล้ว');
   if(['E4','F1','F2'].includes(g.scene) && s.key && v.coreApproached &&
      ['active','weakened'].includes(v.RITUAL_STATUS) && v.KAEW_D_RESULT==='won' && v.KAEW_TEMP_DISPERSED && !v.kaewVoice53)
    add('bracelet-reacted','ยืนยันว่าทีมลงมือกับกำไลจริงและแม่แก้วกลับมาสื่อสารผ่านเสียงหรือเงา');
   if(g.phase==='FINAL' && !v.memory53 && ['F1','F2','F3'].includes(g.scene)) {
    add('flood-memory:investigate_memory','ยืนยันว่าทีมตรวจความทรงจำของวิญญาณจริง');
    if(v.coreApproached)add('flood-memory:ritual_memory_reaction','ยืนยันว่าภาพความทรงจำตอบสนองต่อการลงมือกับพิธีจริง');
   }
  }
  if(['5.3','5.5'].includes(g.version ?? '') && s.site==='E' && s.opened && g.presented.includes(g.scene)) {
   for(const name of hostageNames.filter(name=>alive51(s,name) && !s.evacuated.includes(name))) {
    if(v.protectedHostages53?.includes(name))add('lose-protection:'+name,'ยืนยันภัยเข้าถึง '+name+' ได้อีกครั้ง');
    else if(['E2','E6'].includes(g.scene) && !s.escorts.includes(name) &&
      !(v.pending?.kind==='crossfire' && v.pending.target===name))
     add('protect-hostage:'+name,'ยืนยัน '+name+' อยู่จุดคุ้มกันในเรือนที่ภัยเข้าถึงไม่ได้จริง');
   }
  }
  if(s.wichai && v.WICHAI_STATUS==='free' && s.wichai.site===s.site && ['B','D'].includes(s.site) && g.presented.includes(s.site+'1')) {
   const destination=s.site==='B'?'D':'E';
   if(!['5.3','5.5'].includes(g.version ?? '') || destination!=='E')add('wichai-depart:'+destination,'วิชัยเดินทางไป'+(destination==='D'?'สวนกล้วย':'เรือนไม้')+'แล้ว');
  }
  if(g.scene==='E4' && g.presented.includes('E4') && v.FLOOD_EVIDENCE_COLLECTED && !hasFact(s,'gate-testimony') && !v.boonmeeCallPending) {
   add('contact-boonmee','โทรหายายบุญมีเมื่อมีเบอร์ติดต่อจริงและให้ยายเล่าเรื่องการอพยพ');
  }
  if(g.scene==='H1' && g.presented.includes('H1') && historySources52(s) && !hasFact(s,'gate-truth'))add('history-supported','ยืนยันทีมเทียบหลักฐานที่มีและพิสูจน์ลำดับเปิดประตูได้จริง');
  if(['E','FINAL'].includes(g.phase) && s.site==='E' && s.key && wichaiHere51(s) && v.RITUAL_STATUS!=='stopped' && !v.backlash) {
   if(!v.coreApproached)add('wichai-approach','ยืนยันวิชัยเข้าถึงแกนจริง เปิดคำเตือนให้ทีมก่อน');
   if(v.coreWarningDelivered)add('wichai-risk','วิชัยอยู่ถึงแกนและกระชากจริง ให้ทีมรับมือ');
  }
  if(g.scene==='F6' && v.backlash?.announced && v.RITUAL_STATUS!=='stopped') {
   add('backlash-prevented','ยืนยันทีมยุติการกระชากหรือป้องกันแรงสะท้อนสำเร็จ');
   add('backlash-resolved','ยืนยันเปิดโอกาสให้ตอบโต้แล้ว และเกิดแรงสะท้อนจริง');
  }
 }
 if(['E','FINAL'].includes(g.phase)) {
  if(v.humanCaseSupported!==true)add('evidence-supported','DM ยืนยันมีหลักฐานเอาผิดวิชัยเพียงพอจากเอกสาร/พยานจริง');
  if(v.humanCaseSupported!==false)add('evidence-insufficient','DM ยืนยันหลักฐานเอาผิดวิชัยยังไม่พอ');
  if(v.disclosurePlan!==true)add('plan-credible','DM ยืนยันทีมมีแผนเปิดเผย/รับผิดที่ทำได้จริง');
  if(v.disclosurePlan!==false)add('plan-insufficient','DM ยืนยันยังไม่มีแผนเปิดเผย/รับผิดที่น่าเชื่อถือ');
  if(hasFact(s,'gate-truth') && !v.pastDisclosed && (!['5.3','5.5'].includes(g.version ?? '') ||
   g.scene==='F5' && v.RITUAL_STATUS==='stopped' && v.disclosure53?.evidence.every(id=>s.evidence.includes(id)))) {
   const plan=v.disclosure53;
   add('disclosed','ยืนยันส่ง/เปิดเผยหลักฐานปี 2534 จริงแล้ว พร้อมบันทึกการกระทำ',
    plan ? plan.evidence.join(', ')+' · ผู้รับ '+plan.recipient : undefined);
  }
 }
 if(v.RITUAL_STATUS==='stopped' && (!v.KAEW_TEMP_DISPERSED || kaewVoice53(s)) && v.humanCaseSupported===true && v.disclosurePlan===true && hasFact(s,'gate-truth') && v.KAEW_FINAL!=='calm')add('voluntary-calm','ยืนยันแม่แก้วเลือกยุติภัยเองจากการกระทำจริงแล้ว ไม่ต้องทอย');
 if(g.scene==='F5' && v.RITUAL_STATUS==='stopped' && !v.KAEW_TEMP_DISPERSED && v.KAEW_FINAL!=='hostile')add('kaew-hostile','ยืนยันแม่แก้วเลือกใช้ความรุนแรงและยังเป็นภัยจริงหลังเป็นอิสระ');
 if(noTimer(s) && v.lethal && g.scene==='E5' && g.presented.includes('E5') && wichaiHere51(s) && !v.e5Threat) {
  add('e5-threat','ยืนยันทีมโจมตีทันทีและวิชัยพยายามคว้าคนในระยะจริง');
 }
 if(noTimer(s) && v.lethal && g.scene==='F5' && g.presented.includes('F5') && !v.KAEW_TEMP_DISPERSED && v.KAEW_FINAL!=='calm' && wichaiHere51(s,true) && !v.f5Question) {
  add('f5-question','ให้แม่แก้วถามทีมว่าจะเปิดหลักฐานและให้ใครรับผิด');
 }
 if(v.lethal && !v.pending && g.scene==='E5' && wichaiHere51(s) && g.presented.includes('E5')) {
  for(const n of hostageNames)if((noTimer(s)?hostageReachable52(s,n) && (v.e5Threat || (s.storyChecks?.E5_WICHAI_NEGOTIATE?.at(-1)?.total ?? Infinity)<=10):s.opened && alive51(s,n) && !s.evacuated.includes(n)))add('shield:'+n,'วิชัยใช้มีดและคว้า'+n+'ไว้ได้หลังทีมมีโอกาสขัดขวาง');
 }
 if(!v.pending && g.scene==='E5' && wichaiHere51(s))add('wichai-escaped','ยืนยันวิชัยหนีสำเร็จตามเส้นทางและโอกาสไล่ตามจริงแล้ว');
 if(v.lethal && !v.pending && g.scene==='F5' && v.RITUAL_STATUS==='stopped' && !v.KAEW_TEMP_DISPERSED && v.KAEW_FINAL!=='calm' && wichaiHere51(s,true) && (v.humanCaseSupported===false || v.disclosurePlan===false) && (!noTimer(s) || v.f5Question==='delivered'))add('attempt','แม่แก้วเข้าถึงวิชัยแล้ว ให้ทีมรับมือก่อนเธอลงมือ');
 if(v.pending) {
  if(v.pending.announced) {
   add('prevented','ยืนยันทีมขัดขวาง/ช่วยออกสำเร็จตามกติกาจริง ยุติเหตุคุกคาม');
   add('fatal','ยืนยันเปิดจังหวะรับมือแล้ว ทีมยังโจมตีเสี่ยงหรือป้องกันไม่ทัน และผู้โจมตีลงมือถึงตายจริง');
  }
 }
 for(const n of hostageNames.filter(n=>!alive51(s,n)))for(const witness of hostageNames.filter(w=>w!==n && alive51(s,w))) {
  if(!v.deathKnown[witness]?.includes(n)) {
   add('witness:'+witness+':'+n,'ยืนยัน '+witness+' อยู่ตรงหน้าและเห็น '+n+' เสียชีวิตจริง');
   add('informed:'+witness+':'+n,'ยืนยันทีมแจ้งข่าวการเสียชีวิตของ '+n+' ให้ '+witness+' ทราบจริงแล้ว');
  }
 }
 const filtered=g.version==='5.5'?out.filter(option=>
  !['e5-threat','ritual-release','fatal'].includes(option.id) &&
  !option.id.startsWith('shield:') && !option.id.startsWith('context:') &&
  !(option.id==='contact-boonmee') &&
  !(option.id==='flood-memory:ritual_memory_reaction') &&
  !(option.id==='flood-memory:investigate_memory') &&
  !(option.id==='bracelet-reacted')
 ):out;
 return filtered.map(option=>({...option,...(['5.3','5.5'].includes(g.version ?? '')?actionHelp[option.id.split(':')[0]]:undefined)}));
}
export function command51(w:World,command:string) {
 const s=w.case001!,v=s.v51!;
 const option=dmOptions51(s).find(o=>o.id===command);
 if(!option)throw Error('เหตุการณ์ไม่ตรงเงื่อนไขจริง');
 const [kind,...parts]=command.split(':');
 if(kind==='ungag-dol')v.dolUngagged55=true;
 if(kind==='door-access55')v.doorAccess55=true;
 if(kind==='door-tools55')v.doorOpened55=true;
 if(kind==='enter-room55') {
  s.opened=true;v.HOSTAGES_FOUND=hostageNames.filter(name=>alive51(s,name)).length;
  emitCaseBeat(s,'enter-room55',storyContent(s).scenes.E2.cue,'party');
 }
 if(kind==='context')v.contextConfirmed.push(parts.join(':'));
 if(kind==='enable-lethal') {v.lethal=true;emitCaseBeat(s,'v51:lethal',lethalAnnouncement51(s),'party');}
 if(kind==='wichai-depart'){s.wichai!.site=parts[0] as 'D'|'E';s.wichai!.status='idle';}
 if(kind==='wichai-route')v.wichaiArrival53={reason:parts[0]==='called'?'called':'followed',arrived:false};
 if(kind==='wichai-arrived') {
  v.wichaiArrival53!.arrived=true;
  s.wichai!.site='E';s.wichai!.status='idle';
 }
 if(kind==='ritual-release') {
  stopRitual51(s);
  emitCaseBeat(s,'ritual-release','กำไลหยุดสั่นและด้ายที่ยังผูกอยู่คลายลง','party');
 }
 if(kind==='read-gate') {
  const sources=v.floodSources53 ??= {};
  sources.gate=true;
  if(parts[0]==='B4')sources.archive=true;
  v.FLOOD_EVIDENCE_COLLECTED=true;
  if(!s.evidence.includes('E07'))s.evidence.push('E07');
 }
 if(kind==='read-shelter')(v.floodSources53 ??= {}).shelter=true;
 if(kind==='flood-people-proven')(v.floodSources53 ??= {}).peopleProven=true;
 if(kind==='read-ritual-book')v.ritualBook53=true;
 if(kind==='bracelet-reacted') {
  v.kaewVoice53=true;
  emitCaseBeat(s,'bracelet-reacted','เสียงแม่แก้วดังแผ่วจากกำไล','party');
 }
 if(kind==='flood-memory')v.memory53=parts[0]==='investigate_memory'?'investigate_memory':'ritual_memory_reaction';
 if(kind==='protect-hostage')(v.protectedHostages53 ??= []).push(parts[0] as Hostage);
 if(kind==='lose-protection')v.protectedHostages53=v.protectedHostages53?.filter(name=>name!==parts[0]);
 if(kind==='history-supported') {
  addFact(s,'gate-truth');addFact(s,'v41-flood-evidence');v.FLOOD_TRUTH='evidence';
  if(['5.3','5.5'].includes(s.guided?.version ?? ''))(v.floodSources53 ??= {}).compared=true;
  emitCaseBeat(s,'guided-history',['5.3','5.5'].includes(s.guided?.version ?? '')?'บันทึกสองฉบับชี้ว่าประตูผันน้ำเปิดก่อนมีการยืนยันว่าคนจากสวนถึงศูนย์อพยพครบ':'หลักฐานยืนยันว่ามีการเปิดประตูผันน้ำก่อนพื้นที่สวนอพยพครบ','party');
 }
 if(kind==='contact-boonmee') {
  v.boonmeeCallPending=true;
  const line=storyContent(s).scenes.H1.dialogue.find(line=>line.speaker==='ยายบุญมี' && line.text.includes('ไม่เห็นคนเปิดประตู'))!;
  emitCaseBeat(s,'v52:boonmee-call','ยายบุญมี (ทางโทรศัพท์) · '+line.text,'party');
  if(!w.dmSession)delivered51(s,'v52:boonmee-call');
 }
 if(kind==='wichai-approach') {
  v.coreApproached=true;
  emitCaseBeat(s,'approach-ritual-core',storyContent(s).scenes.F1.cue,'party');
  if(!w.dmSession)delivered51(s,'approach-ritual-core');
 }
 if(kind==='wichai-risk')startBacklash52(s,'wichai');
 if(kind==='backlash-prevented' || kind==='backlash-resolved') {
  if(kind==='backlash-resolved' && ['5.3','5.5'].includes(s.guided?.version ?? ''))v.backlashOccurred53=true;
  if(kind==='backlash-resolved')emitCaseBeat(s,'v52:backlash','ปมด้ายเหวี่ยงกลับจนเทียนบนโต๊ะดับไปเล่มหนึ่ง เศษโคลนเปียกพุ่งออกจากร่องไม้','local');
  delete v.backlash;
 }
 if(kind==='collect-land')v.LAND_EVIDENCE_COLLECTED=true;
 if(kind==='collect-flood'){v.FLOOD_EVIDENCE_COLLECTED=true;if(!s.evidence.includes('E07'))s.evidence.push('E07');}
 if(kind==='evidence-supported') {
  if(!v.LAND_EVIDENCE_COLLECTED && !hasFact(s,'current-testimony'))throw Error('ต้องมีหลักฐานหรือคำให้การที่ได้รับจริง');
  v.humanCaseSupported=true;
 }
 if(kind==='evidence-insufficient')v.humanCaseSupported=false;
 if(kind==='plan-credible')v.disclosurePlan=true;
 if(kind==='plan-insufficient')v.disclosurePlan=false;
 if(kind==='disclosed') {v.pastDisclosed=true;addFact(s,'truth-recorded');}
 if(kind==='voluntary-calm'){v.KAEW_FINAL='calm';s.ghost='pacified';}
 if(kind==='kaew-hostile'){v.KAEW_FINAL='hostile';s.ghost='hostile';}
 if(kind==='unnecessary-attack')v.KAEW_TRUST='low';
 if(kind==='wichai-escaped')v.WICHAI_STATUS='escaped';
 if(kind==='e5-threat')v.e5Threat=true;
 if(kind==='f5-question') {
  v.f5Question='pending';
  emitCaseBeat(s,'v52:f5-question','แม่แก้ว · ใครจะยืนบอกความจริง? จะเอาหลักฐานอะไรไปให้คนเป็นดู?','party');
  if(!w.dmSession)delivered51(s,'v52:f5-question');
 }
 if(kind==='shield') {
  v.pending={kind:'crossfire',target:parts[0] as Hostage,announced:!w.dmSession};
  emitCaseBeat(s,'v51:crossfire-window','ปลายมีดที่คอและตัวประกันขัดขืน · '+parts[0]+'\nวิชัย · อย่าบีบผม! อีกก้าวเดียวผมกรีดคอมันจริง ๆ ด้วย!','party');
 }
 if(kind==='attempt') {
  v.pending={kind:'execution',announced:!w.dmSession};
  const row=storyContent(s).scenes.F5.responses.split('\n').find(line=>line.startsWith('3. '))!;
  const quotes=[...row.matchAll(/“([^”]+)”/g)].map(match=>match[1]);
  emitCaseBeat(s,'v51:execution-window',[quotes[0],quotes[1] && 'วิชัย · '+quotes[1]].filter(Boolean).join('\n'),'party');
 }
 if(kind==='prevented')delete v.pending;
 if(kind==='fatal') {
  if(v.pending?.kind==='crossfire') {
   if(!wichaiHere51(s) || !alive51(s,v.pending.target) || s.evacuated.includes(v.pending.target) || noTimer(s) && !hostageReachable52(s,v.pending.target))throw Error('วิชัยเข้าถึงตัวประกันไม่ได้แล้ว');
   const target=v.pending.target;killHostage51(s,target,'crossfire_wichai');
   emitCaseBeat(s,'v51:crossfire-death',target+' เสียชีวิตจากการลงมีดของวิชัย','local');
  } else if(v.pending?.kind==='execution') {
   if(!wichaiHere51(s,true) || v.RITUAL_STATUS!=='stopped' || v.KAEW_TEMP_DISPERSED)throw Error('แม่แก้วเข้าถึงวิชัยไม่ได้แล้ว');
   v.WICHAI_STATUS='dead';v.WICHAI_DEATH_CAUSE='kaew_execution';v.KAEW_FINAL='hostile';
   s.ghost='hostile';
   emitCaseBeat(s,'v51:execution-death','แม่แก้วบีบคอวิชัยจนหมดแรง','local');
  }
  delete v.pending;
 }
 if(kind==='witness'||kind==='informed') {
  const [witness,target]=parts;
  (v.deathKnown[witness]??=[]).push(target as Hostage);
  if(kind==='witness')v.contextConfirmed.push('witness:'+witness+':'+target);
 }
 v.adjudications.push({event:command,...(['5.3','5.5'].includes(s.guided?.version ?? '')?{label:option.label,effect:option.effect}:{}),...(noTimer(s)?{}:{minute:s.minute})});
}
export function delivered51(s:CaseState,eventId:string) {
 if(noTimer(s) && s.v51) {
  if(eventId==='v52:f5-question')s.v51.f5Question='delivered';
  if(eventId==='v52:boonmee-call'){addFact(s,'gate-testimony');delete s.v51.boonmeeCallPending;}
  if(eventId==='approach-ritual-core' || eventId==='guided-cue:F1')s.v51.coreWarningDelivered=true;
  if(eventId==='guided-cue:F6' && s.v51.backlash)s.v51.backlash.announced=true;
 }
 if(s.v51?.pending && ['v51:crossfire-window','v51:execution-window'].includes(eventId))s.v51.pending.announced=true;
}
export function validateSave51(s:CaseState) {
 const v=s.v51;
 if(!v)return;
 const eventDriven=noTimer(s),defaults=newState51(false,eventDriven);
 if((s.guided?.version!=='5.1' && !eventDriven) || Object.keys(defaults).some(key=>!(key in v)) ||
  !['not_met','talked','won','fled','lost'].includes(v.KAEW_D_RESULT) ||
  !['active','weakened','stopped','entrenched'].includes(v.RITUAL_STATUS) ||
  !['free','captured','escaped','dead'].includes(v.WICHAI_STATUS) ||
  (v.WICHAI_DEATH_CAUSE==='kaew_execution')!==(v.WICHAI_STATUS==='dead') ||
  (eventDriven ? v.RITUAL_STATUS==='entrenched' || Object.keys(v).some(key=>key.startsWith('RITUAL_0300_')) ||
   s.minute!==0 || hostageNames.some(n=>v.DEATH_CAUSE[n]==='ritual_toll' || v.RITUAL_STATUS==='stopped' && v.RITUAL_TETHER_INTACT[n]) ||
   ['bagSearched','coreApproached','coreWarningDelivered'].some(key=>typeof v[key as keyof State51]!=='boolean') ||
   !!v.backlash && (v.RITUAL_STATUS==='stopped' || !['player','wichai'].includes(v.backlash.actor) || typeof v.backlash.announced!=='boolean')
   : v.RITUAL_0300_FULL_POWER!==(v.RITUAL_0300_PRESTATE==='active')) ||
  new Set(s.evacuated).size!==s.evacuated.length || new Set(s.escorts).size!==s.escorts.length ||
  s.seals[2] !== (v.RITUAL_STATUS==='stopped') || !Number.isFinite(s.minute) || s.minute<0 ||
  s.minute>=240 && v.RITUAL_0300_PRESTATE===null ||
  hostageNames.some(n=>!['alive','dead'].includes(v.HOSTAGE_FATE[n]) || typeof v.RITUAL_TETHER_INTACT[n]!=='boolean' ||
   v.HOSTAGE_FATE[n]==='dead' && (!v.DEATH_CAUSE[n] || s.evacuated.includes(n) || s.escorts.includes(n)) ||
   v.HOSTAGE_FATE[n]==='alive' && v.DEATH_CAUSE[n]!==null))throw Error('State v'+(eventDriven?'5.2':'5.1')+' ในเซฟไม่ครบหรือขัดกัน ต้องตรวจเซฟก่อนโหลด');
}
