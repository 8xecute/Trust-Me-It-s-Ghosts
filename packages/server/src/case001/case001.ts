import { caseCombatStats } from './caseCombatStats.js';
import { guidedCellarRead, guidedEndingText } from './guidedCase.js';
import { alive51, clock51, endingText51, resolveEnding51, safeHostages51, wichaiHere51, sceneCue51, presentScene51, startBacklash52, stopRitual51, delivered51, type State51 } from './storyV51.js';
import { noTimer, storyContent } from './v51Content.js';
import { characterAttribute } from '@baan/shared';
import { caseNotebook } from './caseNotebook.js';
import {readFileSync} from 'node:fs';

import { addFact, advanceStory, dmSceneScript, hasFact, newStory, speak, storyEndingNarration, storyEpilogues, storyTopics, v4 } from './caseStory.js';
import { type ScenarioProgress, resolveCheck, type Attribute, type Background, type Character } from '@baan/shared';

import type { StoryRoll } from './storyDice.js';

export type Site = 'A'|'B'|'C'|'D'|'E';
type Ending = 'A'|'B'|'C'|'D';
type Ghost = 'hidden'|'cautious'|'hostile'|'pacified'|'sealed'|'freed'|'bound';
const read = (name:string) => JSON.parse(readFileSync(new URL('../../scenarios/case-001/'+name,import.meta.url),'utf8'));
const mission = read('case-001.json') as {
 title:string; briefing:string;
 investigationChecks:Record<string,{background:Background;attribute:Attribute;deception?:boolean}>;
 spiritSense:{site:Site;evidence:string;question:string;answer:string}; locations:{id:Site;name:string}[]; travel:[Site,Site][]; travelMinutes:number; endingNarration:Record<Ending,string>;
};
export const caseNarration = read('case-001.narrative.json') as {scenes:Record<Site,string>;encounters:Record<string,{start:string;end:string}>;phases:Record<string,string>;vision:string;escape:string;incapacitated:string;withdrawal:string};
const names = ['ดล','นิด','เพิ่ม'];
const labels = {A:'ปลดปล่อยแม่แก้ว',B:'สะกดวิญญาณ / คลี่คลายไม่สมบูรณ์',C:'ช่วยผู้สูญหายเท่านั้น',D:'ภารกิจล้มเหลว'};
const ghostLabels: Record<Ghost,string> = {hidden:'ยังไม่ปรากฏ',cautious:'ระวังตัว',hostile:'เป็นศัตรู',pacified:'สงบ',sealed:'ถูกสะกด',freed:'ได้รับการปลดปล่อย',bound:'ถูกผูกวิญญาณ'};
const clueSites: Record<string,Site> = {E01:'C',E02:'C',E03:'D',E04:'D',E05:'E',E06:'D',E07:'B',E08:'B'};
const clueActions: Record<string,string> = {
 E01:'ค้นหารอยเท้าหลังบ้าน',E02:'ค้นโต๊ะทำงาน',E03:'ค้นหลังศาลเก่า',E04:'ตรวจต้นกล้วยใหญ่',
 E05:'เปิดกล่องไม้และเก็บกำไลหลังคลายผนึก',E06:'ตรวจรอยล้อรถเข็น',E07:'ขออนุญาตตรวจเอกสารหมู่บ้าน',E08:'ขอให้ต้นเล่าหลังรับปากว่าจะช่วยคุ้มครอง',
};
export interface CaseReport {
 ending:Ending; title:string; time?:string; haunt:number; rescued:number; evidence:number; seals:number;
 ghost:string; accountability:boolean; advance:number; base:number|null; rescueBonus:number; rootBonus:number;
 payable:number|null; reputation:number|null; decisions:string[]; text:string;
}
export function emitCaseBeat(s:CaseState,eventId:string,text:string,scope:'local'|'party'='local',site:Site=s.site,recipient?:string) {
 (s.narrativeEvents ??= []).push({eventId,text,site,scope,recipient});
}
export interface CaseState {
 v51?:State51;
 basicMode?:true;
 guided?:import('./guidedCase.js').GuidedState;
 narrativeEvents?:{eventId:string;text:string;site:Site;scope:'local'|'party';recipient?:string;actor?:string}[];
 diceVersion?:'4.1'; storyChecks?:Record<string,StoryRoll[]>;
 storyVersion?:4; story?:ScenarioProgress; containment?:number; escortOwners?:Record<string,string>;
 wichai?:{site:Site;status:'idle'|'traveling'|'detained';nextMove:number;sabotaged:boolean};
 site:Site; minute:number; haunt:number; ghost:Ghost; trust:number; seals:[boolean,boolean,boolean];
 progress:number; evidence:string[]; evacuated:string[]; escorts:string[]; opened:boolean; returned:boolean;
 lore:boolean; understood:boolean; key:boolean; advance:number; milestones:string[]; decisions:string[];
 notice:string; report:CaseReport|null; rescueOnTime:boolean;
}
export function newCase(upgraded=false,storyVersion?:4,diceVersion?:'4.1'):CaseState {
 const state:CaseState={storyVersion,diceVersion,...(upgraded?{story:newStory(),containment:0,escortOwners:{},wichai:{site:'B',status:'idle',nextMove:0,sabotaged:false}}:{}),site:'A',minute:0,haunt:2,ghost:'hidden',trust:0,seals:[false,false,false],progress:0,
  evidence:[],evacuated:[],escorts:[],opened:false,returned:false,lore:false,understood:false,key:false,
  advance:0,milestones:[],decisions:[],notice:mission.briefing,report:null,rescueOnTime:false};
 emitCaseBeat(state,'briefing',state.notice,'party');
 advanceStory(state);
 return state;
}
function time(minute:number) {
 const total=(23*60+minute)%1440;
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
export function sceneNarration(s:CaseState,site:Site=s.site) {
 if(s.v51)return s.report ? '' : sceneCue51(s,s.guided!.scene);
 return (s.storyVersion===4 ? v4.scenes : caseNarration.scenes)[site];
}
function locationName(s:CaseState,site:Site) {
 return s.storyVersion===4 ? v4.locations[site] : mission.locations.find(location=>location.id===site)!.name;
}
function accountable(s:CaseState) {
 if(s.v51)return s.v51.humanCaseSupported===true;
 if(s.storyVersion===4) return hasFact(s,'current-testimony') &&
  (s.evidence.includes('E02') || s.evacuated.includes(names[0]) || s.wichai?.status==='detained');
 return ['E02','E07','E08'].filter(id=>s.evidence.includes(id)).length + Number(s.evacuated.includes(names[0])) >= 2;
}
function endingV4(s:CaseState):Ending {
 if(s.v51)return resolveEnding51(s);
 if(!s.seals[2]) return 'D';
 if(s.evacuated.length!==3 || !accountable(s)) return 'C';
 if(s.ghost!=='freed') return 'B';
 return hasFact(s,'gate-truth') && (hasFact(s,'confessed') || hasFact(s,'truth-recorded')) ? 'A' : 'C';
}
function finish(s:CaseState, ending:Ending,cause:'withdrawal'|'deadline'|'incapacitated'='withdrawal') {
 if(s.report) return;
 const isV4=s.storyVersion===4;
 const fullB=ending==='B' && s.evacuated.length===3 && s.ghost==='sealed';
 const base=ending==='A'||fullB ? 8000 : null;
 const rescueBonus=(ending==='C'&&(!isV4 || s.evacuated.length===3))||fullB||ending==='A'&&(s.story || s.rescueOnTime) ? 3000 : 0;
 const rootBonus=ending==='A'?4000:0;
 const reputation=ending==='A'?3:fullB?1:ending==='C'?0:null;
 const payable=base===null?null:base+rescueBonus+rootBonus-s.advance;
 const reputationText=reputation===null?'รอพิจารณา':String(reputation);
 const payText=payable===null?'รอพิจารณาค่าจ้างพื้นฐาน':payable+' บาท';
 const report:CaseReport={ending,title:s.v51 ? storyContent(s).endings[ending].title : isV4 ? v4.endings[ending].title : labels[ending],...(noTimer(s)?{}:{time:time(s.minute)}),haunt:s.haunt,rescued:s.v51?safeHostages51(s).length:s.evacuated.length,
  evidence:s.evidence.length,seals:s.seals.filter(Boolean).length,ghost:ghostLabels[s.ghost],
  accountability:accountable(s),advance:s.advance,base,rescueBonus,rootBonus,payable,reputation,
  decisions:[...s.decisions],text:''};
 if(s.v51) {
  if(s.v51.ENDING_MODIFIER==='fallen_agent')report.title='เจ้าหน้าที่เสียชีวิตระหว่างปฏิบัติหน้าที่ / Fallen Agent';
  if(s.v51.ENDING_MODIFIER==='vigilante_ghost')report.title='แม่แก้วลงมือฆ่าวิชัย / Vigilante Ghost';
  if(s.v51.KAEW_TEMP_DISPERSED)report.ghost='ร่างปรากฏสลายชั่วคราว';
 }
 report.text=[
  'รายงานคดี BS-001 · '+mission.title,'ตอนจบ '+ending+' · '+report.title,
  'ช่วยผู้สูญหาย '+report.rescued+'/3 · หลักฐาน '+report.evidence+'/8 · ผนึก '+report.seals+'/3',
  'แม่แก้ว '+report.ghost+' · หลักฐานเอาผิดวิชัย '+(report.accountability?'เพียงพอ':'ยังไม่เพียงพอ'),
  (noTimer(s)?'':'เวลา '+report.time+' · ')+'ความหลอน '+report.haunt+'/10',
  ...(isV4 && !s.v51 ? ['พิธี '+(s.seals[2]?'หยุดแล้ว':s.minute>=240?'ฝังแน่น':'ยังทำงาน')+
   ' · วิชัย '+(s.wichai?.status==='detained'?'ถูกควบคุมตัว':'ยังไม่อยู่ในการควบคุมตัว')] : []),
  'ค่าจ้างพื้นฐาน '+(base??'รอพิจารณา')+' · โบนัสช่วยเหลือ '+rescueBonus+' · โบนัสต้นเหตุ '+rootBonus+' · หักเงินล่วงหน้า '+s.advance+' บาท',
  'ยอดจ่าย '+payText+' · ชื่อเสียง '+reputationText,
  'การตัดสินใจสำคัญ',...report.decisions,
 ].join('\n');
 if(ending==='A' || fullB || ending==='C' || s.ghost==='bound') s.notice=mission.endingNarration[ending];
 s.report=report;
 if(s.story) {
  const earlyFailure=ending==='D' && cause!=='deadline' && (cause==='incapacitated' || !isV4 || s.minute<240);
  s.notice=s.v51 ? endingText51(s,ending) : s.guided ? guidedEndingText(ending) : earlyFailure ? caseNarration[cause] : isV4 ? v4.endings[ending].text : storyEndingNarration[ending];
  emitCaseBeat(s,'ending:'+ending,s.notice,'party');
  advanceStory(s);
  const variants=[
   !isV4 && ending==='A' && hasFact(s,'confessed') && storyEpilogues.confession,
   !isV4 && ending==='B' && !fullB && storyEpilogues.incomplete,
   hasFact(s,'bribe-accepted') && storyEpilogues.bribe,
   hasFact(s,'truth-recorded') && 'แนบคำให้การเรื่องประตูน้ำในรายงาน',
   !isV4 && hasFact(s,'company-teaser') && storyEpilogues.teaser,
  ];
  for(const [index,text] of variants.entries()) if(text) emitCaseBeat(s,'epilogue:'+index,text,'party');
  report.text+='\n'+[s.notice,...variants.filter(Boolean)].join('\n');
 }
}
function haunt(s:CaseState, gain:number) {s.haunt=Math.min(10,s.haunt+gain);}
export function withdrawCase(s:CaseState) {finish(s,s.storyVersion===4 ? endingV4(s) : 'D');}
export function failCase(s:CaseState) { finish(s,s.storyVersion===4 ? endingV4(s) : 'D','incapacitated'); }
export function tick(s:CaseState, cost:number) {
 if(s.report || noTimer(s)) return;
 if(s.v51 && (!Number.isFinite(cost) || cost<0)) throw Error('เวลาในเรื่องต้องเพิ่มหรือคงเดิม');
 const previousMinute=s.minute;
 s.minute+=cost;
 if(s.v51)clock51(s,previousMinute);
 function milestone(id:string,eligible:boolean,effect:()=>void) {
  if(eligible && !s.milestones.includes(id)) {s.milestones.push(id);effect();}
 }
 milestone('23:30',s.minute>=30,()=>{s.notice+=' เสียงกระซิบดังแผ่ว ๆ';});
 milestone('00:00',(s.storyVersion===4 ? s.evidence.includes('E03') || s.evidence.includes('E04') : s.minute>=60 || (!!s.story && s.haunt>=6)) && s.site==='D' && s.ghost==='hidden',()=>{s.ghost='cautious';s.notice+=' แม่แก้วปรากฏตัวหลังต้นกล้วยใหญ่';});
 milestone('01:30',s.minute>=150,()=>{if(!s.seals.some(Boolean)) haunt(s,1);});
 milestone('02:30',!s.story && s.minute>=210 && !s.seals[2],()=>{s.notice+=' พิธีใกล้ถึงเส้นตาย 03:00';});
 if(!s.v51 && s.minute>=240 && !s.seals[2]) {
  if(s.storyVersion!==4) {s.ghost='bound';finish(s,'D','deadline');return;}
  milestone('ritual-entrenched',true,()=>{s.ghost='hostile';s.haunt=10;});
 }
 const npc=s.wichai;
 if(s.storyVersion===4 && s.site==='E' && npc?.status==='idle' &&
  (s.opened || s.milestones.includes('unsafe-bracelet')) && !s.seals[2]) {
  npc.status='traveling';npc.nextMove=s.minute+10;
 }
 while(npc?.status==='traveling' && npc.site!=='E' && s.minute>=npc.nextMove) {
  npc.site=npc.site==='B'?'D':'E';npc.nextMove+=10;
 }
 if(npc?.status==='traveling' && npc.site==='E' && (!s.v51 || s.v51.WICHAI_STATUS==='free') && !npc.sabotaged && !hasFact(s,'v41-wichai-cooperating') && s.seals[0] && s.seals[1] && !s.seals[2]) {
  npc.sabotaged=true;haunt(s,1);s.ghost='hostile';s.notice+=' · วิชัยเข้ารบกวนวงพิธี';
 }
 advanceStory(s);
}
type Option = {id:string;label:string;minutes:number;speaker?:string;check?:'ritual'|'spirit'|'investigation'|'physical'|'social';background?:Background;deception?:boolean};
const ritualChecks = ['seal1','seal2','seal3','ritual','suppress'];
const spiritChecks = ['negotiate','pacify'];
const investigationFor = (actionId:string) => mission.investigationChecks[actionId.startsWith('escort:')?'escort':actionId];
export function caseOptions(s:CaseState, upgraded=false):Option[] {
 if(s.report) return [];
 if(s.v51 && s.guided && !s.guided.presented.includes(s.guided.scene))return [];
 const isV4=s.storyVersion===4, eventDriven=noTimer(s);
 const options:Option[]=[];
 const add=(id:string,label:string,minutes=10)=>options.push({id,label,minutes:eventDriven?0:minutes});
 for(const [a,b] of mission.travel) {
  const target=a===s.site?b:b===s.site?a:null;
  if(target) add('travel:'+target,'เดินทางไป '+locationName(s,target),mission.travelMinutes);
 }
 for(const [id,site] of Object.entries(clueSites)) {
  if(eventDriven && id==='E07')continue;
  if(site!==s.site && !(s.site==='E' && (id==='E06' || isV4 && id==='E07'))) continue;
  if(s.evidence.includes(id) || isV4 && id==='E08' || (id==='E05' && !(isV4 ? s.key : s.seals[2]))) continue;
  add('clue:'+id,isV4 && id==='E05' ? 'ตรวจกำไลทองเหลืองในห้องพิธี' : isV4 && id==='E07' && s.site==='E' ? 'ค้นบันทึกการเปิดประตูผันน้ำในเรือนร้าง' : clueActions[id]);
 }
 if(s.site==='A') {
  if(eventDriven && s.guided!.scene==='A1' && !s.milestones.includes('arrival-investigated'))add('survey-arrival','สำรวจรอบจุดจอดรถบริษัท');
  if(!s.basicMode && !s.advance) add('advance','รับเงินล่วงหน้า 2,000 บาท',0);
  if(!s.guided && (s.evacuated.length || s.seals[2] || s.milestones.includes('left-arrival'))) add('finish','ถอนทีมและปิดคดี',0);
 }
 if(!isV4&&s.site==='B'&&!s.lore) add('lore','ถามยายบุญมีถึงวิธีแก้ด้ายดำ');
 if(s.diceVersion==='4.1' && s.site==='B' && !hasFact(s,'v41-photo')) add('view-flood-photo','ตรวจรูปถ่ายเก่าคู่กับแผนที่หมู่บ้าน',0);
 if(s.guided?.phase==='FINAL') add('finish','สรุปผลและปิดคดี',0);
 if(s.site==='D') {
  if(eventDriven && s.guided!.scene==='D3' && !s.v51!.KAEW_TEMP_DISPERSED && !s.milestones.includes('kaew-engaged'))add('engage-kaew','เริ่มเผชิญหน้าแม่แก้ว');
  if(s.evidence.includes('E03')&&!s.understood) add('study','ศึกษาผ้ายันต์เพิ่มเติม');
  if(s.evidence.includes('E04')&&!s.seals[0]) {
   add('seal1',s.lore?'คลายด้ายดำตามวิธียายบุญมี':'คลายด้ายดำ · ความรู้ DC 12');
   add('cut','ตัดด้ายดำโดยไม่ทำพิธี · ความหลอน +2');
  }
  if(s.evidence.includes('E03')&&!s.seals[1]) add('seal2','ลบยันต์ศาล · ความรู้ DC '+((s.understood?8:12)+(s.haunt>=9?2:0)));
  if(s.ghost==='cautious'||s.ghost==='hostile') add('pacify','ปลอบแม่แก้ว · จิตวิญญาณ DC '+((s.understood?12:15)+(s.haunt>=9?2:0)));
  if(s.ghost==='cautious'&&!s.milestones.includes('negotiate')) add('negotiate','เจรจากับแม่แก้ว · จิตวิญญาณ DC '+((s.understood?10:12)+(s.haunt>=9?2:0)));
  if(s.ghost!=='hidden'&&s.understood&&!s.milestones.includes('show-clue')) add('show-clue','แสดงผ้ายันต์และอธิบายพิธี',0);
 }
 if(s.site==='E') {
  if(!s.key) add('key',isV4 ? 'ตรวจห้องพิธีและค้นกุญแจห้องขัง' : 'ค้นหากุญแจห้องเก็บผลผลิตในห้องพิธี');
  if(!s.opened && (s.key || eventDriven && s.guided?.scene==='E1' || s.guided?.scene==='E2' && s.guided.presented.includes('E2')) && !s.guided?.cellarPending) add('open',s.guided ? 'เปิดกลอนห้องเก็บผลผลิต' : 'ใช้กุญแจเปิดห้องเก็บผลผลิต');
  if(eventDriven && s.guided!.scene==='E4' && !s.v51!.bagSearched)add('search-ritual-bag','ค้นใต้ฐานกล่องและเปิดกระเป๋าที่ซ่อนอยู่');
  if(s.guided?.version==='5.5' && s.key && s.v51?.coreApproached &&
    ['E6','F1'].includes(s.guided.scene) && !s.v51.finalDefense55 && s.v51.RITUAL_STATUS!=='stopped')
   add('begin-final55','เริ่มลงมือปลดกำไลและรับมือวงป้องกัน');
  if(eventDriven && s.key && !s.seals[2] && !s.v51!.coreApproached && ['E4','E6'].includes(s.guided!.scene))add('approach-ritual-core','เข้าใกล้กำไลเพื่อเตรียมปลดแกนพิธี');
  if(s.opened && (!eventDriven || s.guided!.presented.includes('E2'))) for(const name of names) {
   if(alive51(s,name) && !s.escorts.includes(name)&&!s.evacuated.includes(name) && !(s.v51?.pending?.kind==='crossfire' && s.v51.pending.target===name)) add('escort:'+name,'พา '+name+' ออกจากห้องเก็บผลผลิต');
  }
  if(eventDriven && s.key && !s.seals[2] && s.v51!.coreWarningDelivered && !s.v51!.backlash) {
   add('unsafe-bracelet','ยืนยันดึงหรือตัดแกนผิดวิธีหลังได้ยินคำเตือน');
  }
  if(!eventDriven && s.story && s.key && !s.seals[2] && !s.milestones.includes('unsafe-bracelet')) {
   add('unsafe-bracelet','ยืนยันแตะกำไลก่อนคลายผนึก · ความหลอน +1 และแม่แก้วอาจเป็นศัตรู');
  }
  if((!eventDriven || !s.v51!.backlash || s.v51!.backlash.announced) && ((s.seals[0]&&s.seals[1]) || (s.guided && s.key))&&!s.seals[2]&&(!isV4 || s.evidence.includes('E05'))) add('seal3',(isV4?'ปลดอาคมที่กำไล · ความรู้ DC ':'คลายวงพิธี · ความรู้ DC ')+(12+(s.haunt>=9?2:0)));
  if(s.seals[2]&&s.evidence.includes('E05')&&!s.returned&&s.ghost!=='sealed') add('return','คืนกำไลให้แม่แก้ว');
  if(s.returned&&s.ghost!=='freed'&&s.ghost!=='sealed') add('ritual','ทำพิธีปลดปล่อย · จิตวิญญาณ DC '+((s.ghost==='pacified'?10:12)+(s.haunt>=9?2:0)));
  if(s.seals[2]&&s.ghost!=='freed'&&s.ghost!=='sealed') add('suppress',(s.story?'ทำพิธีสะกดอย่างปลอดภัย · จิตวิญญาณ DC ':'สะกดแม่แก้วด้วยชุดพิธี · จิตวิญญาณ DC ')+((s.story && s.ghost==='pacified'?10:12)+(s.haunt>=9?2:0)));
 }
 if(s.story) {
  if(isV4 && s.site==='C' && !hasFact(s,'met-boonmee')) add('visit-boonmee','ไปพบยายบุญมี',0);
  if(s.site==='E' && !s.story.firedTriggers.includes('EV06')) add('approach-cellar','เข้าใกล้ประตูห้องเก็บผลผลิต',0);
  for(const topic of storyTopics(s)) options.push({id:topic.id.startsWith('guided-talk:')?topic.id:'talk:'+topic.id,label:topic.label,minutes:topic.minutes,speaker:topic.speaker});
  if(s.site==='B' && s.wichai?.status==='idle' && (accountable(s) || isV4 && s.evidence.includes('E02') && s.evidence.includes('E08'))) add('confront','เผชิญหน้าวิชัยด้วยหลักฐานสองแหล่ง',0);
  if(s.wichai?.site===s.site && s.wichai.status!=='detained' && (!s.v51 || wichaiHere51(s)) && (accountable(s) || s.wichai.status==='traveling' || isV4 && s.evidence.includes('E02') && s.evidence.includes('E08'))) {
   add('detain','ควบคุมตัววิชัย · ร่างกาย DC 12',10);
   add('surrender','ขอให้วิชัยมอบตัว',10);
   if(s.wichai.site==='E' && !s.seals[2] && !hasFact(s,'bribe-accepted')) add('bribe','รับข้อเสนอปกปิดเรื่องจากวิชัย (50,000 บาท)',0);
  }
  if((s.site==='A' || s.guided?.phase==='FINAL') && (hasFact(s,'confessed') || isV4 && hasFact(s,'gate-truth')) && !hasFact(s,'truth-recorded')) add('record-truth','บันทึกคำรับสารภาพในรายงาน',0);
 }
 if(upgraded) add('hint','สำรวจความผิดปกติ',0);
 if(upgraded && s.site===mission.spiritSense.site && s.ghost!=='hidden' && s.evidence.includes(mission.spiritSense.evidence)) {
  add('sense',mission.spiritSense.question,0);
 }
 if(s.guided) {
  const local:Record<string,string[]>= {
  "advance": [
    "A1"
  ],
  "view-flood-photo": [
    "B4"
  ],
  "clue:E01": [
    "C1",
    "C2"
  ],
  "clue:E02": [
    "C2"
  ],
  "clue:E03": [
    "D2"
  ],
  "clue:E04": [
    "D2"
  ],
  "clue:E06": [
    "D5"
  ],
  "clue:E07": [
    "B4",
    "E4",
    "H1"
  ],
  "clue:E05": [
    "E4"
  ],
  "key": [
    "E4"
  ],
  "open": [
    "E2"
  ],
  "visit-boonmee": [
    "C5"
  ],
  "approach-cellar": [
    "E1",
    "E2"
  ],
  "study": [
    "D2"
  ],
  "seal1": [
    "D2",
    "D4"
  ],
  "seal2": [
    "D2",
    "D4"
  ],
  "cut": [
    "D2",
    "D4"
  ],
  "pacify": [
    "D3",
    "D4"
  ],
  "negotiate": [
    "D3"
  ],
  "show-clue": [
    "D3",
    "D4"
  ],
  "detain": [
    "B2",
    "E5"
  ],
  "surrender": [
    "B2",
    "E5"
  ],
  "bribe": [
    "E5"
  ],
  "confront": [
    "B2"
  ],
  "unsafe-bracelet": [
    "E4"
  ],
  "seal3": [
    "E4",
    "F1",
    "F3",
    "F5"
  ],
  "return": [
    "E4",
    "F5"
  ],
  "ritual": [
    "F5"
  ],
  "suppress": [
    "F5"
  ],
  "record-truth": [
    "H1",
    "F5"
  ],
  "finish": [
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6"
  ]
};
  if(eventDriven) {
   local.open=['E1','E4'];
   local['unsafe-bracelet']=['E4','E6','F1','F2','F3','F6'];
   local.seal3.push('F2','F6');
   local.finish.push('E6','H1');
  }
  for(let i=options.length-1;i>=0;i--) {
   const id=options[i].id;
   if(s.v51 && !eventDriven && s.guided.phase==='FINAL' && ['key','open','clue:E05'].includes(id))continue;
   if(id.startsWith('travel:') || (local[id] && !local[id].includes(s.guided.scene))) options.splice(i,1);
  }
 }
 if(s.v51) for(let i=options.length-1;i>=0;i--) {
  const id=options[i].id;
  // Undefined v5.1 outcomes remain private rules decisions. Keep previous
  // rooms' mechanics intact rather than silently equating them with calm.
  if(['return','ritual','suppress','record-truth'].includes(id) || id==='finish' && !!(s.v51.pending || s.v51.backlash) ||
   id==='pacify' && s.v51.KAEW_TEMP_DISPERSED)options.splice(i,1);
 }
 if(s.guided?.version==='5.5')for(let i=options.length-1;i>=0;i--)if(options[i].id==='seal3')options.splice(i,1);
 if(s.basicMode) for(let i=options.length-1;i>=0;i--) if(['hint','sense'].includes(options[i].id)) options.splice(i,1);
 if(!upgraded) return options;
 return options.map(option => {
  if(option.id==='detain') return {...option,check:'physical'};
  if(option.id==='surrender' && !hasFact(s,'v41-wichai-cooperating')) return {...option,check:'social'};
  if(ritualChecks.includes(option.id) && !(option.id==='seal1' && s.lore)) return {...option,check:'ritual'};
  if(spiritChecks.includes(option.id)) return {...option,check:'spirit'};
  if(s.diceVersion==='4.1' && ['clue:E02','clue:E03','clue:E04','clue:E05','clue:E06','clue:E07'].includes(option.id)) return option;
  if(s.guided && (option.id.startsWith('escort:') || option.id==='open')) return option;
  const investigation=investigationFor(option.id);
  return investigation && !s.milestones.includes('retry:'+option.id)
   ? {...option,label:option.label+' · ทดสอบ DC 12',check:'investigation',deception:investigation.deception}
   : option;
 });
}
export function applyCaseAction(current:CaseState, id:unknown, rollD20:()=>number, actor?: {character:Character;dcOverride?:number;statOverride?:keyof import('@baan/shared').LiteStats;boost?:'focus'|'background'|'deception'|'diagnostic';backgroundUsed:boolean;onBoost:()=>void;inEncounter?:boolean;playerId?:string;deferGuidedOpen?:boolean;onCheck?:(result:ReturnType<typeof resolveCheck>)=>void}):CaseState {
 const option=caseOptions(current,!!actor).find(option=>option.id===id);
 if(!option) throw Error('ทำรายการนี้ในคดีไม่ได้');
 const s=structuredClone(current);
 const [kind,target]=option.id.split(':');
 const isV4=s.storyVersion===4;
 s.notice=option.label;
 if(current.basicMode && actor?.boost && actor.boost!=='focus') throw Error('พักความสามารถพิเศษไว้ในโหมดพื้นฐาน');
 if(actor?.boost && !option.check) throw Error('รายการนี้ไม่มีการทดสอบ');
 if(actor?.boost==='background') throw Error('ระบบภูมิหลังถูกยกเลิกแล้ว');
 if(actor?.boost==='deception' && (!option.deception || actor.character.talent!=='detect_deception' || actor.backgroundUsed)) {
  throw Error('ใช้จับพิรุธกับรายการนี้ไม่ได้');
 }
 if(actor?.boost==='diagnostic' && (option.id!=='open' || actor.character.profession!=='occult_engineer' || actor.backgroundUsed)) {
  throw Error('ใช้ตรวจกลไกกับรายการนี้ไม่ได้');
 }
 if((actor?.boost==='focus' || actor?.boost==='deception') && (actor.character.focus<1 || actor.character.sanity===0)) throw Error('สมาธิไม่พอ');
 const check=(dc:number, attribute:Attribute='knowledge', partial=false, core?:'SOC'|'INT'|'PER') => {
  if(actor) {
   if(attribute==='spirit' && actor.character.sanity===0) throw Error('ตื่นตระหนกจนทดสอบจิตวิญญาณไม่ได้');
   const result=resolveCheck({dc:actor.dcOverride ?? dc,attribute:characterAttribute(actor.character,attribute,actor.statOverride ?? core),boost:actor.boost==='diagnostic' || actor.boost==='deception' ? 'focus' : actor.boost,partial},rollD20);
   if(actor.boost) actor.onBoost();
   actor.onCheck?.(result);
   s.notice+=' · ทอย '+result.die+' รวม '+result.total;
   return result.outcome;
  }
  const die=rollD20();
  if(!Number.isInteger(die)||die<1||die>20) throw Error('ผลทอยไม่ถูกต้อง');
  const total=die+3; // ค่าความรู้และจิตวิญญาณของหมอพิธีตามกติกาเริ่มต้น
  s.notice+=' · ทอย '+die+' รวม '+total;
  return die===20||die!==1&&total>=dc?'success':die!==1&&total>=dc-3?'partial':'failure';
 };
 const penalty=s.haunt>=9?2:0;
 const trust=()=>{s.trust=Math.min(3,s.trust+1);};
 if(actor && option.check==='investigation') {
  if(check(12,investigationFor(option.id).attribute)!=='success') {
   s.milestones.push('retry:'+option.id);
   s.notice+=(noTimer(s)?' · ยังทำรายการไม่สำเร็จ ลองเปลี่ยนวิธีหรือหาเบาะแสประกอบ':' · ยังทำรายการไม่สำเร็จ ลองอีกครั้งโดยใช้เวลาเพิ่มได้');
   emitCaseBeat(s,option.id,s.notice);
   tick(s,actor?.inEncounter ? 0 : option.minutes);
   return s;
  }
 }
 switch(kind) {
  case 'talk': speak(s,target);break;
  case 'view-flood-photo': addFact(s,'v41-photo');s.notice="รูปเก่าแสดงชาวบ้านยืนใกล้ประตูน้ำ ที่ขอบภาพมีชายหนุ่มคล้ายประเสริฐ เมื่อขยับกรอบ น้ำหยดหนึ่งไหลลงจากด้านในกระจก แต่ด้านหลังกรอบกลับแห้งสนิท";break;
  case 'visit-boonmee': addFact(s,'met-boonmee');break;
  case 'approach-cellar': s.milestones.push('approached-cellar');break;
  case 'confront':
   if(!noTimer(s)){s.wichai!.status='traveling';s.wichai!.nextMove=s.minute+10;}
   addFact(s,'confronted');break;
  case 'detain': case 'surrender': {
   const dc=kind==='detain' ? (isV4 ? caseCombatStats.wichai.PDEF : 12) : (accountable(s) && s.evacuated.length===3) ? 12 : 15;
   if((kind==='surrender' && hasFact(s,'v41-wichai-cooperating')) || check(dc,kind==='detain'?'body':'mind',false,kind==='surrender'?'SOC':undefined)==='success') s.wichai!.status='detained';
   else if(!noTimer(s) && s.wichai!.site!=='E') {s.wichai!.status='traveling';s.wichai!.nextMove=s.minute+10;}
   break;
  }
  case 'bribe': addFact(s,'bribe-accepted');break;
  case 'record-truth': addFact(s,'truth-recorded');break;
  case 'hint': {
   if(actor?.character.profession!=='paranormal_investigator' || actor.backgroundUsed) throw Error('เฉพาะนักสืบเหนือธรรมชาติ');
   const hint=caseOptions(s).find(entry=>entry.id.startsWith('clue:') && entry.id!=='clue:E08');
   if(!hint) throw Error('ยังไม่มีร่องรอยที่สังเกตได้');
   s.notice=hint.label; actor.onBoost(); break;
  }
  case 'sense':
   if(actor?.character.profession!=='medium' || actor.character.sanity<1 || actor.backgroundUsed) {
    throw Error('ยังถามเรื่องนี้กับวิญญาณไม่ได้');
   }
   s.notice=mission.spiritSense.answer;
   actor.onBoost();
   break;
  case 'travel':
   if((s.site==='A' || target==='A') && !s.milestones.includes('left-arrival')) s.milestones.push('left-arrival');
   s.site=target as Site;
   if(s.site==='A'&&s.escorts.length) {
    const arriving=s.escorts.filter(name=>!actor?.playerId || !s.escortOwners?.[name] || s.escortOwners[name]===actor.playerId);
    s.evacuated.push(...arriving);
    s.escorts=s.escorts.filter(name=>!arriving.includes(name));
    s.rescueOnTime=s.evacuated.length===3 && s.minute+option.minutes<240;
   }
   break;
  case 'clue': s.evidence.push(target);break;
  case 'advance': s.advance=2000;if(noTimer(s))s.milestones.push('arrival-investigated');break;
  case 'survey-arrival': s.milestones.push('arrival-investigated');break;
  case 'lore': s.lore=true;break;
  case 'study': s.understood=true;break;
  case 'key': s.key=true;break;
  case 'open':
   if(s.guided && !noTimer(s) && actor?.deferGuidedOpen) s.guided.cellarPending=true;
   else s.opened=true;
   break;
  case 'escort':
   s.escorts.push(target);
   if(s.escortOwners && actor?.playerId) s.escortOwners[target]=actor.playerId;
   break;
  case 'seal1':
   if(s.lore||check(12)==='success') {s.seals[0]=true;trust();}
   else s.notice+=' · ผนึกยังอยู่';
   break;
  case 'engage-kaew': s.milestones.push('kaew-engaged');break;
  case 'cut': s.seals[0]=true;haunt(s,2);if(s.ghost!=='hidden') s.ghost='hostile';break;
  case 'seal2':
   if(check((s.understood?8:12)+penalty)==='success') s.seals[1]=true;
   else {haunt(s,1);s.notice+=' · ผนึกยังอยู่';}
   break;
  case 'search-ritual-bag':
   s.v51!.bagSearched=true;
   s.notice='ใต้ผ้าพบกระเป๋าสะพายของวิชัย ในกระเป๋ามีหนังสือทวงหนี้ ตารางซื้อขายที่ดิน และแฟ้มบันทึกปี 2534';
   break;
  case 'approach-ritual-core':
   s.v51!.coreApproached=true;
   s.notice='ปมผ้าชื่อเพิ่มกระตุกแรงและแดงเข้มกว่าชื่ออื่น เสียงแม่แก้วเตือนให้หยุดมือก่อนดึงแกน';
   if(!actor?.deferGuidedOpen)delivered51(s,'approach-ritual-core');
   break;
  case 'unsafe-bracelet':
   if(noTimer(s)){startBacklash52(s,'player');break;}
   s.milestones.push('unsafe-bracelet');haunt(s,1);
   if(s.ghost!=='pacified') s.ghost='hostile';
   break;
  case 'seal3':
   if(check(12+penalty)==='success') {s.seals[2]=true;if(isV4 && !s.v51?.KAEW_TEMP_DISPERSED && (s.ghost==='bound' || s.ghost==='hidden')) s.ghost='cautious';}
   else {haunt(s,1);s.notice+=' · พิธียังทำงานอยู่';}
   break;
  case 'show-clue': s.milestones.push(kind);trust();break;
  case 'negotiate':
   s.milestones.push(kind);
   if(check((s.understood?10:12)+penalty,'spirit')==='success') trust();
   break;
  case 'pacify':
   if(check((s.understood?12:15)+penalty,'spirit')==='success') s.ghost='pacified';
   break;
  case 'return': s.returned=true;s.trust=3;break;
  case 'ritual': {
   const result=check((s.ghost==='pacified'?10:12)+penalty,'spirit',true);
   s.progress=Math.min(6,s.progress+(result==='success'?(!s.basicMode && actor?.character.profession==='ritual_specialist'?3:2):result==='partial'?1:0));
   if(result!=='success') haunt(s,1);
   if(s.progress===6) s.ghost='freed';
   break;
  }
  case 'suppress': {
   const result=check((s.story && s.ghost==='pacified'?10:12)+penalty,'spirit',!!s.story);
   if(s.story) {
    s.containment=Math.min(4,(s.containment ?? 0)+(result==='success'?2:result==='partial'?1:0));
    if(s.containment===4) s.ghost='sealed';
   } else if(result==='success') s.ghost='sealed';
   if(result!=='success') haunt(s,1);
   break;
  }
 }
 if(isV4 && !s.v51) {
  if(s.site==='A' && kind!=='travel' && kind!=='finish' && !s.milestones.includes('arrival-investigated')) s.milestones.push('arrival-investigated');
  const storyText=v4.beats[option.id];
  if(storyText) s.notice=storyText;
 }
 if(s.guided && kind==='open') s.notice=noTimer(s)?'กลอนห้องใต้ถุนคลายออก':guidedCellarRead!;
 if(kind==='finish') addFact(s,'withdrawn');
 if(s.v51) {
  if(s.wichai?.status==='detained' && s.v51.WICHAI_STATUS!=='dead')s.v51.WICHAI_STATUS='captured';
  if(s.v51.WICHAI_STATUS==='captured' && s.v51.pending?.kind==='crossfire')delete s.v51.pending;
  if((kind==='seal1' && s.seals[0] || kind==='seal2' && s.seals[1]) && s.v51.RITUAL_STATUS==='active')s.v51.RITUAL_STATUS='weakened';
  if(kind==='seal3' && s.seals[2]) {
   stopRitual51(s);
  }
  if(kind==='key' || kind==='open' && !noTimer(s))presentScene51(s,kind==='key'?'E4':'E2');
 }
 if(kind!=='travel') s.decisions.push(s.notice);
 emitCaseBeat(s,s.guided && kind==='open' && !noTimer(s)?'guided-cellar-open':option.id,s.notice,kind==='clue' || s.guided && kind==='open' || ['approach-ritual-core','search-ritual-bag'].includes(kind)?'party':'local');
 tick(s,actor?.inEncounter ? 0 : option.minutes);
 if(kind==='finish'&&!s.report) {
  if(isV4) finish(s,endingV4(s));
  else if(!s.seals[2]) finish(s,s.evacuated.length===3?'C':'D');
  else finish(s,s.evacuated.length===3&&s.ghost==='freed'&&accountable(s)?'A':'B');
 }
 return s;
}
export function caseDmView(s:CaseState) {
 if(s.v51)return {script:storyContent(s).scenes[s.guided!.scene]?.sourceMarkdown ?? '',secret:storyContent(s).scenes[s.guided!.scene]?.dmSecret ?? '',choices:caseOptions(s,true).filter(option=>option.id.startsWith('guided-talk:'))};
 return {...dmSceneScript(s),choices:caseOptions(s,true).filter(option=>option.id.startsWith('talk:') || option.id.startsWith('guided-talk:') || option.id==='approach-cellar')};
}
export function caseView(s:CaseState, upgraded=false) {
 const actions=caseOptions(s,upgraded).map(option=>noTimer(s) && option.speaker ? {...option,label:'คุยกับ '+option.speaker} : option);
 const speakers=[...new Set(actions.flatMap(option=>option.speaker ? [option.speaker] : []))];
 return {notebook:caseNotebook(s),title:mission.title,location:locationName(s,s.site),storyVersion:s.storyVersion,diceVersion:s.diceVersion,
  ...(noTimer(s)?{}:{time:time(s.minute)}),intro:sceneNarration(s),notice:s.notice,haunt:s.haunt,rescued:s.v51?safeHostages51(s).length:s.evacuated.length,escorting:s.escorts.length,
  evidence:s.evidence.length,seals:s.seals.filter(Boolean).length,progress:s.progress,containment:s.containment,
  ghost:s.v51?.KAEW_TEMP_DISPERSED?'ร่างปรากฏสลายชั่วคราว':s.ghost==='hidden'?null:ghostLabels[s.ghost],report:s.report,actions,speakers};
}
