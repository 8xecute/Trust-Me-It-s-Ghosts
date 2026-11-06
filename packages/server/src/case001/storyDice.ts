import { readFileSync } from 'node:fs';
import type { LiteStats } from '@baan/shared';
import { emitCaseBeat } from './case001.js';
import { addFact, advanceStory, hasFact } from './caseStory.js';
import type { World } from '../world.js';

type Outcome = 'full'|'partial'|'failure';
type Stat = keyof LiteStats;
type Check = {
 id:string; scene_id:string; title:string; stat:string; dc:number; partial_margin:number;
 trigger:string; baseline:string; bypass:string; fallback:string;
 full:Branch; partial:Branch; failure:Branch;
};
type Branch = {dm:string;dialogue:string;information:string[]};
export type StoryRoll = {actor:string;stat:Stat;dc:number;die:number;total:number;outcome:Outcome;context:string};

const read=(name:string)=>JSON.parse(readFileSync(new URL('../../scenarios/case-001/'+name,import.meta.url),'utf8'));
const pack=read('case-001.v4.1.dice.json') as {checks:Check[]};
const flow=read('case-001.v4.1.flow.json') as {scenes:{id:string;investigation_checks?:string[]}[]};
const mapped=new Map(flow.scenes.flatMap(scene=>(scene.investigation_checks ?? []).map(id=>[id,scene.id] as const)));
if(pack.checks.length!==16 || mapped.size!==16 || new Set(pack.checks.map(check=>check.id)).size!==16 ||
 pack.checks.some(check=>mapped.get(check.id)!==check.scene_id || ![11,14,17].includes(check.dc) ||
 check.partial_margin!==3 || !/^(BODY|PER|INT|SOC|SPI|RES)(\|(BODY|PER|INT|SOC|SPI|RES))?$/.test(check.stat) ||
 ![check.full,check.partial,check.failure].every(branch=>branch?.dm && branch?.dialogue && Array.isArray(branch.information)))) {
 throw Error('ข้อมูลจุดทอย CASE 001 v4.1 ไม่ตรงกับลำดับฉาก');
}

export const storyCheckHelp=pack.checks.map(({id,scene_id,title,stat,dc,trigger,baseline,bypass,fallback})=>({id,scene_id,title,stat,dc,trigger,baseline,bypass,fallback}));

