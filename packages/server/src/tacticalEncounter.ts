import { characterAttribute, liteAttack, liteDefense } from '@baan/shared';
import {
  ghostDecision, ghostMovementBudget, manifestationDamage, professionTechniques, resolveCheck, spendAction, startTurn,
  type Attribute, type GhostGrid,
} from '@baan/shared';
import type { CaseAttack, CaseCombatStats } from './case001/caseCombatStats.js';
import type { Cell, World } from './world.js';

type Telegraph = { kind: 'wail' | 'lash'; cells: Cell[]; attack?:CaseAttack; interceptedBy?: string };
export interface GhostProfile {
  movement: number;
  combat?:CaseCombatStats;
  special?: 'wail'|'lash';
  restrains?: boolean;
  armor: number;
  boss?: boolean;
  canPacify?: boolean;
  anchorActive?: boolean;
}

export interface Tactics {
  profile?: GhostProfile;
  calmUntil?: number;
  dispersed?: {until:number; manifestation:number};
  round: number;
  reaction: Record<string, number>;
  used: string[];
  defense: Record<string, number>;
  restrained: Record<string, number>;
  telegraph?: Telegraph;
  nextSpecial?: Telegraph['kind'];
  zones: Record<string,{ center: Cell; until: number }>;
  devices: Record<string,Cell>;
  exposed?: {actor:string;until:number};
  immobilized?: number;
  weakened?: number;
  scanned?: number;
  concealed?: boolean;
  traps: Record<string, Cell>;
}

export const newTactics = (profile?:GhostProfile): Tactics => ({
  ...(profile ? {profile:{...profile}} : {}),
  round: 1, reaction: {}, used: [], defense: {}, restrained: {}, traps: {}, zones:{}, devices:{},
});
const distance = (a: Cell, b: Cell) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const same = (a: Cell, b: Cell) => distance(a,b)===0;
const reject = (message='เป้าหมายหรือจังหวะไม่ถูกต้อง'): never => { throw Error(message); };

function check(w: World, actor: string, stat: Attribute, roll: () => number, boost?: 'focus', dc=12) {
  const result = resolveCheck({dc, attribute:characterAttribute(w.characters![actor],stat), boost},roll);
  w.lastCheck = {playerId:actor, ...result};
  return result.outcome==='success';
}

function free(w: World, grid: GhostGrid, p: Cell, mover?: string) {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x>=0 && p.y>=0 && p.x<grid.width && p.y<grid.height &&
    !grid.blocked.some(cell=>same(cell,p)) &&
    !Object.entries(w.players).some(([id,cell])=>id!==mover && same(cell,p)) &&
    (mover===undefined || !same(w.encounter!.ghost,p));
}

function readCell(input: unknown): Cell {
  if (!input || typeof input!=='object' || !('x' in input) || !('y' in input) ||
    typeof input.x!=='number' || typeof input.y!=='number') return reject();
  return {x:input.x,y:input.y};
}

function soothe(w:World) {
  if(w.tactics!.profile?.canPacify===false) {
    w.tactics!.calmUntil=w.tactics!.round;
    delete w.tactics!.telegraph;
  } else Object.assign(w.encounter!,{phase:'resolved',outcome:'pacified',disposition:'pacified'});
}

function dispel(w: World, amount: number) {
  const final=w.caseMap?.battle?.final55;
  if(final?.shield==='up') {
    final.damageBlocked=true;
    return;
  }
  const e = w.encounter!;
  const before=e.ghostHealth;
  e.ghostHealth=Math.max(0,before-amount);
  if(e.ghostHealth) return;
  e.manifestation=0;
  if(w.tactics!.profile?.anchorActive) {
    w.tactics!.dispersed={until:w.tactics!.round+2,manifestation:before};
    delete w.tactics!.telegraph;
  } else Object.assign(e,{phase:'resolved',outcome:'defeated'});
}

