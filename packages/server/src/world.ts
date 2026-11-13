import {matchQa53, qaForScene53} from './case001/qa53.js';
import { noTimer, reader52, reader53, reader55, readerLabel, storyContent } from './case001/v51Content.js';
import {travelCaseMap,resumeSessionBattle,turnEncounterAction} from './case001/caseBattle.js';
import { sharedCaseStory, newGuided, observeGuidedScene, allowedGuidedScenes, canOpenGuidedScene, guidedView, guidedCommand, guidedScript, guidedBackup } from './case001/guidedCase.js';
import { newState51, presentScene51, dmOptions51, storySummary51, dialogue51, command51, delivered51, validateSave51, lethalAnnouncement51 } from './case001/storyV51.js';
import { availableDialogue, storyCheckResponse, isStoryCheck, storyCheckHelp, storyCheckOptions } from './case001/storyDice.js';
import { completeCaseRound, executeCaseAction } from './case001/caseActions.js';
import { caseCombatStats } from './case001/caseCombatStats.js';
import { characterAttribute, caseNpcs, type CaseNpcPlacement } from '@baan/shared';
import { addFact, dmEventPreviews, advanceStory, previewDialogue, sceneSpeakers, gmGuide, gmGuideV41 } from './case001/caseStory.js';
import { newNarrative, enqueueNarrative, narrativeView, advanceNarrative, type NarrativeState } from './narrative.js';
import { advanceTactics, applyTechnique, newTactics, negotiateV2, stabilize, strikeV2, type Tactics } from './tacticalEncounter.js';
import { emitBattlePhase, caseBattleAction, caseOpportunity, startCaseBattle, battleView, newCaseMap, removeCasePlayer, syncCaseBattle, type CaseMap } from './case001/caseBattle.js';
import { sceneNarration, emitCaseBeat, newCase, caseView, caseOptions, caseDmView, withdrawCase, tick, type CaseState, type Site } from './case001/case001.js';
import { readFileSync } from 'node:fs';
import { parseScenarioJSON, applyScenarioEvent, getScriptedDmView, type ScriptedDmView, type ScenarioProgress } from '@baan/shared';
import { randomInt, randomUUID } from 'node:crypto';
import { caseGrid, castProfiles, validateBiography, validatePlayerName, type Biography, resolveCheck, spendAction, createCharacter, type Character, startTurn, spendAP, focus, skillCheck, type TurnState, type CheckOutcome } from '@baan/shared';
import { startGhostEncounter, playerGhostAction, runGhostPhase, type GhostEncounter } from '@baan/shared';
import type { DmLogEntry, DmRollCard, NarrativeBeat } from '@baan/shared';

export type Cell = {x:number;y:number};
type ExplorationPlan={id:string;actions:Record<string,{actionId:string;boost?:unknown;minutes:number}>};
type QueuedNarration = Omit<NarrativeBeat,'sequence'> & {answer?:import('@baan/shared').DmOutcomeAnswer;phase?:string;id:string;recipients:string[]};
type DmQuestion = {guidedScene?:string;id:string;playerId:string;site:Site;label:string};
type DmCheck = {stat?:keyof import('@baan/shared').LiteStats;dice?:ReturnType<typeof storyCheckOptions>[number]['dice'];id:string;actionId:string;site:Site;label:string;boost?:unknown};
type DmSession = {
 answers?:{question:string;text:string;qaId?:string;scene?:string;sequence:number}[];
 sent?:Record<string,{text:string;site:string;sequence:number;count:number}>;
 checks:Record<string,DmCheck>;
 narration:QueuedNarration[];
 questions:DmQuestion[];
 rolls:Record<string,DmRollCard>;
 latestRoll?:DmRollCard;
 log:DmLogEntry[];
};

export type WorldAction = {id:string;type:'turnEncounter';round:unknown;choice:unknown;targetId?:unknown;attackId?:unknown}
 | {id:string;type:'setPlayerNames';playerName?:unknown;characterName?:unknown} | {id:string;type:'updateCharacter';profession:unknown;bonus?:unknown;talent?:unknown;playerName?:unknown;characterName?:unknown} | {id:string;type:'dmSessionControl';command:'pause'|'resume'|'withdraw'|'rewind'|'attendance'|'clearPending';targetId?:string;absent?:boolean} | {id:string;type:'dmPlaceNpc';site:string;npcId:string;position:{x:number;y:number}|null} | {id:string;type:'guided';command:string;target?:string} | {id:string;type:'dmPublish'|'dmDismiss';cardId:string;part?:'narration'|'dialogue'|'all'} | {id:string;type:'dmCancelCheck';targetId:string;checkId:string} | {id:string;type:'dmRequestRoll';targetId:string;checkId?:string;difficulty?:unknown;stat?:unknown} | {id:string;type:'dmAnswer';cardId:string;actionId:string;confirmContext?:boolean} | {id:string;type:'dmReply';cardId:string;text:unknown;speaker?:unknown;qaId?:unknown} | {id:string;type:'askGm';text:unknown;site:Site} | {id:string;type:'dmTravel';actionId:string;site:Site} | {id:string;type:'dmNarrativeNext';targetId:string;sequence:number} | {id:string;type:'planSubmit';actionId:string;boost?:unknown} | {id:string;type:'planResolve'|'planCancel';planId:string} | {id:string;type:'narrativeNext';sequence:number} | {id:string;type:'caseDm';targetId:string;actionId:string} | {id:string;type:'caseObjective';step?:number} | {id:string;type:'createCharacter';profession:unknown;bonus:unknown;talent?:unknown;background?:unknown;biography?:unknown;playerName?:unknown;characterName?:unknown} | {id:string;type:'caseStart';mode?:'story'} | {id:string;type:'caseAction';actionId:string;boost?:unknown;site?:Site} | {id:string; type:'claimDm'|'releaseDm'} | {id:string; type:'dmEvent'|'dmDialogue'|'dmScene'; targetId:string} | {id:string; type:'dmRoll'; requestId:string} | {id:string; type:'chooseDialogue'; dialogueId:string; choiceId:string} | {id:string; type:'move'; target:Cell} | {id:string;type:'open'|'close'|'collect';objectId:string} | {id:string;type:'useTalent'|'usePassive'|'stabilize'|'tacticalCheck';boost?:unknown;targetId?:unknown;target?:unknown;allyTarget?:unknown} | {id:string;type:'start'|'breakRestraint'|'endTurn'|'pacify'|'strike'|'escape'|'focus'|'check'};
export interface World { inactivePlayers?:string[];preparingSession?:boolean; playerNames?:Record<string,{playerName?:string;characterName?:string}>; paused?:boolean; basicMode?:true; dmSession?:DmSession; sceneMode?:true; explorationPlan?:ExplorationPlan; narrative?:NarrativeState; caseMap?:CaseMap; tactics?:Tactics; characters?:Record<string,Character>; backgroundUses?:Set<string>; biographies?:Record<string,Biography>; revision:number; players:Record<string,Cell>; objects:Record<string,{x:number;y:number;state:'closed'|'open'|'locked'|'static';evidenceId?:string;collected?:boolean}>; evidence:string[]; inventory:Record<string,string[]>; encounter:GhostEncounter|null; activePlayer:string|null; roundStart:string|null; turns:Record<string,TurnState>; lastCheck:{playerId:string;die:number;total:number;outcome:CheckOutcome}|null; case001?:CaseState; scenario:ScenarioProgress; humanDmId:string|null; diceRequest:DmRollCard|null; }
type Snapshot = Omit<World,'dmSession'|'explorationPlan'|'narrative'|'case001'|'caseMap'|'backgroundUses'|'biographies'> & {manualDm?:true;awaitingReport?:boolean;dmLog?:DmLogEntry[];pendingQuestionCount?:number;pendingCheck?:string;narrative?:ReturnType<typeof narrativeView>;explorationPlan?:{id:string;participants:string[];minutes:number;mine?:{actionId:string;minutes:number}}} & {dm:ScriptedDmView;case001?:ReturnType<typeof caseView>;caseMap?:{site:string;npcs?:CaseNpcPlacement[];opportunity?:string;withdrawalBlocked?:boolean;battle?:ReturnType<typeof battleView>;turnConclusion?:CaseMap['turnConclusion']}};
const npcDossiers: {id:string;name:string;background:string;motivation:string;knowledge:string;secret:string;roleplay:string}[] = JSON.parse(readFileSync(new URL('../scenarios/case-001/case-001.npcs.dm.json', import.meta.url), 'utf8'));
const npcDossiers52=JSON.parse(readFileSync(new URL('../scenarios/case-001/case-001.v5.2.npcs.json',import.meta.url),'utf8')) as typeof npcDossiers;
const scenario = parseScenarioJSON(readFileSync(new URL('../scenarios/sample.json', import.meta.url), 'utf8'));
type DmScript = {script:string; secret:string; next:string[]; dialogue:string[]; events:{id:string;text:string}[]};
const dmScripts: Record<string,DmScript> = JSON.parse(readFileSync(new URL('../scenarios/sample.dm.json', import.meta.url), 'utf8')).scenes;
const walls=Array.from({length:10},(_,x)=>({x,y:0}));
const obstacles=[{x:1,y:4},{x:2,y:7},{x:8,y:5},{x:7,y:8}];
const house=Array.from({length:12},(_,i)=>({x:3+i%4,y:2+Math.floor(i/4)}));
const grid={width:10,height:10,blocked:[...walls,...obstacles,...house,{x:2,y:5},{x:7,y:6},{x:5,y:8}]};
const eq=(a:Cell,b:Cell)=>a.x===b.x && a.y===b.y;
function gmText(value:unknown) {
 if(typeof value!=='string' || !value.trim() || value.trim().length>1000) throw Error('ข้อความต้องยาว 1–1,000 ตัวอักษร');
 return value.trim();
}

