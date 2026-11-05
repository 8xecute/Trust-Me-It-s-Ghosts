import { advanceTactics, applyTechnique, newTactics, negotiateV2, stabilize, strikeV2, type Tactics } from './tacticalEncounter.js';
import { caseBattleAction, caseOpportunity, startCaseBattle, battleView, newCaseMap, removeCasePlayer, syncCaseBattle, travelCaseMap, type CaseMap } from './caseBattle.js';
import { newCase, caseView, caseDmView, applyCaseAction, failCase, tick, type CaseState } from './case001.js';
import { readFileSync } from 'node:fs';
import { parseScenarioJSON, applyScenarioEvent, getScriptedDmView, type ScriptedDmView, type ScenarioProgress } from '@baan/shared';
import { randomInt, randomUUID } from 'node:crypto';
import { caseGrid, validateBiography, type Biography, resolveCheck, spendAction, createCharacter, type Character, startTurn, spendAP, focus, skillCheck, type TurnState, type CheckOutcome } from '@baan/shared';
import { startGhostEncounter, playerGhostAction, runGhostPhase, type GhostEncounter } from '@baan/shared';
export type Cell = {x:number;y:number};
export type WorldAction = {id:string;type:'caseDm';targetId:string;actionId:string} | {id:string;type:'caseObjective'} | {id:string;type:'createCharacter';profession:unknown;bonus:unknown;talent?:unknown;background?:unknown;biography?:unknown} | {id:string;type:'caseStart'} | {id:string;type:'caseAction';actionId:string;boost?:unknown} | {id:string; type:'claimDm'|'releaseDm'} | {id:string; type:'dmEvent'|'dmDialogue'|'dmScene'|'dmRequestRoll'; targetId:string} | {id:string; type:'dmRoll'; requestId:string} | {id:string; type:'chooseDialogue'; dialogueId:string; choiceId:string} | {id:string; type:'move'; target:Cell} | {id:string;type:'open'|'close'|'collect';objectId:string} | {id:string;type:'useTalent'|'usePassive'|'stabilize'|'tacticalCheck';boost?:unknown;targetId?:unknown;target?:unknown;allyTarget?:unknown} | {id:string;type:'start'|'breakRestraint'|'endTurn'|'pacify'|'strike'|'escape'|'focus'|'check'};
export interface World { caseMap?:CaseMap; tactics?:Tactics; characters?:Record<string,Character>; backgroundUses?:Set<string>; biographies?:Record<string,Biography>; revision:number; players:Record<string,Cell>; objects:Record<string,{x:number;y:number;state:'closed'|'open'|'locked'|'static';evidenceId?:string;collected?:boolean}>; evidence:string[]; inventory:Record<string,string[]>; encounter:GhostEncounter|null; activePlayer:string|null; roundStart:string|null; turns:Record<string,TurnState>; lastCheck:{playerId:string;die:number;total:number;outcome:CheckOutcome}|null; case001?:CaseState; scenario:ScenarioProgress; humanDmId:string|null; diceRequest:{id:string;playerId:string;die:number|null}|null; }
type Snapshot = Omit<World,'case001'|'caseMap'|'backgroundUses'|'biographies'> & {dm:ScriptedDmView;case001?:ReturnType<typeof caseView>;caseMap?:{site:string;opportunity?:string;withdrawalBlocked?:boolean;battle?:ReturnType<typeof battleView>}};
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
 create(code:string, version?:2){this.worlds.set(code,{...(version===2 ? {characters:{},backgroundUses:new Set<string>(),biographies:{}} : {}),revision:0,players:{},objects:{box:{x:2,y:5,state:'closed'},'locked-box':{x:7,y:6,state:'locked'},clue:{x:5,y:8,state:'static',evidenceId:'evidence-1'}},evidence:[],inventory:{},encounter:null,activePlayer:null,roundStart:null,turns:{},lastCheck:null,humanDmId:null,diceRequest:null,scenario:applyScenarioEvent(scenario,{sceneId:scenario.scenes[0].id,evidence:[],objectives:[],firedTriggers:[],endingId:null},'enter-yard')});this.seen.set(code,new Map());}
 addPlayer(code:string,id:string){const w=this.get(code); const spawns=[{x:4,y:7},{x:3,y:7},{x:6,y:7},{x:4,y:8}];
 if(w.characters) spawns.push({x:3,y:8},{x:5,y:7},{x:6,y:8});
 const p=spawns.find(p=>!Object.values(w.players).some(q=>eq(p,q)) && (!w.tactics || !w.encounter || !eq(p,w.encounter.ghost))); if(!p) throw Error('ไม่มีตำแหน่งว่าง'); w.players[id]=p; w.inventory[id]=[]; w.turns[id]=startTurn(); w.revision++;}
 removePlayer(code:string,id:string){const w=this.get(code); delete w.players[id]; removeCasePlayer(w,id);
 if(w.case001?.escortOwners) for(const [name,owner] of Object.entries(w.case001.escortOwners)) {
  if(owner===id) {delete w.case001.escortOwners[name];w.case001.escorts=w.case001.escorts.filter(escort=>escort!==name);}
 } if(w.characters) delete w.characters[id]; if(w.biographies) delete w.biographies[id]; delete w.inventory[id]; delete w.turns[id]; if(w.humanDmId===id) w.humanDmId=null; if(w.diceRequest?.playerId===id) w.diceRequest=null; if(w.roundStart===id) w.roundStart=Object.keys(w.players)[0] ?? null; if(w.activePlayer===id) w.activePlayer=Object.keys(w.players).find(id=>!w.tactics || (id!==w.humanDmId && !!w.characters?.[id]?.hp)) ?? null; w.revision++;}
 dmPanel(code:string,player:string) {
  const w=this.get(code);
  if (!Object.hasOwn(w.players,player) || w.humanDmId!==player) throw Error('เฉพาะผู้ดำเนินเรื่อง');
  if(w.case001?.story) return {caseMode:true,investigators:Object.keys(w.players).filter(id=>id!==player && w.characters?.[id]).map(id=>{
   const site=w.caseMap?.sites[id] ?? 'A';
   const view=caseDmView({...w.case001!,site});
   return {id,site,...view,choices:w.caseMap?.battle?.site===site || !w.characters?.[id]?.hp ? [] : view.choices};
  })};
  const script=dmScripts[w.scenario.sceneId];
  return {
   sceneId:w.scenario.sceneId, script:script.script, secret:script.secret,
   events:script.events.filter(event=>applyScenarioEvent(scenario,w.scenario,event.id)!==w.scenario),
   dialogue:scenario.dialogue.filter(line=>script.dialogue.includes(line.id)).map(({id,text})=>({id,text})),
   scenes:scenario.scenes.filter(scene=>script.next.includes(scene.id)),
  };
 }
 biography(code:string,player:string) { return this.get(code).biographies?.[player] ?? {}; }
 snapshot(code:string, viewer?:string): Snapshot {
  const {case001,caseMap,backgroundUses,biographies,...world} = structuredClone(this.get(code));
  if(world.encounter && world.tactics?.concealed && (world.tactics.scanned ?? 0)<world.tactics.round) {
   world.encounter.ghost={x:-1,y:-1};
  }
  const site=viewer && viewer!==world.humanDmId ? caseMap?.sites[viewer] ?? 'A' : case001?.site;
  const localCase=case001 && site ? {...case001,site} : case001;
  if(caseMap && viewer && viewer!==world.humanDmId) {
   world.players=Object.fromEntries(Object.entries(world.players).filter(([id])=>id!==world.humanDmId && (caseMap.sites[id] ?? 'A')===site));
  }
  return {...world,case001:localCase && caseView(localCase,!!world.characters),
   ...(caseMap && site && localCase ? {caseMap:{site,opportunity:caseOpportunity(localCase,caseMap),withdrawalBlocked:!!caseMap.battle,battle:battleView(caseMap,site)}} : {}),dm:getScriptedDmView(scenario,world.scenario)};
 }
 delete(code:string){this.worlds.delete(code);this.seen.delete(code);}
 apply(code:string,player:string,input:unknown):{snapshot:Snapshot;duplicate:boolean} {
  const current=this.get(code);
  const w=current.characters ? structuredClone(current) : current;
  if(!w.players[player]) throw Error('ไม่พบผู้เล่น');
  if(!input || typeof input!=='object') throw Error('คำขอไม่ถูกต้อง'); let a=input as WorldAction;
  const requester=player;
  if(typeof a.id!=='string'||a.id.length<1||a.id.length>100 || typeof a.type!=='string') throw Error('คำขอไม่ถูกต้อง');
  const dedupe=player+':'+a.id; const seen=this.seen.get(code)!; if(seen.has(dedupe)) return {snapshot:this.snapshot(code,player),duplicate:true};
  if ('die' in a || 'roll' in a || 'total' in a || 'outcome' in a || 'dc' in a || 'modifier' in a) throw Error('คำขอไม่ถูกต้อง');
  if(a.type==='caseDm') {
   const panel=this.dmPanel(code,requester);
   if(!('caseMode' in panel) || !panel.investigators) throw Error('ใช้คำสั่งนี้ในคดีรุ่น 2 เท่านั้น');
   const {targetId,actionId}=a;
   if(!panel.investigators.find(target=>target.id===targetId)?.choices.some(choice=>choice.id===actionId)) throw Error('หัวข้อนี้ยังใช้ไม่ได้');
   player=targetId;
   a={id:a.id,type:'caseAction',actionId};
  }
  if(w.characters && w.humanDmId===player && ['move','open','close','collect','chooseDialogue','start','endTurn','strike','escape','pacify','tacticalCheck','stabilize','breakRestraint','caseStart'].includes(a.type)) throw Error('คำสั่งนี้สำหรับผู้สืบสวน');
  const pos=w.players[player];
  if(w.encounter && w.encounter.phase!=='resolved' && ['move','endTurn','pacify','strike','escape','focus','check','tacticalCheck','breakRestraint','stabilize'].includes(a.type) && w.activePlayer!==player) throw Error('ยังไม่ถึงเทิร์นของผู้เล่น');

  if(w.tactics && w.encounter?.phase==='player' && ['move','strike','pacify','escape','tacticalCheck','open','close','collect','stabilize'].includes(a.type)
    && (!w.characters?.[player]?.hp || w.humanDmId===player)) throw Error('ตัวละครยังลงมือไม่ได้');
  if(w.tactics && w.encounter?.phase==='player' && a.type==='move' && (w.tactics.restrained[player] ?? 0)>=w.tactics.round) {
   throw Error('ถูกพันธนาการ');
  }
  const caseTactical=w.caseMap && ['move','start','endTurn','strike','pacify','escape','useTalent','usePassive','stabilize','breakRestraint','caseObjective'].includes(a.type);
  if(caseTactical) {
   caseBattleAction(w,player,a,caseGrid(w.caseMap!.sites[player] ?? 'A'),this.rollD20,()=>{
    if(++w.caseMap!.rounds%3===0) tick(w.case001!,10);
    if(Object.entries(w.characters!).filter(([id])=>id!==w.humanDmId).every(([,character])=>!character.hp)) failCase(w.case001!);
    syncCaseBattle(w);
   });
  } else {
  if(w.case001 && a.type!=='caseAction' && a.type!=='caseStart' && a.type!=='createCharacter' && !(w.case001.story && (a.type==='dmRequestRoll' || a.type==='dmRoll'))) throw Error('ใช้คำสั่งจากหน้าคดี');
  switch(a.type){
   case 'createCharacter': {
    if(!w.characters || w.humanDmId===player || w.characters[player]) throw Error('สร้างตัวละครไม่ได้');
    const biography=validateBiography(a.biography);
    w.characters[player]=createCharacter(a.profession,a.bonus,
      a.talent===undefined && a.background===undefined ? undefined : {talent:a.talent,background:a.background});
    if(w.biographies) w.biographies[player]=biography;
    break;
   }
   case 'caseStart': {
    if(w.case001 || (w.encounter && w.encounter.phase!=='resolved')) throw Error('เริ่มคดีไม่ได้');
    const count=Object.keys(w.players).filter(id=>id!==w.humanDmId).length;
    const limit=w.characters?6:4;
    if(count<2 || count>limit) throw Error('ต้องมีผู้สืบสวน 2–'+limit+' คน');
    if(w.characters && Object.keys(w.players).some(id=>id!==w.humanDmId && !w.characters?.[id])) throw Error('ผู้สืบสวนทุกคนต้องสร้างตัวละครก่อน');
    w.case001=newCase(!!w.characters);
    if(w.characters) {w.caseMap=newCaseMap(w.players);w.encounter=null;w.tactics=undefined;w.activePlayer=null;}
    break;
   }
   case 'caseAction': {
    if(!w.case001 || w.humanDmId===player) throw Error('เฉพาะผู้สืบสวนในคดี');
    const character=w.characters?.[player];
    if(w.case001.story && character?.hp===0) throw Error('ตัวละครหมดสภาพ');
    if(w.characters && !character) throw Error('สร้างตัวละครก่อน');
    const site=w.caseMap?.sites[player] ?? (w.caseMap?'A':w.case001.site);
    const battle=w.caseMap?.battle;
    if(battle && a.actionId==='finish') throw Error('ยังถอนทีมไม่ได้จนกว่าการเผชิญหน้าจะจบ');
    const inBattle=battle?.site===site;
    const priorCase={...w.case001,site};
    if(inBattle) {
     if(battle.active!==player || !['seal1','seal2','seal3','ritual','suppress','show-clue'].includes(a.actionId)) throw Error('ใช้คำสั่งนี้ไม่ได้ขณะเผชิญหน้า');
     if(a.actionId==='seal3' && battle.phase==='chains') throw Error('คลายเส้นด้ายที่ปรากฏในสนามก่อน');
     w.turns[player]=spendAP(w.turns[player],a.actionId==='show-clue'?1:2) ?? (()=>{throw Error('AP ไม่พอ');})();
    }
    const boost=a.boost;
    if(boost!==undefined && (!character || (boost!=='focus' && boost!=='background' && boost!=='deception' && boost!=='diagnostic'))) throw Error('ตัวเสริมการทดสอบไม่ถูกต้อง');
    const backgroundKey=player+':'+site+':'+(boost ?? a.actionId);
    let usedBoost=false;
    w.case001=applyCaseAction(priorCase,a.actionId,this.rollD20,character && {
     character,boost,playerId:player,inEncounter:inBattle,backgroundUsed:w.backgroundUses?.has(backgroundKey) ?? false,
     onBoost:()=>{usedBoost=true;},
    });
    if(w.caseMap && a.actionId==='cut') w.case001.milestones.push('grove-disturbed');
    if(w.caseMap && w.case001.site!==site) travelCaseMap(w,player,w.case001.site,caseGrid(w.case001.site));
    if(w.caseMap && !battle && caseOpportunity(w.case001,w.caseMap)==='EN04') startCaseBattle(w,player,caseGrid(w.case001.site));
    syncCaseBattle(w);
    if(character && a.actionId==='sense') character.sanity--;
    if(usedBoost && character && (boost==='focus' || boost==='deception')) character.focus--;
    if(usedBoost && boost!=='focus') w.backgroundUses?.add(backgroundKey);
    break;
   }
   case 'claimDm':
    if(w.characters && w.encounter && w.encounter.phase!=='resolved') throw Error('เปลี่ยนบทบาทหลังจบการเผชิญหน้า');
    if(w.humanDmId && w.humanDmId!==player) throw Error('ห้องนี้มีผู้ดำเนินเรื่องแล้ว');
    w.humanDmId=player;
    break;
   case 'releaseDm':
    if(w.characters && (Object.keys(w.players).length>6 || (w.encounter && w.encounter.phase!=='resolved'))) throw Error('ยังคืนบทผู้ดำเนินเรื่องไม่ได้');
    if(w.humanDmId!==player) throw Error('เฉพาะผู้ดำเนินเรื่อง');
    w.humanDmId=null;
    w.diceRequest=null;
    break;
   case 'dmEvent': case 'dmDialogue': case 'dmScene': case 'dmRequestRoll': {
    const panel=this.dmPanel(code,player);
    if('caseMode' in panel) {
     if(a.type!=='dmRequestRoll' || w.case001?.report || w.diceRequest?.die===null || !panel.investigators?.some(target=>target.id===a.targetId)) throw Error('ขอทอยไม่ได้');
     w.diceRequest={id:randomUUID(),playerId:a.targetId,die:null};
     break;
    }
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
   case 'useTalent': case 'usePassive': {
    applyTechnique(w,player,a,grid,this.rollD20);
    if(w.encounter?.outcome==='pacified') w.scenario=applyScenarioEvent(scenario,w.scenario,'pacified');
    break;
   }
   case 'tacticalCheck': {
    const character=w.characters?.[player], encounter=w.encounter;
    if(!character || !encounter || encounter.phase!=='player') throw Error('ไม่มีเทิร์น');
    if(a.boost!==undefined && a.boost!=='focus') throw Error('ตัวเสริมการทดสอบไม่ถูกต้อง');
    const boost=a.boost==='focus' ? 'focus' : undefined;
    if(boost && character.sanity===0) throw Error('ตื่นตระหนกจนใช้สมาธิไม่ได้');
    const payment=spendAction(w.turns[player],character.focus,{ap:1,focus:Number(!!boost)});
    if(!payment) throw Error('AP หรือสมาธิไม่พอ');
    const result=resolveCheck({dc:12,attribute:character.stats.mind,boost},this.rollD20);
    character.focus=payment.focus;
    w.lastCheck={playerId:player,die:result.die,total:result.total,outcome:result.outcome};
    w.encounter={...encounter,turn:payment.turn};
    break;
   }
   case 'focus': {
    if(w.characters) throw Error('เลือกใช้สมาธิก่อนทอย'); if(!w.encounter || w.encounter.phase!=='player') throw Error('ไม่มีเทิร์น'); const turn=focus(w.turns[player]); if(!turn) throw Error('ตั้งสมาธิไม่ได้'); w.encounter={...w.encounter,turn}; break; }
   case 'check': { if(w.characters) throw Error('ใช้การทดสอบของห้องรุ่น 2'); if(!w.encounter || w.encounter.phase!=='player') throw Error('ไม่มีเทิร์น'); const result=skillCheck(w.turns[player],12,0,this.rollD20); if(!result) throw Error('AP ไม่พอ'); w.encounter={...w.encounter,turn:result.state}; w.lastCheck={playerId:player,die:result.die,total:result.total,outcome:result.outcome}; break; }
   case 'start':
    if(w.characters && Object.keys(w.players).filter(id=>id!==w.humanDmId).length>6) throw Error('เลือกผู้ดำเนินเรื่องหนึ่งคนก่อน');
    if(w.characters && (!w.characters[player]?.hp || w.humanDmId===player)) throw Error('สร้างตัวละครก่อนเริ่มการเผชิญหน้า');
    if(w.encounter && w.encounter.phase!=='resolved') throw Error('กำลังเผชิญหน้า'); if(w.characters) w.tactics=newTactics(); w.encounter=startGhostEncounter(pos,{x:9,y:9}); w.activePlayer=w.tactics ? Object.keys(w.players).find(id=>id!==w.humanDmId && !!w.characters?.[id]?.hp) ?? player : player; w.roundStart=w.activePlayer; for(const id of Object.keys(w.players)) w.turns[id]=startTurn(); break;
   case 'stabilize': stabilize(w,player,a.targetId,this.rollD20); break;
   case 'breakRestraint': {
    const character=w.characters?.[player], t=w.tactics, encounter=w.encounter;
    if(!t || !encounter || encounter.phase!=='player' || !character?.hp || (t.restrained[player] ?? 0)<t.round) throw Error('ยังแก้พันธนาการไม่ได้');
    const turn=spendAP(w.turns[player],1);
    if(!turn) throw Error('AP ไม่พอ');
    const result=resolveCheck({dc:12,attribute:character.stats.body},this.rollD20);
    if(result.outcome==='success') delete t.restrained[player];
    encounter.turn=turn;
    w.lastCheck={playerId:player,...result};
    break;
   }
   case 'endTurn':
    if(w.tactics && w.encounter?.phase==='player') {
     const ids=Object.keys(w.players);
     const index=ids.indexOf(player);
     const next=ids.slice(index+1).find(id=>id!==w.humanDmId && !!w.characters?.[id]?.hp);
     if(!next) advanceTactics(w,grid,this.rollD20);
     w.activePlayer=next ?? ids.find(id=>id!==w.humanDmId && !!w.characters?.[id]?.hp) ?? null;
     if(!w.activePlayer) w.encounter.phase='resolved';
     else w.encounter.turn=w.turns[w.activePlayer];
     break;
    }
    if(!w.encounter || w.encounter.phase!=='player')throw Error('ไม่มีเทิร์น'); { const ids=Object.keys(w.players), next=ids[(ids.indexOf(player)+1)%ids.length]; if(next===w.roundStart) { w.encounter=runGhostPhase({...w.encounter,player:pos},grid); for(const id of ids) w.turns[id]=startTurn(); } w.activePlayer=next; w.encounter={...w.encounter,turn:w.turns[next]}; } break;
   case 'pacify': case 'strike': case 'escape': {if(w.tactics && a.type==='pacify'){negotiateV2(w,player,this.rollD20);if(w.encounter?.outcome==='pacified') w.scenario=applyScenarioEvent(scenario,w.scenario,'pacified');break;} if(w.tactics && a.type==='strike'){strikeV2(w,player,this.rollD20);break;} if(!w.encounter)throw Error('ไม่มีการเผชิญหน้า'); const next=playerGhostAction({...w.encounter,player:pos},a.type,grid); if(next.phase===w.encounter.phase && next.turn.ap===w.encounter.turn.ap)throw Error('ทำรายการไม่ได้');w.encounter=next;if(next.outcome==='pacified') w.scenario=applyScenarioEvent(scenario,w.scenario,'pacified');break;}
   default: throw Error('ไม่รู้จักคำสั่ง');
  }
  }
  if(w.encounter && w.activePlayer===player && a.type!=='endTurn' && a.type!=='createCharacter') w.turns[player]=w.encounter.turn;
  if(w.tactics && w.encounter?.phase==='resolved') delete w.tactics.telegraph;
  this.worlds.set(code,w);
  w.revision++;seen.set(dedupe,w.revision);return {snapshot:this.snapshot(code,requester),duplicate:false};
 }
 private get(code:string){const w=this.worlds.get(code);if(!w)throw Error('ไม่พบสถานะห้อง');return w;}
}
