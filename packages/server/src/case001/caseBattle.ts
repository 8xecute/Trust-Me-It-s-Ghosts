import { noTimer } from './v51Content.js';
import {caseGrid as caseGridForSession} from '@baan/shared';
import { randomInt } from 'node:crypto';
import { characterAttribute, liteGhostHP } from '@baan/shared';
import { readFileSync } from 'node:fs';
import {
  ghostDecision, resolveCheck, spendAP, startGhostEncounter, startTurn, type GhostEncounter, type GhostGrid,
} from '@baan/shared';
import { advanceTactics, applyTechnique, negotiateV2, newTactics, resolveNpcAttack, stabilize, strikeV2, type Tactics } from '../tacticalEncounter.js';
import { caseNarration, emitCaseBeat, type CaseState, type Site } from './case001.js';
import { caseCombatStats } from './caseCombatStats.js';
import { addFact, hasFact, v4 } from './caseStory.js';
import type { Cell, World } from '../world.js';

type EnemyKind = 'drowned_echo'|'bound_wraith'|'ritual_guardian'|'kaew_boss';
type EncounterId = 'EN01'|'EN02'|'EN03'|'EN04';
const definitions = JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.encounters.json',import.meta.url),'utf8')) as
  Record<EncounterId,{site:Site;title:string;roster:EnemyKind[];turnRoster55?:EnemyKind[]}>;
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
  round:number; actor:string; label:string; target?:string;
  check?:Pick<NonNullable<World['lastCheck']>,'die'|'total'|'outcome'>;
  effect?:string;
};
type TurnEncounter = {acted:string[]; maxHp:number; history:TurnBeat[];declared?:{attackId:string;targetId:string;round:number}};
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
  turnConclusion?:{outcome:'escaped'|'lost'|'pacified'|'won';check?:TurnBeat['check']};
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
    map.turnConclusion={outcome,check:battle.turnEncounter.history.at(-1)?.check};
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

function recordTurn(b:CaseBattle,beat:Omit<TurnBeat,'round'>) {
  const history=b.turnEncounter!.history;
  const check=beat.check;
  history.push({round:b.round,...beat,check:check && {die:check.die,total:check.total,outcome:check.outcome}});
  if(history.length>24) history.shift();
}

export function completeTurnPlayer(w:World,actor:string,label:string,check?:TurnBeat['check'],target?:string,effect?:string) {
  const b=w.caseMap?.battle;
  if(!b?.turnEncounter || b.active!==actor) return;
  recordTurn(b,{actor,label,target,check,effect});
  b.turnEncounter.acted.push(actor);
  w.turns[actor]={...w.turns[actor],ap:0};
  if(!activeEnemies(b).length && !b.final55) finishCaseBattle(w);
  else selectTurnPlayer(w,b);
}

const turnEnemy=(b:CaseBattle)=>activeEnemies(b).find(enemy=>!b.turnEncounter!.acted.includes(enemy.id));
const npcAttacks=(b:CaseBattle,enemy=turnEnemy(b))=>enemy?.tactics.profile?.combat?.attacks.filter(attack=>!attack.requires &&
 (attack.id!=='FLOOD_MEMORY' || b.phase==='flood_memory')) ?? [];
const openingScene=(b:CaseBattle)=>b.id==='EN01'?'C4':b.id==='EN02'?'D4':'F1';

