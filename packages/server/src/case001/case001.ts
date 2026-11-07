import { caseCombatStats } from './caseCombatStats.js';
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
 ending:Ending; title:string; time:string; haunt:number; rescued:number; evidence:number; seals:number;
 ghost:string; accountability:boolean; advance:number; base:number|null; rescueBonus:number; rootBonus:number;
 payable:number|null; reputation:number|null; decisions:string[]; text:string;
}
export function emitCaseBeat(s:CaseState,eventId:string,text:string,scope:'local'|'party'='local',site:Site=s.site,recipient?:string) {
 (s.narrativeEvents ??= []).push({eventId,text,site,scope,recipient});
}
export interface CaseState {
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
 return (s.storyVersion===4 ? v4.scenes : caseNarration.scenes)[site];
}
function locationName(s:CaseState,site:Site) {
 return s.storyVersion===4 ? v4.locations[site] : mission.locations.find(location=>location.id===site)!.name;
}
function accountable(s:CaseState) {
 if(s.storyVersion===4) return hasFact(s,'current-testimony') &&
  (s.evidence.includes('E02') || s.evacuated.includes(names[0]) || s.wichai?.status==='detained');
 return ['E02','E07','E08'].filter(id=>s.evidence.includes(id)).length + Number(s.evacuated.includes(names[0])) >= 2;
}
function endingV4(s:CaseState):Ending {
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
 const report:CaseReport={ending,title:isV4 ? v4.endings[ending].title : labels[ending],time:time(s.minute),haunt:s.haunt,rescued:s.evacuated.length,
  evidence:s.evidence.length,seals:s.seals.filter(Boolean).length,ghost:ghostLabels[s.ghost],
  accountability:accountable(s),advance:s.advance,base,rescueBonus,rootBonus,payable,reputation,
  decisions:[...s.decisions],text:''};
 report.text=[
  'รายงานคดี BS-001 · '+mission.title,'ตอนจบ '+ending+' · '+report.title,
  'ช่วยผู้สูญหาย '+report.rescued+'/3 · หลักฐาน '+report.evidence+'/8 · ผนึก '+report.seals+'/3',
  'แม่แก้ว '+report.ghost+' · หลักฐานเอาผิดวิชัย '+(report.accountability?'เพียงพอ':'ยังไม่เพียงพอ'),
  'เวลา '+report.time+' · ความหลอน '+report.haunt+'/10',
  ...(isV4 ? ['พิธี '+(s.seals[2]?'หยุดแล้ว':s.minute>=240?'ฝังแน่น':'ยังทำงาน')+
   ' · วิชัย '+(s.wichai?.status==='detained'?'ถูกควบคุมตัว':'ยังไม่อยู่ในการควบคุมตัว')] : []),
  'ค่าจ้างพื้นฐาน '+(base??'รอพิจารณา')+' · โบนัสช่วยเหลือ '+rescueBonus+' · โบนัสต้นเหตุ '+rootBonus+' · หักเงินล่วงหน้า '+s.advance+' บาท',
  'ยอดจ่าย '+payText+' · ชื่อเสียง '+reputationText,
  'การตัดสินใจสำคัญ',...report.decisions,
 ].join('\n');
 if(ending==='A' || fullB || ending==='C' || s.ghost==='bound') s.notice=mission.endingNarration[ending];
 s.report=report;
 if(s.story) {
  const earlyFailure=ending==='D' && cause!=='deadline' && (cause==='incapacitated' || !isV4 || s.minute<240);
  s.notice=earlyFailure ? caseNarration[cause] : isV4 ? v4.endings[ending].text : storyEndingNarration[ending];
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
export function failCase(s:CaseState) { finish(s,s.storyVersion===4 ? endingV4(s) : 'D','incapacitated'); }
export function tick(s:CaseState, cost:number) {
 if(s.report) return;
 s.minute+=cost;
 function milestone(id:string,eligible:boolean,effect:()=>void) {
  if(eligible && !s.milestones.includes(id)) {s.milestones.push(id);effect();}
 }
 milestone('23:30',s.minute>=30,()=>{s.notice+=' เสียงกระซิบดังแผ่ว ๆ';});
 milestone('00:00',(s.storyVersion===4 ? s.evidence.includes('E03') || s.evidence.includes('E04') : s.minute>=60 || (!!s.story && s.haunt>=6)) && s.site==='D' && s.ghost==='hidden',()=>{s.ghost='cautious';s.notice+=' แม่แก้วปรากฏตัวหลังต้นกล้วยใหญ่';});
 milestone('01:30',s.minute>=150,()=>{if(!s.seals.some(Boolean)) haunt(s,1);});
 milestone('02:30',!s.story && s.minute>=210 && !s.seals[2],()=>{s.notice+=' พิธีใกล้ถึงเส้นตาย 03:00';});
 if(s.minute>=240 && !s.seals[2]) {
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
 if(npc?.status==='traveling' && npc.site==='E' && !npc.sabotaged && !hasFact(s,'v41-wichai-cooperating') && s.seals[0] && s.seals[1] && !s.seals[2]) {
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
 const isV4=s.storyVersion===4;
 const options:Option[]=[];
 const add=(id:string,label:string,minutes=10)=>options.push({id,label,minutes});
 for(const [a,b] of mission.travel) {
  const target=a===s.site?b:b===s.site?a:null;
  if(target) add('travel:'+target,'เดินทางไป '+locationName(s,target),mission.travelMinutes);
 }
 for(const [id,site] of Object.entries(clueSites)) {
  if(site!==s.site && !(s.site==='E' && (id==='E06' || isV4 && id==='E07'))) continue;
  if(s.evidence.includes(id) || isV4 && id==='E08' || (id==='E05' && !(isV4 ? s.key : s.seals[2]))) continue;
  add('clue:'+id,isV4 && id==='E05' ? 'ตรวจกำไลทองเหลืองในห้องพิธี' : isV4 && id==='E07' && s.site==='E' ? 'ค้นบันทึกการเปิดประตูผันน้ำในเรือนร้าง' : clueActions[id]);
 }
 if(s.site==='A') {
  if(!s.advance) add('advance','รับเงินล่วงหน้า 2,000 บาท',0);
  if(s.story || s.evacuated.length || s.seals[2]) add('finish','ถอนทีมและปิดคดี',0);
 }
 if(!isV4&&s.site==='B'&&!s.lore) add('lore','ถามยายบุญมีถึงวิธีแก้ด้ายดำ');
 if(s.diceVersion==='4.1' && s.site==='B' && !hasFact(s,'v41-photo')) add('view-flood-photo','ตรวจรูปถ่ายเก่าคู่กับแผนที่หมู่บ้าน',0);
 if(s.site==='D') {
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
  if(!s.opened && s.key) add('open','ใช้กุญแจเปิดห้องเก็บผลผลิต');
  if(s.opened) for(const name of names) {
   if(!s.escorts.includes(name)&&!s.evacuated.includes(name)) add('escort:'+name,'พา '+name+' ออกจากห้องเก็บผลผลิต');
  }
  if(s.story && s.key && !s.seals[2] && !s.milestones.includes('unsafe-bracelet')) {
   add('unsafe-bracelet','ยืนยันแตะกำไลก่อนคลายผนึก · ความหลอน +1 และแม่แก้วอาจเป็นศัตรู');
  }
  if(s.seals[0]&&s.seals[1]&&!s.seals[2]&&(!isV4 || s.evidence.includes('E05'))) add('seal3',(isV4?'ปลดอาคมที่กำไล · ความรู้ DC ':'คลายวงพิธี · ความรู้ DC ')+(12+(s.haunt>=9?2:0)));
  if(s.seals[2]&&s.evidence.includes('E05')&&!s.returned&&s.ghost!=='sealed') add('return','คืนกำไลให้แม่แก้ว');
  if(s.returned&&s.ghost!=='freed'&&s.ghost!=='sealed') add('ritual','ทำพิธีปลดปล่อย · จิตวิญญาณ DC '+((s.ghost==='pacified'?10:12)+(s.haunt>=9?2:0)));
  if(s.seals[2]&&s.ghost!=='freed'&&s.ghost!=='sealed') add('suppress',(s.story?'ทำพิธีสะกดอย่างปลอดภัย · จิตวิญญาณ DC ':'สะกดแม่แก้วด้วยชุดพิธี · จิตวิญญาณ DC ')+((s.story && s.ghost==='pacified'?10:12)+(s.haunt>=9?2:0)));
 }
 if(s.story) {
  if(isV4 && s.site==='C' && !hasFact(s,'met-boonmee')) add('visit-boonmee','ไปพบยายบุญมี',0);
  if(s.site==='E' && !s.story.firedTriggers.includes('EV06')) add('approach-cellar','เข้าใกล้ประตูห้องเก็บผลผลิต',0);
  for(const topic of storyTopics(s)) options.push({id:'talk:'+topic.id,label:topic.label,minutes:topic.minutes,speaker:topic.speaker});
  if(s.site==='B' && s.wichai?.status==='idle' && (accountable(s) || isV4 && s.evidence.includes('E02') && s.evidence.includes('E08'))) add('confront','เผชิญหน้าวิชัยด้วยหลักฐานสองแหล่ง',0);
  if(s.wichai?.site===s.site && s.wichai.status!=='detained' && (accountable(s) || s.wichai.status==='traveling' || isV4 && s.evidence.includes('E02') && s.evidence.includes('E08'))) {
   add('detain','ควบคุมตัววิชัย · ร่างกาย DC 12',10);
   add('surrender','ขอให้วิชัยมอบตัว',10);
   if(s.wichai.site==='E' && !s.seals[2] && !hasFact(s,'bribe-accepted')) add('bribe','รับข้อเสนอปกปิดเรื่องจากวิชัย (50,000 บาท)',0);
  }
  if(s.site==='A' && (hasFact(s,'confessed') || isV4 && hasFact(s,'gate-truth')) && !hasFact(s,'truth-recorded')) add('record-truth','บันทึกคำรับสารภาพในรายงาน',0);
 }
 if(upgraded) add('hint','สำรวจความผิดปกติ',0);
 if(upgraded && s.site===mission.spiritSense.site && s.ghost!=='hidden' && s.evidence.includes(mission.spiritSense.evidence)) {
  add('sense',mission.spiritSense.question,0);
 }
 if(!upgraded) return options;
 return options.map(option => {
  if(option.id==='detain') return {...option,check:'physical'};
  if(option.id==='surrender' && !hasFact(s,'v41-wichai-cooperating')) return {...option,check:'social'};
  if(ritualChecks.includes(option.id) && !(option.id==='seal1' && s.lore)) return {...option,check:'ritual',background:'temple_student'};
  if(spiritChecks.includes(option.id)) return {...option,check:'spirit'};
  if(s.diceVersion==='4.1' && ['clue:E02','clue:E03','clue:E04','clue:E05','clue:E06','clue:E07'].includes(option.id)) return option;
  const investigation=investigationFor(option.id);
  return investigation && !s.milestones.includes('retry:'+option.id)
   ? {...option,label:option.label+' · ทดสอบ DC 12',check:'investigation',background:investigation.background,deception:investigation.deception}
   : option;
 });
}
export function applyCaseAction(current:CaseState, id:unknown, rollD20:()=>number, actor?: {character:Character;boost?:'focus'|'background'|'deception'|'diagnostic';backgroundUsed:boolean;onBoost:()=>void;inEncounter?:boolean;playerId?:string;onCheck?:(result:ReturnType<typeof resolveCheck>)=>void}):CaseState {
 const option=caseOptions(current,!!actor).find(option=>option.id===id);
 if(!option) throw Error('ทำรายการนี้ในคดีไม่ได้');
 const s=structuredClone(current);
 const [kind,target]=option.id.split(':');
 const isV4=s.storyVersion===4;
 s.notice=option.label;
 if(actor?.boost && !option.check) throw Error('รายการนี้ไม่มีการทดสอบ');
 if(actor?.boost==='background' && (!option.background || actor.character.background!==option.background || actor.backgroundUsed)) {
  throw Error('ใช้ภูมิหลังกับการทดสอบนี้ไม่ได้');
 }
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
   const result=resolveCheck({dc,attribute:characterAttribute(actor.character,attribute,core),boost:actor.boost==='diagnostic' || actor.boost==='deception' ? 'focus' : actor.boost,partial},rollD20);
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
   s.notice+=' · ยังทำรายการไม่สำเร็จ ลองอีกครั้งโดยใช้เวลาเพิ่มได้';
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
   s.wichai!.status='traveling';s.wichai!.nextMove=s.minute+10;addFact(s,'confronted');break;
  case 'detain': case 'surrender': {
   const dc=kind==='detain' ? (isV4 ? caseCombatStats.wichai.PDEF : 12) : (accountable(s) && s.evacuated.length===3) ? 12 : 15;
   if((kind==='surrender' && hasFact(s,'v41-wichai-cooperating')) || check(dc,kind==='detain'?'body':'mind',false,kind==='surrender'?'SOC':undefined)==='success') s.wichai!.status='detained';
   else if(s.wichai!.site!=='E') {s.wichai!.status='traveling';s.wichai!.nextMove=s.minute+10;}
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
   s.site=target as Site;
   if(s.site==='A'&&s.escorts.length) {
    const arriving=s.escorts.filter(name=>!actor?.playerId || !s.escortOwners?.[name] || s.escortOwners[name]===actor.playerId);
    s.evacuated.push(...arriving);
    s.escorts=s.escorts.filter(name=>!arriving.includes(name));
    s.rescueOnTime=s.evacuated.length===3 && s.minute+option.minutes<240;
   }
   break;
  case 'clue': s.evidence.push(target);break;
  case 'advance': s.advance=2000;break;
  case 'lore': s.lore=true;break;
  case 'study': s.understood=true;break;
  case 'key': s.key=true;break;
  case 'open': s.opened=true;break;
  case 'escort':
   s.escorts.push(target);
   if(s.escortOwners && actor?.playerId) s.escortOwners[target]=actor.playerId;
   break;
  case 'seal1':
   if(s.lore||check(12)==='success') {s.seals[0]=true;trust();}
   else s.notice+=' · ผนึกยังอยู่';
   break;
  case 'cut': s.seals[0]=true;haunt(s,2);if(s.ghost!=='hidden') s.ghost='hostile';break;
  case 'seal2':
   if(check((s.understood?8:12)+penalty)==='success') s.seals[1]=true;
   else {haunt(s,1);s.notice+=' · ผนึกยังอยู่';}
   break;
  case 'unsafe-bracelet':
   s.milestones.push('unsafe-bracelet');haunt(s,1);
   if(s.ghost!=='pacified') s.ghost='hostile';
   break;
  case 'seal3':
   if(check(12+penalty)==='success') {s.seals[2]=true;if(isV4 && (s.ghost==='bound' || s.ghost==='hidden')) s.ghost='cautious';}
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
   s.progress=Math.min(6,s.progress+(result==='success'?(actor?.character.profession==='ritual_specialist'?3:2):result==='partial'?1:0));
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
 if(isV4) {
  if(s.site==='A' && kind!=='travel' && kind!=='finish' && !s.milestones.includes('arrival-investigated')) s.milestones.push('arrival-investigated');
  const storyText=v4.beats[option.id];
  if(storyText) s.notice=storyText;
 }
 if(kind==='finish') addFact(s,'withdrawn');
 if(kind!=='travel') s.decisions.push(s.notice);
 emitCaseBeat(s,option.id,s.notice,kind==='clue'?'party':'local');
 tick(s,actor?.inEncounter ? 0 : option.minutes);
 if(kind==='finish'&&!s.report) {
  if(isV4) finish(s,endingV4(s));
  else if(!s.seals[2]) finish(s,s.evacuated.length===3?'C':'D');
  else finish(s,s.evacuated.length===3&&s.ghost==='freed'&&accountable(s)?'A':'B');
 }
 return s;
}
export function caseDmView(s:CaseState) {
 return {...dmSceneScript(s),choices:caseOptions(s,true).filter(option=>option.id.startsWith('talk:') || option.id==='approach-cellar')};
}
export function caseView(s:CaseState, upgraded=false) {
 const actions=caseOptions(s,upgraded);
 const speakers=[...new Set(actions.flatMap(option=>option.speaker ? [option.speaker] : []))];
 return {notebook:caseNotebook(s),title:mission.title,location:locationName(s,s.site),storyVersion:s.storyVersion,diceVersion:s.diceVersion,
  time:time(s.minute),intro:sceneNarration(s),notice:s.notice,haunt:s.haunt,rescued:s.evacuated.length,escorting:s.escorts.length,
  evidence:s.evidence.length,seals:s.seals.filter(Boolean).length,progress:s.progress,containment:s.containment,
  ghost:s.ghost==='hidden'?null:ghostLabels[s.ghost],report:s.report,actions,speakers};
}
