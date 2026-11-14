import {combatFlavour,type CombatFlavour} from './combatFlavour.js';
import { noTimer } from './v51Content.js';
import {caseGrid as caseGridForSession} from '@baan/shared';
import { randomInt } from 'node:crypto';
import { characterMaxHp, characterAttribute, liteGhostHP, professions, turnSkills, powerAttacks } from '@baan/shared';
import { readFileSync } from 'node:fs';
import {
  ghostDecision, resolveCheck, spendAP, startGhostEncounter, startTurn, type GhostEncounter, type GhostGrid,
} from '@baan/shared';
import { advanceTactics, applyTechnique, negotiateV2, newTactics, resolveNpcAttack, stabilize, strikeV2, type Tactics } from '../tacticalEncounter.js';
import { caseNarration, emitCaseBeat, type CaseState, type Site } from './case001.js';
import { type CaseAttack, caseCombatStats } from './caseCombatStats.js';
import { addFact, hasFact, v4 } from './caseStory.js';
import type { Cell, World } from '../world.js';

type EnemyKind = 'drowned_echo'|'bound_wraith'|'ritual_guardian'|'kaew_boss';
type EncounterId = 'EN01'|'EN02'|'EN03'|'EN04';
const definitions = JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.encounters.json',import.meta.url),'utf8')) as
  Record<EncounterId,{site:Site;title:string;roster:EnemyKind[];turnRoster55?:EnemyKind[];sharedHp55?:boolean;sharedHpBase55?:number}>;
type PacifyResponse={response:'hesitate'|'respond';description:string;success:string};
const pacifyResponses=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.pacify-v55.json',import.meta.url),'utf8')) as Partial<Record<EncounterId,PacifyResponse>>;
const pacifyResponse=(w:World,b:CaseBattle)=>w.case001?.guided?.version==='5.5' && b.turnEncounter ? pacifyResponses[b.id] : undefined;
const enemies = {
  drowned_echo:{name:'ผีเงาจมน้ำ',hp:3},
  bound_wraith:{name:'ผีด้ายดำ',hp:4},
  ritual_guardian:{name:'ผีเฝ้าเรือน',hp:6},
  kaew_boss:{name:'แม่แก้ว',hp:12},
};
type Enemy = {maxHp?:number;id:string;kind:EnemyKind;state:GhostEncounter;tactics:Tactics};
type TurnBeat = {
  round:number; actor:string; label:string; target?:string;actorName?:string;targetName?:string;intendedTarget?:string;intendedTargetName?:string;
  changes?:{id:string;name:string;hp?:{before:number;after:number};sanity?:{before:number;after:number};focus?:{before:number;after:number}}[];
  check?:Pick<NonNullable<World['lastCheck']>,'die'|'total'|'outcome'>;
  effect?:string;flavour?:CombatFlavour;
};
type TurnEncounter = {powerUsed?:string[];unsteady?:Record<string,number>;shaken?:Record<string,number>;conditions?:{ward:Record<string,boolean>;cover:Record<string,string>;silenced:Record<string,boolean>};acted:string[]; maxHp:number; history:TurnBeat[];declared?:{attackId:string;targetId:string;round:number}};
export interface CaseBattle {
  id:EncounterId;site:Site;title?:string;round:number;active:string|null;enemies:Enemy[];
  phase?:'chains'|'flood_memory'|'choice';
  initiative?: (string|null)[];
  turnEncounter?:TurnEncounter;
  projections:Cell[];
  armorDisabled?:boolean;
  focusCell?:Cell;
  flooded?:Cell[];
  final55?:{step:0|1|2|3;shield:'up'|'down';actionWindow:boolean;ritualActor?:string;damageBlocked?:boolean;trustUsed?:boolean;withheldAttack?:boolean};
}
export interface CaseMap {
  npcPlacements?:Partial<Record<Site,import('@baan/shared').CaseNpcPlacement[]>>;
  sites:Record<string,Site>;
  positions:Partial<Record<Site,Record<string,Cell>>>;
  completed:EncounterId[];
  rounds:number;
  battle?:CaseBattle;
  turnConclusion?:{site?:Site;outcome:'escaped'|'lost'|'pacified'|'won';check?:TurnBeat['check'];history?:TurnBeat[]};
}
export const newCaseMap = (players:Record<string,Cell>):CaseMap => ({
  sites:Object.fromEntries(Object.keys(players).map(id=>[id,'A'])),
  positions:{A:structuredClone(players)},completed:[],rounds:0,
});
const distance=(a:Cell,b:Cell)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const fail=(reason='ทำรายการนี้ไม่ได้'):never=>{throw Error(reason);};
const points=(grid:GhostGrid)=>Array.from({length:grid.width*grid.height},(_,i)=>({x:i%grid.width,y:Math.floor(i/grid.width)}));
const localPlayers=(w:World,site:Site)=>Object.fromEntries(Object.entries(w.players)
  .filter(([id])=>id!==w.humanDmId && !w.inactivePlayers?.includes(id) && (w.caseMap!.sites[id] ?? 'A')===site));
const readyPlayers=(w:World,site:Site)=>Object.keys(localPlayers(w,site)).filter(id=>(w.characters?.[id]?.hp ?? 0)>0);
export function removeCasePlayer(w:World,id:string,gridFor:(site:Site)=>GhostGrid,roll:()=>number,completeRound:()=>void) {
  const map=w.caseMap;
  if(!map) return;
  delete map.sites[id];
  for(const saved of Object.values(map.positions)) delete saved[id];
  const battle=map.battle;
  if(battle?.turnEncounter) {
    if(!readyPlayers(w,battle.site).length) {
      completeRound();
      if(map.battle===battle) finishCaseBattle(w);
    } else if(battle.active===id) selectTurnPlayer(w,battle);
    return;
  }
  if(battle?.active===id) {
    if(battle.initiative) return nextCombatTurn(w,battle,gridFor(battle.site),roll,battle.initiative.indexOf(id),completeRound);
    battle.active=readyPlayers(w,battle.site)[0] ?? null;
    if(!battle.active) finishCaseBattle(w);
  }
}
const activeEnemies=(b:CaseBattle)=>b.enemies.filter(enemy=>enemy.state.phase!=='resolved');
const peacefulBattle=(b:CaseBattle)=>b.turnEncounter && b.enemies.length>1 ?
  b.enemies.every(enemy=>enemy.state.outcome==='pacified') : b.enemies.some(enemy=>enemy.state.outcome==='pacified');

export function travelCaseMap(w:World, actor:string, site:Site, grid:GhostGrid) {
  const map=w.caseMap!;
  const previous=map.sites[actor] ?? 'A';
  (map.positions[previous] ??= {})[actor]=w.players[actor];
  const occupied=Object.values(localPlayers(w,site));
  const stored=map.positions[site]?.[actor];
  const candidates=points(grid).sort((a,b)=>distance(a,stored ?? {x:4,y:7})-distance(b,stored ?? {x:4,y:7}));
  const cell=candidates.find(p=>![...occupied,...grid.blocked,...(map.battle?.site===site?activeEnemies(map.battle).map(e=>e.state.ghost):[])].some(q=>distance(p,q)===0));
  if(!cell) return fail('ไม่มีช่องว่างในสถานที่');
  map.sites[actor]=site;
  w.players[actor]=cell;
}