export function turnEncounterAction(w:World,actor:string,a:{round:unknown;choice:unknown;targetId?:unknown;attackId?:unknown;enemyId?:unknown;step?:unknown},
  roll:()=>number,completeRound:()=>void) {
  const b=w.caseMap?.battle;
  if(!b?.turnEncounter || a.round!==b.round || w.case001?.report) return fail('รอบนี้จบแล้ว โปรดเลือกอีกครั้ง');
  if(!w.case001?.guided?.presented.includes(openingScene(b))) return fail('รอ DM ส่งบทเปิดฉากก่อน');
  const npc=turnEnemy(b);
  const selected=b.enemies.find(enemy=>enemy.id===a.targetId);
  const enemy=actor===w.humanDmId ? npc ?? b.enemies[0] :
    a.choice==='strike' || a.choice==='pacify' ? selected ?? (b.enemies.length===1 ? b.enemies[0] : undefined) : b.enemies[0];
  if(!enemy)return fail('เลือกผีเป้าหมายก่อน');
  if(actor===w.humanDmId) {
    if(b.active) return fail('ยังไม่ถึงตาของผี');
    if(b.enemies.length>1 && (!npc || a.enemyId!==npc.id))return fail('ตาของผีเปลี่ยนแล้ว โปรดเลือกอีกครั้ง');
    if(a.choice==='withdraw') {
      if(b.id==='EN04')return fail('การถอยของผีไม่หยุดพิธี ให้เลือกผ่านตา');
      recordTurn(b,{actor:enemy.id,label:'ผีถอยกลับไปในคราบน้ำ'});
      enemy.state.phase='resolved';
      enemy.state.outcome='defeated';
      if(!activeEnemies(b).length){finishCaseBattle(w);return;}
    } else if(a.choice==='attack' || a.choice==='declareAttack') {
      if(!activeEnemies(b).length || b.final55?.withheldAttack || (enemy.tactics.calmUntil ?? 0)>=b.round)return fail('ผีไม่มีการโจมตีในตานี้');
      const attack=npcAttacks(b,enemy).find(option=>option.id===a.attackId);
      const target=a.targetId;
      if(!attack || typeof target!=='string' || !readyPlayers(w,b.site).includes(target)) return fail('เลือกท่าและผู้สืบสวนที่ยังลงมือได้');
      if(a.choice==='declareAttack') {
        enemy.tactics.telegraph={kind:attack.targetDefense==='MDEF'?'wail':'lash',attack,cells:[{...w.players[target]}]};
        b.turnEncounter.declared={attackId:attack.id,targetId:target,round:b.round};
        if(!attack.telegraphOneBossTurnBeforeUse)return;
      } else {
        if(attack.telegraphOneBossTurnBeforeUse && (!b.turnEncounter.declared || b.turnEncounter.declared.round>=b.round))return fail('ท่านี้ต้องประกาศล่วงหน้าหนึ่งตาผี');
        if(b.id==='EN04' && (enemy.tactics.telegraph?.attack?.id!==attack.id ||
          !enemy.tactics.telegraph.cells.some(cell=>distance(cell,w.players[target])===0)))return fail('ประกาศท่าและเป้าหมายก่อนโจมตี');
        const result=resolveNpcAttack(w.characters![target],attack,enemy.tactics.profile!.combat!.ATK,roll(),
          enemy.tactics.defense[target]===b.round);
        if(result.outcome==='success' && attack.condition==='ROOTED')enemy.tactics.restrained[target]=b.round+1;
        recordTurn(b,{actor:enemy.id,target,label:attack.name_th,check:result,effect:result.damage ?
          (attack.damageResource==='HP'?'การโจมตีกระแทกเข้าร่าง เป้าหมายเสียพลังชีวิต ':'เสียงหลอนแทรกเข้าจิต เป้าหมายเสียสติ ')+result.damage : 'เป้าหมายรอดจากการโจมตี ไม่เสียพลังชีวิตหรือสติ'});
      }
    } else if(a.choice==='pass') recordTurn(b,{actor:enemy.id,label:(enemy.tactics.calmUntil ?? 0)>=b.round?'ผีชะงักตามเสียงเรียก': 'รอดูท่าที',effect:(enemy.tactics.calmUntil ?? 0)>=b.round?'งดโจมตีตานี้ แต่ยังไม่จบการเผชิญหน้า':undefined});
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
    b.turnEncounter.acted=[];
    selectTurnPlayer(w,b);
    return;
  }
  if(b.active!==actor || !readyPlayers(w,b.site).includes(actor)) return fail('ยังไม่ถึงตาของคุณ');
  if(w.dmSession?.checks[actor] || w.dmSession?.rolls[actor]?.die===null) return fail('จัดการคำขอทอยที่ค้างก่อน');
  if((a.choice==='strike' || a.choice==='pacify') && enemy.state.phase==='resolved')return fail('ผีเป้าหมายจบการเผชิญหน้าแล้ว');
  const local=localWorld(w,b,enemy);
  local.lastCheck=null;
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
    case 'strike': {
      if(b.final55)b.final55.damageBlocked=false;
      const before=enemy.state.ghostHealth;
      strikeV2(local,actor,roll,false);
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
      label='ขับไล่ผี';
      break;
    }
    case 'pacify':
      if(!enemy.tactics.profile?.canPacify)return fail('ผีตนนี้ไม่เปิดรับการกล่อมระหว่างสู้');
      negotiateV2(local,actor,roll,false,pacifyResponse(w,b)?.response);
      target=enemy.id;
      effect=pacifyResponse(w,b) ? (local.lastCheck?.outcome==='success' ? pacifyResponse(w,b)!.success : 'เสียงเรียกยังไปไม่ถึง ผียังคุกคามทีมต่อ') : enemy.state.outcome==='pacified' ? 'ผีคลายท่าทีคุกคามและสงบลง' : 'เสียงเรียกยังไปไม่ถึง ผียังไม่สงบ';
      label='กล่อมให้ผีสงบ';
      break;
    case 'stabilize':
      stabilize(local,actor,a.targetId,roll,false);
      target=a.targetId as string;
      label='พยุงเพื่อน';
      if(w.characters![target].hp>0) effect='เพื่อนที่ล้มกลับมามีแรง ฟื้นพลังชีวิต 1';
      else effect='ยังพยุงเพื่อนให้ฟื้นไม่ได้ เพื่อนยังล้มอยู่';
      break;
    case 'guard':
      for(const member of b.enemies)member.tactics.defense[actor]=b.round;
      label='ตั้งรับ';
      effect='ป้องกัน +2 ในตาผีรอบนี้';
      break;
    case 'pass':
      label='ผ่านตา';
      break;
    case 'withdraw':
      recordTurn(b,{actor,label:'พาทีมถอย'});
      finishCaseBattle(w,true);
      return;
    default: return fail();
  }
  completeTurnPlayer(w,actor,label,local.lastCheck ?? undefined,target,effect);
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
        if(b.turnEncounter)recordTurn(b,{actor,label:'ปลดกำไลอย่างควบคุม',check:result,effect:'พิธีหยุดแล้ว'});
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
      party:Object.keys(localPlayers(w,b.site)).filter(id=>!!w.characters?.[id]),
      acted:turn.acted,history:turn.history,maxHp:turn.maxHp,npcActive:turnEnemy(b)?.id,
      pacifyDescription:pacifyResponse(w,b)?.description,
      scene:openingScene(b),canPacify:!!b.enemies[0].tactics.profile?.canPacify,
      ...(isDm?{declared:b.turnEncounter?.declared,canWithhold:!!b.final55 && !b.final55.trustUsed && !!b.enemies[0].tactics.telegraph && w?.case001?.v51?.KAEW_TRUST==='high'}:{}),
      ready:!!w.case001?.guided?.presented.includes(openingScene(b)),
      ...(isDm ? {attacks:(activeEnemies(b).length && !b.final55?.withheldAttack?((turnEnemy(b)?.tactics.calmUntil ?? 0)>=b.round ? [] : npcAttacks(b)):[]).map(attack=>({id:attack.id,name:attack.name_th,resource:attack.damageResource,damage:attack.damage}))} : {}),
    } : undefined,
    enemies:visible.map(e=>({id:e.id,maxHp:e.maxHp ?? turn?.maxHp ?? e.state.ghostHealth,resolved:e.state.phase==='resolved',hesitating:(e.tactics.calmUntil ?? 0)>=b.round,outcome:e.state.outcome,name:enemies[e.kind].name+(b.enemies.length>1?' '+(b.enemies.indexOf(e)+1):''),position:e.state.ghost,hp:e.state.ghostHealth,telegraph:e.tactics.telegraph,
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