function availableChecks(w:World,player:string) {
 const s=w.case001, character=w.characters?.[player];
 if(!s || s.diceVersion!=='4.1' || s.report || !character?.hp || !character.coreStats ||
   w.humanDmId===player || w.caseMap?.sites[player]!==s.site) return [];
 const battle=w.caseMap?.battle;
 const has=(id:string)=>s.evidence.includes(id);
 const fact=(id:string)=>hasFact(s,id);
 const fired=(id:string)=>s.story?.firedTriggers.includes(id) ?? false;
 const delivered=(id:string)=>!w.dmSession ? fired(id) :
   w.narrative?.records.some(beat=>beat.eventId===id && beat.recipients.includes(player));
 const tonSpoke=fired('dialogue-black-bundle') || fired('dialogue-cart');
 const exposedWichai=fact('current-testimony');
 const gateCorroborated=has('E07') && fact('gate-testimony');
 const supportKaew=fact('gate-truth') && (exposedWichai || s.wichai?.status==='detained');
 const frightened=s.opened && s.evacuated.length===0 && s.escorts.length===0;
 const wInScene=s.wichai?.site===s.site && s.wichai.status!=='detained';
 const eligible:Record<string,boolean|undefined>={
  A2_RADIO_ECHO:delivered('arrival-radio'),
  B2_WICHAI_TELL:wInScene && !exposedWichai && !(has('E08') && has('E02')) &&
   (fired('dialogue-wichai-land') || fired('dialogue-grove-alibi')),
  B3_TON_DISCLOSURE:tonSpoke && !has('E08'),
  B4_FLOOD_PHOTO:fact('v41-photo'),
  C2_LAND_PATTERN:has('E02'),
  C3_SPIRIT_RESIDUE:delivered('EV02') && (has('E01') || has('E02')),
  C4_DROWNED_ECHO_VISION:battle?.id==='EN01' && battle.active===player &&
   !fact('memory-fragment') && battle.enemies.some(enemy=>enemy.state.phase!=='resolved') && (w.turns[player]?.ap ?? 0)>=2,
  C5_EVACUATION_RECORDS:fact('met-boonmee') && fired('EV15'),
  D2_BINDING_PATTERN:has('E04') && !s.seals[2],
  D3_KAEW_CONTACT:fired('dialogue-spirit-controller') && (s.ghost==='cautious' || s.ghost==='hostile') && !s.seals[2],
  D5_CART_TRACKS:has('E06'),
  E3_HOSTAGES_ORDER:frightened,
  E4_BRACELET_DECODE:s.key && !s.seals[2],
  E5_WICHAI_NEGOTIATE:wInScene && !fact('v41-wichai-cooperating') && !(exposedWichai && s.evacuated.length===3),
  H1_FLOOD_TIMELINE:gateCorroborated && !fact('gate-truth') && !fact('confessed'),
  F5_KAEW_RECONCILE:s.seals[2] && (s.ghost==='hostile' || s.ghost==='cautious') && !(supportKaew && s.trust>=2),
 };
 return pack.checks.flatMap(check=>{
  const scene=check.scene_id[0];
  const siteMatches=scene==='H' ? ['B','C','E'].includes(s.site) : (scene==='F'?'E':scene)===s.site;
  if(!siteMatches || !eligible[check.id] || (battle && check.id!=='C4_DROWNED_ECHO_VISION')) return [];
  const attempts=s.storyChecks?.[check.id] ?? [];
  if(attempts.some(roll=>roll.outcome==='full')) return [];
  return check.stat.split('|').flatMap(raw=>{
   const stat=raw as Stat;
   if(stat==='SPI' && character.sanity===0) return [];
   // Only a different approach or new, relevant support allows another attempt.
   const support=check.id==='F5_KAEW_RECONCILE' ? [supportKaew, s.trust>=2] :
    check.id==='E5_WICHAI_NEGOTIATE' ? [exposedWichai,has('E02')] :
    check.id==='B4_FLOOD_PHOTO' ? [has('E07')] : [];
   const context=JSON.stringify([stat,...support]);
   return attempts.some(roll=>roll.context===context) ? [] : [{check,stat,context}];
  });
 });
}

export const isStoryCheck=(id:unknown)=>typeof id==='string' && id.startsWith('dice:');

export function storyCheckOptions(w:World,player:string) {
 return availableChecks(w,player).map(({check,stat})=>({
  id:'dice:'+check.id+':'+stat,
  label:check.title+(check.stat.includes('|') ? stat==='SOC'?' · ใช้คำพูด':' · เชื่อมถึงวิญญาณ' : ''),
  minutes:0,
  check:stat==='SPI'?'spirit' as const:stat==='SOC'?'social' as const:'investigation' as const,
  dice:{stat,dc:check.dc,ap:check.id==='C4_DROWNED_ECHO_VISION'?2:0},
 }));
}