export function caseOpportunity(s:CaseState,map:CaseMap):EncounterId|undefined {
  const available=(id:EncounterId)=>!map.completed.includes(id) && definitions[id].site===s.site;
  if(s.report || map.battle) return;
  if(s.guided?.version==='5.5' && s.site==='E' && s.v51?.finalReleaseCommitted55 && !s.seals[2] && available('EN04'))return 'EN04';
  if(s.storyVersion===4) {
    if(available('EN01') && (s.evidence.includes('E01') || s.evidence.includes('E02'))) return 'EN01';
    if(available('EN02') && !s.seals[2] && (s.ghost==='cautious' || s.ghost==='hostile') && (!noTimer(s) || s.milestones.includes('kaew-engaged'))) return 'EN02';
    if(s.guided?.version!=='5.5' && (!s.guided || s.guided.phase==='FINAL' && !hasFact(s,'kaew-dispersed')) && available('EN04') && !s.seals[2] && s.seals[0] && s.seals[1] && s.evidence.includes('E05') &&
      (s.ghost==='hostile' || (noTimer(s) ? s.guided?.phase==='FINAL' && !!s.v51?.coreApproached : s.minute>=210 || s.milestones.includes('unsafe-bracelet')))) return 'EN04';
    return;
  }
  if(available('EN04') && s.seals[0] && s.seals[1] && !s.seals[2] && s.ghost!=='pacified' && (s.ghost==='hostile' || s.haunt>=6)) return 'EN04';
  if(available('EN03') && (s.key || s.opened) && !s.seals[2]) return 'EN03';
  if(available('EN02') && !s.seals[2] && (s.ghost==='hostile' || s.haunt>=6 || s.milestones.includes('grove-disturbed'))) return 'EN02';
  if(available('EN01') && s.evidence.includes('E01')) return 'EN01';
}

export function startCaseBattle(w:World,actor:string,grid:GhostGrid,roll:()=>number=()=>randomInt(1,21)) {
  const map=w.caseMap!, site=map.sites[actor] ?? 'A';
  const id=caseOpportunity({...w.case001!,site},map) ?? fail('ยังไม่มีการเผชิญหน้าที่นี่');
  const isV4=w.case001!.storyVersion===4;
  const party=readyPlayers(w,site);
  if(!party.includes(actor)) return fail();
  const count=Math.max(2,party.length);
  const combat=isV4 && id!=='EN03' ? caseCombatStats[id] : undefined;
  const turnEncounter=['EN01','EN02','EN04'].includes(id) && noTimer(w.case001!) && !!w.humanDmId && !!combat;
  const occupied=[...Object.values(localPlayers(w,site)),...grid.blocked];
  const slots=points(grid).reverse().filter(p=>!occupied.some(q=>distance(p,q)===0));
  const roster:EnemyKind[]=turnEncounter && w.case001!.guided?.version==='5.5' && definitions[id].turnRoster55 ? definitions[id].turnRoster55! : isV4 ? [id==='EN01' ? 'drowned_echo' : 'kaew_boss'] : definitions[id].roster.slice(0,count<=2 ? (id==='EN01'||id==='EN04'?1:2) : 3);
  const members=roster.map((kind,index)=>{
    const state=startGhostEncounter(w.players[actor],slots[index]);
    const partySize=w.case001!.guided?.version==='5.5'?party.length:Object.keys(localPlayers(w,site)).length;
    state.ghostHealth=combat ? liteGhostHP(combat.baseHPFor2,Math.max(2,Math.min(w.basicMode && w.case001!.guided?.version!=='5.5'?4:6,partySize))) : kind==='kaew_boss' && (!isV4 || id==='EN04') ?Math.min(20,8+4*count):enemies[kind].hp;
    if(combat && turnEncounter && w.case001!.guided?.version==='5.5' && definitions[id].sharedHp55){
      const pool=liteGhostHP(definitions[id].sharedHpBase55 ?? combat.baseHPFor2,Math.max(2,Math.min(6,partySize)));state.ghostHealth=Math.floor(pool/roster.length)+Number(index<pool%roster.length);
    }
    const tactics=newTactics({combat,movement:combat?.MOVE ?? (kind==='kaew_boss'?3:1),armor:kind==='ritual_guardian'?1:0,
      special:kind==='drowned_echo'?'wail':kind==='kaew_boss'?undefined:'lash',restrains:kind!=='ritual_guardian',
      boss:kind==='kaew_boss' && (!isV4 || id==='EN04'),canPacify:kind!=='kaew_boss' || isV4 && id==='EN02',anchorActive:kind==='kaew_boss' && (!isV4 || id==='EN04')});
    return {id:id+'-'+(index+1),maxHp:state.ghostHealth,kind,state,tactics};
  });
  const projectionCount=isV4 && hasFact(w.case001!,'kaew-dispersed') ? 1 : 2;
  map.battle={id,site,...(isV4 && id==='EN02' ? {title:'เผชิญหน้าแม่แก้วในสวน'} : {}),round:1,active:party[0],enemies:members,
    ...(id==='EN04'?{phase:'chains' as const}:{}),projections:id==='EN04'?slots.slice(roster.length,roster.length+projectionCount):[],
    ...(turnEncounter ? {turnEncounter:{acted:[],maxHp:members[0].state.ghostHealth,history:[]}} :
      id==='EN03'||id==='EN01' ? {focusCell:slots[roster.length]} : {})};
  if(id==='EN04' && w.case001!.guided?.version==='5.5') {
    map.battle.final55={step:0,shield:'up',actionWindow:false};
    map.battle.projections=[];
    map.battle.focusCell=slots[roster.length];
    members[0].tactics.profile!.anchorActive=false;
    w.case001!.v51!.finalDefense55=true;
    w.case001!.v51!.finalBody55='embodied';
    w.case001!.v51!.KAEW_TEMP_DISPERSED=false;
  }
  for(const player of party) w.turns[player]=startTurn();
  if(combat && !turnEncounter) {
    const initiative=[...party.map(player=>({player,bonus:characterAttribute(w.characters![player],'mind')})),
      {player:null,bonus:combat.INIT}].map(entry=>({...entry,total:roll()+entry.bonus}));
    initiative.sort((a,b)=>b.total-a.total || Number(a.player===null)-Number(b.player===null) ||
      b.bonus-a.bonus || (a.player ?? '').localeCompare(b.player ?? ''));
    map.battle.initiative=initiative.map(entry=>entry.player);
    nextCombatTurn(w,map.battle,grid,roll,-1,()=>{});
  }
  if(map.battle.final55)map.battle.final55.actionWindow=true;
  w.case001!.notice=map.battle.title ?? definitions[id].title;
  const script=isV4 ? v4.encounters[id] : caseNarration.encounters[id];
  let text=script.start;
  if(isV4 && id==='EN04') {
    const s=w.case001!;
    const prior=hasFact(s,'kaew-dispersed') ? 'won' : hasFact(s,'kaew-fled') ? 'fled' : hasFact(s,'kaew-talked') ? 'talked' : undefined;
    if(prior) text+='\n'+v4.finalArrival[prior];
  }
  if(!w.case001!.v51 && !(w.case001!.guided && id==='EN01')) {
    emitCaseBeat(w.case001!,id+':start',text);
    w.case001!.narrativeEvents!.at(-1)!.site=site;
  }
}