export function applyTechnique(
  w: World, actor: string, action: { type: string; targetId?: unknown; target?: unknown; allyTarget?: unknown; boost?: unknown },
  grid: GhostGrid, roll: () => number,
) {
  const t=w.tactics, e=w.encounter, character=w.characters?.[actor], from=w.players[actor];
  if (!t || !e || e.phase!=='player' || !character || character.hp===0 || w.humanDmId===actor) return reject('ใช้ความสามารถไม่ได้');
  const talent=professionTechniques[character.profession].talents.find(entry=>entry.id===character.talent);
  const passive=action.type==='usePassive';
  const id=passive ? professionTechniques[character.profession].passive : talent?.id;
  const reaction=id==='bodyguard' || (!passive && talent?.reaction);
  const boost=action.boost==='focus' ? 'focus' : undefined;
  if (action.boost!==undefined && !boost) return reject();
  if (reaction ? t.reaction[actor]===t.round || !t.telegraph : w.activePlayer!==actor) return reject('ยังใช้ในจังหวะนี้ไม่ได้');
  if (boost && !['soothe_spirit','spirit_binding','clearing_bash','silence_wail','ritual_jammer'].includes(id ?? '')) return reject();
  if ((!passive || boost) && character.sanity===0) return reject('ตื่นตระหนกจนใช้สมาธิไม่ได้');
  const payment=spendAction(w.turns[actor],character.focus,{
    ap:passive ? (id==='emergency_response'?2:0) : talent?.ap ?? 0,
    focus:(passive?0:talent?.focus ?? 0)+Number(!!boost),
  }) ?? reject('AP หรือสมาธิไม่พอ');
  const targetId=typeof action.targetId==='string' ? action.targetId : actor;
  const ally=()=>w.characters?.[targetId] && w.players[targetId] && w.humanDmId!==targetId &&
    w.characters[targetId] || reject();
  const nearby=(range: number, self=false)=>{
    const target=ally();
    if ((!self && targetId===actor) || distance(from,w.players[targetId])>range) return reject();
    return target;
  };
  const once=(key: string)=>{
    if(t.used.includes(key)) return reject('ใช้สิทธิ์นี้ไปแล้ว');
    t.used.push(key);
  };
  const ghost=(range: number)=>{
    if (t.dispersed || (t.concealed && (t.scanned ?? 0)<t.round) || distance(from,e.ghost)>range) return reject('มองไม่เห็นผีหรืออยู่นอกระยะ');
  };
  const threatened=(player: string)=>t.telegraph?.cells.some(cell=>same(cell,w.players[player])) ?? false;
  const prepared=()=>t.telegraph ?? reject('ยังไม่มีการโจมตีพิเศษที่เตรียมไว้');
  const canMove=(who: string, to: Cell, range: number)=>{
    const origin=w.players[who], steps=distance(origin,to);
    if (!steps || steps>range || (t.restrained[who] ?? 0)>=t.round || !free(w,grid,to,who)) return reject();
    if (steps===2 && ![{x:to.x,y:origin.y},{x:origin.x,y:to.y},
      {x:(origin.x+to.x)/2,y:(origin.y+to.y)/2}]
      .some(cell=>distance(origin,cell)===1 && distance(cell,to)===1 && free(w,grid,cell,who))) return reject();
  };
  const rollSkill=(stat: Attribute)=>check(w,actor,stat,roll,boost);
  const installTrap=()=>{
    const cell=readCell(action.target);
    if (distance(from,cell)!==1 || !free(w,grid,cell,actor) ||
      Object.values(t.traps).some(trap=>same(trap,cell)) || t.traps[actor]) return reject();
    t.traps[actor]=cell;
  };

  switch(id) {
    case 'protective_talisman': nearby(2); t.defense[targetId]=t.round; break;
    case 'break_bindings':
      nearby(2); if ((t.restrained[targetId] ?? 0)<t.round) return reject();
      delete t.restrained[targetId]; break;
    case 'ritual_zone': {
      const center=readCell(action.target);
      if (distance(from,center)>3 || !free(w,grid,center) || t.zones[actor]) return reject();
      t.zones[actor]={center,until:t.round}; break;
    }
    case 'weakness_analysis': ghost(4); t.exposed={actor,until:t.round+1}; break;
    case 'evasive_step': {
      const to=readCell(action.target);
      if (!threatened(actor)) return reject();
      canMove(actor,to,2); w.players[actor]=to; break;
    }
    case 'spirit_binding': ghost(2); if(rollSkill('body')) t.immobilized=t.round; break;
    case 'defensive_line':
      for(const [id,cell] of Object.entries(w.players)) if(distance(from,cell)<=1) t.defense[id]=t.round;
      break;
    case 'clearing_bash': {
      ghost(1);
      if(rollSkill('body')) {
        const dx=e.ghost.x-from.x,dy=e.ghost.y-from.y;
        for(let step=0;step<2;step++) {
          const cell={x:e.ghost.x+dx,y:e.ghost.y+dy};
          if (!free(w,grid,cell)) break;
          if (moveGhost(w,cell,roll) || e.outcome || t.dispersed) break;
        }
        if(!t.dispersed && !e.outcome) dispel(w,1);
      }
      break;
    }
    case 'soothe_spirit':
      ghost(4);
      if(rollSkill('spirit')) soothe(w);
      break;
    case 'share_composure': {
      const target=nearby(1);
      if (target.sanity===10) return reject();
      once('share:'+targetId); target.sanity++; break;
    }
    case 'silence_wail':
      if(prepared().kind!=='wail') return reject();
      ghost(4); if(rollSkill('spirit')) delete t.telegraph; break;
    case 'electric_talisman_trap': installTrap(); break;
    case 'spirit_scanner': {
      if (distance(from,e.ghost)>4 || !hasLineOfEffect(from,e.ghost,grid)) return reject('สแกนไม่ถึงเป้าหมาย');
      t.scanned=t.round+1; break;
    }
    case 'ritual_jammer':
      ghost(4);
      if(t.profile?.boss) prepared();
      if(rollSkill('knowledge')) {
        if(t.profile?.boss) delete t.telegraph;
        else t.weakened=t.round;
      }
      break;
    case 'field_first_aid': {
      const target=nearby(1,true);
      if(target.hp===0 || target.hp===10) return reject();
      once('heal:'+targetId); target.hp=Math.min(10,target.hp+3); break;
    }
    case 'composure_kit': {
      const target=nearby(1);
      if(target.sanity===10) return reject();
      once('kit:'+targetId); target.sanity=target.sanity===0?1:Math.min(10,target.sanity+2); break;
    }
    case 'emergency_drag': {
      nearby(1);
      const to=readCell(action.target), other=readCell(action.allyTarget);
      if (!threatened(targetId) || same(to,other)) return reject();
      if (!same(to,from)) canMove(actor,to,1);
      if (!same(other,w.players[targetId])) canMove(targetId,other,1);
      if (same(to,from) && same(other,w.players[targetId])) return reject();
      w.players[actor]=to; w.players[targetId]=other; break;
    }
    case 'bodyguard':
      nearby(1);
      if(prepared().kind!=='lash' || prepared().interceptedBy || !threatened(targetId)) return reject();
      prepared().interceptedBy=actor; break;
    case 'emergency_response': {
      const target=nearby(1);
      if(target.hp!==0) return reject();
      once(actor+':emergency'); once('stabilized:'+targetId); target.hp=3; break;
    }
    case 'field_technician': {
      once(actor+':setup');
      if(t.traps[actor]) return reject();
      const cell=readCell(action.target);
      if(distance(from,cell)!==1 || !free(w,grid,cell,actor)) return reject();
      t.devices[actor]=cell;
      if(distance(cell,e.ghost)<=2) t.scanned=t.round; break;
    }
    default: return reject('ใช้ความสามารถนี้กับการทดสอบหรือฉากที่เกี่ยวข้อง');
  }

  character.focus=payment.focus;
  w.turns[actor]=payment.turn;
  if (w.activePlayer===actor) e.turn=payment.turn;
  if (reaction) t.reaction[actor]=t.round;
}

