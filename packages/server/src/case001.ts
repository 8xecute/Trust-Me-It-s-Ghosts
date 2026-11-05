import {readFileSync} from 'node:fs';

import { addFact, advanceStory, dmSceneScript, hasFact, newStory, speak, storyEndingNarration, storyEpilogues, storyTopics } from './caseStory.js';
import { type ScenarioProgress, resolveCheck, type Attribute, type Background, type Character } from '@baan/shared';

export type Site = 'A'|'B'|'C'|'D'|'E';
type Ending = 'A'|'B'|'C'|'D';
type Ghost = 'hidden'|'cautious'|'hostile'|'pacified'|'sealed'|'freed'|'bound';
const read = (name:string) => JSON.parse(readFileSync(new URL('../scenarios/'+name,import.meta.url),'utf8'));
const mission = read('case-001.json') as {
 title:string; briefing:string;
 investigationChecks:Record<string,{background:Background;attribute:Attribute;deception?:boolean}>;
 spiritSense:{site:Site;evidence:string;question:string;answer:string}; locations:{id:Site;name:string}[]; travel:[Site,Site][]; travelMinutes:number; endingNarration:Record<Ending,string>;
};
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
export interface CaseState {
 story?:ScenarioProgress; containment?:number; escortOwners?:Record<string,string>;
 wichai?:{site:Site;status:'idle'|'traveling'|'detained';nextMove:number;sabotaged:boolean};
 site:Site; minute:number; haunt:number; ghost:Ghost; trust:number; seals:[boolean,boolean,boolean];
 progress:number; evidence:string[]; evacuated:string[]; escorts:string[]; opened:boolean; returned:boolean;
 lore:boolean; understood:boolean; key:boolean; advance:number; milestones:string[]; decisions:string[];
 notice:string; report:CaseReport|null; rescueOnTime:boolean;
}
export function newCase(upgraded=false):CaseState {
 const state:CaseState={...(upgraded?{story:newStory(),containment:0,escortOwners:{},wichai:{site:'B',status:'idle',nextMove:0,sabotaged:false}}:{}),site:'A',minute:0,haunt:2,ghost:'hidden',trust:0,seals:[false,false,false],progress:0,
  evidence:[],evacuated:[],escorts:[],opened:false,returned:false,lore:false,understood:false,key:false,
  advance:0,milestones:[],decisions:[],notice:mission.briefing,report:null,rescueOnTime:false};
 advanceStory(state);
 return state;
}
function time(minute:number) {
 const total=(23*60+minute)%1440;
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function accountable(s:CaseState) {
 return ['E02','E07','E08'].filter(id=>s.evidence.includes(id)).length + Number(s.evacuated.includes(names[0])) >= 2;
}
function finish(s:CaseState, ending:Ending) {
 if(s.report) return;
 const fullB=ending==='B' && s.evacuated.length===3 && s.ghost==='sealed';
 const base=ending==='A'||fullB ? 8000 : null;
 const rescueBonus=ending==='C'||fullB||ending==='A'&&(s.story || s.rescueOnTime) ? 3000 : 0;
 const rootBonus=ending==='A'?4000:0;
 const reputation=ending==='A'?3:fullB?1:ending==='C'?0:null;
 const payable=base===null?null:base+rescueBonus+rootBonus-s.advance;
 const reputationText=reputation===null?'รอพิจารณา':String(reputation);
 const payText=payable===null?'รอพิจารณาค่าจ้างพื้นฐาน':payable+' บาท';
 const report:CaseReport={ending,title:labels[ending],time:time(s.minute),haunt:s.haunt,rescued:s.evacuated.length,
  evidence:s.evidence.length,seals:s.seals.filter(Boolean).length,ghost:ghostLabels[s.ghost],
  accountability:accountable(s),advance:s.advance,base,rescueBonus,rootBonus,payable,reputation,
  decisions:[...s.decisions],text:''};
 report.text=[
  'รายงานคดี BS-001 · '+mission.title,'ตอนจบ '+ending+' · '+report.title,
  'ช่วยผู้สูญหาย '+report.rescued+'/3 · หลักฐาน '+report.evidence+'/8 · ผนึก '+report.seals+'/3',
  'แม่แก้ว '+report.ghost+' · หลักฐานเอาผิดวิชัย '+(report.accountability?'เพียงพอ':'ยังไม่เพียงพอ'),
  'เวลา '+report.time+' · ความหลอน '+report.haunt+'/10',
  'ค่าจ้างพื้นฐาน '+(base??'รอพิจารณา')+' · โบนัสช่วยเหลือ '+rescueBonus+' · โบนัสต้นเหตุ '+rootBonus+' · หักเงินล่วงหน้า '+s.advance+' บาท',
  'ยอดจ่าย '+payText+' · ชื่อเสียง '+reputationText,
  'การตัดสินใจสำคัญ',...report.decisions,
 ].join('\n');
 if(ending==='A' || fullB || ending==='C' || s.ghost==='bound') s.notice=mission.endingNarration[ending];
 s.report=report;
 if(s.story) {
  s.notice=storyEndingNarration[ending];
  advanceStory(s);
  const variants=[ending==='A' && hasFact(s,'confessed') && storyEpilogues.confession,
   ending==='B' && !fullB && storyEpilogues.incomplete,hasFact(s,'bribe-accepted') && storyEpilogues.bribe,
   hasFact(s,'truth-recorded') && 'แนบคำให้การเรื่องประตูน้ำในรายงาน',hasFact(s,'company-teaser') && storyEpilogues.teaser];
  report.text+='\n'+[s.notice,...variants.filter(Boolean)].join('\n');
 }
}
function haunt(s:CaseState, gain:number) {s.haunt=Math.min(10,s.haunt+gain);}
export function failCase(s:CaseState) { finish(s,'D'); }
export function tick(s:CaseState, cost:number) {
 if(s.report) return;
 s.minute+=cost;
 function milestone(id:string,eligible:boolean,effect:()=>void) {
  if(eligible && !s.milestones.includes(id)) {s.milestones.push(id);effect();}
 }
 milestone('23:30',s.minute>=30,()=>{s.notice+=' เสียงกระซิบดังแผ่ว ๆ';});
 milestone('00:00',(s.minute>=60 || (!!s.story && s.haunt>=6)) && s.site==='D' && s.ghost==='hidden',()=>{s.ghost='cautious';s.notice+=' แม่แก้วปรากฏตัวหลังต้นกล้วยใหญ่';});
 milestone('01:30',s.minute>=150,()=>{if(!s.seals.some(Boolean)) haunt(s,1);});
 milestone('02:30',!s.story && s.minute>=210 && !s.seals[2],()=>{s.notice+=' พิธีใกล้ถึงเส้นตาย 03:00';});
 if(s.minute>=240 && !s.seals[2]) {s.ghost='bound';finish(s,'D');return;}
 const npc=s.wichai;
 while(npc?.status==='traveling' && npc.site!=='E' && s.minute>=npc.nextMove) {
  npc.site=npc.site==='B'?'D':'E';npc.nextMove+=10;
 }
 if(npc?.status==='traveling' && npc.site==='E' && !npc.sabotaged && s.seals[0] && s.seals[1] && !s.seals[2]) {
  npc.sabotaged=true;haunt(s,1);s.ghost='hostile';s.notice+=' · วิชัยเข้ารบกวนวงพิธี';
 }
 advanceStory(s);
}
type Option = {id:string;label:string;minutes:number;check?:'ritual'|'spirit'|'investigation';background?:Background;deception?:boolean};
const ritualChecks = ['seal1','seal2','seal3','ritual','suppress'];
const spiritChecks = ['negotiate','pacify'];
const investigationFor = (actionId:string) => mission.investigationChecks[actionId.startsWith('escort:')?'escort':actionId];
export function caseOptions(s:CaseState, upgraded=false):Option[] {
 if(s.report) return [];
 const options:Option[]=[];
 const add=(id:string,label:string,minutes=10)=>options.push({id,label,minutes});
 for(const [a,b] of mission.travel) {
  const target=a===s.site?b:b===s.site?a:null;
  if(target) add('travel:'+target,'เดินทางไป '+mission.locations.find(location=>location.id===target)!.name,mission.travelMinutes);
 }
 for(const [id,site] of Object.entries(clueSites)) {
  if(site!==s.site && !(id==='E06'&&s.site==='E')) continue;
  if(s.evidence.includes(id) || (id==='E05' && !s.seals[2])) continue;
  add('clue:'+id,clueActions[id]);
 }
 if(s.site==='A') {
  if(!s.advance) add('advance','รับเงินล่วงหน้า 2,000 บาท',0);
  if(s.story || s.evacuated.length || s.seals[2]) add('finish','ถอนทีมและปิดคดี',0);
 }
 if(s.site==='B'&&!s.lore) add('lore','ถามยายบุญมีถึงวิธีแก้ด้ายดำ');
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
  if(!s.key) add('key','ค้นหากุญแจห้องเก็บผลผลิตในห้องพิธี');
  if(!s.opened && s.key) add('open','ใช้กุญแจเปิดห้องเก็บผลผลิต');
  if(s.opened) for(const name of names) {
   if(!s.escorts.includes(name)&&!s.evacuated.includes(name)) add('escort:'+name,'พา '+name+' ออกจากห้องเก็บผลผลิต');
  }
  if(s.story && s.key && !s.seals[2] && !s.milestones.includes('unsafe-bracelet')) {
   add('unsafe-bracelet','ยืนยันแตะกำไลก่อนคลายผนึก · ความหลอน +1 และแม่แก้วอาจเป็นศัตรู');
  }
  if(s.seals[0]&&s.seals[1]&&!s.seals[2]) add('seal3','คลายวงพิธี · ความรู้ DC '+(12+(s.haunt>=9?2:0)));
  if(s.seals[2]&&s.evidence.includes('E05')&&!s.returned&&s.ghost!=='sealed') add('return','คืนกำไลให้แม่แก้ว');
  if(s.returned&&s.ghost!=='freed'&&s.ghost!=='sealed') add('ritual','ทำพิธีปลดปล่อย · จิตวิญญาณ DC '+((s.ghost==='pacified'?10:12)+(s.haunt>=9?2:0)));
  if(s.seals[2]&&s.ghost!=='freed'&&s.ghost!=='sealed') add('suppress',(s.story?'ทำพิธีสะกดอย่างปลอดภัย · จิตวิญญาณ DC ':'สะกดแม่แก้วด้วยชุดพิธี · จิตวิญญาณ DC ')+((s.story && s.ghost==='pacified'?10:12)+(s.haunt>=9?2:0)));
 }
 if(s.story) {
  if(s.site==='E' && !s.story.firedTriggers.includes('EV06')) add('approach-cellar','เข้าใกล้ประตูห้องเก็บผลผลิต',0);
  for(const topic of storyTopics(s)) add('talk:'+topic.id,topic.label,topic.minutes);
  if(s.site==='B' && s.wichai?.status==='idle' && accountable(s)) add('confront','เผชิญหน้าวิชัยด้วยหลักฐานสองแหล่ง',0);
  if(s.wichai?.site===s.site && s.wichai.status!=='detained' && (accountable(s) || s.wichai.status==='traveling')) {
   add('detain','ควบคุมตัววิชัย · ร่างกาย DC 12',10);
   add('surrender','ขอให้วิชัยมอบตัว',10);
   if(s.wichai.site==='E' && !s.seals[2] && !hasFact(s,'bribe-accepted')) add('bribe','รับข้อเสนอปกปิดเรื่องจากวิชัย (50,000 บาท)',0);
  }
  if(s.site==='A' && hasFact(s,'confessed') && !hasFact(s,'truth-recorded')) add('record-truth','บันทึกคำรับสารภาพในรายงาน',0);
 }
 if(upgraded) add('hint','สำรวจความผิดปกติ',0);
 if(upgraded && s.site===mission.spiritSense.site && s.ghost!=='hidden' && s.evidence.includes(mission.spiritSense.evidence)) {
  add('sense',mission.spiritSense.question,0);
 }
 if(!upgraded) return options;
 return options.map(option => {
  if(ritualChecks.includes(option.id) && !(option.id==='seal1' && s.lore)) return {...option,check:'ritual',background:'temple_student'};
  if(spiritChecks.includes(option.id)) return {...option,check:'spirit'};
  const investigation=investigationFor(option.id);
  return investigation && !s.milestones.includes('retry:'+option.id)
   ? {...option,label:option.label+' · ทดสอบ DC 12',check:'investigation',background:investigation.background,deception:investigation.deception}
   : option;
 });
}
export function applyCaseAction(current:CaseState, id:unknown, rollD20:()=>number, actor?: {character:Character;boost?:'focus'|'background'|'deception'|'diagnostic';backgroundUsed:boolean;onBoost:()=>void;inEncounter?:boolean;playerId?:string}):CaseState {
 const option=caseOptions(current,!!actor).find(option=>option.id===id);
 if(!option) throw Error('ทำรายการนี้ในคดีไม่ได้');
 const s=structuredClone(current);
 const [kind,target]=option.id.split(':');
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
 const check=(dc:number, attribute:Attribute='knowledge', partial=false) => {
  if(actor) {
   if(attribute==='spirit' && actor.character.sanity===0) throw Error('ตื่นตระหนกจนทดสอบจิตวิญญาณไม่ได้');
   const result=resolveCheck({dc,attribute:actor.character.stats[attribute],boost:actor.boost==='diagnostic' || actor.boost==='deception' ? 'focus' : actor.boost,partial},rollD20);
   if(actor.boost) actor.onBoost();
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
   tick(s,actor?.inEncounter ? 0 : option.minutes);
   return s;
  }
 }
 switch(kind) {
  case 'talk': speak(s,target);break;
  case 'approach-cellar': s.milestones.push('approached-cellar');break;
  case 'confront':
   s.wichai!.status='traveling';s.wichai!.nextMove=s.minute+10;addFact(s,'confronted');break;
  case 'detain': case 'surrender': {
   const dc=kind==='detain' || (accountable(s) && s.evacuated.length===3)?12:15;
   if(check(dc,kind==='detain'?'body':'mind')==='success') s.wichai!.status='detained';
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
   if(check(12+penalty)==='success') s.seals[2]=true;
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
 if(kind==='finish') addFact(s,'withdrawn');
 if(kind!=='travel') s.decisions.push(s.notice);
 tick(s,actor?.inEncounter ? 0 : option.minutes);
 if(kind==='finish'&&!s.report) {
  if(!s.seals[2]) finish(s,s.evacuated.length===3?'C':'D');
  else finish(s,s.evacuated.length===3&&s.ghost==='freed'&&accountable(s)?'A':'B');
 }
 return s;
}
export function caseDmView(s:CaseState) {
 return {...dmSceneScript(s.site),choices:caseOptions(s,true).filter(option=>option.id.startsWith('talk:') || option.id==='approach-cellar')};
}
export function caseView(s:CaseState, upgraded=false) {
 return {title:mission.title,location:mission.locations.find(location=>location.id===s.site)!.name,
  time:time(s.minute),notice:s.notice,haunt:s.haunt,rescued:s.evacuated.length,escorting:s.escorts.length,
  evidence:s.evidence.length,seals:s.seals.filter(Boolean).length,progress:s.progress,containment:s.containment,
  ghost:s.ghost==='hidden'?null:ghostLabels[s.ghost],report:s.report,actions:caseOptions(s,upgraded)};
}