export function finishCaseBattle(w:World,escaped=false) {
  const map=w.caseMap!, battle=map.battle!;
  if(battle.turnEncounter) {
    const outcome=escaped?'escaped':!readyPlayers(w,battle.site).length?'lost':
      peacefulBattle(battle)?'pacified':'won';
    map.turnConclusion={site:battle.site,outcome,check:battle.turnEncounter.history.at(-1)?.check,history:structuredClone(battle.turnEncounter.history)};
  }
  if(!map.completed.includes(battle.id)) map.completed.push(battle.id);
  const s=w.case001;
  if(s?.storyVersion===4 && !s.report) {
    const script=v4.encounters[battle.id];
    const pacified=peacefulBattle(battle);
    if(s.v51 && battle.id==='EN04') {delete map.battle;return;}
    if(s.v51 && (battle.id==='EN01' || battle.id==='EN02')) {
      const lost=!Object.entries(w.characters ?? {}).some(([id,c])=>id!==w.humanDmId && !w.inactivePlayers?.includes(id) && !!w.players[id] && map.sites[id]===battle.site && c.hp>0);
      const result=escaped?'escaped':lost?'lost':pacified?'pacified':'won';
      if(battle.id==='EN01') {
        s.v51.GHOST_ENCOUNTER=result;
        if(pacified)s.v51.GHOST_CLUE='vision';
        else if(result==='won' && s.v51.GHOST_CLUE==='none')s.v51.GHOST_CLUE='trace';
      } else {
        s.v51.KAEW_D_RESULT=result==='escaped'?'fled':result==='pacified'?'talked':result;
        if(result==='won'){s.v51.KAEW_TEMP_DISPERSED=true;s.ghost='hidden';addFact(s,'kaew-dispersed');}
        if(result==='escaped')addFact(s,'kaew-fled');
        if(result==='pacified'){s.ghost='pacified';addFact(s,'kaew-talked');}
      }
      const text=battle.id==='EN01' ? {escaped:'ผีชะงักที่ธรณี',won:'ร่างแตกเหลือด้ายหนึ่งเส้น',pacified:'เห็นภาพน้ำกับคนขนสิ่งของไปทางเรือน ไม่เห็นหน้า',lost:'ทีมหมดสภาพต่อสู้'}[result] :
       {escaped:'แม่แก้วหยุดที่ขอบเขตสวน “ข้าไม่ได้อยากทำให้เจ็บ”',won:'ร่างชุดเขียวสลาย แต่เสียงยังอยู่ “ข้ายัง... ไปไหนไม่ได้”',pacified:'แม่แก้ว · ถ้าหยุดทำร้ายข้า... ข้าจะพยายามหยุด',lost:'ด้ายกระชากเธอจนฝืนเตือน “หนีไป”'}[result];
      emitCaseBeat(s,battle.id+':end',text,'local',battle.site);
      delete map.battle;return;
    }
    emitCaseBeat(s,battle.id+':end',
      escaped ? script.escaped ?? caseNarration.escape : pacified ? script.pacified ?? script.end : script.end,'local',battle.site);
    if(!escaped && battle.id==='EN01') {
      if(pacified) addFact(s,'memory-fragment');
      else if(s.diceVersion==='4.1' && !hasFact(s,'memory-fragment') &&
        battle.enemies.every(enemy=>enemy.state.outcome==='defeated')) addFact(s,'v41-ghost-trace');
    }
    if(battle.id==='EN02') {
      if(escaped) addFact(s,'kaew-fled');
      else if(pacified) {s.ghost='pacified';addFact(s,'kaew-talked');}
      else {s.ghost='hidden';addFact(s,'kaew-dispersed');}
    }
    delete map.battle;
    return;
  }
  if(w.case001 && !w.case001.report) emitCaseBeat(w.case001,battle.id+':end',escaped?caseNarration.escape:caseNarration.encounters[battle.id].end,'local',battle.site);
  if(!escaped && battle.id==='EN01' && w.case001 && !w.case001.report && battle.enemies.every(e=>e.state.phase==='resolved')) {
    w.case001.notice='ภาพประตูน้ำปรากฏชั่วครู่ก่อนเงาจะจางหาย';
    emitCaseBeat(w.case001,'EN01:vision',caseNarration.vision);
    if(w.case001.story && !w.case001.story.objectives.includes('memory-fragment')) w.case001.story.objectives.push('memory-fragment');
    w.case001.narrativeEvents!.at(-1)!.site=battle.site;
  }
  delete map.battle;
}

export function emitBattlePhase(w:World) {
 const battle=w.caseMap?.battle,s=w.case001;
 if(s?.v51)return;
 if(!battle?.phase || !s?.story || s.report) return;
 const key='narrative:'+battle.id+':'+battle.phase;
 if(s.milestones.includes(key)) return;
 s.milestones.push(key);
 emitCaseBeat(s,battle.id+':'+battle.phase,(s.storyVersion===4 ? v4.phases : caseNarration.phases)[battle.phase],'local',battle.site);
 if(battle.phase==='flood_memory' && !s.story.objectives.includes('memory-fragment')) s.story.objectives.push('memory-fragment');
}

export function syncCaseBattle(w:World) {
  const b=w.caseMap?.battle,s=w.case001;
  if(!b || !s) return;
  if(s.report) {finishCaseBattle(w);return;}
  if(b.id==='EN04' && s.seals[2]) {
    b.phase='choice';
    delete b.flooded;
    const boss=b.enemies[0];
    boss.tactics.profile!.anchorActive=false;
    if(s.storyVersion===4 || s.ghost==='freed' || s.ghost==='sealed') finishCaseBattle(w);
  } else if(b.id==='EN02') {
    for(const [i,e] of b.enemies.filter(e=>e.kind==='bound_wraith').entries()) if(s.seals[i]) e.state.phase='resolved';
    if(!activeEnemies(b).length) finishCaseBattle(w);
  }
}

const sharedFields=['reaction','used','defense','restrained','zones','devices','traps'] as const;
function localWorld(w:World,b:CaseBattle,e:Enemy):World {
  const shared=b.enemies[0].tactics;
  for(const field of sharedFields) Object.assign(e.tactics,{[field]:shared[field]});
  e.tactics.round=b.round;
  return {...w,players:localPlayers(w,b.site),activePlayer:b.active,encounter:e.state,tactics:e.tactics};
}

function selectTurnPlayer(w:World,b:CaseBattle) {
  b.active=readyPlayers(w,b.site).find(id=>!b.turnEncounter!.acted.includes(id)) ?? null;
  if(b.active) w.turns[b.active]=startTurn();
}

const entityName=(w:World,b:CaseBattle,id:string)=>{
  const enemy=b.enemies.find(e=>e.id===id),character=w.characters?.[id];
  return enemy ? enemies[enemy.kind].name+(b.enemies.length>1?' '+(b.enemies.indexOf(enemy)+1):'') : character?.playerName || character?.characterName || (character ? professions[character.profession].name : 'ผู้ร่วมฉาก');
};
const resources=(w:World,b:CaseBattle):Record<string,{hp:number;sanity?:number;focus?:number}>=>Object.fromEntries([...Object.entries(w.characters ?? {}).map(([id,c])=>[id,{hp:c.hp,sanity:c.sanity,focus:c.focus}] as const),...b.enemies.map(e=>[e.id,{hp:e.state.ghostHealth}] as const)]);
function resourceChanges(w:World,b:CaseBattle,before:ReturnType<typeof resources>):NonNullable<TurnBeat['changes']> {
  const after=resources(w,b);
  return Object.entries(before).flatMap(([id,previous])=>{
    const changes:NonNullable<TurnBeat['changes']>[number]={id,name:entityName(w,b,id)};
    for(const key of ['hp','sanity','focus'] as const)if(previous[key]!==undefined && after[id]?.[key]!==undefined && previous[key]!==after[id][key])changes[key]={before:previous[key]!,after:after[id][key]!};
    return Object.keys(changes).length>2?[changes]:[];
  });
}
function recordTurn(w:World,b:CaseBattle,beat:Omit<TurnBeat,'round'>) {
  const history=b.turnEncounter!.history;
  const check=beat.check;
  const actorName=entityName(w,b,beat.actor),targetName=beat.targetName ?? (beat.target ? entityName(w,b,beat.target):undefined);
  const flavour=w.case001?.guided?.version==='5.5' ? combatFlavour({scene:b.id,actor:actorName,target:targetName,label:beat.label,effect:beat.effect,enemyActor:b.enemies.some(enemy=>enemy.id===beat.actor),outcome:beat.check?.outcome,down:!!beat.target && w.characters?.[beat.target]?.hp===0,dispersed:!!beat.target && b.enemies.some(enemy=>enemy.id===beat.target && enemy.state.ghostHealth===0),sequence:b.round+history.length+(beat.check?.die ?? 0)}) : undefined;
  history.push({round:b.round,...beat,flavour,actorName:entityName(w,b,beat.actor),targetName:beat.targetName ?? (beat.target ? entityName(w,b,beat.target):undefined),intendedTargetName:beat.intendedTarget ? entityName(w,b,beat.intendedTarget):undefined,check:check && {die:check.die,total:check.total,outcome:check.outcome}});
  if(history.length>24) history.shift();
}

