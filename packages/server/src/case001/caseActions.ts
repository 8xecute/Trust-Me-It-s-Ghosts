import { caseGrid, spendAP } from '@baan/shared';
import type { World } from '../world.js';
import { observeGuidedScene, speakGuided } from './guidedCase.js';
import { noTimer } from './v51Content.js';
import { isStoryCheck, runStoryCheck } from './storyDice.js';
import { applyCaseAction, failCase, tick } from './case001.js';
import { caseOpportunity, completeTurnPlayer, startCaseBattle, syncCaseBattle, travelCaseMap } from './caseBattle.js';

export function completeCaseRound(w:World) {
 if(++w.caseMap!.rounds%3===0) tick(w.case001!,10);
 if(!Object.entries(w.characters!).some(([id,character])=>id!==w.humanDmId && !w.inactivePlayers?.includes(id) && w.players[id] && character.hp)) {
  const v=w.case001!.v51;
  if(v && w.caseMap?.battle?.id==='EN01')v.GHOST_ENCOUNTER='lost';
  if(v && w.caseMap?.battle?.id==='EN02')v.KAEW_D_RESULT='lost';
  failCase(w.case001!);
 }
 syncCaseBattle(w);
}

export function executeCaseAction(w:World,player:string,a:{actionId:string;boost?:unknown;dcOverride?:number;statOverride?:keyof import('@baan/shared').LiteStats},roll:()=>number,coordinated=false) {
 if(w.case001?.guided?.version==='5.5' && a.actionId==='begin-final55') {
  const s=w.case001,v=s.v51!;
  if(player===w.humanDmId || !w.characters?.[player]?.hp || w.caseMap?.sites[player]!=='E' ||
    !s.guided!.presented.includes(s.guided!.scene) || !['E6','F1'].includes(s.guided!.scene) ||
    !s.key || !v.coreApproached || v.RITUAL_STATUS==='stopped' || w.caseMap.battle || v.finalDefense55)
   throw Error('ยังเริ่มปลดกำไลที่นี่ไม่ได้');
  v.finalReleaseCommitted55=true;
  startCaseBattle(w,player,caseGrid('E'),roll);
  s.guided!.phase='FINAL';
  observeGuidedScene(w,'F1');
  return;
 }
 if(w.case001?.guided?.version==='5.5' && a.actionId==='seal3')throw Error('ปลดเกราะสามขั้นก่อน แล้วใช้การกระทำที่กำไลในสนาม');
 if(w.caseMap?.battle?.turnEncounter && !isStoryCheck(a.actionId)) throw Error('เลือกการกระทำจากหน้าเผชิญหน้า');
 if(a.actionId.startsWith('guided-talk:')) {speakGuided(w.case001!,a.actionId);return;}
 if(isStoryCheck(a.actionId)) {
  runStoryCheck(w,player,a.actionId,a.boost,roll,a.dcOverride);
  completeTurnPlayer(w,player,'ติดต่อขอภาพจากผี',w.lastCheck ?? undefined);
  return;
 }
 const first=w.case001?.narrativeEvents?.length ?? 0;

    if(!w.case001 || w.humanDmId===player) throw Error('เฉพาะผู้สืบสวนในคดี');
    if(typeof a.actionId!=='string') throw Error('คำสั่งคดีไม่ถูกต้อง');
    if(w.sceneMode) w.lastCheck=null;
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
    if(boost!==undefined && (!character || (boost!=='focus' && boost!=='deception' && boost!=='diagnostic'))) throw Error('ตัวเสริมการทดสอบไม่ถูกต้อง');
    const backgroundKey=player+':'+site+':'+(boost ?? a.actionId);
    let usedBoost=false;
    w.case001=applyCaseAction(priorCase,a.actionId,roll,character && {
     character,boost,deferGuidedOpen:!!w.dmSession,dcOverride:a.dcOverride,statOverride:a.statOverride,playerId:w.sceneMode && a.actionId.startsWith('travel:') ? undefined : player,inEncounter:inBattle || coordinated,backgroundUsed:w.backgroundUses?.has(backgroundKey) ?? false,
     onBoost:()=>{usedBoost=true;},
     onCheck:w.sceneMode ? ({die,total,outcome})=>{w.lastCheck={playerId:player,die,total,outcome};} : undefined,
    });
    if(noTimer(w.case001) && a.actionId==='unsafe-bracelet')observeGuidedScene(w,'F6');
    if(w.caseMap && a.actionId==='cut') w.case001.milestones.push('grove-disturbed');
    if(w.caseMap && w.case001.site!==site) {
     const travellers=w.sceneMode ? Object.keys(w.players).filter(id=>id!==w.humanDmId) : [player];
     for(const id of travellers) travelCaseMap(w,id,w.case001.site,caseGrid(w.case001.site));
    }
    if(!w.sceneMode && !coordinated && w.caseMap && !battle && caseOpportunity(w.case001,w.caseMap)==='EN04') startCaseBattle(w,player,caseGrid(w.case001.site));
    syncCaseBattle(w);
    if(character && a.actionId==='sense') character.sanity--;
    if(usedBoost && character && (boost==='focus' || boost==='deception')) character.focus--;
    if(usedBoost && boost!=='focus') w.backgroundUses?.add(backgroundKey);

 for(const beat of w.case001?.narrativeEvents?.slice(first) ?? []) beat.actor=player;
}
