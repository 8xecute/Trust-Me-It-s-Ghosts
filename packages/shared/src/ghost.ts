import { startTurn, spendAP, type TurnState } from './turn.js';
export type Point = {x:number;y:number};
export type GhostOutcome = 'pacified' | 'escaped' | 'defeated';
export interface GhostEncounter { phase: 'player' | 'ghost' | 'resolved'; outcome: GhostOutcome | null; turn: TurnState; player: Point; ghost: Point; ghostHealth: number; playerHealth: number; manifestation: number; disposition: 'hostile' | 'pacified' }
export interface GhostGrid { width:number; height:number; blocked: readonly Point[] }
const distance = (a:Point,b:Point) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const same = (a:Point,b:Point) => a.x===b.x && a.y===b.y;
const key = (p:Point) => `${p.x},${p.y}`;
const dirs = [{x:0,y:-1},{x:-1,y:0},{x:1,y:0},{x:0,y:1}];
export function startGhostEncounter(player: Point, ghost: Point): GhostEncounter { return {phase:'player',outcome:null,turn:startTurn(),player:{...player},ghost:{...ghost},ghostHealth:2,playerHealth:3,manifestation:1,disposition:'hostile'}; }
/** Deterministic BFS to a free cell adjacent to the player; ties use fixed direction order. */
export function ghostDecision(s: GhostEncounter, grid: GhostGrid): {type:'attack'|'move'|'wait'; target?:Point} {
 if (s.disposition !== 'hostile' || s.phase !== 'ghost') return {type:'wait'};
 if (distance(s.ghost,s.player) === 1) return {type:'attack'};
 const queue: {p:Point; first:Point|null}[] = [{p:s.ghost,first:null}]; const seen = new Set([key(s.ghost)]);
 for(let i=0;i<queue.length;i++){ const cur=queue[i]; if(cur.first && distance(cur.p,s.player)===1) return {type:'move',target:cur.first};
  for(const d of dirs){const n={x:cur.p.x+d.x,y:cur.p.y+d.y}; if(n.x<0||n.y<0||n.x>=grid.width||n.y>=grid.height||same(n,s.player)||grid.blocked.some(b=>same(b,n))||seen.has(key(n))) continue; seen.add(key(n)); queue.push({p:n,first:cur.first ?? n});}
 } return {type:'wait'};
}
export function playerGhostAction(s: GhostEncounter, action:'pacify'|'strike'|'escape', grid:GhostGrid): GhostEncounter {
 if(s.phase!=='player' || s.outcome || s.turn.ap<1) return s;
 if(action==='escape' && !(s.player.x===0||s.player.y===0||s.player.x===grid.width-1||s.player.y===grid.height-1)) return s;
 if(action!=='escape' && distance(s.player,s.ghost)>1) return s;
 const turn=spendAP(s.turn,1)!;
 if(action==='escape') return {...s,turn,phase:'resolved',outcome:'escaped'};
 if(action==='pacify') return {...s,turn,disposition:'pacified',phase:'resolved',outcome:'pacified'};
 const ghostHealth=s.ghostHealth-1; return {...s,turn,ghostHealth,...(ghostHealth<=0?{phase:'resolved' as const,outcome:'defeated' as const,manifestation:0}:{})};
}
export function runGhostPhase(s:GhostEncounter, grid:GhostGrid): GhostEncounter {
 if(s.phase!=='player' || s.outcome) return s;
 const next={...s,phase:'ghost' as const}; const action=ghostDecision(next,grid);
 return {...next,phase:'player',turn:startTurn(),ghost:action.type==='move'?action.target!:s.ghost,playerHealth:action.type==='attack'?Math.max(0,s.playerHealth-1):s.playerHealth,manifestation:Math.min(3,s.manifestation+1)};
}