export function completeTurnPlayer(w:World,actor:string,label:string,check?:TurnBeat['check'],target?:string,effect?:string,changes?:TurnBeat['changes']) {
  const b=w.caseMap?.battle;
  if(!b?.turnEncounter || b.active!==actor) return;
  recordTurn(w,b,{actor,label,target,check,effect,changes,targetName:!target && (label.includes('อาคม') || label.includes('เกราะ') || label.includes('แรงสะท้อน') || label.includes('คำสั่ง') || label.includes('กำไล'))?'จุดอาคม / กำไล':undefined});
  b.turnEncounter.acted.push(actor);
  w.turns[actor]={...w.turns[actor],ap:0};
  if(!activeEnemies(b).length && !b.final55) finishCaseBattle(w);
  else selectTurnPlayer(w,b);
}

const turnEnemy=(b:CaseBattle)=>activeEnemies(b).find(enemy=>!b.turnEncounter!.acted.includes(enemy.id));
const npcAttacks=(b:CaseBattle,enemy=turnEnemy(b),v55=false)=>[...(enemy?.tactics.profile?.combat?.attacks ?? []).filter(attack=>!attack.requires),...(v55?ghostMoves55[b.id] ?? []:[])].filter(attack=>attack.id!=='FLOOD_MEMORY' || b.phase==='flood_memory');
const ghostMoves55=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.ghost-moves-v55.json',import.meta.url),'utf8')) as Partial<Record<EncounterId,CaseAttack[]>>;
const openingScene=(b:CaseBattle)=>b.id==='EN01'?'C4':b.id==='EN02'?'D4':'F1';

