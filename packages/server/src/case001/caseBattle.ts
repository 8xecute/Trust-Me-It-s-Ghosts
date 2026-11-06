import { randomInt } from 'node:crypto';
import { characterAttribute, liteGhostHP } from '@baan/shared';
import { readFileSync } from 'node:fs';
import {
  ghostDecision, resolveCheck, spendAP, startGhostEncounter, startTurn, type GhostEncounter, type GhostGrid,
} from '@baan/shared';
import { advanceTactics, applyTechnique, negotiateV2, newTactics, stabilize, strikeV2, type Tactics } from '../tacticalEncounter.js';
import { caseNarration, emitCaseBeat, type CaseState, type Site } from './case001.js';
import { caseCombatStats } from './caseCombatStats.js';
import { addFact, hasFact, v4 } from './caseStory.js';
import type { Cell, World } from '../world.js';

type EnemyKind = 'drowned_echo'|'bound_wraith'|'ritual_guardian'|'kaew_boss';
type EncounterId = 'EN01'|'EN02'|'EN03'|'EN04';
const definitions = JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.encounters.json',import.meta.url),'utf8')) as
  Record<EncounterId,{site:Site;title:string;roster:EnemyKind[]}>;
const enemies = {
  drowned_echo:{name:'ผีเงาจมน้ำ',hp:3},
  bound_wraith:{name:'ผีด้ายดำ',hp:4},
  ritual_guardian:{name:'ผีเฝ้าเรือน',hp:6},
  kaew_boss:{name:'แม่แก้ว',hp:12},
};
type Enemy = {id:string;kind:EnemyKind;state:GhostEncounter;tactics:Tactics};
export interface CaseBattle {
  id:EncounterId;site:Site;title?:string;round:number;active:string|null;enemies:Enemy[];
  phase?:'chains'|'flood_memory'|'choice';
  initiative?: (string|null)[];
  projections:Cell[];
  armorDisabled?:boolean;
  focusCell?:Cell;
  flooded?:Cell[];
}
export interface CaseMap {
  sites:Record<string,Site>;
  positions:Partial<Record<Site,Record<string,Cell>>>;
  completed:EncounterId[];
  rounds:number;
  battle?:CaseBattle;
}
export const newCaseMap = (players:Record<string,Cell>):CaseMap => ({
  sites:Object.fromEntries(Object.keys(players).map(id=>[id,'A'])),
  positions:{A:structuredClone(players)},completed:[],rounds:0,
});
const distance=(a:Cell,b:Cell)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const fail=(reason='ทำรายการนี้ไม่ได้'):never=>{throw Error(reason);};
const points=(grid:GhostGrid)=>Array.from({length:grid.width*grid.height},(_,i)=>({x:i%grid.width,y:Math.floor(i/grid.width)}));
const localPlayers=(w:World,site:Site)=>Object.fromEntries(Object.entries(w.players)
  .filter(([id])=>id!==w.humanDmId && (w.caseMap!.sites[id] ?? 'A')===site));
const readyPlayers=(w:World,site:Site)=>Object.keys(localPlayers(w,site)).filter(id=>(w.characters?.[id]?.hp ?? 0)>0);
export function removeCasePlayer(w:World,id:string,gridFor:(site:Site)=>GhostGrid,roll:()=>number,completeRound:()=>void) {
  const map=w.caseMap;
  if(!map) return;
  delete map.sites[id];
  for(const saved of Object.values(map.positions)) delete saved[id];
  const battle=map.battle;
  if(battle?.active===id) {
    if(battle.initiative) return nextCombatTurn(w,battle,gridFor(battle.site),roll,battle.initiative.indexOf(id),completeRound);
    battle.active=readyPlayers(w,battle.site)[0] ?? null;
    if(!battle.active) finishCaseBattle(w);
  }
}
const activeEnemies=(b:CaseBattle)=>b.enemies.filter(enemy=>enemy.state.phase!=='resolved');

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
  if(s.storyVersion===4) {
    if(available('EN01') && (s.evidence.includes('E01') || s.evidence.includes('E02'))) return 'EN01';
    if(available('EN02') && !s.seals[2] && (s.ghost==='cautious' || s.ghost==='hostile')) return 'EN02';
    if(available('EN04') && !s.seals[2] && s.seals[0] && s.seals[1] && s.evidence.includes('E05') &&
      (s.ghost==='hostile' || s.minute>=210 || s.milestones.includes('unsafe-bracelet'))) return 'EN04';
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
  const occupied=[...Object.values(localPlayers(w,site)),...grid.blocked];
  const slots=points(grid).reverse().filter(p=>!occupied.some(q=>distance(p,q)===0));
  const roster:EnemyKind[]=isV4 ? [id==='EN01' ? 'drowned_echo' : 'kaew_boss'] : definitions[id].roster.slice(0,count<=2 ? (id==='EN01'||id==='EN04'?1:2) : 3);
  const members=roster.map((kind,index)=>{
    const state=startGhostEncounter(w.players[actor],slots[index]);
    state.ghostHealth=combat ? liteGhostHP(combat.baseHPFor2,Math.max(2,Object.keys(localPlayers(w,site)).length)) : kind==='kaew_boss' && (!isV4 || id==='EN04') ?Math.min(20,8+4*count):enemies[kind].hp;
    const tactics=newTactics({combat,movement:combat?.MOVE ?? (kind==='kaew_boss'?3:1),armor:kind==='ritual_guardian'?1:0,
      special:kind==='drowned_echo'?'wail':kind==='kaew_boss'?undefined:'lash',restrains:kind!=='ritual_guardian',
      boss:kind==='kaew_boss' && (!isV4 || id==='EN04'),canPacify:kind!=='kaew_boss' || isV4 && id==='EN02',anchorActive:kind==='kaew_boss' && (!isV4 || id==='EN04')});
    return {id:id+'-'+(index+1),kind,state,tactics};
  });
  const projectionCount=isV4 && hasFact(w.case001!,'kaew-dispersed') ? 1 : 2;
  map.battle={id,site,...(isV4 && id==='EN02' ? {title:'เผชิญหน้าแม่แก้วในสวน'} : {}),round:1,active:party[0],enemies:members,
    ...(id==='EN04'?{phase:'chains' as const}:{}),projections:id==='EN04'?slots.slice(roster.length,roster.length+projectionCount):[],
    ...(id==='EN03'||id==='EN01'?{focusCell:slots[roster.length]}:{})};
  for(const player of party) w.turns[player]=startTurn();
  if(combat) {
    const initiative=[...party.map(player=>({player,bonus:characterAttribute(w.characters![player],'mind')})),
      {player:null,bonus:combat.INIT}].map(entry=>({...entry,total:roll()+entry.bonus}));
    initiative.sort((a,b)=>b.total-a.total || Number(a.player===null)-Number(b.player===null) ||
      b.bonus-a.bonus || (a.player ?? '').localeCompare(b.player ?? ''));
    map.battle.initiative=initiative.map(entry=>entry.player);
    nextCombatTurn(w,map.battle,grid,roll,-1,()=>{});
  }
  w.case001!.notice=map.battle.title ?? definitions[id].title;
  const script=isV4 ? v4.encounters[id] : caseNarration.encounters[id];
  let text=script.start;
  if(isV4 && id==='EN04') {
    const s=w.case001!;
    const prior=hasFact(s,'kaew-dispersed') ? 'won' : hasFact(s,'kaew-fled') ? 'fled' : hasFact(s,'kaew-talked') ? 'talked' : undefined;
    if(prior) text+='\n'+v4.finalArrival[prior];
  }
  emitCaseBeat(w.case001!,id+':start',text);
  w.case001!.narrativeEvents!.at(-1)!.site=site;
}

