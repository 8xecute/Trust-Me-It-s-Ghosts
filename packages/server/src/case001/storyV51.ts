import type { CaseState } from './case001.js';
import type { World } from '../world.js';
import { emitCaseBeat } from './case001.js';
import { addFact, hasFact } from './caseStory.js';
import { endings51, scenes51, type V51Line } from './v51Content.js';

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
 RITUAL_0300_PRESTATE:Ritual|null;RITUAL_0300_FULL_POWER:boolean;
 KAEW_FINAL:null|'calm'|'hostile'|'sealed'|'departed'|'controlled';ENDING_MODIFIER:string|null;
 LAND_EVIDENCE_COLLECTED:boolean;FLOOD_EVIDENCE_COLLECTED:boolean;PLAYER_DEATHS:number;
 // These are DM observations of real actions, not new evidence sufficiency rules.
 humanCaseSupported:boolean|null;pastDisclosed:boolean;disclosurePlan:boolean|null;
 contextConfirmed:string[];deathKnown:Record<string,Hostage[]>;
 pending?:{kind:'crossfire';target:Hostage;announced:boolean}|{kind:'execution';announced:boolean};
 adjudications:{event:string;minute:number}[];
};
export function newState51(lethal=false):State51 {
 return {lethal,CASE_ACCEPTED:false,KNOWN_MISSING_NAMES:false,LOCATION_B_KNOWN:false,LOCATION_C_KNOWN:false,LOCATION_D_KNOWN:false,LOCATION_E_KNOWN:false,
 TON_TRUST:'low',SUSPECT_WICHAI:'unknown',FLOOD_TRUTH:'unknown',KNOWS_WICHAI_SAVED:false,GHOST_ENCOUNTER:'not_started',GHOST_CLUE:'none',
 KAEW_TRUST:'neutral',KAEW_D_RESULT:'not_met',KAEW_TEMP_DISPERSED:false,HOSTAGES_FOUND:0,
 HOSTAGE_FATE:{ดล:'alive',นิด:'alive',เพิ่ม:'alive'},DEATH_CAUSE:{ดล:null,นิด:null,เพิ่ม:null},
 WICHAI_STATUS:'free',WICHAI_DEATH_CAUSE:null,RITUAL_STATUS:'active',RITUAL_PLAN:'unknown',RITUAL_TETHER_INTACT:{ดล:true,นิด:true,เพิ่ม:true},
 RITUAL_0300_PRESTATE:null,RITUAL_0300_FULL_POWER:false,KAEW_FINAL:null,ENDING_MODIFIER:null,
 LAND_EVIDENCE_COLLECTED:false,FLOOD_EVIDENCE_COLLECTED:false,PLAYER_DEATHS:0,humanCaseSupported:null,pastDisclosed:false,disclosurePlan:null,
 contextConfirmed:[],deathKnown:{},adjudications:[]};
}
export const alive51=(s:CaseState,name:string)=>!s.v51 || s.v51.HOSTAGE_FATE[name as Hostage]!=='dead';
export function contract51(s:CaseState) {
 const v=s.v51!;
 return {...v,PHASE:s.guided!.phase,TIME_MINUTES:s.minute,HOSTAGES_SAFE:s.evacuated.filter(n=>alive51(s,n)).length,
 HOSTAGES_DEAD:hostageNames.filter(n=>!alive51(s,n)).length,WICHAI_COOPERATING:hasFact(s,'v41-wichai-cooperating'),BRIBE_ACCEPTED:hasFact(s,'bribe-accepted'),
 CHECK_RESULTS:Object.fromEntries(Object.entries(s.storyChecks ?? {}).filter(([,rolls])=>rolls.length).map(([id,rolls])=>[id,rolls.at(-1)!.outcome]))};
}
export function wichaiHere51(s:CaseState,includeCaptured=false) {
 return s.wichai?.site===s.site && (s.v51?.WICHAI_STATUS==='free' || includeCaptured && s.v51?.WICHAI_STATUS==='captured');
}
export function killHostage51(s:CaseState,name:Hostage,cause:NonNullable<State51['DEATH_CAUSE'][Hostage]>) {
 const v=s.v51!;
 if(v.HOSTAGE_FATE[name]==='dead') return false;
 v.HOSTAGE_FATE[name]='dead';v.DEATH_CAUSE[name]=cause;
 s.evacuated=s.evacuated.filter(n=>n!==name);s.escorts=s.escorts.filter(n=>n!==name);
 if(v.pending?.kind==='crossfire' && v.pending.target===name) delete v.pending;
 return true;
}
export function clock51(s:CaseState,previous:number) {
 const v=s.v51;
 if(!v || previous>=240 || s.minute<240 || v.RITUAL_0300_PRESTATE!==null) return;
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
 const v=s.v51!,scene=scenes51[id];
 if(id==='F2') {
  if(v.KAEW_TEMP_DISPERSED) return 'เสียงยังอยู่';
  const key=v.KAEW_D_RESULT;
  const row=scene.dmReadAloud.split('\n').find(line=>key==='not_met'?line.includes('`not_met`'):key==='fled'||key==='lost'?line.includes('`fled`'):line.includes('`'+key+'`'));
  if(!row) throw Error('ตรวจ State D ก่อนเปิด F2');
  return row.match(/“([^”]+)”/)![1];
 }
 if(id==='F6' && v.KAEW_TEMP_DISPERSED)return scene.cue.split('แม่แก้วทรุดลง')[0].trim();
 if(id==='F5' && v.KAEW_TEMP_DISPERSED)return 'วงพิธีดับราวกับมีคนเป่าเทียน';
 if(id==='H1')return 'บันทึกฉบับหนึ่งมีเวลา «เปิดประตูผันน้ำ»\n'+(hasFact(s,'gate-testimony')?'ยายบุญมีให้ข้อมูลว่าไม่ได้เห็นคนเปิดประตูกับตา และมีคนยังออกมาไม่ครบ':'');
 if(id==='E2' && hostageNames.some(n=>!alive51(s,n))) return 'กลอนคลายออกพร้อมกลิ่นอับและเหงื่อค้าง';
 if(id==='E3' && (hostageNames.some(n=>!alive51(s,n)) || s.evacuated.length || s.escorts.length)) return 'ผู้รอดชีวิตมองจุดว่างที่อีกคนเคยนั่ง';
 if(id==='E6' && v.RITUAL_STATUS==='stopped') return 'วงพิธีดับราวกับมีคนเป่าเทียน';
 if(id==='E6' && s.evacuated.length) return scene.cue.split('ขณะที่ใต้ถุน')[0].trim();
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
 if(id==='C5') addFact(s,'met-boonmee');
 if(id==='D2') {for(const key of ['E03','E04'])if(!s.evidence.includes(key))s.evidence.push(key);if(s.ghost==='hidden')s.ghost='cautious';}
 if(id==='D5') {v.LOCATION_E_KNOWN=true;if(!s.evidence.includes('E06'))s.evidence.push('E06');}
 if(id==='E2') {s.opened=true;v.HOSTAGES_FOUND=3;}
 if(id==='E4') {s.key=true;if(!s.evidence.includes('E05'))s.evidence.push('E05');}
 if(id==='F2' && !v.KAEW_TEMP_DISPERSED) s.ghost='cautious';
 if(id==='F5' && !v.KAEW_TEMP_DISPERSED && !['pacified','freed','sealed'].includes(s.ghost)) s.ghost='cautious';
}