export function turnEncounterAction(w:World,actor:string,a:{round:unknown;choice:unknown;targetId?:unknown;attackId?:unknown;enemyId?:unknown;boost?:unknown;step?:unknown},
  roll:()=>number,completeRound:()=>void) {
  const b=w.caseMap?.battle;
  if(a.boost!==undefined)return fail('ยกเลิกการใช้สมาธิเพิ่มผลทอยใน encounter แล้ว');
  if(!b?.turnEncounter || a.round!==b.round || w.case001?.report) return fail('รอบนี้จบแล้ว โปรดเลือกอีกครั้ง');
  if(!w.case001?.guided?.presented.includes(openingScene(b))) return fail('รอ DM ส่งบทเปิดฉากก่อน');
  const beforeResources=resources(w,b);
  const npc=turnEnemy(b);
  const selected=b.enemies.find(enemy=>enemy.id===a.targetId);
  const enemy=actor===w.humanDmId ? npc ?? b.enemies[0] :
    a.choice==='strike' || a.choice==='powerStrike' || a.choice==='pacify' || a.choice==='observe' || a.choice==='classSkill' && w.characters?.[actor] && turnSkills[w.characters[actor].profession].target==='enemy' ? selected ?? (b.enemies.length===1 ? b.enemies[0] : undefined) : b.enemies[0];
  if(!enemy)return fail('เลือกผีเป้าหมายก่อน');
  if(actor===w.humanDmId) {
    if(b.active) return fail('ยังไม่ถึงตาของผี');
    if(b.enemies.length>1 && (!npc || a.enemyId!==npc.id))return fail('ตาของผีเปลี่ยนแล้ว โปรดเลือกอีกครั้ง');
    if(a.choice==='withdraw') {
      if(b.id==='EN04')return fail('การถอยของผีไม่หยุดพิธี ให้เลือกผ่านตา');
      recordTurn(w,b,{actor:enemy.id,label:'ผีถอยกลับไปในคราบน้ำ',effect:'ผีตัวนี้หยุดต่อสู้แล้ว'});
      enemy.state.phase='resolved';
      enemy.state.outcome='defeated';
      if(!activeEnemies(b).length){finishCaseBattle(w);return;}
    } else if(a.choice==='attack' || a.choice==='declareAttack') {
      if(!activeEnemies(b).length || b.final55?.withheldAttack || (enemy.tactics.calmUntil ?? 0)>=b.round)return fail('ผีไม่มีการโจมตีในตานี้');
      const attack=npcAttacks(b,enemy,w.case001?.guided?.version==='5.5').find(option=>option.id===a.attackId);
      const target=a.targetId;
      if(attack?.targetDefense==='MDEF' && b.turnEncounter.conditions?.silenced[enemy.id])return fail('ผีถูกสะกดเสียงในตานี้');
      if(!attack || typeof target!=='string' || !readyPlayers(w,b.site).includes(target)) return fail('เลือกท่าและผู้สืบสวนที่ยังลงมือได้');
      if(a.choice==='declareAttack') {
        enemy.tactics.telegraph={kind:attack.targetDefense==='MDEF'?'wail':'lash',attack,cells:[{...w.players[target]}]};
        b.turnEncounter.declared={attackId:attack.id,targetId:target,round:b.round};
        recordTurn(w,b,{actor:enemy.id,target,label:'ประกาศ '+attack.name_th,effect:attack.telegraphOneBossTurnBeforeUse?'เตรียมท่า ต้องรอหนึ่งตาผีก่อนใช้':'ประกาศท่าแล้ว ยังไม่ทอยและยังไม่มีความเสียหาย'});
        if(!attack.telegraphOneBossTurnBeforeUse)return;
      } else {
        if(attack.telegraphOneBossTurnBeforeUse && (!b.turnEncounter.declared || b.turnEncounter.declared.round>=b.round))return fail('ท่านี้ต้องประกาศล่วงหน้าหนึ่งตาผี');
        if(b.id==='EN04' && (enemy.tactics.telegraph?.attack?.id!==attack.id ||
          !enemy.tactics.telegraph.cells.some(cell=>distance(cell,w.players[target])===0)))return fail('ประกาศท่าและเป้าหมายก่อนโจมตี');
        const cover=attack.damageResource==='HP' ? b.turnEncounter.conditions?.cover[target] : undefined;
        const victim=cover && readyPlayers(w,b.site).includes(cover) ? cover : target;
        if(cover)delete b.turnEncounter.conditions!.cover[target];
        const wardAvailable=!!b.turnEncounter.conditions?.ward[victim];
        const result=resolveNpcAttack(w.characters![victim],attack,enemy.tactics.profile!.combat!.ATK,roll(),
          b.enemies[0].tactics.defense[victim]===b.round,wardAvailable?1:0);
        const warded=wardAvailable && result.outcome==='success' && attack.damage>0;
        if(warded)delete b.turnEncounter.conditions!.ward[victim];
        if(result.outcome==='success' && attack.condition==='ROOTED')for(const member of b.enemies)member.tactics.restrained[victim]=b.round+1;
        if(result.outcome==='success' && attack.condition==='SHAKEN')(b.turnEncounter.shaken ??= {})[victim]=b.round+1;
        if(result.outcome==='success' && attack.condition==='GUARD_BREAK'){
          for(const member of b.enemies)delete member.tactics.defense[victim];
          (b.turnEncounter.unsteady ??= {})[victim]=b.round+1;
        }
        recordTurn(w,b,{actor:enemy.id,target:victim,intendedTarget:victim!==target?target:undefined,changes:resourceChanges(w,b,beforeResources),label:attack.name_th,check:result,effect:(victim!==target?'รับการโจมตีแทนเพื่อน · ':'')+(warded?'ยันต์รับความเสียหาย 1 · ':'')+(result.damage ?
          (attack.damageResource==='HP'?'การโจมตีกระแทกเข้าร่าง เป้าหมายเสียพลังชีวิต ':'เสียงหลอนแทรกเข้าจิต เป้าหมายเสียสติ ')+result.damage : 'เป้าหมายไม่เสียพลังชีวิตหรือสติ')+(result.outcome==='success' && attack.condition==='ROOTED'?' · ถูกพันธนาการถึงรอบหน้า':result.outcome==='success' && attack.condition==='SHAKEN'?' · หวาดกลัวถึงรอบหน้า':result.outcome==='success' && attack.condition==='GUARD_BREAK'?' · แนวตั้งรับถูกทำลาย เสียหลักถึงรอบหน้า':'')});
      }
    } else if(a.choice==='pass') recordTurn(w,b,{actor:enemy.id,label:(enemy.tactics.calmUntil ?? 0)>=b.round?'ผีชะงักตามเสียงเรียก': 'รอดูท่าที',effect:(enemy.tactics.calmUntil ?? 0)>=b.round?'งดโจมตีตานี้ แต่ยังไม่จบการเผชิญหน้า':undefined});
    else return fail();
    if(a.choice!=='declareAttack') {
      delete enemy.tactics.telegraph;
      delete b.turnEncounter.declared;
    }
    if(b.final55)delete b.final55.withheldAttack;
    b.turnEncounter.acted.push(enemy.id);
    if(!readyPlayers(w,b.site).length) {completeRound();if(w.caseMap?.battle===b)finishCaseBattle(w);return;}
    if(turnEnemy(b))return;
    for(const member of b.enemies)member.tactics.defense={};
    completeRound();
    if(w.caseMap?.battle!==b) return;
    if(!readyPlayers(w,b.site).length) return finishCaseBattle(w);
    b.round++;
    delete b.turnEncounter.conditions;
    if(b.turnEncounter.unsteady)for(const [id,until] of Object.entries(b.turnEncounter.unsteady))if(until<b.round)delete b.turnEncounter.unsteady[id];
    if(b.turnEncounter.shaken)for(const [id,until] of Object.entries(b.turnEncounter.shaken))if(until<b.round)delete b.turnEncounter.shaken[id];
    b.turnEncounter.acted=[];
    selectTurnPlayer(w,b);
    return;
  }
  if(b.active!==actor || !readyPlayers(w,b.site).includes(actor)) return fail('ยังไม่ถึงตาของคุณ');
  if(w.dmSession?.checks[actor] || w.dmSession?.rolls[actor]?.die===null) return fail('จัดการคำขอทอยที่ค้างก่อน');
  if((a.choice==='strike' || a.choice==='powerStrike' || a.choice==='pacify') && enemy.state.phase==='resolved')return fail('ผีเป้าหมายจบการเผชิญหน้าแล้ว');
  const expanded=w.case001?.guided?.version==='5.5';
  const character=w.characters![actor];
  if((a.choice==='observe' || a.choice==='encourage') && !expanded)return fail('ยังใช้การกระทำนี้ไม่ได้');
  if(a.choice==='observe' && (enemy.state.phase==='resolved' || enemy.state.ghostHealth===0))return fail('เลือกผีที่ยังคุกคามทีม');
  const local=localWorld(w,b,enemy);
  local.lastCheck=null;
  const restrained=expanded && (b.enemies[0].tactics.restrained[actor] ?? 0)>=b.round;
  if(restrained && (a.choice==='strike' || a.choice==='powerStrike' && powerAttacks[character.profession].physical || a.choice==='withdraw' || a.choice==='classSkill' && ['field_medic','containment_specialist'].includes(character.profession)))return fail('ถูกพันธนาการ ต้องปลดก่อนลงมือทางกาย');
  const unsteady=(b.turnEncounter.unsteady?.[actor] ?? 0)>=b.round;
  if(unsteady && (a.choice==='guard' || a.choice==='classSkill' && character.profession==='containment_specialist'))return fail('เสียหลัก ต้องตั้งหลักก่อนตั้งรับหรือยืนคุ้มกัน');
  const frightened=(b.turnEncounter.shaken?.[actor] ?? 0)>=b.round;
  if(frightened && (a.choice==='powerStrike' || a.choice==='pacify' || a.choice==='classSkill'))return fail('หวาดกลัว ต้องตั้งสติหรือให้เพื่อนช่วยก่อนใช้ท่านี้');
  let label:string, effect:string|undefined, target:string|undefined;
  switch(a.choice) {
    case 'objective':
      if(!b.final55 && !b.projections.length && (!b.focusCell || b.armorDisabled))return fail('ไม่มีจุดอาคมให้จัดการ');
      label=b.final55?['ยึดจุดรับแรงสะท้อน','แยกสายคำสั่ง','คลายปมเกราะ','ปลดกำไลอย่างควบคุม'][b.final55.step]:'คลายจุดอาคม';
      caseBattleAction(w,actor,{type:'caseObjective',step:a.step},caseGridForSession(b.site),roll,completeRound,true);
      local.lastCheck=w.lastCheck;
      if(w.caseMap?.battle!==b)return;
      effect=local.lastCheck?.outcome==='success' ? 'จุดอาคมคลายตัวตามการลงมือของผู้สืบสวน' : 'จุดอาคมยังต้านไว้ ขั้นตอนยังไม่คืบหน้า';
      break;
    case 'strike':
    case 'powerStrike': {
      const power=a.choice==='powerStrike' ? powerAttacks[character.profession] : undefined;
      if(power && (!expanded || character.sanity===0 || b.turnEncounter.powerUsed?.includes(actor)))return fail('ท่าโจมตีหนักใช้ได้ครั้งเดียวต่อ encounter และต้องมีสติ');
      if(b.final55)b.final55.damageBlocked=false;
      const before=enemy.state.ghostHealth;
      strikeV2(local,actor,roll,false,0,power);
      if(power)(b.turnEncounter.powerUsed ??= []).push(actor);
      const damage=before-enemy.state.ghostHealth;
      if(b.final55 && !enemy.state.ghostHealth) {
        w.case001!.v51!.finalBody55='dispersed';
        w.case001!.v51!.KAEW_TEMP_DISPERSED=true;
        w.case001!.v51!.kaewVoice53=true;
      }
      target=enemy.id;
      if(damage) effect='แรงขับไล่กระแทกร่างผี เสียพลังชีวิต '+damage+(enemy.state.ghostHealth===0 ? ' · ร่างผีสลาย'+(b.final55?' แต่พิธียังทำงาน':'') : '');
      else if(b.final55?.damageBlocked)effect='โจมตีโดน เกราะรับความเสียหายไว้';
      else effect='แรงขับไล่ไม่ทำให้ร่างผีเสียพลังชีวิต';
      label=power?.name ?? 'ขับไล่ผี';
      if(power)effect=(effect ?? '')+' · ใช้สิทธิ์โจมตีหนักแล้วใน encounter นี้';
      break;
    }
    case 'pacify':
      if(!enemy.tactics.profile?.canPacify)return fail('ผีตนนี้ไม่เปิดรับการกล่อมระหว่างสู้');
      negotiateV2(local,actor,roll,false,pacifyResponse(w,b)?.response);
      target=enemy.id;
      effect=pacifyResponse(w,b) ? ((local as World).lastCheck?.outcome==='success' ? pacifyResponse(w,b)!.success : 'เสียงเรียกยังไปไม่ถึง ผียังคุกคามทีมต่อ') : enemy.state.outcome==='pacified' ? 'ผีคลายท่าทีคุกคามและสงบลง' : 'เสียงเรียกยังไปไม่ถึง ผียังไม่สงบ';
      label=pacifyResponse(w,b)?'เรียกสติผี':'กล่อมให้ผีสงบ';
      break;
    case 'stabilize':
      stabilize(local,actor,a.targetId,roll,false);
      target=a.targetId as string;
      label='พยุงเพื่อน';
      if(w.characters![target].hp>0) effect='เพื่อนที่ล้มกลับมามีแรง ฟื้นพลังชีวิต 1';
      else effect='ยังพยุงเพื่อนให้ฟื้นไม่ได้ เพื่อนยังล้มอยู่';
      break;
    case 'observe': {
      const paid=spendAP(w.turns[actor],2) ?? fail('AP ไม่พอ');
      const check=resolveCheck({dc:12,attribute:characterAttribute(character,'mind','PER')},roll);
      local.lastCheck={playerId:actor,...check};w.turns[actor]=paid;
      if(check.outcome==='success')enemy.tactics.exposed={actor,until:b.round+1};
      target=enemy.id;label='อ่านจังหวะผี';
      effect=check.outcome==='success'?'เปิดช่องให้เพื่อนคนถัดไปที่โจมตีผีตัวนี้ +2 ใช้ได้ครั้งเดียวถึงรอบหน้า ไม่เพิ่มดาเมจและไม่ข้ามเกราะ':'ยังอ่านจังหวะไม่ได้ ไม่เกิดช่องเปิดใหม่';
      break;
    }
    case 'encourage': {
      if(typeof a.targetId!=='string' || a.targetId===actor || !readyPlayers(w,b.site).includes(a.targetId))return fail('เลือกเพื่อนที่ยังไม่ล้มในฉากนี้');
      const ally=w.characters![a.targetId], key='share:'+a.targetId;
      if(ally.sanity>=10 && (b.turnEncounter.shaken?.[a.targetId] ?? 0)<b.round || enemy.tactics.used.includes(key))return fail('สติเต็มหรือใช้สิทธิ์ดึงสติเพื่อนคนนี้แล้ว');
      const paid=spendAP(w.turns[actor],2) ?? fail('AP ไม่พอ');
      const check=resolveCheck({dc:12,attribute:characterAttribute(character,'spirit','SOC')},roll);
      enemy.tactics.used.push(key);w.turns[actor]=paid;local.lastCheck={playerId:actor,...check};
      if(check.outcome==='success'){ally.sanity=Math.min(10,ally.sanity+1);if(b.turnEncounter.shaken)delete b.turnEncounter.shaken[a.targetId];}
      target=a.targetId;label='ดึงสติเพื่อน';
      effect=check.outcome==='success'?'เพื่อนตั้งหลักได้ ฟื้นสติ 1 และหายหวาดกลัว · ใช้สิทธิ์ช่วยคนนี้แล้วใน encounter นี้':'เพื่อนยังตั้งหลักไม่ได้ · ใช้สิทธิ์ช่วยคนนี้แล้วใน encounter นี้';
      break;
    }
    case 'compose': {
      if(!frightened && !unsteady)return fail('ไม่มีสถานะที่ต้องตั้งหลัก');
      const result=resolveCheck({dc:12,attribute:characterAttribute(character,'spirit','RES')},roll);
      local.lastCheck={playerId:actor,...result};target=actor;label='ตั้งหลัก';
      if(result.outcome==='success'){if(b.turnEncounter.shaken)delete b.turnEncounter.shaken[actor];if(b.turnEncounter.unsteady)delete b.turnEncounter.unsteady[actor];}
      effect=result.outcome==='success'?'ตั้งหลักได้แล้ว ลบหวาดกลัวและเสียหลัก ไม่ฟื้นแต้มสติ':'ยังตั้งสติไม่ได้';break;
    }
    case 'breakFree': {
      if(!restrained)return fail('ไม่ได้ถูกพันธนาการ');
      const result=resolveCheck({dc:12,attribute:characterAttribute(character,'body')},roll);
      local.lastCheck={playerId:actor,...result};target=actor;label='ดิ้นหลุดพันธนาการ';
      if(result.outcome==='success')for(const member of b.enemies)delete member.tactics.restrained[actor];
      effect=result.outcome==='success'?'หลุดจากพันธนาการแล้ว':'พันธนาการยังรัดไว้';break;
    }
    case 'classSkill': {
      if(!expanded || character.sanity===0 || character.focus<1)return fail('สติหรือสมาธิไม่พอใช้ท่าอาชีพ');
      const skill=turnSkills[character.profession];
      const targetId=a.targetId;
      if(typeof targetId!=='string')return fail('เลือกเป้าหมายท่าอาชีพ');
      if(skill.target==='enemy' && (enemy.id!==targetId || enemy.state.phase==='resolved' || enemy.state.ghostHealth===0))return fail('เลือกผีที่ยังคุกคามทีม');
      if(skill.target==='ally' && !readyPlayers(w,b.site).includes(targetId))return fail('เลือกเพื่อนในฉาก');
      if(['containment_specialist','occult_engineer','field_medic'].includes(character.profession) && targetId===actor)return fail('ท่านี้ใช้กับเพื่อน');
      const conditions=b.turnEncounter.conditions ?? {ward:{},cover:{},silenced:{}};
      const ally=w.characters?.[targetId];
      label=skill.name;target=targetId;
      switch(character.profession) {
        case 'paranormal_investigator':
          enemy.tactics.exposed={actor,until:b.round+1};effect='เปิดช่องให้เพื่อนโจมตีผีตัวนี้ +2 ครั้งเดียวถึงรอบหน้า';break;
        case 'ritual_specialist':
          if(conditions.ward[targetId])return fail('เป้าหมายมียันต์คุ้มภัยแล้ว');
          conditions.ward[targetId]=true;effect='ยันต์พร้อมลดความเสียหายครั้งแรก 1 ในตาผีรอบนี้';break;
        case 'medium': {
          if(conditions.silenced[targetId])return fail('ผีถูกสะกดเสียงแล้ว');
          const result=resolveCheck({dc:12,attribute:characterAttribute(character,'spirit')},roll);
          local.lastCheck={playerId:actor,...result};
          if(result.outcome==='success')conditions.silenced[targetId]=true;
          effect=result.outcome==='success'?'ผีใช้ท่าโจมตีทางจิตไม่ได้ในตานี้ แต่ยังโจมตีทางกายได้':'ยังสะกดเสียงผีไม่ได้';break;
        }
        case 'containment_specialist':
          if(conditions.cover[targetId])return fail('มีคนคุ้มกันเป้าหมายนี้แล้ว');
          conditions.cover[targetId]=actor;for(const member of b.enemies)member.tactics.defense[actor]=b.round;
          effect='พร้อมรับการโจมตี HP ครั้งถัดไปแทนเพื่อน และตั้งรับ +2 ให้ตัวเอง';break;
        case 'occult_engineer':
          if((enemy.tactics.restrained[targetId] ?? 0)>=b.round) {
            for(const member of b.enemies)delete member.tactics.restrained[targetId];effect='ช่วยเพื่อนหลุดพันธนาการ';
          } else if((b.turnEncounter.unsteady?.[targetId] ?? 0)>=b.round){
            delete b.turnEncounter.unsteady![targetId];effect='ช่วยเพื่อนหายเสียหลัก';
          } else if((b.turnEncounter.shaken?.[targetId] ?? 0)>=b.round) {
            delete b.turnEncounter.shaken![targetId];effect='ช่วยเพื่อนหายหวาดกลัว ไม่ฟื้นแต้มสติ';
          } else {
            const key='share:'+targetId;
            if(!ally || ally.sanity>=10 || enemy.tactics.used.includes(key))return fail('เพื่อนไม่มีสถานะที่ช่วยได้หรือใช้สิทธิ์ฟื้นสติแล้ว');
            ally.sanity++;enemy.tactics.used.push(key);effect='เพื่อนฟื้นสติ 1 ใช้สิทธิ์ร่วมกับดึงสติเพื่อน';
          }break;
        case 'field_medic':
          for(const member of b.enemies){delete member.tactics.restrained[targetId];member.tactics.defense[targetId]=b.round;}
          if(b.turnEncounter.unsteady)delete b.turnEncounter.unsteady[targetId];
          effect='พาเพื่อนพ้นพันธนาการและเสียหลัก พร้อมตั้งรับ +2 ไม่ฟื้น HP';break;
      }
      b.turnEncounter.conditions=conditions;character.focus-=skill.focus;effect+=' · ใช้สมาธิ '+skill.focus;
      break;
    }
    case 'guard':
      for(const member of b.enemies)member.tactics.defense[actor]=b.round;
      target=actor;label='ตั้งรับ';
      effect='ป้องกัน +2 ในตาผีรอบนี้';
      break;
    case 'pass':
      label='ผ่านตา';effect='ส่งตาให้ผู้เล่นถัดไป';
      break;
    case 'withdraw':
      recordTurn(w,b,{actor,label:'พาทีมถอย',effect:'ทั้งทีมออกจากการเผชิญหน้า'});
      finishCaseBattle(w,true);
      return;
    default: return fail();
  }
  completeTurnPlayer(w,actor,label,local.lastCheck ?? undefined,target,effect,resourceChanges(w,b,beforeResources));
}