function hasLineOfEffect(from: Cell, to: Cell, grid: GhostGrid) {
  const steps=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y));
  for(let step=1;step<steps;step++) {
    const cell={x:Math.round(from.x+(to.x-from.x)*step/steps),y:Math.round(from.y+(to.y-from.y)*step/steps)};
    if (grid.blocked.some(block=>same(block,cell))) return false;
  }
  return true;
}

function moveGhost(w: World, cell: Cell, roll: () => number) {
  const t=w.tactics!;
  w.encounter!.ghost=cell;
  const trap=Object.entries(t.traps).find(([,point])=>same(point,cell));
  if(!trap) return false;
  const [owner]=trap;
  delete t.traps[owner];
  if(!w.characters?.[owner] || !check(w,owner,'knowledge',roll)) return false;
  dispel(w,2);
  return !t.profile?.boss;
}

export function resolveNpcAttack(target: NonNullable<World['characters']>[string], attack:CaseAttack, bonus:number, die:number, guard:boolean) {
  const defense=target.coreStats ? liteDefense(target.coreStats,attack.targetDefense,guard) :
    10+characterAttribute(target,attack.targetDefense==='PDEF'?'body':'spirit')+(guard?2:0);
  const hit=liteAttack({roll:die,bonus,defense,damage:attack.damage,physical:false,manifestation:'HUMAN'});
  if(attack.damageResource==='Sanity') target.sanity=Math.max(0,target.sanity-hit.damage);
  else target.hp=Math.max(0,target.hp-hit.damage);
  return {die,total:die+bonus,damage:hit.damage,outcome:hit.hit?'success' as const:'failure' as const};
}