export function runStoryCheck(w:World,player:string,actionId:string,boost:unknown,roll:()=>number) {
 const entry=availableChecks(w,player).find(({check,stat})=>actionId==='dice:'+check.id+':'+stat);
 if(!entry) throw Error('การทดสอบนี้ทำไม่ได้ในสถานการณ์ปัจจุบัน');
 const {check,stat,context}=entry;
 const s=w.case001!, character=w.characters![player];
 if(boost!==undefined && boost!=='focus') throw Error('การทดสอบนี้ใช้โบนัสสมาธิได้เท่านั้น');
 if(boost==='focus' && (character.focus<1 || character.sanity===0)) throw Error('สมาธิไม่พอ');
 const die=roll();
 if(!Number.isInteger(die)||die<1||die>20) throw Error('ผลทอยไม่ถูกต้อง');
 const total=die+character.coreStats![stat]+(boost==='focus'?2:0);
 const outcome=total>=check.dc?'full':total>=check.dc-check.partial_margin?'partial':'failure';
 const attempts=(s.storyChecks ??= {});
 (attempts[check.id] ??= []).push({actor:player,stat,dc:check.dc,die,total,outcome,context});
 if(boost==='focus') character.focus--;
 if(check.id==='C4_DROWNED_ECHO_VISION') w.turns[player].ap-=2;
 w.lastCheck={playerId:player,die,total,outcome:outcome==='full'?'success':outcome};
 if(outcome==='full') {
  if(['B2_WICHAI_TELL','B3_TON_DISCLOSURE','C2_LAND_PATTERN'].includes(check.id)) addFact(s,'v41-wichai-suspected');
  if(['B4_FLOOD_PHOTO','C5_EVACUATION_RECORDS'].includes(check.id)) addFact(s,'v41-flood-partial');
  if(check.id==='C4_DROWNED_ECHO_VISION') addFact(s,'memory-fragment');
  if(check.id==='E4_BRACELET_DECODE') addFact(s,'v41-ritual-prepared');
  if(check.id==='E5_WICHAI_NEGOTIATE') addFact(s,'v41-wichai-cooperating');
  if(check.id==='D3_KAEW_CONTACT' && (s.seals[0] || s.milestones.includes('show-clue'))) s.trust=Math.max(s.trust,2);
  if(check.id==='H1_FLOOD_TIMELINE') {
   addFact(s,'v41-flood-evidence');
   addFact(s,'gate-truth');
   if(s.site==='B') addFact(s,'confessed');
  }
  if(check.id==='F5_KAEW_RECONCILE' && hasFact(s,'gate-truth') &&
   (hasFact(s,'current-testimony') || s.wichai?.status==='detained')) s.ghost='pacified';
 }
 if(outcome==='partial') {
  if(check.id==='C4_DROWNED_ECHO_VISION') addFact(s,'v41-ghost-trace');
  if(check.id==='E4_BRACELET_DECODE') addFact(s,'v41-ritual-basic');
  if(check.id==='H1_FLOOD_TIMELINE') addFact(s,'v41-flood-partial');
 }
 if(check.id==='E3_HOSTAGES_ORDER') addFact(s,'current-testimony');
 const branch=check[outcome];
 const text=[branch.dm,availableDialogue(w,check.id,outcome,branch.dialogue)].filter(Boolean).join('\n');
 s.notice=text;
 emitCaseBeat(s,actionId,text,'party',s.site);
 s.narrativeEvents!.at(-1)!.actor=player;
 advanceStory(s);
}

function availableDialogue(w:World,id:string,outcome:Outcome,dialogue:string) {
 const s=w.case001!;
 const kaewPresent=s.ghost==='cautious' || s.ghost==='hostile' || s.ghost==='pacified';
 const wichaiPresent=s.wichai?.site===s.site && s.wichai.status!=='detained';
 if(id==='H1_FLOOD_TIMELINE' && s.site!=='B') return;
 if(id==='D2_BINDING_PATTERN' && !kaewPresent) return;
 if(id==='D5_CART_TRACKS' && (outcome==='failure' || !kaewPresent)) return;
 if(id==='E4_BRACELET_DECODE' && (outcome==='full' ? !kaewPresent : !wichaiPresent)) return;
 return dialogue;
}

export function learnedStoryInformation(state:import('./case001.js').CaseState) {
 const rank={failure:0,partial:1,full:2};
 return pack.checks.flatMap(check=>{
  const best=state.storyChecks?.[check.id]?.reduce((a,b)=>rank[b.outcome]>rank[a.outcome]?b:a);
  if(!best) return [];
  return check[best.outcome].information.map((text,index)=>({id:check.id+':'+index,text,source:check.title}));
 });
}