function canReach(from:Cell,to:Cell,grid:GhostGrid,blocked:Cell[],budget:number,flooded:Cell[]) {
  const free=(p:Cell)=>p.x>=0 && p.y>=0 && p.x<grid.width && p.y<grid.height &&
    !blocked.some(q=>distance(p,q)===0);
  const key=(p:Cell)=>p.x+':'+p.y;
  const best=new Map<string,number>([[key(from),0]]);
  const queue=[{cell:from,cost:0}];
  for(const {cell,cost} of queue) {
    if(distance(cell,to)===0 && cost>0) return true;
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
      if(!dx && !dy) continue;
      const p={x:cell.x+dx,y:cell.y+dy};
      if(!free(p) || (dx && dy && (!free({x:p.x,y:cell.y}) || !free({x:cell.x,y:p.y})))) continue;
      const next=cost+1+Number(flooded.some(q=>distance(q,p)===0));
      if(next>budget || next>=(best.get(key(p)) ?? Infinity)) continue;
      best.set(key(p),next);queue.push({cell:p,cost:next});
    }
  }
  return false;
}

function nextCombatTurn(w:World,b:CaseBattle,grid:GhostGrid,roll:()=>number,index:number,completeRound:()=>void) {
  const order=b.initiative!;
  const enemy=b.enemies[0];
  while(readyPlayers(w,b.site).length && (activeEnemies(b).length || !!b.final55)) {
    index++;
    if(index===order.length) {
      index=0;
      b.round++;
      completeRound();
      if(w.caseMap?.battle!==b) return;
      if(b.phase==='flood_memory') b.flooded=readyPlayers(w,b.site).slice(0,2).map(id=>({...w.players[id]}));
    }
    const player=order[index];
    if(player===null) {
      if(b.final55 && !activeEnemies(b).length)continue;
      if(b.final55?.withheldAttack) {delete b.final55.withheldAttack;continue;}
      const local=localWorld(w,b,enemy);
      advanceTactics(local,grid,roll,false);
      continue;
    }
    if(w.characters?.[player]?.hp && w.players[player] && !w.inactivePlayers?.includes(player)) {
      b.active=player;
      w.turns[player]=startTurn();
      return;
    }
  }
  if(!readyPlayers(w,b.site).length) completeRound();
  if(w.caseMap?.battle===b) finishCaseBattle(w);
}