export function advanceTactics(w: World, grid: GhostGrid, roll: () => number, resetTurns = true) {
  const t=w.tactics!, e=w.encounter!;
  const targets=Object.entries(w.players).filter(([id])=>id!==w.humanDmId && (w.characters?.[id]?.hp ?? 0)>0);
  if (!targets.length) return;
  targets.sort((a,b)=>distance(a[1],e.ghost)-distance(b[1],e.ghost));
  const final=w.caseMap?.battle;
  if(final?.final55 && final.phase==='flood_memory') {
    const ritualActor=final.final55.ritualActor;
    const reachable=targets.find(([id,cell])=>id===ritualActor && hasLineOfEffect(e.ghost,cell,grid) &&
      t.profile?.combat?.attacks.some(attack=>!attack.requires && attack.range>=distance(cell,e.ghost)));
    if(reachable) {
      targets.splice(targets.indexOf(reachable),1);
      targets.unshift(reachable);
    }
  }
  const [,nearest]=targets[0];
  const pending=t.telegraph;
  delete t.telegraph;
  const canAct=!t.dispersed && (t.calmUntil ?? 0)<t.round;
  const combat=t.profile?.combat;
  const range=distance(nearest,e.ghost);
  const attacks=combat?.attacks.filter(option=>!option.requires && option.range>=range &&
    (option.id!=='FLOOD_MEMORY' || w.caseMap?.battle?.phase==='flood_memory')) ?? [];
  const attack=(t.nextSpecial==='wail' ? attacks.find(option=>option.id==='FLOOD_MEMORY') : undefined) ??
    attacks.find(option=>(option.targetDefense==='MDEF')===(t.nextSpecial==='wail')) ?? attacks[0];
  if (canAct && pending) {
    const victims=pending.interceptedBy && targets.some(([id])=>id===pending.interceptedBy) ?
      targets.filter(([id])=>id===pending.interceptedBy) : targets.filter(([,cell])=>pending.cells.some(point=>same(point,cell)));
    for (const [id,cell] of victims.slice(0,combat || pending.kind==='lash' ? 1 : 2)) {
      const target=w.characters![id];
      const penalty=(t.weakened ?? 0)>=t.round ||
        Object.values(t.zones).some(zone=>Math.abs(cell.x-zone.center.x)<=1 && Math.abs(cell.y-zone.center.y)<=1);
      if(combat && pending.attack) {
        const attack=pending.attack;
        const guard=(t.defense[id] ?? 0)>=t.round;
        if(guard) delete t.defense[id];
        const result=resolveNpcAttack(target,attack,combat.ATK-(penalty?2:0),roll(),guard);
        if(result.outcome==='success' && attack.condition==='ROOTED') t.restrained[id]=t.round+1;
        continue;
      }
      const result=resolveCheck({dc:12+((t.defense[id] ?? 0)>=t.round?2:0),attribute:2-(penalty?2:0)},roll);
      if(result.outcome!=='success') continue;
      if(pending.kind==='wail') target.sanity=Math.max(0,target.sanity-1);
      else {
        target.hp=Math.max(0,target.hp-(targets.length>2?2:1));
        if(t.profile?.restrains!==false) t.restrained[id]=t.round+1;
      }
    }
  } else if (canAct && (combat ? !!attack && hasLineOfEffect(e.ghost,nearest,grid) : range<=1)) {
    t.concealed=false;
    const kind=attack ? (attack.targetDefense==='MDEF'?'wail':'lash') : t.profile?.special ?? t.nextSpecial ?? 'wail';
    t.nextSpecial=kind==='wail'?'lash':'wail';
    t.telegraph={kind,attack,cells:(kind==='wail'?targets.filter(([,cell])=>distance(cell,e.ghost)<=(attack?.range ?? 2) && (!attack || hasLineOfEffect(e.ghost,cell,grid))).slice(0,2):targets.slice(0,1)).map(([,cell])=>({...cell}))};
  } else if (canAct) {
    const budget=ghostMovementBudget(t.profile?.movement ?? 1,(t.immobilized ?? 0)>=t.round,!!t.profile?.boss);
    const movementGrid={...grid,blocked:[...grid.blocked,...Object.values(w.players)]};
    for(let step=0;step<budget;step++) {
      const decision=ghostDecision({...e,phase:'ghost',player:nearest},movementGrid);
      if(!decision.target) break;
      if(moveGhost(w,decision.target,roll) || e.outcome || t.dispersed) break;
    }
    t.concealed=targets.every(([,cell])=>!hasLineOfEffect(cell,e.ghost,grid));
    if(Object.values(t.devices).some(cell=>distance(cell,e.ghost)<=2)) t.scanned=t.round+1;
  }
  for(const [owner,zone] of Object.entries(t.zones)) if(zone.until<=t.round) delete t.zones[owner];
  t.round++;
  if(t.dispersed && t.round>=t.dispersed.until && t.profile?.anchorActive) {
    e.ghostHealth=t.dispersed.manifestation;
    e.manifestation=1;
    delete t.dispersed;
  }
  if(resetTurns) for(const id of Object.keys(w.turns)) w.turns[id]=(w.characters?.[id]?.hp ?? 0)>0 ? startTurn() : {ap:0,focused:false};
}

