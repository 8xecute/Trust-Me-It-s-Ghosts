import { startTurn, type TurnState } from '@baan/shared';
import { startGhostEncounter, playerGhostAction, runGhostPhase, type GhostEncounter } from '@baan/shared';
export type Cell = {x:number;y:number};
export type WorldAction = {id:string; type:'move'; target:Cell} | {id:string;type:'open'|'close'|'collect';objectId:string} | {id:string;type:'start'|'endTurn'|'pacify'|'strike'|'escape'};
export interface World { revision:number; players:Record<string,Cell>; objects:Record<string,{x:number;y:number;state:'closed'|'open'|'locked'|'static';evidenceId?:string;collected?:boolean}>; evidence:string[]; inventory:Record<string,string[]>; encounter:GhostEncounter|null; activePlayer:string|null; roundStart:string|null; turns:Record<string,TurnState>; }
const walls=Array.from({length:10},(_,x)=>({x,y:0}));
const obstacles=[{x:1,y:4},{x:2,y:7},{x:8,y:5},{x:7,y:8}];
const house=Array.from({length:12},(_,i)=>({x:3+i%4,y:2+Math.floor(i/4)}));
const grid={width:10,height:10,blocked:[...walls,...obstacles,...house,{x:2,y:5},{x:7,y:6},{x:5,y:8}]};
const eq=(a:Cell,b:Cell)=>a.x===b.x && a.y===b.y;
export class WorldStore {
 private worlds=new Map<string,World>(); private seen=new Map<string,Map<string,number>>();
 create(code:string){this.worlds.set(code,{revision:0,players:{},objects:{box:{x:2,y:5,state:'closed'},'locked-box':{x:7,y:6,state:'locked'},clue:{x:5,y:8,state:'static',evidenceId:'evidence-1'}},evidence:[],inventory:{},encounter:null,activePlayer:null,roundStart:null,turns:{}});this.seen.set(code,new Map());}
 addPlayer(code:string,id:string){const w=this.get(code); const spawns=[{x:4,y:7},{x:3,y:7},{x:6,y:7},{x:4,y:8}]; const p=spawns.find(p=>!Object.values(w.players).some(q=>eq(p,q))); if(!p) throw Error('ไม่มีตำแหน่งว่าง'); w.players[id]=p; w.inventory[id]=[]; w.turns[id]=startTurn(); w.revision++;}
 removePlayer(code:string,id:string){const w=this.get(code); delete w.players[id]; delete w.inventory[id]; delete w.turns[id]; if(w.roundStart===id) w.roundStart=Object.keys(w.players)[0] ?? null; if(w.activePlayer===id) w.activePlayer=Object.keys(w.players)[0] ?? null; w.revision++;}
 snapshot(code:string){return structuredClone(this.get(code));}
 delete(code:string){this.worlds.delete(code);this.seen.delete(code);}
 apply(code:string,player:string,input:unknown):{snapshot:World;duplicate:boolean} {
  const w=this.get(code); if(!w.players[player]) throw Error('ไม่พบผู้เล่น');
  if(!input || typeof input!=='object') throw Error('คำขอไม่ถูกต้อง'); const a=input as WorldAction;
  if(typeof a.id!=='string'||a.id.length<1||a.id.length>100 || typeof a.type!=='string') throw Error('คำขอไม่ถูกต้อง');
  const dedupe=player+':'+a.id; const seen=this.seen.get(code)!; if(seen.has(dedupe)) return {snapshot:this.snapshot(code),duplicate:true};
  const pos=w.players[player];
  if(w.encounter && w.encounter.phase!=='resolved' && ['move','endTurn','pacify','strike','escape'].includes(a.type) && w.activePlayer!==player) throw Error('ยังไม่ถึงเทิร์นของผู้เล่น');

  switch(a.type){
   case 'move': {const t=a.target;if(!t||!Number.isInteger(t.x)||!Number.isInteger(t.y)||t.x<0||t.y<0||t.x>=10||t.y>=10||Math.abs(pos.x-t.x)+Math.abs(pos.y-t.y)!==1||grid.blocked.some(p=>eq(p,t))||Object.entries(w.players).some(([id,p])=>id!==player&&eq(p,t))||!!(w.encounter && w.encounter.phase!=='resolved'&&eq(w.encounter.ghost,t))) throw Error('เดินไม่ได้'); if(w.encounter && w.encounter.phase!=='resolved'){if(w.encounter.turn.ap<1)throw Error('AP ไม่พอ');w.encounter={...w.encounter,player:{...t},turn:{...w.encounter.turn,ap:w.encounter.turn.ap-1}};} w.players[player]={...t};break;}
   case 'open': case 'close': case 'collect': {const o=w.objects[a.objectId]; if(!o||Math.abs(pos.x-o.x)+Math.abs(pos.y-o.y)>1)throw Error('วัตถุอยู่ไกลเกินไป'); if(a.type==='open'&&o.state==='closed')o.state='open'; else if(a.type==='close'&&o.state==='open')o.state='closed'; else if(a.type==='collect'&&o.evidenceId&&!o.collected){o.collected=true;w.evidence.push(o.evidenceId);w.inventory[player].push(o.evidenceId);}else throw Error('ทำรายการไม่ได้'); break;}
   case 'start': if(w.encounter && w.encounter.phase!=='resolved') throw Error('กำลังเผชิญหน้า'); w.encounter=startGhostEncounter(pos,{x:9,y:9}); w.activePlayer=player; w.roundStart=player; for(const id of Object.keys(w.players)) w.turns[id]=startTurn(); break;
   case 'endTurn': if(!w.encounter || w.encounter.phase!=='player')throw Error('ไม่มีเทิร์น'); { const ids=Object.keys(w.players), next=ids[(ids.indexOf(player)+1)%ids.length]; if(next===w.roundStart) { w.encounter=runGhostPhase({...w.encounter,player:pos},grid); for(const id of ids) w.turns[id]=startTurn(); } w.activePlayer=next; w.encounter={...w.encounter,turn:w.turns[next]}; } break;
   case 'pacify': case 'strike': case 'escape': {if(!w.encounter)throw Error('ไม่มีการเผชิญหน้า'); const next=playerGhostAction({...w.encounter,player:pos},a.type,grid); if(next.phase===w.encounter.phase && next.turn.ap===w.encounter.turn.ap)throw Error('ทำรายการไม่ได้');w.encounter=next;break;}
   default: throw Error('ไม่รู้จักคำสั่ง');
  }
  if(w.encounter && w.encounter.phase!=='resolved' && w.activePlayer===player && a.type!=='endTurn') w.turns[player]=w.encounter.turn;
  w.revision++;seen.set(dedupe,w.revision);return {snapshot:this.snapshot(code),duplicate:false};
 }
 private get(code:string){const w=this.worlds.get(code);if(!w)throw Error('ไม่พบสถานะห้อง');return w;}
}