function isDmQuestion(actionId:string) {
 return actionId.startsWith('guided-talk:') || actionId.startsWith('talk:') || actionId==='lore' || actionId==='sense';
}

function previewWorld({dmSession,narrative,...world}:World):World {
 return structuredClone(world);
}

function suggestedAnswers(w:World,question:DmQuestion) {
 const state=w.case001;
 if(!state || !noTimer(state) || !state.v51 || state.guided?.scene!==question.guidedScene ||
  w.caseMap?.battle || state.report || w.caseMap?.sites[question.playerId]!==question.site || !w.characters?.[question.playerId]?.hp)return [];
 if(['5.3','5.5'].includes(state.guided?.version ?? ''))return matchQa53(state,question.label).map(q=>({
  id:q.id, speaker:q.speaker, label:q.question, answer:q.answer, confirmContext:false, qa:true,
 }));
 const scene=storyContent(state).scenes[state.guided!.scene];
 const direct:Record<string,(string|undefined)[]>={A1:['A1:6','A1:7','A1:4'],A2:[undefined,'A2:1']};
 const exact=direct[scene.id]?.[scene.questions.indexOf(question.label)];
 if(!exact) return [];
 return dialogue51(state,true).filter(line=>line.id===exact).map(line=>({
  id:'guided-talk:'+line.id,speaker:line.speaker,label:readerLabel(line.label),answer:line.text,
  confirmContext:!questionPreview(w,question.playerId,'guided-talk:'+line.id),
 }));
}

function questionPreview(w:World,player:string,actionId:string) {
 const site=w.caseMap?.sites[player];
 if(!site || !w.players[player] || w.caseMap?.battle || !w.characters?.[player]?.hp || w.case001?.report) return;
 if(actionId.startsWith('guided-talk:')) return previewDialogue({...w.case001!,site},actionId);
 if(actionId.startsWith('talk:')) return previewDialogue({...w.case001!,site},actionId.slice(5));
 const preview=previewWorld(w);
 try {
  executeCaseAction(preview,player,{actionId},()=>{throw Error('ต้องทอยก่อนตอบ');});
  return preview.case001?.narrativeEvents?.find(beat=>beat.eventId===actionId)?.text;
 } catch {
  return undefined;
 }
}

function checkAvailable(w:World,player:string,check:DmCheck) {
 if(!w.case001 || w.caseMap?.sites[player]!==check.site) return false;
 if(!isStoryCheck(check.actionId) && w.caseMap.battle) return false;
 if(![...caseOptions(w.case001,true),...storyCheckOptions(w,player)].some(option=>option.id===check.actionId && option.check)) return false;
 const rollRequired=Symbol('roll required');
 try {
  executeCaseAction(isStoryCheck(check.actionId) ? w : previewWorld(w),player,check,()=>{throw rollRequired;});
 } catch(error) {
  return error===rollRequired;
 }
 return false;
}

function recordDm(session:DmSession,kind:DmLogEntry['kind'],actor:string,recipients:string[],text:string) {
 session.log.push({sequence:session.log.length+1,kind,actor,recipients:[...recipients],text});
}

function inCurrentNarration(w:World,beat:QueuedNarration) {
 if(w.case001 && noTimer(w.case001) && beat.eventId==='guided-cue:F6' && !w.case001.v51?.backlash)return false;
 if(w.case001?.v51 && beat.eventId==='v51:crossfire-window' && w.case001.v51.pending?.kind!=='crossfire')return false;
 if(w.case001?.v51 && beat.eventId==='v51:execution-window' && w.case001.v51.pending?.kind!=='execution')return false;
 if(w.case001?.guided && beat.eventId==='guided-contact-prasert' && w.case001.guided.scene!=='H1') return false;
 if(w.case001?.guided && beat.eventId==='guided-cellar-open' && w.case001.guided.scene!=='E2') return false;
 if(w.case001 && noTimer(w.case001) && beat.scene && beat.scene!==w.case001.guided?.scene)return false;
 if(w.case001?.guided && beat.answer && beat.answer.scene!==w.case001.guided.scene) return false;
 if(w.case001?.guided && beat.phase && beat.phase!==w.case001.guided.phase) return false;
 if(w.case001?.guided && beat.eventId.startsWith('guided-cue:') && beat.eventId!=='guided-cue:'+w.case001.guided.scene) return false;
 return w.case001?.report ? /^(ending:|epilogue:)/.test(beat.eventId) :
  beat.site===w.case001?.site;
}

function deliverDmNarration(w:World,beat:QueuedNarration,dm:string,kind:'narration'|'answer') {
 const {id,recipients:queuedRecipients,answer,...content}=beat;
 const recipients=queuedRecipients.filter(id=>!w.inactivePlayers?.includes(id));
 const state=w.narrative ??= newNarrative();
 if(w.case001?.guided && beat.eventId==='guided-contact-prasert') w.case001.guided.prasertContact=true;
 if(w.case001?.guided && beat.eventId==='guided-cellar-open') {
  w.case001.opened=true;delete w.case001.guided.cellarPending;advanceStory(w.case001);
 }
 const sent=w.dmSession!.sent ??= Object.fromEntries(state.records.map(beat=>[beat.eventId,{text:beat.text,site:beat.site,sequence:beat.sequence,count:1}]));
 enqueueNarrative(state,{...content,scene:content.scene ?? w.case001?.guided?.scene,phase:content.phase ?? w.case001?.guided?.phase,actor:dm},recipients);
 if(w.case001?.v51) {
  delivered51(w.case001,beat.eventId);
  if(noTimer(w.case001) && beat.eventId.startsWith('dice:H1_FLOOD_TIMELINE:') && /ผมร่วมตัดสินใจให้เปิด/.test(beat.text))addFact(w.case001,'confessed');
 }
 if(w.case001?.guided && beat.eventId.startsWith('guided-cue:')) {
  const id=beat.eventId.slice('guided-cue:'.length);
  if(!w.case001.guided.presented.includes(id)) w.case001.guided.presented.push(id);
  if(w.case001.v51)presentScene51(w.case001,id);
 }
 for(const player of recipients) state.cursors[player]=state.sequence;
 const previous=sent[beat.eventId];
 sent[beat.eventId]={text:beat.text,site:beat.site,sequence:state.sequence,count:(previous?.count ?? 0)+1};
 recordDm(w.dmSession!,kind,dm,recipients,beat.text);
}