export function stabilize(w: World, actor: string, input: unknown, roll: () => number, checkDistance=true) {
  const t=w.tactics, e=w.encounter, character=w.characters?.[actor];
  if(!t || e?.phase!=='player' || !character?.hp || typeof input!=='string' || input===actor ||
    !w.players[input] || w.characters?.[input]?.hp!==0 || (checkDistance && distance(w.players[actor],w.players[input])!==1) ||
    t.used.includes('stabilized:'+input)) return reject();
  const paid=spendAction(w.turns[actor],character.focus,{ap:2,focus:0}) ?? reject('AP ไม่พอ');
  if((!w.basicMode && character.profession==='field_medic') || check(w,actor,'knowledge',roll,undefined,8)) {
    w.characters![input].hp=1;
    t.used.push('stabilized:'+input);
  }
  e.turn=paid.turn;
}

export function negotiateV2(w: World, actor: string, roll: () => number, checkDistance=true, response:'resolve'|'hesitate'|'respond'='resolve') {
  const e=w.encounter, character=w.characters?.[actor], t=w.tactics;
  if(!e || !t || e.phase!=='player' || !character?.hp || !character.sanity ||
    (checkDistance && distance(w.players[actor],e.ghost)!==1) || t.dispersed || (t.concealed && (t.scanned ?? 0)<t.round)) return reject();
  const paid=spendAction(w.turns[actor],character.focus,{ap:2,focus:0}) ?? reject('AP ไม่พอ');
  if(check(w,actor,'spirit',roll,undefined,t.profile?.combat?.MDEF ?? 12)) {
    if(response==='resolve')soothe(w);
    else if(response==='hesitate') {t.calmUntil=t.round;delete t.telegraph;}
  }
  e.turn=paid.turn;
}

export function strikeV2(w: World, actor: string, roll: () => number, checkDistance=true) {
  const e=w.encounter!, t=w.tactics!, character=w.characters?.[actor];
  if (!character || character.hp===0 || e.phase!=='player' || t.dispersed || (checkDistance && distance(w.players[actor],e.ghost)!==1) ||
    (t.concealed && (t.scanned ?? 0)<t.round)) return reject();
  const paid=spendAction(w.turns[actor],character.focus,{ap:2,focus:0}) ?? reject('AP ไม่พอ');
  const exposed=!!t.exposed && t.exposed.actor!==actor && t.exposed.until>=t.round;
  const combat=t.profile?.combat;
  if(combat) {
    const die=roll(), bonus=characterAttribute(character,'body')+(exposed?2:0);
    const result=liteAttack({roll:die,bonus,defense:combat.PDEF,damage:w.basicMode?2:1,physical:true,manifestation:combat.manifestation});
    if(exposed) delete t.exposed;
    w.lastCheck={playerId:actor,die,total:die+bonus,outcome:result.hit?'success':'failure'};
    e.turn=paid.turn;
    if(result.damage) dispel(w,result.damage);
    return;
  }
  const result=resolveCheck({dc:12,attribute:characterAttribute(character,'body'),equipment:exposed?2:0,partial:true},roll);
  if(exposed) delete t.exposed;
  w.lastCheck={playerId:actor,...result};
  e.turn=paid.turn;
  const armor=Math.max(0,(t.profile?.armor ?? 0)-Number(exposed));
  const damage=manifestationDamage(result.outcome,result.critical,armor);
  if(damage) dispel(w,damage);
}