export function caseBattleAction(w:World,actor:string,a:{type:string;target?:unknown;targetId?:unknown;allyTarget?:unknown;boost?:unknown;enemyId?:unknown;step?:unknown},
 grid:GhostGrid,roll:()=>number,completeRound:()=>void,fromTurn=false) {
  const map=w.caseMap!, site=map.sites[actor] ?? 'A', b=map.battle;
  const inBattle=!!b && b.site===site;
  if(!w.characters?.[actor]?.hp || w.humanDmId===actor || w.case001?.report) return fail();
  if(inBattle && b.turnEncounter && !fromTurn) return fail('เลือกการกระทำจากหน้าเผชิญหน้า');
  if(inBattle && b.final55 && !w.case001?.guided?.presented.includes('F1'))return fail('รอ DM ส่งบทเปิดวงป้องกันก่อน');
  if(a.type==='move') {
    if(inBattle && b.active!==actor) return fail('ยังไม่ถึงเทิร์น');
    const p=a.target as Cell|undefined, from=w.players[actor];
    const occupied=Object.entries(localPlayers(w,site)).filter(([id])=>id!==actor).map(([,cell])=>cell);
    const blocked=[...grid.blocked,...occupied,...(inBattle?activeEnemies(b).map(e=>e.state.ghost):[])];
    if(!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) ||
      !canReach(from,p,grid,blocked,inBattle?4:grid.width*grid.height,inBattle?b.flooded ?? []:[])) return fail('เดินไม่ได้');
    if(inBattle) {
      if((b.enemies[0].tactics.restrained[actor] ?? 0)>=b.round) return fail('ถูกพันธนาการ');
      w.turns[actor]=spendAP(w.turns[actor],1) ?? fail('AP ไม่พอ');
    }
    w.players[actor]={x:p.x,y:p.y};
    return;
  }
  if(a.type==='start') return startCaseBattle(w,actor,grid,roll);
  if(!inBattle) return fail('ไม่มีการเผชิญหน้าในสถานที่นี้');
  if(a.type==='endTurn') {
    if(b.active!==actor) return fail('ยังไม่ถึงเทิร์น');
    if(b.initiative) return nextCombatTurn(w,b,grid,roll,b.initiative.indexOf(actor),completeRound);
    const party=readyPlayers(w,site), next=party[party.indexOf(actor)+1];
    if(next) {b.active=next;return;}
    let damageBudget=Object.keys(localPlayers(w,site)).length<=2?1:2;
    for(const e of activeEnemies(b)) {
      const local=localWorld(w,b,e);
      const others=activeEnemies(b).filter(other=>other!==e).map(other=>other.state.ghost);
      if(e.tactics.telegraph && damageBudget--<=0) delete e.tactics.telegraph;
      advanceTactics(local,{...grid,blocked:[...grid.blocked,...others]},roll);
      w.lastCheck=local.lastCheck;
    }
    b.round++;
    b.active=readyPlayers(w,site)[0] ?? null;
    for(const id of readyPlayers(w,site)) w.turns[id]=startTurn();
    completeRound();
    if(b.phase==='flood_memory') b.flooded=readyPlayers(w,site).slice(0,2).map(id=>({...w.players[id]}));
    if(map.battle && (!b.active || !activeEnemies(b).length)) finishCaseBattle(w);
    return;
  }
  if(a.type==='breakRestraint' || a.type==='caseObjective') {
    if(b.active!==actor) return fail('ยังไม่ถึงเทิร์น');
    if(a.type==='caseObjective' && b.final55) {
      const final=b.final55;
      if(!final.actionWindow || a.step!==final.step) return fail('ขั้นตอนเปลี่ยนแล้ว โปรดเลือกใหม่');
      if(!fromTurn && (!b.focusCell || distance(b.focusCell,w.players[actor])>1))return fail('เข้าใกล้กำไลก่อน');
      const turn=spendAP(w.turns[actor],2) ?? fail('AP ไม่พอ');
      const result=resolveCheck({dc:12,attribute:characterAttribute(w.characters![actor],'knowledge')},roll);
      w.turns[actor]=turn;w.lastCheck={playerId:actor,...result};
      final.ritualActor=actor;
      if(result.outcome!=='success')return;
      if(final.step<3) {
        final.step=(final.step+1) as 1|2|3;
        if(final.step===2) {
          b.phase='flood_memory';
          w.case001!.v51!.finalPhaseTwo55=true;
        }
        if(final.step===3)final.shield='down';
        w.case001!.notice=['','ยึดจุดรับแรงสะท้อนได้แล้ว','แยกสายคำสั่งได้ ภาพความทรงจำปรากฏ','ปมเกราะคลายแล้ว ยังต้องลงมือปลดกำไล'][final.step];
      } else {
        if(b.turnEncounter)recordTurn(w,b,{actor,label:'ปลดกำไลอย่างควบคุม',targetName:'กำไล',check:result,effect:'พิธีหยุดแล้ว'});
        w.case001!.seals[2]=true;
        w.case001!.v51!.RITUAL_STATUS='stopped';
        delete w.case001!.v51!.backlash;
        for(const name of Object.keys(w.case001!.v51!.RITUAL_TETHER_INTACT) as ('ดล'|'นิด'|'เพิ่ม')[])w.case001!.v51!.RITUAL_TETHER_INTACT[name]=false;
        finishCaseBattle(w);
      }
      return;
    }
    const index=b.projections.findIndex(p=>fromTurn || distance(p,w.players[actor])<=1);
    const restrained=b.enemies[0].tactics.restrained;
    if(a.type==='breakRestraint' && (restrained[actor] ?? 0)<b.round) return fail();
    if(a.type==='caseObjective' && index<0 && (!b.focusCell || !fromTurn && distance(b.focusCell,w.players[actor])>1 || b.armorDisabled)) return fail('เข้าใกล้เป้าหมายก่อน');
    const turn=spendAP(w.turns[actor],a.type==='breakRestraint'?1:2) ?? fail('AP ไม่พอ');
    const result=resolveCheck({dc:a.type==='caseObjective' && b.id==='EN03' && w.case001!.understood ? 8 : 12,attribute:characterAttribute(w.characters[actor],a.type==='breakRestraint'?'body':'knowledge')},roll);
    w.turns[actor]=turn;
    w.lastCheck={playerId:actor,...result};
    if(result.outcome==='success') {
      if(a.type==='breakRestraint') delete restrained[actor];
      else if(index>=0) {b.projections.splice(index,1);if(!b.projections.length) b.phase='flood_memory';}
      else if(b.id==='EN01') {
        for(const enemy of b.enemies) {
          enemy.state.phase='resolved';
          if(w.case001!.storyVersion===4) enemy.state.outcome='pacified';
        }
        finishCaseBattle(w);
      } else {b.armorDisabled=true;b.enemies[0].tactics.profile!.armor=0;}
    }
    return;
  }
  const e=(a.enemyId===undefined?activeEnemies(b)[0]:activeEnemies(b).find(enemy=>enemy.id===a.enemyId)) ?? fail();
  if(b.final55)b.final55.damageBlocked=false;
  const local=localWorld(w,b,e);
  const otherCells=activeEnemies(b).filter(other=>other!==e).map(other=>other.state.ghost);
  const arena={...grid,blocked:[...grid.blocked,...otherCells]};
  if(a.type==='useTalent' || a.type==='usePassive') applyTechnique(local,actor,a,arena,roll);
  else {
    if(b.active!==actor) return fail('ยังไม่ถึงเทิร์น');
    if(a.type==='strike') {
      strikeV2(local,actor,roll);
      if(e.kind==='kaew_boss' && !w.case001!.milestones.includes('kaew-attacked')) {
        const s=w.case001!;
        s.milestones.push('kaew-attacked');s.trust=Math.max(0,s.trust-2);s.haunt=Math.min(10,s.haunt+2);s.ghost='hostile';
      }
    }
    else if(a.type==='pacify') negotiateV2(local,actor,roll);
    else if(a.type==='stabilize') stabilize(local,actor,a.targetId,roll);
    else if(a.type==='escape') {
      const p=w.players[actor];
      if(p.x!==0 && p.y!==0 && p.x!==grid.width-1 && p.y!==grid.height-1) return fail('เดินไปที่ขอบแผนที่ก่อน');
      finishCaseBattle(w,true);
      return;
    } else return fail();
  }
  Object.assign(w.players,local.players);
  w.lastCheck=local.lastCheck;
  if(b.final55 && e.state.ghostHealth===0) {
    w.case001!.v51!.finalBody55='dispersed';
    w.case001!.v51!.KAEW_TEMP_DISPERSED=true;
    w.case001!.v51!.kaewVoice53=true;
  }
  if(b.active===actor) w.turns[actor]=e.state.turn;
  if(!activeEnemies(b).length && !b.final55) finishCaseBattle(w);
}