export function finishCaseBattle(w:World,escaped=false) {
  const map=w.caseMap!, battle=map.battle!;
  if(!map.completed.includes(battle.id)) map.completed.push(battle.id);
  const s=w.case001;
  if(s?.storyVersion===4 && !s.report) {
    const script=v4.encounters[battle.id];
    const pacified=battle.enemies.some(enemy=>enemy.state.outcome==='pacified');
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
  while(readyPlayers(w,b.site).length && activeEnemies(b).length) {
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
      const local=localWorld(w,b,enemy);
      advanceTactics(local,grid,roll,false);
      continue;
    }
    if(w.characters?.[player]?.hp && w.players[player]) {
      b.active=player;
      w.turns[player]=startTurn();
      return;
    }
  }
  if(!readyPlayers(w,b.site).length) completeRound();
  if(w.caseMap?.battle===b) finishCaseBattle(w);
}

export function caseBattleAction(w:World,actor:string,a:{type:string;target?:unknown;targetId?:unknown;allyTarget?:unknown;boost?:unknown;enemyId?:unknown},
 grid:GhostGrid,roll:()=>number,completeRound:()=>void) {
  const map=w.caseMap!, site=map.sites[actor] ?? 'A', b=map.battle;
  const inBattle=!!b && b.site===site;
  if(!w.characters?.[actor]?.hp || w.humanDmId===actor || w.case001?.report) return fail();
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
    const index=b.projections.findIndex(p=>distance(p,w.players[actor])<=1);
    const restrained=b.enemies[0].tactics.restrained;
    if(a.type==='breakRestraint' && (restrained[actor] ?? 0)<b.round) return fail();
    if(a.type==='caseObjective' && index<0 && (!b.focusCell || distance(b.focusCell,w.players[actor])>1 || b.armorDisabled)) return fail('เข้าใกล้เป้าหมายก่อน');
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
  if(b.active===actor) w.turns[actor]=e.state.turn;
  if(!activeEnemies(b).length) finishCaseBattle(w);
}

export function battleView(map:CaseMap,site:Site) {
  const b=map.battle;
  if(!b || b.site!==site) return;
  const visible=activeEnemies(b).filter(e=>!e.tactics.dispersed && (!e.tactics.concealed || (e.tactics.scanned ?? 0)>=b.round));
  return {id:b.id,title:b.title ?? definitions[b.id].title,phase:b.phase,round:b.round,active:b.active,
    enemies:visible.map(e=>({id:e.id,name:enemies[e.kind].name,position:e.state.ghost,hp:e.state.ghostHealth,telegraph:e.tactics.telegraph,
      defense:e.tactics.profile?.combat && {PDEF:e.tactics.profile.combat.PDEF,MDEF:e.tactics.profile.combat.MDEF}})),
    danger:activeEnemies(b).flatMap(e=>e.tactics.telegraph?.cells ?? []),
    projections:[...b.projections,...(b.focusCell&&!b.armorDisabled?[b.focusCell]:[])],flooded:b.flooded ?? [],objective:!!b.focusCell&&!b.armorDisabled || b.projections.length>0,
    reaction:b.enemies[0].tactics.reaction,restrained:b.enemies[0].tactics.restrained,
  };
}