export class WorldStore {
 constructor(
  private readonly rollD20: () => number = () => randomInt(1, 21),
  private readonly storyRoomsOnly = false,
  private readonly storyDiceV41 = false,
  private readonly guidedV43 = false,
  private readonly basicRules = false,
  private readonly guidedVersion:'4.3'|'5.1'|'5.2'|'5.3'|'5.5'='4.3',
  private readonly lethalV51=false,
 ) {}
 private rewinds=new Map<string,{world:Omit<World,'backgroundUses'>;backgroundUses?:string[]}>();
 private worlds=new Map<string,World>(); private seen=new Map<string,Map<string,number>>();
 checkpoint(code:string) {
  const {backgroundUses,...world}=structuredClone(this.get(code));
  return {world,rewind:structuredClone(this.rewinds.get(code)),backgroundUses:backgroundUses ? [...backgroundUses] : undefined,seen:[...this.seen.get(code)!]};
 }
 restore(code:string,{world,backgroundUses,seen,rewind}:ReturnType<WorldStore['checkpoint']>) {
  if(!world?.sceneMode || !world.case001 || !world.players || !Array.isArray(seen) || this.worlds.has(code)) {
   throw Error('สถานะคดีที่บันทึกไม่ถูกต้อง');
  }
  if(this.basicRules) {world.basicMode=true;world.case001.basicMode=true;}
  if((world.case001.guided?.version==='5.1' || noTimer(world.case001)) && !world.case001.v51)throw Error('เซฟไม่มี State Contract ของฉบับที่ระบุ');
  validateSave51(world.case001);
  this.worlds.set(code,structuredClone({...world,backgroundUses:backgroundUses ? new Set(backgroundUses) : undefined}));
  this.seen.set(code,new Map(seen));
  if(rewind) this.rewinds.set(code,structuredClone(rewind));
 }
 prepareSession(code:string) {const w=this.get(code);w.paused=true;w.preparingSession=true;w.revision++;}
 hasStarted(code:string) { return !!this.worlds.get(code)?.sceneMode; }
 assertCanJoin(raw:unknown) {
  if(typeof raw==='string' && this.hasStarted(raw.trim().toUpperCase())) {
   throw Error('คดีเริ่มแล้ว ใช้การกลับเข้าห้องสำหรับสมาชิกเดิม');
  }
 }
 create(code:string, version?:2){this.worlds.set(code,{...(this.basicRules?{basicMode:true as const}:{}),...(version===2 ? {characters:{},backgroundUses:new Set<string>(),biographies:{}} : {}),revision:0,players:{},objects:{box:{x:2,y:5,state:'closed'},'locked-box':{x:7,y:6,state:'locked'},clue:{x:5,y:8,state:'static',evidenceId:'evidence-1'}},evidence:[],inventory:{},encounter:null,activePlayer:null,roundStart:null,turns:{},lastCheck:null,humanDmId:null,diceRequest:null,scenario:applyScenarioEvent(scenario,{sceneId:scenario.scenes[0].id,evidence:[],objectives:[],firedTriggers:[],endingId:null},'enter-yard')});this.seen.set(code,new Map());}
 addPlayer(code:string,id:string){const w=this.get(code); const spawns=[{x:4,y:7},{x:3,y:7},{x:6,y:7},{x:4,y:8}];
 if(w.characters) spawns.push({x:3,y:8},{x:5,y:7},{x:6,y:8});
 const p=spawns.find(p=>!Object.values(w.players).some(q=>eq(p,q)) && (!w.tactics || !w.encounter || !eq(p,w.encounter.ghost))); if(!p) throw Error('ไม่มีตำแหน่งว่าง'); w.players[id]=p; w.inventory[id]=[]; w.turns[id]=startTurn(); w.revision++;}
 removePlayer(code:string,id:string){const w=this.get(code); delete w.explorationPlan; delete w.players[id]; if(w.playerNames)delete w.playerNames[id]; removeCasePlayer(w,id,caseGrid,this.rollD20,()=>completeCaseRound(w));
 if(w.case001?.escortOwners) for(const [name,owner] of Object.entries(w.case001.escortOwners)) {
  if(owner===id) {delete w.case001.escortOwners[name];w.case001.escorts=w.case001.escorts.filter(escort=>escort!==name);}
 } if(w.characters) delete w.characters[id]; if(w.biographies) delete w.biographies[id]; delete w.inventory[id]; delete w.turns[id]; if(w.humanDmId===id) w.humanDmId=null; if(w.diceRequest?.playerId===id) w.diceRequest=null;
 if(w.dmSession?.rolls[id]?.die===null) recordDm(w.dmSession,'roll-canceled',id,[id],'ผู้รับออกจากห้อง');
 if(w.dmSession) {
  w.dmSession.questions=w.dmSession.questions.filter(question=>question.playerId!==id);
  w.dmSession.narration=w.dmSession.narration.map(beat=>({...beat,recipients:beat.recipients.filter(player=>player!==id)})).filter(beat=>beat.recipients.length>0);
  delete w.dmSession.rolls[id];
  const check=w.dmSession.checks[id];
  if(check) recordDm(w.dmSession,'check-canceled',id,[id],check.label+' · ผู้เล่นออกจากห้อง');
  delete w.dmSession.checks[id];
 }
 if(w.roundStart===id) w.roundStart=Object.keys(w.players)[0] ?? null; if(w.activePlayer===id) w.activePlayer=Object.keys(w.players).find(id=>!w.tactics || (id!==w.humanDmId && !!w.characters?.[id]?.hp)) ?? null; w.revision++;}
 dmPanel(code:string,player:string,includeReader=true) {
  const w=this.get(code);
  if (!Object.hasOwn(w.players,player) || w.humanDmId!==player) throw Error('เฉพาะผู้ดำเนินเรื่อง');
  if(!w.case001 && this.storyRoomsOnly) return {caseMode:true,guide:this.storyDiceV41 ? gmGuideV41 : gmGuide,narration:[],travel:[],investigators:[]};
  if(w.case001?.story) return {
   caseMode:true,
   npcDossiers:structuredClone(noTimer(w.case001)?npcDossiers52:npcDossiers),
   backup:guidedBackup(w),
   sent:structuredClone(w.dmSession?.sent ?? Object.fromEntries((w.narrative?.records ?? []).map(beat=>[beat.eventId,{text:beat.text,site:beat.site,sequence:beat.sequence,count:1}]))),
   guide:w.case001.v51 ? undefined : w.case001.diceVersion ? gmGuideV41 : w.case001.storyVersion===4 ? gmGuide : undefined,
   guidedScenes:w.case001.guided ? allowedGuidedScenes(w).map(scene=>({id:scene.id,canOpen:canOpenGuidedScene(w,scene.id),cue:scene.entry_cue,script:noTimer(w.case001!)?'':guidedScript(w.case001!,scene.id),sent:!!w.case001!.guided!.presented.includes(scene.id)})) : undefined,
   storyProgress:noTimer(w.case001) ? {observed:w.case001.guided!.observed,presented:w.case001.guided!.presented,answers:structuredClone(w.dmSession?.answers ?? [])} : undefined,
   storyReader:noTimer(w.case001) && includeReader ? {
    ...(w.case001.guided!.version==='5.5'?reader55:w.case001.guided!.version==='5.3'?reader53:reader52),
    qa:['5.3','5.5'].includes(w.case001.guided!.version ?? '')?Object.keys(storyContent(w.case001).scenes).flatMap(id=>qaForScene53(id,w.case001!.guided!.version)):undefined,
    answers:structuredClone(w.dmSession?.answers ?? []),
    observed:w.case001.guided!.observed,presented:w.case001.guided!.presented,
   } : undefined,
   sharedStory:noTimer(w.case001)?sharedCaseStory(w).slice(-12):undefined,
   storySummary:w.case001.v51 ? storySummary51(w.case001) : undefined,
   storyEvents:w.case001.v51 ? [...dmOptions51(w.case001),...(
    w.caseMap?.battle?.final55 && w.case001.v51.KAEW_TRUST==='high' &&
    !w.caseMap.battle.final55.trustUsed && w.caseMap.battle.enemies[0].tactics.telegraph ?
    [{id:'forbear55',label:'แม่แก้วฝืนคำสั่งและงดการโจมตีที่ประกาศไว้ครั้งนี้',effect:'ยกเลิกการโจมตีครั้งนี้ ใช้ได้ครั้งเดียวจากความเชื่อใจ'}]:[])] : undefined,
   diceGuide:w.case001.diceVersion && !noTimer(w.case001) ? storyCheckHelp : undefined,
   narration:(w.dmSession?.narration ?? []).map(beat=>({
    ...structuredClone(beat),current:inCurrentNarration(w,beat),
    speakers:[...new Set([...beat.text.matchAll(/(?:^|\n)([ก-๙]{2,24})\s*(?:·|:)/g)].map(match=>match[1]))],
   })),
   speakers:w.caseMap?.battle || w.case001.report ? [] : sceneSpeakers(w.case001),
   wichai:w.case001.storyVersion===4 ? { ...caseCombatStats.wichai, site:w.case001.wichai?.site, status:w.case001.wichai?.status } : undefined,
   travel:w.dmSession && !w.caseMap?.battle ? caseOptions(w.case001,true).filter(option=>option.id.startsWith('travel:')) : [],
   questions:w.dmSession?.questions.map(question=>({
    ...question,
    suggestions:suggestedAnswers(w,question),
    open:(!question.guidedScene || question.guidedScene===w.case001!.guided?.scene) && !w.case001!.report && !w.caseMap?.battle && w.caseMap?.sites[question.playerId]===question.site,
   })),
   investigators:Object.keys(w.players).filter(id=>id!==player && w.characters?.[id]).map(id=>{
   const site=w.caseMap?.sites[id] ?? 'A';
   const {choices,script,secret}=caseDmView({...w.case001!,site});
   const check=w.dmSession?.checks[id];
   const special=w.dmSession ? caseOptions({...w.case001!,site},true).filter(option=>option.id==='sense' || option.id==='lore')
    .filter(option=>questionPreview(w,id,option.id)) : [];
   return {id,site,script:noTimer(w.case001!)?'':script,secret:noTimer(w.case001!)?'':secret,check:check && {id:check.id,label:check.label,dice:check.dice,stat:check.stat},diceRequest:w.dmSession?.rolls[id],narrative:narrativeView(w.narrative,id),events:noTimer(w.case001!) ? [] : dmEventPreviews({...w.case001!,site}),choices:w.caseMap?.battle?.site===site || !w.characters?.[id]?.hp ? [] : [...choices,...special].map(choice=>({
    ...choice,label:noTimer(w.case001!) ? readerLabel(choice.label) || 'บทพูดตามสถานการณ์' : choice.label,answer:isDmQuestion(choice.id) ? questionPreview(w,id,choice.id) : undefined,
   }))};
  })};
  const script=dmScripts[w.scenario.sceneId];
  return {
   sceneId:w.scenario.sceneId, script:script.script, secret:script.secret,
   events:script.events.filter(event=>applyScenarioEvent(scenario,w.scenario,event.id)!==w.scenario),
   dialogue:scenario.dialogue.filter(line=>script.dialogue.includes(line.id)).map(({id,text})=>({id,text})),
   scenes:scenario.scenes.filter(scene=>script.next.includes(scene.id)),
  };
 }
 dmPreview(code:string,player:string,target:unknown) {
  const world=this.get(code);
  if(world.humanDmId!==player || !world.players[player]) throw Error('เฉพาะผู้ดำเนินเรื่อง');
  if(typeof target!=='string' || target===player || !world.players[target]) throw Error('ไม่พบผู้สืบสวน');
  const snapshot=this.snapshot(code,target);
  return this.storyRoomsOnly ? {...snapshot,biography:structuredClone(this.biography(code,target))} : snapshot;
 }
 biography(code:string,player:string) { return this.get(code).biographies?.[player] ?? {}; }
 snapshot(code:string, viewer?:string): Snapshot {
  const {dmSession,explorationPlan,narrative,case001,caseMap,backgroundUses,biographies,...world} = structuredClone(this.get(code));
  world.players=Object.fromEntries(Object.entries(world.players).filter(([id])=>!world.inactivePlayers?.includes(id)));
  if(world.encounter && world.tactics?.concealed && (world.tactics.scanned ?? 0)<world.tactics.round) {
   world.encounter.ghost={x:-1,y:-1};
  }
  const site=viewer && viewer!==world.humanDmId ? caseMap?.sites[viewer] ?? 'A' : case001?.site;
  const localCase=case001 && site ? {...case001,site} : case001;
  if(caseMap && viewer && viewer!==world.humanDmId) {
   world.players=Object.fromEntries(Object.entries(world.players).filter(([id])=>id!==world.humanDmId && (caseMap.sites[id] ?? 'A')===site));
  }
  const isDm=!!viewer && viewer===world.humanDmId;
  const delivered=viewer && narrative ? narrativeView(narrative,viewer) : undefined;
  const notebookCase=localCase && dmSession && !isDm ? {...localCase,storyChecks:Object.fromEntries(Object.entries(localCase.storyChecks ?? {}).filter(([id])=>delivered?.history.some(beat=>beat.eventId.startsWith('dice:'+id+':'))))} : localCase;
  const story=notebookCase && caseView(notebookCase,!!world.characters);
  if(story && viewer && !isDm) story.actions.push(...storyCheckOptions({...world,case001,caseMap,dmSession,narrative},viewer));
  if(story && viewer && world.inactivePlayers?.includes(viewer))story.actions=[];
  const awaitingReport=!!(dmSession && !isDm && story?.report && !delivered?.history.some(beat=>beat.eventId.startsWith('ending:')));
  if(dmSession && !isDm && story) {
   story.intro='';
   story.actions=story.actions.filter(option=>!isDmQuestion(option.id) && !option.id.startsWith('travel:'));
   story.notice=delivered?.history.at(-1)?.text ?? 'รอผู้ดำเนินเรื่องจ่ายบทเล่า';
   if(awaitingReport) story.report=null;
   world.diceRequest=viewer ? dmSession.rolls[viewer] ?? null : null;
  }
  if(story && case001?.guided && !isDm && !case001.guided.presented.includes(case001.guided.scene)) story.actions=[];
  const manual=dmSession ? {
   manualDm:true as const,
   latestRoll:dmSession.latestRoll,
   awaitingReport,
   dmLog:dmSession.log.filter(entry=>isDm || (!!viewer && entry.recipients.includes(viewer))),
   pendingCheck:viewer ? dmSession.checks[viewer]?.actionId : undefined,
   pendingQuestionCount:dmSession.questions.filter(q=>q.playerId===viewer && q.site===site).length,
  } : {};
  return {...world,...manual,...(case001?.guided ? {guided:guidedView({...world,case001,caseMap,dmSession,narrative})} : {}),...(explorationPlan && viewer?{explorationPlan:{id:explorationPlan.id,participants:Object.keys(explorationPlan.actions),minutes:Math.max(0,...Object.values(explorationPlan.actions).map(a=>a.minutes)),mine:explorationPlan.actions[viewer]?{actionId:explorationPlan.actions[viewer].actionId,minutes:explorationPlan.actions[viewer].minutes}:undefined}}:{}),...(viewer && narrative?{narrative:narrativeView(narrative,viewer)}:{}),case001:story,
   ...(caseMap && site && localCase ? {caseMap:{site,npcs:caseMap.npcPlacements?.[site] ?? [],opportunity:caseOpportunity(localCase,caseMap),withdrawalBlocked:!!caseMap.battle,battle:battleView(caseMap,site,{...world,caseMap,case001},isDm),
    ...(site==='C' && caseMap.turnConclusion ? {turnConclusion:caseMap.turnConclusion} : {})}} : {}),dm:getScriptedDmView(scenario,world.scenario)};
 }
 delete(code:string){this.worlds.delete(code);this.seen.delete(code);this.rewinds.delete(code);}
 apply(code:string,player:string,input:unknown):{snapshot:Snapshot;duplicate:boolean} {
  const current=this.get(code);
  const w=current.characters ? structuredClone(current) : current;
  if(!w.players[player]) throw Error('ไม่พบผู้เล่น');
  if(!input || typeof input!=='object') throw Error('คำขอไม่ถูกต้อง'); let a=input as WorldAction;
  const requester=player;
  let narrativeActors=[player];
  let approvedAnswer:string|undefined;
  let rollAnswer:import('@baan/shared').DmOutcomeAnswer|undefined;
  if(typeof a.id!=='string'||a.id.length<1||a.id.length>100 || typeof a.type!=='string') throw Error('คำขอไม่ถูกต้อง');
  const editingProfile=a.type==='updateCharacter';
  if(editingProfile) {
   if(w.case001 || w.encounter || !w.characters?.[player] || w.humanDmId===player) throw Error('แก้ตัวละครได้ก่อนเริ่มคดีเท่านั้น');
   a={...a,bonus:('bonus' in a ? a.bonus : undefined) ?? w.characters[player].bonus,type:'createCharacter'} as Extract<WorldAction,{type:'createCharacter'}>;
  }
  if(w.basicMode && (a.type==='useTalent' || a.type==='usePassive' || ('boost' in a && a.boost!==undefined && a.boost!=='focus'))) throw Error('พักความสามารถพิเศษไว้ในโหมดพื้นฐาน ใช้ Stat และสมาธิได้');
  const dedupe=player+':'+a.id; const seen=this.seen.get(code)!; if(seen.has(dedupe)) return {snapshot:this.snapshot(code,player),duplicate:true};
  if(a.type==='dmSessionControl' && a.command==='rewind') {
   const saved=this.rewinds.get(code);
   if(player!==w.humanDmId || !w.dmSession || w.case001?.report || !saved || Object.keys(w.players).sort().join(',')!==Object.keys(saved.world.players).sort().join(',') || saved.world.humanDmId!==player) throw Error('ย้อนต้นบทไม่ได้เมื่อสมาชิกหรือ DM เปลี่ยน หรือคดีปิดแล้ว');
   const restored:World=structuredClone({...saved.world,backgroundUses:saved.backgroundUses ? new Set(saved.backgroundUses):undefined});
   restored.paused=true;restored.preparingSession=true;restored.inactivePlayers=[...(w.inactivePlayers ?? [])];restored.revision=w.revision+1;
   this.worlds.set(code,restored);seen.set(dedupe,restored.revision);
   return {snapshot:this.snapshot(code,player),duplicate:false};
  }
  if(w.inactivePlayers?.includes(player))throw Error('ตัวละครพักใน session นี้ รอ DM จัดทีมก่อนเริ่มครั้งหน้า');
  if(w.paused && a.type!=='dmSessionControl') throw Error('DM พักคดีอยู่ รอเปิดเล่นต่อ');
  const parked:Record<string,Cell>={};
  if(a.type!=='dmSessionControl')for(const id of w.inactivePlayers ?? [])if(w.players[id]){parked[id]=w.players[id];delete w.players[id];}
  if(w.case001?.guided?.transition && a.type!=='dmSessionControl' && a.type!=='dmPlaceNpc' && (a.type!=='guided' || !['confirm','cancel','propose'].includes(a.command))) delete w.case001.guided.transition;
  if ('die' in a || 'roll' in a || 'total' in a || 'outcome' in a || 'dc' in a || 'dcOverride' in a || 'statOverride' in a || 'modifier' in a) throw Error('คำขอไม่ถูกต้อง');
  if(a.type==='dmTravel' && w.case001?.guided) throw Error('ยืนยันเปลี่ยนบทผ่านสมุดคดี');
  if(a.type==='dmTravel') {
   if(!w.dmSession || w.humanDmId!==requester || w.caseMap?.battle || a.site!==w.case001?.site) throw Error('ผู้ดำเนินเรื่องยังพาทีมเดินทางไม่ได้');
   const actionId=a.actionId;
   const destination=caseOptions(w.case001!,true).find(option=>option.id===actionId && option.id.startsWith('travel:'));
   const lead=Object.keys(w.players).find(id=>id!==requester && !!w.characters?.[id]?.hp);
   if(!destination || !lead) throw Error('ทีมยังเดินทางไปที่นั่นไม่ได้');
   player=lead;
   recordDm(w.dmSession,'travel',requester,Object.keys(w.players).filter(id=>id!==requester),destination.label);
   a={id:a.id,type:'caseAction',actionId:destination.id};
  }
  if(a.type==='caseDm' || a.type==='dmAnswer') {
   let questionId:string|undefined;
   if(a.type==='dmAnswer') {
    this.dmPanel(code,requester);
    const cardId=a.cardId;
    const question=w.dmSession?.questions.find(entry=>entry.id===cardId);
    if(!question || (question.guidedScene && question.guidedScene!==w.case001?.guided?.scene) || w.caseMap?.sites[question.playerId]!==question.site || typeof a.actionId!=='string' ||
      !isDmQuestion(a.actionId)) throw Error('บทตอบนี้ใช้กับคำถามไม่ได้แล้ว');
    const answerId=a.actionId;
    if(a.confirmContext===true && !questionPreview(w,question.playerId,answerId)) {
     if(!suggestedAnswers(w,question).some(answer=>answer.id===answerId && answer.confirmContext))throw Error('บทตอบนี้ใช้กับคำถามไม่ได้แล้ว');
     command51(w,'context:'+answerId.slice('guided-talk:'.length));
    }
    if(!questionPreview(w,question.playerId,answerId))throw Error('บทตอบนี้ใช้กับคำถามไม่ได้แล้ว');
    questionId=cardId;
    if(w.case001?.guided) w.case001.guided.questions=w.case001.guided.questions.filter(text=>text!==question.label);
    a={id:a.id,type:'caseDm',targetId:question.playerId,actionId:a.actionId};
   }
   const panel=this.dmPanel(code,requester);
   if(!('caseMode' in panel) || !panel.investigators) throw Error('ใช้คำสั่งนี้ในคดีรุ่น 2 เท่านั้น');
   const {targetId,actionId}=a;
   if(!questionId && !panel.investigators.find(target=>target.id===targetId)?.choices.some(choice=>choice.id===actionId)) throw Error('หัวข้อนี้ยังใช้ไม่ได้');
   if(w.dmSession && isDmQuestion(actionId)) {
    approvedAnswer=actionId;
    if(questionId) w.dmSession.questions=w.dmSession.questions.filter(q=>q.id!==questionId);
   }
   player=targetId;
   narrativeActors=[targetId];
   a={id:a.id,type:'caseAction',actionId};
  }
  const storyStart=a.type==='caseStart' && (a.mode==='story' || (this.storyRoomsOnly && !!w.characters));
  if(w.inactivePlayers?.includes(player))throw Error('ตัวละครพักใน session นี้');
  if(w.characters && w.humanDmId===player && !storyStart && ['move','open','close','collect','chooseDialogue','start','endTurn','strike','escape','pacify','tacticalCheck','stabilize','breakRestraint','caseStart'].includes(a.type)) throw Error('คำสั่งนี้สำหรับผู้สืบสวน');
  if(this.storyRoomsOnly && w.characters && !w.case001 &&
    !['createCharacter','setPlayerNames','claimDm','releaseDm','caseStart'].includes(a.type)) throw Error('เริ่มคดีก่อนลงมือสำรวจ');
  if(w.explorationPlan && !['planSubmit','planResolve','planCancel','narrativeNext','move','dmRequestRoll','dmRoll','dmNarrativeNext'].includes(a.type)) delete w.explorationPlan;
  const pos=w.players[player];
  if(w.encounter && w.encounter.phase!=='resolved' && ['move','endTurn','pacify','strike','escape','focus','check','tacticalCheck','breakRestraint','stabilize'].includes(a.type) && w.activePlayer!==player) throw Error('ยังไม่ถึงเทิร์นของผู้เล่น');

  if(w.tactics && w.encounter?.phase==='player' && ['move','strike','pacify','escape','tacticalCheck','open','close','collect','stabilize'].includes(a.type)
    && (!w.characters?.[player]?.hp || w.humanDmId===player)) throw Error('ตัวละครยังลงมือไม่ได้');
  if(w.tactics && w.encounter?.phase==='player' && a.type==='move' && (w.tactics.restrained[player] ?? 0)>=w.tactics.round) {
   throw Error('ถูกพันธนาการ');
  }
  if(w.sceneMode && ['planSubmit','planResolve'].includes(a.type)) throw Error('ทีมสำรวจฉากเดียวกัน');
  const caseTactical=w.caseMap && (!w.sceneMode || a.type==='start' || !!w.caseMap.battle) &&
    ['move','start','endTurn','strike','pacify','escape','useTalent','usePassive','stabilize','breakRestraint','caseObjective'].includes(a.type);
  if(a.type==='turnEncounter') {
   turnEncounterAction(w,player,a,this.rollD20,()=>completeCaseRound(w));
  } else if(caseTactical) {
   caseBattleAction(w,player,a,caseGrid(w.caseMap!.sites[player] ?? 'A'),this.rollD20,()=>completeCaseRound(w));
   if(a.type==='start' && w.case001?.guided && w.caseMap?.battle?.id==='EN01') observeGuidedScene(w,'C4');
   if(a.type==='caseObjective' && w.case001?.guided?.version==='5.5' && w.case001.v51?.RITUAL_STATUS==='stopped')observeGuidedScene(w,'F5');
  } else {
  if(w.case001 && !['guided','dmSessionControl','dmPlaceNpc','planSubmit','planResolve','planCancel','dmPublish','dmDismiss','dmCancelCheck','askGm','dmReply'].includes(a.type) && a.type!=='dmNarrativeNext' && a.type!=='narrativeNext' && a.type!=='caseAction' && a.type!=='caseStart' && a.type!=='createCharacter' && !(a.type==='claimDm' && w.dmSession && !w.humanDmId) && !(w.case001.story && (a.type==='dmRequestRoll' || a.type==='dmRoll'))) throw Error('ใช้คำสั่งจากหน้าคดี');
  switch(a.type){
   case 'dmSessionControl': {
    if(player!==w.humanDmId || !w.dmSession || !w.case001 || w.case001.report) throw Error('เฉพาะ DM ในคดีที่ยังไม่ปิด');
    if(a.command==='pause') {w.paused=true;w.preparingSession=true;}
    else if(a.command==='clearPending') {
     if(!w.paused)throw Error('พักคดีก่อนยกเลิกคำขอ');
     delete w.explorationPlan;w.dmSession.checks={};
     for(const [id,roll] of Object.entries(w.dmSession.rolls))if(roll.die===null)delete w.dmSession.rolls[id];
    }
    else if(a.command==='attendance') {
     if(!w.paused || !a.targetId || a.targetId===player || !w.players[a.targetId] || !w.characters?.[a.targetId] || typeof a.absent!=='boolean')throw Error('จัดทีมได้เฉพาะ DM ขณะพักคดี');
     const absent=new Set(w.inactivePlayers ?? []);a.absent?absent.add(a.targetId):absent.delete(a.targetId);
     const active=Object.keys(w.players).filter(id=>id!==player && !absent.has(id));
     if(w.caseMap?.battle && !active.some(id=>w.characters?.[id]?.hp && w.caseMap!.sites[id]===w.caseMap!.battle!.site))throw Error('ต้องมีคนในฉากเผชิญหน้าเดิมอย่างน้อยหนึ่งคน');
     if(w.explorationPlan || Object.keys(w.dmSession.checks).length || Object.values(w.dmSession.rolls).some(r=>r.die===null))throw Error('จัดการแผนหรือคำขอทอยที่ค้างก่อนเปลี่ยนทีม');
     if(!a.absent && w.inactivePlayers?.includes(a.targetId) && w.caseMap)travelCaseMap(w,a.targetId,w.case001.site,caseGrid(w.case001.site));
     w.inactivePlayers=[...absent];

    }
    else if(a.command==='resume') {
     if(Object.keys(w.players).filter(id=>id!==player && !w.inactivePlayers?.includes(id)).length<2)throw Error('ต้องมีผู้สืบสวนเล่นวันนี้อย่างน้อย 2 คน');
     delete w.paused;delete w.preparingSession;
     resumeSessionBattle(w,this.rollD20,()=>completeCaseRound(w));
    }
    else if(a.command==='withdraw') {
     delete w.paused;delete w.caseMap?.battle;delete w.case001.guided?.transition;
     withdrawCase(w.case001);
    } else throw Error('คำสั่งจัดการคดีไม่ถูกต้อง');
    break;
   }
   case 'dmPlaceNpc': {
    if(w.humanDmId!==player || !w.dmSession || !w.case001 || !w.caseMap || w.case001.report || a.site!==w.case001.site || w.caseMap.battle) throw Error('วางตัวละครได้เฉพาะผู้ดำเนินเรื่องในฉากปัจจุบัน');
    const npc=caseNpcs.find(item=>item.id===a.npcId);
    const pos=a.position;
    if(!npc || (pos!==null && (!pos || typeof pos.x!=='number' || typeof pos.y!=='number' || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || pos.x<0 || pos.x>100 || pos.y<0 || pos.y>100))) throw Error('ตำแหน่งหรือตัวละครไม่ถูกต้อง');
    const placements=w.caseMap.npcPlacements ??= {};
    const current=placements[w.case001.site] ?? [];
    placements[w.case001.site]=current.filter(item=>item.id!==npc.id);
    if(pos) placements[w.case001.site]!.push({id:npc.id,x:Math.round(pos.x*10)/10,y:Math.round(pos.y*10)/10});
    break;
   }
   case 'guided':
    if(a.command==='v51:forbear55') {
     const b=w.caseMap?.battle;
     if(player!==w.humanDmId || !b?.final55 || b.final55.trustUsed || w.case001?.v51?.KAEW_TRUST!=='high' ||
       !b.enemies[0].tactics.telegraph)throw Error('ไม่มีการโจมตีที่แม่แก้วยับยั้งได้');
     delete b.enemies[0].tactics.telegraph;
     b.final55.trustUsed=true;b.final55.withheldAttack=true;
     break;
    }
    guidedCommand(w,player,a.command,a.target);if(a.command==='history') approvedAnswer='guided-history';if(a.command==='hint') approvedAnswer='guided-hint';if(a.command==='evacuate') approvedAnswer='guided-rescue';narrativeActors=Object.keys(w.players).filter(id=>id!==w.humanDmId);break;
   case 'planSubmit': {
    if(!w.case001 || !w.caseMap || w.case001.report || w.caseMap.battle || w.humanDmId===player || !w.characters?.[player]?.hp) throw Error('วางแผนได้เฉพาะช่วงสำรวจ');
    const option=caseOptions({...w.case001,site:w.caseMap.sites[player] ?? 'A'},true).find(o=>o.id===a.actionId && o.id!=='finish');
    if(!option) throw Error('กิจกรรมนี้วางแผนไม่ได้');
    const plan=w.explorationPlan ??= {id:randomUUID(),actions:{}};
    plan.actions[player]={actionId:a.actionId,boost:a.boost,minutes:option.minutes};break;
   }
   case 'planCancel': case 'planResolve': {
    const plan=w.explorationPlan;
    if(!plan || plan.id!==a.planId || w.humanDmId===player || !w.characters?.[player]?.hp) throw Error('แผนนี้ใช้ไม่ได้แล้ว');
    if(a.type==='planCancel') {delete w.explorationPlan;break;}
    const entries=Object.entries(plan.actions).sort(([a],[b])=>a.localeCompare(b));
    if(!plan.actions[player] || entries.length<2 || w.caseMap?.battle || !w.case001 || w.case001.report) throw Error('ต้องมีกิจกรรมที่ยืนยันอย่างน้อยสองคน');
    const claimed=new Set<string>();
    for(const [id,proposal] of entries) {
     if(!w.players[id] || !w.characters?.[id]?.hp) throw Error('ผู้ร่วมแผนไม่พร้อม');
     const option=caseOptions({...w.case001,site:w.caseMap!.sites[id] ?? 'A'},true).find(o=>o.id===proposal.actionId && o.id!=='finish');
     if(!option || (!option.id.startsWith('travel:') && claimed.has(option.id))) throw Error('กิจกรรมขัดแย้งกัน กรุณาปรับแผน');
     claimed.add(option.id);
    }
    narrativeActors=entries.map(([id])=>id);
    const duration=Math.max(...entries.map(([,p])=>p.minutes));
    for(const [id,proposal] of entries) executeCaseAction(w,id,proposal,this.rollD20,true);
    tick(w.case001,duration);
    if(!w.case001.report) for(const site of new Set(entries.map(([id])=>w.caseMap!.sites[id] ?? 'A'))) {
     const prior=w.case001.site;w.case001.site=site;tick(w.case001,0);w.case001.site=prior;
    }
    for(const [id] of entries) if(!w.case001.report && !w.caseMap!.battle && caseOpportunity({...w.case001,site:w.caseMap!.sites[id]},w.caseMap!)==='EN04') startCaseBattle(w,id,caseGrid(w.caseMap!.sites[id]));
    syncCaseBattle(w);delete w.explorationPlan;break;
   }
   case 'dmNarrativeNext': {
    this.dmPanel(code,player);
    if(!w.narrative || !w.players[a.targetId] || a.targetId===player) throw Error('ไม่พบคิวผู้สืบสวน');
    advanceNarrative(w.narrative,a.targetId,a.sequence);break;
   }
   case 'narrativeNext': if(w.narrative) advanceNarrative(w.narrative,player,a.sequence); break;
   case 'setPlayerNames': {
    if(!w.characters || w.case001 || w.encounter || w.humanDmId===player) throw Error('ตั้งชื่อได้ก่อนเริ่มคดีเท่านั้น');
    const names={playerName:validatePlayerName(a.playerName),characterName:validatePlayerName(a.characterName)};
    (w.playerNames ??= {})[player]=names;
    const c=w.characters[player];
    if(c) w.characters[player]={...c,playerName:names.playerName,characterName:names.characterName ?? castProfiles[c.profession].name};
    break;
   }
   case 'createCharacter': {
    if(!w.characters || w.humanDmId===player || w.characters[player] && !editingProfile) throw Error('สร้างตัวละครไม่ได้');
    const character=createCharacter(a.profession,a.bonus,
      w.basicMode || a.talent===undefined ? undefined : {talent:a.talent},this.storyRoomsOnly);
    if(this.storyRoomsOnly && Object.entries(w.characters).some(([id,other])=>id!==player && other.profession===character.profession)) {
     throw Error('เพื่อนร่วมทีมเลือกตัวละครนี้แล้ว');
    }
    const biography=this.storyRoomsOnly ? castProfiles[character.profession].biography : validateBiography(a.biography);
    const playerName=validatePlayerName(a.playerName ?? w.playerNames?.[player]?.playerName);
    const characterName=validatePlayerName(a.characterName ?? w.playerNames?.[player]?.characterName);
    w.characters[player]={...character,...(playerName?{playerName}:{}),...(characterName || this.storyRoomsOnly ? {characterName:characterName ?? castProfiles[character.profession].name}: {})};
    if(w.biographies) w.biographies[player]={...biography};
    break;
   }
   case 'caseStart': {
    if(w.case001 || (w.encounter && w.encounter.phase!=='resolved')) throw Error('เริ่มคดีไม่ได้');
    const count=Object.keys(w.players).filter(id=>id!==w.humanDmId).length;
    const sceneMode=storyStart;
    if(this.storyRoomsOnly && sceneMode && w.humanDmId!==player) throw Error('ให้ผู้ดำเนินเรื่องเป็นคนเริ่มคดี');
    if(sceneMode && !w.characters) throw Error('ใช้โหมดเล่าเรื่องในห้องรุ่น 2');
    const limit=w.characters ? 6 : 4;
    if(count<2 || count>limit) throw Error('ต้องมีผู้สืบสวน 2–'+limit+' คน');
    if(w.characters && Object.keys(w.players).some(id=>id!==w.humanDmId && !w.characters?.[id])) throw Error('ผู้สืบสวนทุกคนต้องสร้างตัวละครก่อน');
    w.case001=newCase(!!w.characters,sceneMode ? 4 : undefined,sceneMode && this.storyDiceV41 ? '4.1' : undefined);
    if(w.basicMode) w.case001.basicMode=true;
    if(sceneMode) {
     w.sceneMode=true;
     if(w.humanDmId) w.dmSession={narration:[],questions:[],checks:{},rolls:{},log:[]};
     if(this.guidedV43) {
      w.case001.guided=newGuided(this.guidedVersion);
      if(this.guidedVersion!=='4.3') {
       w.case001.v51=newState51(this.lethalV51,noTimer(w.case001));
       if(this.guidedVersion==='5.5')w.case001.v51.CASE_ACCEPTED=true;
       w.case001.narrativeEvents=[];
       w.case001.notice='';
       if(this.lethalV51)emitCaseBeat(w.case001,'v51:lethal',lethalAnnouncement51(w.case001),'party');
      }
      observeGuidedScene(w,'A1');
     }
     w.lastCheck=null;
     narrativeActors=Object.keys(w.players).filter(id=>id!==w.humanDmId);
    }
    if(w.characters) {w.caseMap=newCaseMap(w.players);w.encounter=null;w.tactics=undefined;w.activePlayer=null;}
    break;
   }
   case 'caseAction': {
    if(w.case001?.guided && !w.case001.guided.presented.includes(w.case001.guided.scene)) throw Error('รอผู้ดำเนินเรื่องส่งบทเปิดฉากก่อน');
    if(w.sceneMode && requester===player && (!('site' in a) || a.site!==w.case001?.site)) throw Error('ทีมเปลี่ยนฉากแล้ว โปรดเลือกคำสั่งใหม่');
    if(w.dmSession && requester===player && typeof a.actionId==='string' &&
      (isDmQuestion(a.actionId) || a.actionId.startsWith('travel:'))) throw Error('ให้ผู้ดำเนินเรื่องจัดการการเดินทางและบทสนทนา');
    if(w.dmSession && requester===player && w.case001 && (!w.caseMap?.battle || isStoryCheck(a.actionId))) {
     const option=[...caseOptions(w.case001,true),...storyCheckOptions(w,player)].find(option=>option.id===a.actionId);
     if(option?.check) {
      if(w.dmSession.checks[player] || w.dmSession.rolls[player]?.die===null) throw Error('มีคำขอทอยที่รออยู่แล้ว');
      const check={id:randomUUID(),actionId:option.id,site:w.case001.site,label:option.label,boost:a.boost,stat:({ritual:'INT',spirit:'SPI',physical:'BODY',social:'SOC',investigation:'PER'} as const)[option.check],dice:'dice' in option ? option.dice : undefined};
      if(!checkAvailable(w,player,check)) throw Error('ยังทอยเพื่อทำรายการนี้ไม่ได้');
      w.dmSession.checks[player]=check;
      recordDm(w.dmSession,'check-requested',player,[player],check.label);
      break;
     }
    }
    const previousSite=w.case001?.site;
    executeCaseAction(w,player,a,this.rollD20);
    if(w.sceneMode && previousSite!==w.case001?.site) narrativeActors=Object.keys(w.players).filter(id=>id!==w.humanDmId);
    break;
   }
   case 'dmCancelCheck': {
    this.dmPanel(code,player);
    const session=w.dmSession;
    const check=session?.checks[a.targetId];
    if(!session || !check || check.id!==a.checkId) throw Error('ไม่พบคำขอทอยจากฉาก');
    delete session.checks[a.targetId];
    const roll=session.rolls[a.targetId];
    if(roll?.die===null) {
     delete session.rolls[a.targetId];
     recordDm(session,'roll-canceled',player,[a.targetId],check.label);
    }
    recordDm(session,'check-canceled',player,[a.targetId],check.label);
    break;
   }
   case 'askGm': {
    const session=w.dmSession;
    const site=w.case001?.site;
    if(!session || !w.humanDmId || !site || site!==a.site || w.humanDmId===player || !w.characters?.[player] ||
      w.case001?.report || w.caseMap?.battle) throw Error('ยังส่งคำถามให้ผู้ดำเนินเรื่องไม่ได้');
    if(session.questions.filter(question=>question.playerId===player && question.site===site).length>=5) throw Error('มีคำถามรออยู่ 5 ข้อแล้ว');
    const label=gmText(a.text);
    if(w.case001?.guided && !w.case001.guided.questions.includes(label)) w.case001.guided.questions.push(label);
    session.questions.push({id:randomUUID(),playerId:player,site,label,guidedScene:w.case001?.guided?.scene});
    recordDm(session,'question',player,[player],label);
    break;
   }
   case 'dmReply': {
    if(w.humanDmId!==player) throw Error('เฉพาะผู้ดำเนินเรื่อง');
    const session=w.dmSession;
    const question=session?.questions.find(entry=>entry.id===a.cardId);
    if(!session || !question || (question.guidedScene && question.guidedScene!==w.case001?.guided?.scene) || question.site!==w.case001?.site || w.caseMap?.sites[question.playerId]!==question.site ||
      w.case001.report || w.caseMap.battle) throw Error('คำถามนี้ใช้ไม่ได้แล้ว');
    if(w.case001.guided && a.speaker!==undefined) throw Error('ใช้บท NPC ที่ตรวจสอบแล้วในฉากนี้');
    const text=gmText(a.text);
    if(a.speaker!==undefined && (typeof a.speaker!=='string' || !sceneSpeakers(w.case001).includes(a.speaker))) {
     throw Error('ตัวละครนี้ยังพูดในฉากปัจจุบันไม่ได้');
    }
    const qa=a.qaId===undefined?undefined:suggestedAnswers(w,question).find(item=>'qa' in item && item.id===a.qaId);
    if(a.qaId!==undefined && !qa)throw Error('คำตอบแนะนำใช้ไม่ได้แล้ว');
    const speaker=qa && qa.speaker!=='DM'?qa.speaker:a.speaker;
    const answer=speaker ? speaker+' · '+text : text;
    if(w.case001.guided) w.case001.guided.questions=w.case001.guided.questions.filter(text=>text!==question.label);
    const recipients=Object.keys(w.players).filter(id=>id!==player);
    deliverDmNarration(w,{id:question.id,eventId:'gm-answer:'+question.id,text:answer,site:question.site,scope:'party',actor:player,recipients},player,'answer');
    (session.answers ??= []).push({question:question.label,text:answer,qaId:qa?.id,scene:question.guidedScene,sequence:w.narrative!.sequence});
    session.questions=session.questions.filter(entry=>entry.id!==question.id);
    break;
   }
   case 'dmPublish': case 'dmDismiss': {
    this.dmPanel(code,player);
    const session=w.dmSession;
    if(!session) throw Error('ไม่มีคิวผู้ดำเนินเรื่อง');
    if(a.type==='dmPublish') {
     const index=session.narration.findIndex(beat=>beat.id===a.cardId);
     if(index<0) throw Error('จ่ายบทนี้แล้วหรือไม่พบบท');
     if(!inCurrentNarration(w,session.narration[index])) throw Error('บทนี้อยู่คนละฉาก');
     const beat=session.narration[index];
     const cue='guided-cue:'+w.case001?.guided?.scene;
     if(w.case001?.guided && beat.eventId!==cue && session.narration.some(card=>card.eventId===cue && inCurrentNarration(w,card))) throw Error('ส่งบทเปิดฉากก่อนบทอื่น');
     if(beat.answer) {
      const response=beat.answer,part=a.part ?? 'all';
      if(!['narration','dialogue','all'].includes(part)) throw Error('เลือกบทตอบไม่ถูกต้อง');
      const parts=(part==='all' ? ['narration','dialogue'] as const : [part]).filter(key=>response[key] && !response.sentParts.includes(key));
      if(!parts.length) throw Error('จ่ายบทตอบส่วนนี้แล้วหรือไม่มีบท');
      if(parts.includes('dialogue') && !availableDialogue(w,response.checkId,response.outcome==='success'?'full':response.outcome,response.dialogue!)) throw Error('NPC ไม่พร้อมพูดในสถานการณ์ปัจจุบัน');
      deliverDmNarration(w,{...beat,text:parts.map(key=>response[key]).join('\n')},player,'answer');
      response.sentParts.push(...parts);
      if(response.sentParts.includes('narration') && (!response.dialogue || response.sentParts.includes('dialogue'))) session.narration.splice(index,1);
      else beat.text=(['narration','dialogue'] as const).filter(key=>!response.sentParts.includes(key)).map(key=>response[key]).filter(Boolean).join('\n');
     } else {
      session.narration.splice(index,1);
      deliverDmNarration(w,beat,player,'narration');
     }
    } else {
     const index=session.questions.findIndex(question=>question.id===a.cardId);
     if(index<0) throw Error('ไม่พบคำถาม');
     const [question]=session.questions.splice(index,1);
     recordDm(session,'dismissed',player,[question.playerId],question.label);
    }
    break;
   }
   case 'claimDm':
    if(w.characters && w.encounter && w.encounter.phase!=='resolved') throw Error('เปลี่ยนบทบาทหลังจบการเผชิญหน้า');
    if(w.humanDmId && w.humanDmId!==player) throw Error('ห้องนี้มีผู้ดำเนินเรื่องแล้ว');
    w.humanDmId=player;
    break;
   case 'releaseDm':
    if(w.dmSession || (w.characters && (Object.keys(w.players).length>6 || (w.encounter && w.encounter.phase!=='resolved')))) throw Error('ยังคืนบทผู้ดำเนินเรื่องไม่ได้');
    if(w.humanDmId!==player) throw Error('เฉพาะผู้ดำเนินเรื่อง');
    w.humanDmId=null;
    w.diceRequest=null;
    break;
   case 'dmEvent': case 'dmDialogue': case 'dmScene': case 'dmRequestRoll': {
    const panel=this.dmPanel(code,player);
    if(a.type==='dmRequestRoll' && w.inactivePlayers?.includes(a.targetId))throw Error('ตัวละครพักใน session นี้');
    if('caseMode' in panel) {
     if(a.type!=='dmRequestRoll' || w.case001?.report || (w.dmSession ? w.dmSession.rolls[a.targetId]?.die===null : w.diceRequest?.die===null) || !panel.investigators?.some(target=>target.id===a.targetId)) throw Error('ขอทอยไม่ได้');
     const check=w.dmSession?.checks[a.targetId];
     if(check ? a.checkId!==check.id || !checkAvailable(w,a.targetId,check) : a.checkId!==undefined) throw Error('คำขอทอยจากฉากเปลี่ยนไปแล้ว');
     if(check && a.difficulty!==undefined && ![11,14,17,20,22].includes(a.difficulty as number)) throw Error('ระดับความยากไม่ถูกต้อง');
     if(w.case001?.v51 && check?.dice && a.difficulty!==undefined && a.difficulty!==check.dice.dc)throw Error('ต้องรักษา DC ของ Dice Card ต้นฉบับ');
     if(check?.dice && a.stat!==undefined && a.stat!==check.dice.stat) throw Error('จุดทอยตามบทต้องใช้ค่าสถานะที่กำหนด');
     let manualDice: DmRollCard['dice'];
     if(!check && ('difficulty' in a || 'stat' in a)) {
      const stats=w.characters?.[a.targetId]?.coreStats;
      if(!stats || typeof a.stat!=='string' || !Object.hasOwn(stats,a.stat) || ![11,14,17,20,22].includes(a.difficulty as number)) throw Error('ค่าสถานะหรือระดับความยากไม่ถูกต้อง');
      manualDice={stat:a.stat as keyof typeof stats,dc:a.difficulty as number,ap:0};
     }
     if(check && !check.dice && a.difficulty!==undefined) {
      const stats=w.characters?.[a.targetId]?.coreStats;
      if(!stats || typeof a.stat!=='string' || !Object.hasOwn(stats,a.stat)) throw Error('เลือกค่าสถานะก่อนส่งการ์ด');
      manualDice={stat:a.stat as keyof typeof stats,dc:a.difficulty as number,ap:0};
     }
     const selectedDice=check?.dice ? {...check.dice,dc:(a.difficulty as number|undefined) ?? check.dice.dc} : manualDice;
     const card={id:randomUUID(),playerId:a.targetId,die:null,...(check ? {label:check.label} : {}),...(selectedDice ? {dice:selectedDice} : {})};
     if(w.dmSession) {
      w.dmSession.rolls[a.targetId]=card;
      recordDm(w.dmSession,'roll-requested',player,[a.targetId],(check?.label ?? 'จ่ายการ์ดทอย D20')+(selectedDice ? ' · '+selectedDice.stat+' · DC '+selectedDice.dc : ''));
     } else w.diceRequest=card;
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
    const request=w.dmSession ? w.dmSession.rolls[player] : w.diceRequest;
    if(!request || request.id!==a.requestId || request.playerId!==player || request.die!==null) throw Error('ไม่มีคำขอทอยที่ใช้ได้');
    const check=w.dmSession?.checks[player];
    if(check && !checkAvailable(w,player,check)) throw Error('คำขอทอยจากฉากใช้ไม่ได้แล้ว');
    const die=this.rollD20();
    if(!Number.isInteger(die) || die<1 || die>20) throw Error('ผลทอยไม่ถูกต้อง');
    if(w.dmSession) {
     if(check) {
      delete w.dmSession.checks[player];
      executeCaseAction(w,player,{...check,dcOverride:request.dice?.dc,statOverride:request.dice?.stat},()=>die);
      if(isStoryCheck(check.actionId)) rollAnswer=storyCheckResponse(w,check.actionId,request.id);
     }
     let result=check && w.lastCheck?.playerId===player && w.lastCheck.die===die ? w.lastCheck : null;
     if(!check && request.dice) {
      const stats=w.characters?.[player]?.coreStats;
      if(!stats) throw Error('ไม่พบค่าสถานะของผู้เล่น');
      const total=die+stats[request.dice.stat];
      result={playerId:player,die,total,outcome:total>=request.dice.dc?'success':total>=request.dice.dc-3?'partial':'failure'};
     }
     const outcomes={success:'สำเร็จ',partial:'สำเร็จบางส่วน',failure:'ไม่สำเร็จ'};
     const rollResult=result ? {total:result.total,outcome:result.outcome} : undefined;
     const text=result ? 'D20 '+die+' · รวม '+result.total+' · '+outcomes[result.outcome] : 'ทอย D20 ได้ '+die;
     w.dmSession.latestRoll={id:request.id,playerId:player,die,result:rollResult,dice:request.dice};
     w.dmSession.rolls[player]={...w.dmSession.latestRoll,label:check?.label};
     recordDm(w.dmSession,'roll-result',player,Object.keys(w.players),text);
    } else w.diceRequest={...request,die};
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
    const result=resolveCheck({dc:12,attribute:characterAttribute(character,'mind'),boost},this.rollD20);
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
    const result=resolveCheck({dc:12,attribute:characterAttribute(character,'body')},this.rollD20);
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
  if(w.case001?.report && w.case001.guided) {w.case001.guided.phase='ENDING';if(noTimer(w.case001))w.case001.guided.scene='ENDING '+w.case001.report.ending;delete w.case001.guided.transition;}
  if(w.case001?.story) {
   for(const participant of narrativeActors) {
   const site=w.caseMap?.sites[participant] ?? w.case001.site;
   const key='narrative:entry:'+(w.dmSession ? 'party' : participant)+':'+site;
   if(!w.case001.guided && !w.case001.milestones.includes(key)) {
    w.case001.milestones.push(key);
    // First arrival describes the setting before the discoveries from that action.
    (w.case001.narrativeEvents ??= []).unshift({eventId:'entry:'+site,text:sceneNarration(w.case001,site),site,scope:w.dmSession ? 'party' : 'local',recipient:w.dmSession ? undefined : participant,actor:participant});
   }
   if(caseTactical && !w.case001.report) {
    const local={...w.case001,site};advanceStory(local);w.case001.story=local.story;w.case001.narrativeEvents=local.narrativeEvents;
   }
   }
   emitBattlePhase(w);
  }
  if(w.dmSession) for(const [id,check] of Object.entries(w.dmSession.checks)) {
   if(checkAvailable(w,id,check)) continue;
   delete w.dmSession.checks[id];
   if(w.dmSession.rolls[id]?.die===null) {
    delete w.dmSession.rolls[id];
    recordDm(w.dmSession,'roll-canceled',requester,[id],check.label+' · สถานการณ์เปลี่ยน');
   }
   recordDm(w.dmSession,'check-canceled',requester,[id],check.label+' · สถานการณ์เปลี่ยน');
  }
  if(w.dmSession && w.case001?.report && !current.case001?.report) {
   for(const [id,card] of Object.entries(w.dmSession.rolls)) if(card.die===null) {
    recordDm(w.dmSession,'roll-canceled',requester,[id],'คดีสิ้นสุดแล้ว');
    delete w.dmSession.rolls[id];
   }
  }
  if(w.case001?.narrativeEvents?.length) {
   const state=w.narrative ??= newNarrative();
   for(const beat of w.case001.narrativeEvents) {
    const recipients=Object.keys(w.players).filter(id=>id!==w.humanDmId && (!beat.recipient || beat.recipient===id) && (beat.scope==='party' || (w.caseMap?.sites[id] ?? w.case001!.site)===beat.site));
    const {recipient,actor,...publicBeat}=beat;
    if(w.dmSession) {
     const card={...publicBeat,...(rollAnswer && beat.eventId.startsWith('dice:') ? {answer:rollAnswer}:{}),phase:w.case001.guided?.phase,scene:w.case001.guided?.scene,id:randomUUID(),actor:actor ?? player,recipients};
     if(approvedAnswer===beat.eventId) deliverDmNarration(w,card,requester,'answer');
     else if(recipients.length) w.dmSession.narration.push(card);
    } else enqueueNarrative(state,{...publicBeat,actor:actor ?? player},recipients);
   }
   w.case001.narrativeEvents=[];
  }
  Object.assign(w.players,parked);
  this.worlds.set(code,w);
  if(w.case001?.guided && (!current.case001 || current.case001.guided?.phase!==w.case001.guided.phase && w.case001.guided.phase!=='ENDING')) {
   const {backgroundUses,...saved}=structuredClone(w);this.rewinds.set(code,{world:saved,backgroundUses:backgroundUses ? [...backgroundUses] : undefined});
  }
  w.revision++;seen.set(dedupe,w.revision);return {snapshot:this.snapshot(code,requester),duplicate:false};
 }
 private get(code:string){const w=this.worlds.get(code);if(!w)throw Error('ไม่พบสถานะห้อง');return w;}
}
