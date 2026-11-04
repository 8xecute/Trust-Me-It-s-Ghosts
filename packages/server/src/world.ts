import { newCase, caseView, applyCaseAction, type CaseState } from './case001.js';
import { readFileSync } from 'node:fs';
import { parseScenarioJSON, applyScenarioEvent, getScriptedDmView, type ScriptedDmView, type ScenarioProgress } from '@baan/shared';
import { randomInt, randomUUID } from 'node:crypto';
import { startTurn, spendAP, focus, skillCheck, type TurnState, type CheckOutcome } from '@baan/shared';
import { startGhostEncounter, playerGhostAction, runGhostPhase, type GhostEncounter } from '@baan/shared';
export type Cell = {x:number;y:number};
export type WorldAction = {id:string;type:'caseStart'} | {id:string;type:'caseAction';actionId:string} | {id:string; type:'claimDm'|'releaseDm'} | {id:string; type:'dmEvent'|'dmDialogue'|'dmScene'|'dmRequestRoll'; targetId:string} | {id:string; type:'dmRoll'; requestId:string} | {id:string; type:'chooseDialogue'; dialogueId:string; choiceId:string} | {id:string; type:'move'; target:Cell} | {id:string;type:'open'|'close'|'collect';objectId:string} | {id:string;type:'start'|'endTurn'|'pacify'|'strike'|'escape'|'focus'|'check'};
export interface World { revision:number; players:Record<string,Cell>; objects:Record<string,{x:number;y:number;state:'closed'|'open'|'locked'|'static';evidenceId?:string;collected?:boolean}>; evidence:string[]; inventory:Record<string,string[]>; encounter:GhostEncounter|null; activePlayer:string|null; roundStart:string|null; turns:Record<string,TurnState>; lastCheck:{playerId:string;die:number;total:number;outcome:CheckOutcome}|null; case001?:CaseState; scenario:ScenarioProgress; humanDmId:string|null; diceRequest:{id:string;playerId:string;die:number|null}|null; }
type Snapshot = Omit<World,'case001'> & {dm:ScriptedDmView;case001?:ReturnType<typeof caseView>};
const scenario = parseScenarioJSON(readFileSync(new URL('../scenarios/sample.json', import.meta.url), 'utf8'));
type DmScript = {script:string; secret:string; next:string[]; dialogue:string[]; events:{id:string;text:string}[]};
const dmScripts: Record<string,DmScript> = JSON.parse(readFileSync(new URL('../scenarios/sample.dm.json', import.meta.url), 'utf8')).scenes;
const walls=Array.from({length:10},(_,x)=>({x,y:0}));
const obstacles=[{x:1,y:4},{x:2,y:7},{x:8,y:5},{x:7,y:8}];
const house=Array.from({length:12},(_,i)=>({x:3+i%4,y:2+Math.floor(i/4)}));
const grid={width:10,height:10,blocked:[...walls,...obstacles,...house,{x:2,y:5},{x:7,y:6},{x:5,y:8}]};
const eq=(a:Cell,b:Cell)=>a.x===b.x && a.y===b.y;
export class WorldStore {
 constructor(private readonly rollD20: () => number = () => randomInt(1, 21)) {}
 private worlds=new Map<string,World>(); private seen=new Map<string,Map<string,number>>();
 create(code:string){this.worlds.set(code,{revision:0,players:{},objects:{box:{x:2,y:5,state:'closed'},'locked-box':{x:7,y:6,state:'locked'},clue:{x:5,y:8,state:'static',evidenceId:'evidence-1'}},evidence:[],inventory:{},encounter:null,activePlayer:null,roundStart:null,turns:{},lastCheck:null,humanDmId:null,diceRequest:null,scenario:applyScenarioEvent(scenario,{sceneId:scenario.scenes[0].id,evidence:[],objectives:[],firedTriggers:[],endingId:null},'enter-yard')});this.seen.set(code,new Map());}
 addPlayer(code:string,id:string){const w=this.get(code); const spawns=[{x:4,y:7},{x:3,y:7},{x:6,y:7},{x:4,y:8}]; const p=spawns.find(p=>!Object.values(w.players).some(q=>eq(p,q))); if(!p) throw Error('ไม่มีตำแหน่งว่าง'); w.players[id]=p; w.inventory[id]=[]; w.turns[id]=startTurn(); w.revision++;}
 removePlayer(code:string,id:string){const w=this.get(code); delete w.players[id]; delete w.inventory[id]; delete w.turns[id]; if(w.humanDmId===id) w.humanDmId=null; if(w.diceRequest?.playerId===id) w.diceRequest=null; if(w.roundStart===id) w.roundStart=Object.keys(w.players)[0] ?? null; if(w.activePlayer===id) w.activePlayer=Object.keys(w.players)[0] ?? null; w.revision++;}
 dmPanel(code:string,player:string) {
  const w=this.get(code);
  if (!Object.hasOwn(w.players,player) || w.humanDmId!==player) throw Error('เฉพาะผู้ดำเนินเรื่อง');
  const script=dmScripts[w.scenario.sceneId];
  return {
   sceneId:w.scenario.sceneId, script:script.script, secret:script.secret,
   events:script.events.filter(event=>applyScenarioEvent(scenario,w.scenario,event.id)!==w.scenario),
   dialogue:scenario.dialogue.filter(line=>script.dialogue.includes(line.id)).map(({id,text})=>({id,text})),
   scenes:scenario.scenes.filter(scene=>script.next.includes(scene.id)),
  };
 }
 snapshot(code:string): Snapshot {
  const {case001,...world} = structuredClone(this.get(code));
  return {...world,case001:case001 && caseView(case001),dm:getScriptedDmView(scenario,world.scenario)};
 }
 delete(code:string){this.worlds.delete(code);this.seen.delete(code);}
 apply(code:string,player:string,input:unknown):{snapshot:Snapshot;duplicate:boolean} {
  const w=this.get(code); if(!w.players[player]) throw Error('ไม่พบผู้เล่น');
  if(!input || typeof input!=='object') throw Error('คำขอไม่ถูกต้อง'); const a=input as WorldAction;
  if(typeof a.id!=='string'||a.id.length<1||a.id.length>100 || typeof a.type!=='string') throw Error('คำขอไม่ถูกต้อง');
  const dedupe=player+':'+a.id; const seen=this.seen.get(code)!; if(seen.has(dedupe)) return {snapshot:this.snapshot(code),duplicate:true};
  if ('die' in a || 'roll' in a || 'total' in a || 'outcome' in a || 'dc' in a || 'modifier' in a) throw Error('คำขอไม่ถูกต้อง');
  const pos=w.players[player];
  if(w.encounter && w.encounter.phase!=='resolved' && ['move','endTurn','pacify','strike','escape','focus','check'].includes(a.type) && w.activePlayer!==player) throw Error('ยังไม่ถึงเทิร์นของผู้เล่น');

  if(w.case001 && a.type!=='caseAction' && a.type!=='caseStart') throw Error('ใช้คำสั่งจากหน้าคดี');
  switch(a.type){
   case 'caseStart': {
    if(w.case001 || (w.encounter && w.encounter.phase!=='resolved')) throw Error('เริ่มคดีไม่ได้');
    const count=Object.keys(w.players).filter(id=>id!==w.humanDmId).length;
    if(count<2 || count>4) throw Error('ต้องมีผู้สืบสวน 2–4 คน');
    w.case001=newCase();
    break;
   }
   case 'caseAction':
    if(!w.case001 || w.humanDmId===player) throw Error('เฉพาะผู้สืบสวนในคดี');
    w.case001=applyCaseAction(w.case001,a.actionId,this.rollD20);
    break;
   case 'claimDm':
    if(w.humanDmId && w.humanDmId!==player) throw Error('ห้องนี้มีผู้ดำเนินเรื่องแล้ว');
    w.humanDmId=player;
    break;
   case 'releaseDm':
    if(w.humanDmId!==player) throw Error('เฉพาะผู้ดำเนินเรื่อง');
    w.humanDmId=null;
    w.diceRequest=null;
    break;
   case 'dmEvent': case 'dmDialogue': case 'dmScene': case 'dmRequestRoll': {
    const panel=this.dmPanel(code,player);
    if(w.scenario.endingId) throw Error('การสำรวจสิ้นสุดแล้ว');
    if(a.type==='dmEvent') {
     if(!panel.events.some(event=>event.id===a.targetId)) throw Error('เหตุการณ์นี้ใช้ไม่ได้');
     w.scenario=applyScenarioEvent(scenario,w.scenario,a.targetId);
    } else if(a.type==='dmDialogue') {
     if(!panel.dialogue.some(line=>line.id===a.targetId)) throw Error('บทสนทนานี้ใช้ไม่ได้');
     w.scenario={...w.scenario,dialogueId:a.targetId};
    } else if(a.type==='dmScene') {
     if((w.encounter && w.encounter.phase!=='resolved') || !panel.scenes.some(scene=>scene.id===a.targetId)) throw Error('เปลี่ยนฉากไม่ได้');
     w.scenario=applyScenarioEvent(scenario,{...w.scenario,sceneId:a.targetId,dialogueId:null,narration:undefined},'enter-'+a.targetId);
    } else {
     if(typeof a.targetId!=='string' || !Object.hasOwn(w.players,a.targetId) || w.diceRequest?.die===null) throw Error('ขอทอยไม่ได้');
     w.diceRequest={id:randomUUID(),playerId:a.targetId,die:null};
    }
    break;
   }
   case 'dmRoll': {
    const request=w.diceRequest;
    if(!request || request.id!==a.requestId || request.playerId!==player || request.die!==null) throw Error('ไม่มีคำขอทอยที่ใช้ได้');
    w.diceRequest={...request,die:this.rollD20()};
    break;
   }
   case 'chooseDialogue': {
    const dialogue = getScriptedDmView(scenario,w.scenario).dialogue;
    if (!dialogue || dialogue.id !== a.dialogueId || !dialogue.choices.some(choice => choice.id === a.choiceId)) {
     throw Error('ตัวเลือกบทสนทนานี้ใช้ไม่ได้แล้ว');
    }
    w.scenario = applyScenarioEvent(scenario,w.scenario,'choice:' + a.choiceId);
    break;
   }
   case 'move': {const t=a.target;if(!t||!Number.isInteger(t.x)||!Number.isInteger(t.y)||t.x<0||t.y<0||t.x>=10||t.y>=10||Math.abs(pos.x-t.x)+Math.abs(pos.y-t.y)!==1||grid.blocked.some(p=>eq(p,t))||Object.entries(w.players).some(([id,p])=>id!==player&&eq(p,t))||!!(w.encounter && w.encounter.phase!=='resolved'&&eq(w.encounter.ghost,t))) throw Error('เดินไม่ได้'); if(w.encounter && w.encounter.phase!=='resolved'){const turn=spendAP(w.turns[player],1);if(!turn)throw Error('AP ไม่พอ');w.encounter={...w.encounter,player:{...t},turn};} w.players[player]={...t};break;}
   case 'open': case 'close': case 'collect': {const o=w.objects[a.objectId]; if(!o||Math.abs(pos.x-o.x)+Math.abs(pos.y-o.y)>1)throw Error('วัตถุอยู่ไกลเกินไป'); if(a.type==='open'&&o.state==='closed')o.state='open'; else if(a.type==='close'&&o.state==='open')o.state='closed'; else if(a.type==='collect'&&o.evidenceId&&!o.collected){o.collected=true;w.evidence.push(o.evidenceId);w.inventory[player].push(o.evidenceId);w.scenario=applyScenarioEvent(scenario,w.scenario,`collect:${a.objectId}`);}else throw Error('ทำรายการไม่ได้'); break;}
   case 'focus': { if(!w.encounter || w.encounter.phase!=='player') throw Error('ไม่มีเทิร์น'); const turn=focus(w.turns[player]); if(!turn) throw Error('ตั้งสมาธิไม่ได้'); w.encounter={...w.encounter,turn}; break; }
   case 'check': { if(!w.encounter || w.encounter.phase!=='player') throw Error('ไม่มีเทิร์น'); const result=skillCheck(w.turns[player],12,0,this.rollD20); if(!result) throw Error('AP ไม่พอ'); w.encounter={...w.encounter,turn:result.state}; w.lastCheck={playerId:player,die:result.die,total:result.total,outcome:result.outcome}; break; }
   case 'start': if(w.encounter && w.encounter.phase!=='resolved') throw Error('กำลังเผชิญหน้า'); w.encounter=startGhostEncounter(pos,{x:9,y:9}); w.activePlayer=player; w.roundStart=player; for(const id of Object.keys(w.players)) w.turns[id]=startTurn(); break;
   case 'endTurn': if(!w.encounter || w.encounter.phase!=='player')throw Error('ไม่มีเทิร์น'); { const ids=Object.keys(w.players), next=ids[(ids.indexOf(player)+1)%ids.length]; if(next===w.roundStart) { w.encounter=runGhostPhase({...w.encounter,player:pos},grid); for(const id of ids) w.turns[id]=startTurn(); } w.activePlayer=next; w.encounter={...w.encounter,turn:w.turns[next]}; } break;
   case 'pacify': case 'strike': case 'escape': {if(!w.encounter)throw Error('ไม่มีการเผชิญหน้า'); const next=playerGhostAction({...w.encounter,player:pos},a.type,grid); if(next.phase===w.encounter.phase && next.turn.ap===w.encounter.turn.ap)throw Error('ทำรายการไม่ได้');w.encounter=next;if(next.outcome==='pacified') w.scenario=applyScenarioEvent(scenario,w.scenario,'pacified');break;}
   default: throw Error('ไม่รู้จักคำสั่ง');
  }
  if(w.encounter && w.activePlayer===player && a.type!=='endTurn') w.turns[player]=w.encounter.turn;
  w.revision++;seen.set(dedupe,w.revision);return {snapshot:this.snapshot(code),duplicate:false};
 }
 private get(code:string){const w=this.worlds.get(code);if(!w)throw Error('ไม่พบสถานะห้อง');return w;}
}