export function battleView(map:CaseMap,site:Site,w?:World,isDm=false) {
  const b=map.battle;
  if(!b || b.site!==site) return;
  const visible=b.turnEncounter ? b.enemies : activeEnemies(b).filter(e=>!e.tactics.dispersed && (!e.tactics.concealed || (e.tactics.scanned ?? 0)>=b.round));
  const turn=b.turnEncounter;
  return {id:b.id,title:b.title ?? definitions[b.id].title,phase:b.phase,round:b.round,active:b.active,
    final55:b.final55 && {step:b.final55.step,shield:b.final55.shield,damageBlocked:b.final55.damageBlocked},
    turnEncounter:turn && w ? {
      unsteady:turn.unsteady,shaken:turn.shaken,powerUsed:turn.powerUsed,conditions:turn.conditions,guarded:b.enemies[0].tactics.defense,
      expandedActions:w.case001?.guided?.version==='5.5',supportUsed:b.enemies[0].tactics.used.filter(key=>key.startsWith('share:')).map(key=>key.slice(6)),
      party:Object.keys(localPlayers(w,b.site)).filter(id=>!!w.characters?.[id]),
      acted:turn.acted,history:turn.history,maxHp:turn.maxHp,npcActive:turnEnemy(b)?.id,
      pacifyDescription:pacifyResponse(w,b)?.description,
      scene:openingScene(b),canPacify:!!b.enemies[0].tactics.profile?.canPacify,
      ...(isDm?{declared:b.turnEncounter?.declared,canWithhold:!!b.final55 && !b.final55.trustUsed && !!b.enemies[0].tactics.telegraph && w?.case001?.v51?.KAEW_TRUST==='high'}:{}),
      ready:!!w.case001?.guided?.presented.includes(openingScene(b)),
      ...(isDm ? {attacks:(activeEnemies(b).length && !b.final55?.withheldAttack?((turnEnemy(b)?.tactics.calmUntil ?? 0)>=b.round ? [] : npcAttacks(b,turnEnemy(b),w.case001?.guided?.version==='5.5').filter(attack=>!turn.conditions?.silenced[turnEnemy(b)!.id] || attack.targetDefense!=='MDEF')):[]).map(attack=>({id:attack.id,name:attack.name_th,detail:attack.detail ?? (attack.condition==='ROOTED'?'โดนแล้วพันธนาการถึงรอบหน้า':attack.telegraphOneBossTurnBeforeUse?'ต้องประกาศล่วงหน้าหนึ่งตาผี':undefined),resource:attack.damageResource,damage:attack.damage}))} : {}),
    } : undefined,
    enemies:visible.map(e=>({id:e.id,maxHp:e.maxHp ?? turn?.maxHp ?? e.state.ghostHealth,resolved:e.state.phase==='resolved',opening:e.tactics.exposed && e.tactics.exposed.until>=b.round ? e.tactics.exposed : undefined,hesitating:(e.tactics.calmUntil ?? 0)>=b.round,outcome:e.state.outcome,name:enemies[e.kind].name+(b.enemies.length>1?' '+(b.enemies.indexOf(e)+1):''),position:e.state.ghost,hp:e.state.ghostHealth,telegraph:e.tactics.telegraph,
      defense:e.tactics.profile?.combat && {PDEF:e.tactics.profile.combat.PDEF,MDEF:e.tactics.profile.combat.MDEF}})),
    danger:activeEnemies(b).flatMap(e=>e.tactics.telegraph?.cells ?? []),
    projections:[...b.projections,...(b.focusCell&&!b.armorDisabled?[b.focusCell]:[])],flooded:b.flooded ?? [],objective:!!b.focusCell&&!b.armorDisabled || b.projections.length>0,
    reaction:b.enemies[0].tactics.reaction,restrained:b.enemies[0].tactics.restrained,
  };
}

export function resumeSessionBattle(w:World,roll:()=>number,completeRound:()=>void) {
 const b=w.caseMap?.battle;
 if(!b?.active || !w.inactivePlayers?.includes(b.active))return;
 if(b.turnEncounter)selectTurnPlayer(w,b);
 else if(b.initiative)nextCombatTurn(w,b,caseGridForSession(b.site),roll,b.initiative.indexOf(b.active),completeRound);
 else b.active=readyPlayers(w,b.site)[0] ?? null;
}