function hardLineAllowed(s:CaseState,line:V51Line) {
 const v=s.v51!,c=line.context,t=line.text;
 if(hostageNames.includes(line.speaker as Hostage) && (!alive51(s,line.speaker) || !s.opened && line.scene!=='E1' || s.evacuated.includes(line.speaker))) return false;
 if(line.scene==='F2' && line.context!==(v.KAEW_D_RESULT==='fled'||v.KAEW_D_RESULT==='lost'?'fled_lost':v.KAEW_D_RESULT))return false;
 if(line.speaker==='วิชัย' && !wichaiHere51(s,line.scene==='F5')) return false;
 if(line.speaker==='ต้น' && s.site!=='B') return false;
 if(line.speaker==='ยายบุญมี' && line.scene!=='C5') return false;
 if(line.speaker==='ประเสริฐ' && !['A','B'].includes(s.site)) return false;
 if(line.speaker==='แม่แก้ว' && (v.KAEW_TEMP_DISPERSED || !['cautious','hostile','pacified'].includes(s.ghost)) && line.scene!=='E6') return false;
 if(line.scene==='E6' && v.RITUAL_STATUS==='stopped') return false;
 if(line.scene==='E3' && t==='อย่าให้มันรอดไปได้' && v.WICHAI_STATUS==='captured')return false;
 if(line.scene==='E3' && t==='อย่าให้มันปฏิเสธได้' && v.WICHAI_STATUS!=='captured')return false;
 if(line.scene==='B3' && /ส่วนตัว|รถเข็นหนัก/.test(line.label) && v.TON_TRUST!=='high') return false;
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
 return (scenes51[g.scene]?.dialogue ?? []).filter(line=>hardLineAllowed(s,line) &&
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
 s.notice=line.speaker+' · '+line.text.replaceAll('**','');
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
 if(v.KAEW_FINAL==='hostile') return 'B';
 if(v.KAEW_FINAL==='calm' && v.pastDisclosed && v.WICHAI_STATUS!=='dead') return 'A';
 return 'C';
}
export function endingText51(s:CaseState,ending:string) {
 const v=s.v51!,c=contract51(s),paragraphs=endings51[ending].paragraphs;
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
  if(['B4_FLOOD_PHOTO','C5_EVACUATION_RECORDS'].includes(id)) v.FLOOD_TRUTH='partial';
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

export function dmOptions51(s:CaseState) {
 const v=s.v51!,g=s.guided!,out:{id:string;label:string}[]=[];
 const add=(id:string,label:string)=>out.push({id,label});
 if(g.phase==='A' && !v.lethal) add('enable-lethal','ประกาศใช้ Lethal Variant v5.1: 03:00 อาจทำให้เพิ่มเสียชีวิต; HP0 ยังใช้ Core เดิม');
 if(g.scene==='D4' && v.KAEW_TRUST!=='low')add('unnecessary-attack','ยืนยันทีมโจมตีแม่แก้วโดยไม่จำเป็นจริงแล้ว');
 if(g.presented.includes(g.scene)) for(const line of dialogue51(s,true)) if(!v.contextConfirmed.includes(line.id) && !automaticLine51(line)) add('context:'+line.id,'ยืนยันเงื่อนไขบทเกิดจริง: '+line.speaker+' · '+line.context);
 if(g.scene==='E4' && g.presented.includes('E4')) {
  if(!v.LAND_EVIDENCE_COLLECTED)add('collect-land','ยืนยันทีมเก็บเอกสารหนี้/ซื้อขายใน E4 จริงแล้ว');
  if(!v.FLOOD_EVIDENCE_COLLECTED)add('collect-flood','ยืนยันทีมเก็บเอกสารเปิดประตูน้ำใน E4 จริงแล้ว');
 }
 if(['E','FINAL'].includes(g.phase)) {
  if(v.humanCaseSupported!==true)add('evidence-supported','DM ยืนยันมีหลักฐานเอาผิดวิชัยเพียงพอจากเอกสาร/พยานจริง');
  if(v.humanCaseSupported!==false)add('evidence-insufficient','DM ยืนยันหลักฐานเอาผิดวิชัยยังไม่พอ');
  if(v.disclosurePlan!==true)add('plan-credible','DM ยืนยันทีมมีแผนเปิดเผย/รับผิดที่ทำได้จริง');
  if(v.disclosurePlan!==false)add('plan-insufficient','DM ยืนยันยังไม่มีแผนเปิดเผย/รับผิดที่น่าเชื่อถือ');
  if(hasFact(s,'gate-truth') && !v.pastDisclosed)add('disclosed','ยืนยันส่ง/เปิดเผยหลักฐานปี 2534 จริงแล้ว พร้อมบันทึกการกระทำ');
 }
 if(v.RITUAL_STATUS==='stopped' && !v.KAEW_TEMP_DISPERSED && v.humanCaseSupported===true && v.disclosurePlan===true && hasFact(s,'gate-truth') && v.KAEW_FINAL!=='calm')add('voluntary-calm','ยืนยันแม่แก้วเลือกยุติภัยเองจากการกระทำจริงแล้ว ไม่ต้องทอย');
 if(g.scene==='F5' && v.RITUAL_STATUS==='stopped' && !v.KAEW_TEMP_DISPERSED && v.KAEW_FINAL!=='hostile')add('kaew-hostile','ยืนยันแม่แก้วเลือกใช้ความรุนแรงและยังเป็นภัยจริงหลังเป็นอิสระ');
 if(v.lethal && !v.pending && g.scene==='E5' && wichaiHere51(s) && g.presented.includes('E5')) {
  for(const n of hostageNames)if(s.opened && alive51(s,n) && !s.evacuated.includes(n))add('shield:'+n,'ยืนยันหลัง Telegraph และตัดสินตาม Combat แล้ว วิชัยมีมีดและคว้า '+n+' ในระยะจริงได้ เปิดจังหวะรับมือ');
 }
 if(!v.pending && g.scene==='E5' && wichaiHere51(s))add('wichai-escaped','ยืนยันวิชัยหนีสำเร็จตามเส้นทางและโอกาสไล่ตามจริงแล้ว');
 if(v.lethal && !v.pending && g.scene==='F5' && v.RITUAL_STATUS==='stopped' && !v.KAEW_TEMP_DISPERSED && v.KAEW_FINAL!=='calm' && wichaiHere51(s,true) && (v.humanCaseSupported===false || v.disclosurePlan===false))add('attempt','ยืนยันแม่แก้วถามเรื่องความรับผิดแล้วและเข้าถึงวิชัยได้จริง เปิด Execution Attempt ให้ทีมรับมือ');
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
 return out;
}
export function command51(w:World,command:string) {
 const s=w.case001!,v=s.v51!;
 if(!dmOptions51(s).some(o=>o.id===command))throw Error('เหตุการณ์ไม่ตรงเงื่อนไขจริง');
 const [kind,...parts]=command.split(':');
 if(kind==='context')v.contextConfirmed.push(parts.join(':'));
 if(kind==='enable-lethal') {v.lethal=true;emitCaseBeat(s,'v51:lethal','ใช้ Lethal Variant v5.1: เวลา 03:00 พิธีที่ยังแรงเต็มอาจคร่าชีวิตผู้มีชื่อผูกไว้ การพาออกจากเรือนอย่างเดียวไม่ตัดสายพิธี HP0 ยังไม่ตายทันทีตาม Core เดิม','party');}
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
 if(kind==='shield') {
  v.pending={kind:'crossfire',target:parts[0] as Hostage,announced:!w.dmSession};
  emitCaseBeat(s,'v51:crossfire-window','ปลายมีดที่คอและตัวประกันขัดขืน · '+parts[0]+'\nวิชัย · อย่าบีบผม! อีกก้าวเดียวผมกรีดคอมันจริง ๆ ด้วย!','party');
 }
 if(kind==='attempt') {
  v.pending={kind:'execution',announced:!w.dmSession};
  const row=scenes51.F5.responses.split('\n').find(line=>line.startsWith('3. '))!;
  const quotes=[...row.matchAll(/“([^”]+)”/g)].map(match=>match[1]);
  emitCaseBeat(s,'v51:execution-window',quotes[0]+'\nวิชัย · '+quotes[1],'party');
 }
 if(kind==='prevented')delete v.pending;
 if(kind==='fatal') {
  if(v.pending?.kind==='crossfire') {
   if(!wichaiHere51(s) || !alive51(s,v.pending.target) || s.evacuated.includes(v.pending.target))throw Error('วิชัยเข้าถึงตัวประกันไม่ได้แล้ว');
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
 v.adjudications.push({event:command,minute:s.minute});
}
export function delivered51(s:CaseState,eventId:string) {
 if(s.v51?.pending && ['v51:crossfire-window','v51:execution-window'].includes(eventId))s.v51.pending.announced=true;
}
export function validateSave51(s:CaseState) {
 const v=s.v51;
 if(!v)return;
 const defaults=newState51();
 if(s.guided?.version!=='5.1' || Object.keys(defaults).some(key=>!(key in v)) ||
  !['not_met','talked','won','fled','lost'].includes(v.KAEW_D_RESULT) ||
  !['active','weakened','stopped','entrenched'].includes(v.RITUAL_STATUS) ||
  !['free','captured','escaped','dead'].includes(v.WICHAI_STATUS) ||
  (v.WICHAI_DEATH_CAUSE==='kaew_execution')!==(v.WICHAI_STATUS==='dead') ||
  v.RITUAL_0300_FULL_POWER!==(v.RITUAL_0300_PRESTATE==='active') ||
  new Set(s.evacuated).size!==s.evacuated.length || new Set(s.escorts).size!==s.escorts.length ||
  s.seals[2] !== (v.RITUAL_STATUS==='stopped') || !Number.isFinite(s.minute) || s.minute<0 ||
  s.minute>=240 && v.RITUAL_0300_PRESTATE===null ||
  hostageNames.some(n=>!['alive','dead'].includes(v.HOSTAGE_FATE[n]) || typeof v.RITUAL_TETHER_INTACT[n]!=='boolean' ||
   v.HOSTAGE_FATE[n]==='dead' && (!v.DEATH_CAUSE[n] || s.evacuated.includes(n) || s.escorts.includes(n)) ||
   v.HOSTAGE_FATE[n]==='alive' && v.DEATH_CAUSE[n]!==null))throw Error('State v5.1 ในเซฟไม่ครบหรือขัดกัน ต้องตรวจเซฟก่อนโหลด');
}
