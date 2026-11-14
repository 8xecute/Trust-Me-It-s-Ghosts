import assert from 'node:assert/strict';
import {test} from 'node:test';
import {caseGrid,createCharacter,startTurn,liteGhostHP,powerAttacks,characterMaxHp} from '@baan/shared';
import {newCase} from '../src/case001/case001.js';
import {newGuided} from '../src/case001/guidedCase.js';
import {newState51} from '../src/case001/storyV51.js';
import {newCaseMap,startCaseBattle,turnEncounterAction,battleView} from '../src/case001/caseBattle.js';
import type {World} from '../src/world.js';
function room(count:number,site:'C'|'D'='C') {
 const players=Object.fromEntries(Array.from({length:count},(_,i)=>['p'+i,{x:i+2,y:7}]));
 const map=newCaseMap(players);for(const id in players)map.sites[id]=site;
 const s=newCase(true,4,'4.1');s.evidence.push('E01');s.site=site;if(site==='D'){s.ghost='hostile';s.milestones.push('kaew-engaged');}
 s.guided=newGuided('5.5');s.guided.phase=site;s.guided.scene=site==='C'?'C4':'D4';s.guided.presented=[s.guided.scene];s.v51=newState51(false,true);
 // Keep fixed stats here so encounter mechanics tests are independent of profession balance.
 let w:World={players,caseMap:map,case001:s,revision:0,characters:Object.fromEntries(Object.keys(players).map(id=>[id,{...createCharacter('medium',undefined,undefined,true),hp:10,maxHp:10,coreStats:{BODY:2,PER:3,INT:2,SOC:4,SPI:5,RES:2}}])),turns:Object.fromEntries(Object.keys(players).map(id=>[id,startTurn()])),objects:{},inventory:{},evidence:[],encounter:null,activePlayer:null,roundStart:null,lastCheck:null,scenario:{sceneId:'yard',evidence:[],objectives:[],firedTriggers:[],endingId:null},humanDmId:'dm',diceRequest:null,basicMode:true};
 startCaseBattle(w,'p0',caseGrid(site),()=>20);
 const turn=(actor:string,choice:string,extra:object={},die=20)=>turnEncounterAction(w,actor,{round:w.caseMap!.battle!.round,choice,...extra},()=>die,()=>{});
 return {get w(){return w;},turn,restore:()=>{w=JSON.parse(JSON.stringify(w));}};
}
for(const count of [2,3,4,5,6])test('C4 two enemies retain stats, targets, individual NPC turns and save progress: '+count,()=>{
 const r=room(count),b=r.w.caseMap!.battle!;
 assert.equal(b.enemies.length,2);assert.equal(b.enemies[0].state.ghostHealth,liteGhostHP(12,count)/2);assert.equal(b.enemies.reduce((sum,e)=>sum+e.state.ghostHealth,0),liteGhostHP(12,count));
 const [a,z]=b.enemies;
 assert.throws(()=>r.turn('p0','strike'));assert.throws(()=>r.turn('p0','strike',{targetId:'forged'}));
 const hp=a.state.ghostHealth;
 r.turn('p0','strike',{targetId:z.id});assert.equal(z.state.ghostHealth,hp-2);assert.equal(a.state.ghostHealth,hp);
 assert.equal(b.turnEncounter!.history.at(-1)!.target,z.id);assert.match(b.turnEncounter!.history.at(-1)!.effect!,/เสียพลังชีวิต 2/);
 for(let i=1;i<count;i++)r.turn('p'+i,i===1?'guard':'pass');
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.attacks,undefined);
 assert.throws(()=>r.turn('dm','attack',{enemyId:z.id,attackId:'WET_CLAW',targetId:'p0'}));
 const before=r.w.characters!.p1.hp;
 r.turn('dm','attack',{enemyId:a.id,attackId:'WET_CLAW',targetId:'p1'},9);
 assert.equal(r.w.characters!.p1.hp,before);assert.equal(b.round,1);assert.equal(b.active,null);
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.npcActive,z.id);
 r.restore();
 assert.throws(()=>r.turn('dm','pass',{enemyId:a.id}));
 r.turn('dm','attack',{enemyId:z.id,attackId:'WET_CLAW',targetId:'p1'},9);
 assert.equal(r.w.characters!.p1.hp,before);assert.equal(r.w.caseMap!.battle!.round,2);
 assert.equal(r.w.caseMap!.battle!.active,'p0');
 assert.deepEqual(r.w.caseMap!.battle!.turnEncounter!.acted,[]);
});
test('C4 calling both enemies only pauses their attacks, survives save and expires next round',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;const [a,z]=b.enemies;
 r.turn('p0','pacify',{targetId:a.id});r.turn('p1','pacify',{targetId:z.id});
 assert.equal(b.enemies.every(e=>e.state.phase!=='resolved'),true);
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.enemies.every(e=>e.hesitating),true);
 assert.equal(battleView(r.w.caseMap!,'C',r.w,true)!.turnEncounter!.attacks!.length,0);
 assert.match(b.turnEncounter!.history.at(-1)!.effect!,/ยังไม่สงบถาวร/);
 r.restore();
 assert.throws(()=>r.turn('dm','attack',{enemyId:a.id,attackId:'WET_CLAW',targetId:'p0'}),/ไม่มีการโจมตี/);
 r.turn('dm','pass',{enemyId:a.id});r.turn('dm','pass',{enemyId:z.id});
 assert.ok(r.w.caseMap!.battle);assert.equal(r.w.caseMap!.battle!.round,2);
 assert.notEqual(r.w.case001!.v51!.GHOST_ENCOUNTER,'pacified');
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.enemies.some(e=>e.hesitating),false);
 r.turn('p0','pass');r.turn('p1','pass');
 const hp=r.w.characters!.p0.hp;r.turn('dm','attack',{enemyId:a.id,attackId:'WET_CLAW',targetId:'p0'});
 assert.equal(r.w.characters!.p0.hp,hp-2);
});
test('failed C4 call leaves the target able to attack',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;const enemy=b.enemies[0];
 r.turn('p0','pacify',{targetId:enemy.id},1);r.turn('p1','pass');
 assert.equal(enemy.tactics.calmUntil,undefined);
 assert.ok(battleView(r.w.caseMap!,'C',r.w,true)!.turnEncounter!.attacks!.length);
 const hp=r.w.characters!.p0.hp;r.turn('dm','attack',{enemyId:enemy.id,attackId:'WET_CLAW',targetId:'p0'});
 assert.equal(r.w.characters!.p0.hp,hp-2);
});
test('D4 forced ghost responds to success but continues attacking without ending the encounter',()=>{
 const r=room(2,'D'),b=r.w.caseMap!.battle!;
 r.turn('p0','pacify');r.turn('p1','pass');
 assert.ok(r.w.caseMap!.battle);assert.equal(b.enemies[0].tactics.calmUntil,undefined);
 assert.match(b.turnEncounter!.history[0].effect!,/แรงบังคับ/);
 const hp=r.w.characters!.p0.hp;r.turn('dm','attack',{attackId:'BANANA_ROOT_STRIKE',targetId:'p0'});
 assert.equal(r.w.characters!.p0.hp,hp-2);assert.ok(r.w.caseMap!.battle);
});
test('defeated enemy is skipped by DM; victory waits for the last enemy',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;const [a,z]=b.enemies;
 a.state.ghostHealth=2;r.turn('p0','strike',{targetId:a.id});assert.ok(r.w.caseMap!.battle);
 r.turn('p1','pass');assert.equal(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.npcActive,z.id);
 r.turn('dm','withdraw',{enemyId:z.id});assert.equal(r.w.caseMap!.battle,undefined);
 assert.equal(r.w.case001!.v51!.GHOST_ENCOUNTER,'won');
});

test('PER opening helps one different attacker against the selected enemy without changing damage',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;const [a,z]=b.enemies;
 r.turn('p0','observe',{targetId:z.id},9);
 assert.equal(b.turnEncounter!.history.at(-1)!.check!.total,12);
 assert.equal(z.tactics.exposed!.actor,'p0');assert.equal(a.tactics.exposed,undefined);
 r.restore();const saved=r.w.caseMap!.battle!, hp=saved.enemies[1].state.ghostHealth;
 r.turn('p1','strike',{targetId:z.id},8);
 assert.equal(saved.enemies[1].state.ghostHealth,hp-2);
 assert.equal(saved.turnEncounter!.history.at(-1)!.check!.die,8);
 assert.equal(saved.turnEncounter!.history.at(-1)!.check!.total,12);
 assert.equal(saved.enemies[1].tactics.exposed,undefined);
});
test('encounter rejects generic Focus boosts before consuming resources or rolling',()=>{
 const r=room(2),b=r.w.caseMap!.battle!,targetId=b.enemies[0].id;
 const checkpoint=JSON.stringify(r.w);
 for(const choice of ['strike','observe','guard','encourage','classSkill'])assert.throws(()=>r.turn('p0',choice,{targetId,boost:'focus'}),/ยกเลิก/);
 assert.equal(JSON.stringify(r.w),checkpoint);
 r.turn('p0','strike',{targetId},10);assert.equal(r.w.characters!.p0.focus,4);
 assert.equal(b.turnEncounter!.history.at(-1)!.check!.total,12);
});
test('SOC restores one sanity and its shared attempt limit survives save',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;
 assert.throws(()=>r.turn('p0','encourage',{targetId:'p0'}));
 assert.throws(()=>r.turn('p0','encourage',{targetId:'p1'}));
 r.w.characters!.p1.sanity=0;
 r.turn('p0','encourage',{targetId:'p1'},8);
 assert.equal(b.turnEncounter!.history.at(-1)!.check!.total,12);
 assert.equal(r.w.characters!.p1.sanity,1);
 r.turn('p1','pass');r.turn('dm','pass',{enemyId:b.enemies[0].id});r.turn('dm','pass',{enemyId:b.enemies[1].id});
 r.restore();assert.throws(()=>r.turn('p0','encourage',{targetId:'p1'}),/ใช้สิทธิ์/);
 assert.deepEqual(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.supportUsed,['p1']);
});
test('failed SOC attempt still consumes the limit and zero sanity permits ordinary support',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;r.w.characters!.p1.sanity=5;r.w.characters!.p0.sanity=0;
 assert.throws(()=>r.turn('p0','encourage',{targetId:'p1',boost:'focus'}));
 r.turn('p0','encourage',{targetId:'p1'},1);
 assert.equal(r.w.characters!.p1.sanity,5);
 assert.ok(b.enemies[0].tactics.used.includes('share:p1'));
});

function role(r:ReturnType<typeof room>,profession:Parameters<typeof createCharacter>[0]) {
 r.w.characters!.p0={...createCharacter(profession,undefined,undefined,true),hp:10,maxHp:10};
}
function npcTurns(r:ReturnType<typeof room>) {
 const b=r.w.caseMap!.battle!;while(b.active)r.turn(b.active,'pass');
}
test('investigator opens a selected enemy and spends Focus without adding a personal roll bonus',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'paranormal_investigator');
 r.turn('p0','classSkill',{targetId:b.enemies[1].id});assert.equal(r.w.characters!.p0.focus,3);
 assert.equal(b.enemies[1].tactics.exposed!.actor,'p0');assert.equal(b.turnEncounter!.history.at(-1)!.check,undefined);
 assert.equal(b.active,'p1');
});
test('ritual ward absorbs one damage once, survives save and expires after the NPC phase',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'ritual_specialist');
 r.turn('p0','classSkill',{targetId:'p1'});r.restore();npcTurns(r);
 const current=r.w.caseMap!.battle!,hp=r.w.characters!.p1.hp;
 r.turn('dm','attack',{enemyId:current.enemies[0].id,attackId:'WET_CLAW',targetId:'p1'});
 assert.equal(r.w.characters!.p1.hp,hp-1);
 r.turn('dm','attack',{enemyId:current.enemies[1].id,attackId:'WET_CLAW',targetId:'p1'});
 assert.equal(r.w.characters!.p1.hp,hp-3);assert.equal(current.turnEncounter!.conditions,undefined);
});
test('medium silence blocks mental attacks but leaves physical attacks available',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'medium');const enemyId=b.enemies[0].id;
 r.turn('p0','classSkill',{targetId:enemyId});npcTurns(r);
 assert.throws(()=>r.turn('dm','attack',{enemyId,attackId:'CHOKING_SOUND',targetId:'p1'}),/สะกดเสียง/);
 assert.ok(battleView(r.w.caseMap!,'C',r.w,true)!.turnEncounter!.attacks!.every(a=>a.resource==='HP'));
 r.turn('dm','attack',{enemyId,attackId:'WET_CLAW',targetId:'p1'});
 assert.equal(r.w.characters!.p1.hp,8);
});
test('bodyguard intercepts one physical attack and the second still hits the original target',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'containment_specialist');
 r.turn('p0','classSkill',{targetId:'p1'});npcTurns(r);r.restore();
 const current=r.w.caseMap!.battle!;
 r.turn('dm','attack',{enemyId:current.enemies[0].id,attackId:'WET_CLAW',targetId:'p1'});
 assert.equal(r.w.characters!.p0.hp,8);assert.equal(r.w.characters!.p1.hp,10);
 assert.equal(current.turnEncounter!.history.at(-1)!.target,'p0');
 r.turn('dm','attack',{enemyId:current.enemies[1].id,attackId:'WET_CLAW',targetId:'p1'});
 assert.equal(r.w.characters!.p1.hp,8);
});
test('intern clears a restraint and driver clears it with a temporary defense',()=>{
 for(const profession of ['occult_engineer','field_medic']) {
  const r=room(2),b=r.w.caseMap!.battle!;role(r,profession);
  b.enemies[0].tactics.restrained.p1=b.round;
  r.turn('p0','classSkill',{targetId:'p1'});
  assert.equal(b.enemies[0].tactics.restrained.p1,undefined);
  assert.equal(r.w.characters!.p0.focus,3);
  if(profession==='field_medic')assert.equal(b.enemies[0].tactics.defense.p1,b.round);
 }
});
test('intern sanity recovery shares the global per-target limit',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'occult_engineer');r.w.characters!.p1.sanity=0;
 r.turn('p0','classSkill',{targetId:'p1'});assert.equal(r.w.characters!.p1.sanity,1);
 assert.ok(b.enemies[0].tactics.used.includes('share:p1'));
});
test('restraint blocks physical attacks but allows a BODY escape action',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;b.enemies[0].tactics.restrained.p0=1;
 assert.throws(()=>r.turn('p0','strike',{targetId:b.enemies[0].id}),/พันธนาการ/);
 assert.throws(()=>r.turn('p0','withdraw'),/พันธนาการ/);
 r.turn('p0','breakFree');assert.equal(b.enemies[0].tactics.restrained.p0,undefined);assert.equal(b.active,'p1');
});
test('class skills reject insufficient resources and invalid targets without spending a turn',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'ritual_specialist');
 r.w.characters!.p0.focus=0;assert.throws(()=>r.turn('p0','classSkill',{targetId:'p1'}));
 r.w.characters!.p0.focus=4;r.w.characters!.p0.sanity=0;assert.throws(()=>r.turn('p0','classSkill',{targetId:'p1'}));
 r.w.characters!.p0.sanity=10;assert.throws(()=>r.turn('p0','classSkill',{targetId:'forged'}));
 assert.equal(b.active,'p0');assert.equal(r.w.characters!.p0.focus,4);
});

test('C4 can restrain a target through an actual NPC move and its ally can release it',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'occult_engineer');npcTurns(r);
 assert.ok(battleView(r.w.caseMap!,'C',r.w,true)!.turnEncounter!.attacks!.some(a=>a.id==='UNDERFLOOR_HAND'));
 r.turn('dm','attack',{enemyId:b.enemies[0].id,attackId:'UNDERFLOOR_HAND',targetId:'p1'});
 r.turn('dm','pass',{enemyId:b.enemies[1].id});
 assert.equal(r.w.characters!.p1.hp,9);assert.equal(b.enemies[0].tactics.restrained.p1,b.round);
 r.turn('p0','classSkill',{targetId:'p1'});assert.equal(b.enemies[0].tactics.restrained.p1,undefined);
 r.turn('p1','strike',{targetId:b.enemies[0].id});
});
test('fear survives save, blocks spirit actions but allows RES recovery and expires naturally',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;npcTurns(r);
 r.turn('dm','attack',{enemyId:b.enemies[0].id,attackId:'DROWNED_WHISPER',targetId:'p0'});
 r.turn('dm','pass',{enemyId:b.enemies[1].id});r.restore();
 assert.throws(()=>r.turn('p0','classSkill',{targetId:r.w.caseMap!.battle!.enemies[0].id}),/หวาดกลัว/);
 assert.throws(()=>r.turn('p0','pacify',{targetId:r.w.caseMap!.battle!.enemies[0].id}),/หวาดกลัว/);
 const sanity=r.w.characters!.p0.sanity;r.turn('p0','compose');
 assert.equal(r.w.caseMap!.battle!.turnEncounter!.shaken!.p0,undefined);
 assert.equal(r.w.characters!.p0.sanity,sanity);
});
test('SOC support can remove fear while restoring sanity',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;npcTurns(r);
 r.turn('dm','attack',{enemyId:b.enemies[0].id,attackId:'DROWNED_WHISPER',targetId:'p1'});
 r.turn('dm','pass',{enemyId:b.enemies[1].id});
 r.turn('p0','encourage',{targetId:'p1'});
 assert.equal(r.w.characters!.p1.sanity,10);assert.equal(b.turnEncounter!.shaken!.p1,undefined);
});
test('D4 guard-breaking move uses guard for its own hit check then removes it on hit only',()=>{
 const r=room(2,'D'),b=r.w.caseMap!.battle!;
 r.turn('p0','guard');r.turn('p1','pass');
 r.turn('dm','attack',{attackId:'THREAD_SNAP',targetId:'p0'},1);
 assert.equal(r.w.characters!.p0.hp,10);
 r.turn('p0','guard');r.turn('p1','pass');
 r.turn('dm','attack',{attackId:'THREAD_SNAP',targetId:'p0'});
 assert.equal(r.w.characters!.p0.hp,9);assert.match(b.turnEncounter!.history.at(-1)!.effect!,/แนวตั้งรับถูกทำลาย/);
});
test('new ghost moves remain private and mental varieties respect silence',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'medium');
 r.turn('p0','classSkill',{targetId:b.enemies[0].id});npcTurns(r);
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.attacks,undefined);
 assert.throws(()=>r.turn('dm','attack',{enemyId:b.enemies[0].id,attackId:'DROWNED_WHISPER',targetId:'p1'}),/สะกดเสียง/);
});

test('guard break has a next-round effect that the driver can counter',()=>{
 const r=room(2,'D'),b=r.w.caseMap!.battle!;role(r,'field_medic');npcTurns(r);
 r.turn('dm','attack',{attackId:'THREAD_SNAP',targetId:'p1'});
 assert.equal(b.turnEncounter!.unsteady!.p1,b.round);
 r.turn('p0','classSkill',{targetId:'p1'});
 assert.equal(b.turnEncounter!.unsteady!.p1,undefined);
 r.turn('p1','guard');
});
test('unsteady prevents self-guard, RES recovery clears it, and temporary fear expires',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;b.turnEncounter!.unsteady={p0:1};b.turnEncounter!.shaken={p1:1};
 assert.throws(()=>r.turn('p0','guard'),/เสียหลัก/);
 r.turn('p0','compose');assert.equal(b.turnEncounter!.unsteady.p0,undefined);
 npcTurns(r);r.turn('dm','pass',{enemyId:b.enemies[0].id});r.turn('dm','pass',{enemyId:b.enemies[1].id});
 assert.equal(b.turnEncounter!.shaken.p1,undefined);
});

test('combat log stores actual victim, original target, names and resources through save and resolution',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'containment_specialist');
 r.w.characters!.p0.playerName='ต้น';r.w.characters!.p1.playerName='เมฆ';
 r.turn('p0','classSkill',{targetId:'p1'});
 const skill=b.turnEncounter!.history.at(-1)!;
 assert.equal(skill.actorName,'ต้น');assert.equal(skill.targetName,'เมฆ');
 assert.deepEqual(skill.changes!.find(c=>c.id==='p0')!.focus,{before:4,after:3});
 npcTurns(r);r.turn('dm','attack',{enemyId:b.enemies[0].id,attackId:'WET_CLAW',targetId:'p1'});
 const hit=b.turnEncounter!.history.at(-1)!;
 assert.equal(hit.targetName,'ต้น');assert.equal(hit.intendedTargetName,'เมฆ');
 assert.deepEqual(hit.changes!.find(c=>c.id==='p0')!.hp,{before:10,after:8});
 r.restore();r.w.characters!.p0.playerName='ชื่อใหม่';
 assert.equal(r.w.caseMap!.battle!.turnEncounter!.history.at(-1)!.targetName,'ต้น');
 r.turn('dm','pass',{enemyId:b.enemies[1].id});r.turn('p0','withdraw');
 assert.ok(r.w.caseMap!.turnConclusion!.history!.some(beat=>beat.intendedTargetName==='เมฆ'));
 assert.equal(r.w.caseMap!.turnConclusion!.site,'C');
});

test('authored combat narration is saved with its event and retained in the conclusion',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'containment_specialist');
 r.w.characters!.p0.playerName='ต้น';r.turn('p0','classSkill',{targetId:'p1'});
 const narration=structuredClone(b.turnEncounter!.history.at(-1)!.flavour);
 assert.equal(narration!.dialogue!.speaker,'ต้น');assert.match(narration!.text,/ต้น/);
 r.restore();r.w.characters!.p0.playerName='ชื่อใหม่';
 assert.deepEqual(r.w.caseMap!.battle!.turnEncounter!.history.at(-1)!.flavour,narration);
 r.turn('p1','withdraw');assert.deepEqual(r.w.caseMap!.turnConclusion!.history![0].flavour,narration);
});

for(const profession of ['paranormal_investigator','ritual_specialist','medium','containment_specialist','occult_engineer','field_medic'])test('limited heavy attack deals three once and survives save: '+profession,()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,profession);const targetId=b.enemies[0].id;
 const hp=b.enemies[0].state.ghostHealth,focus=r.w.characters!.p0.focus;
 r.turn('p0','powerStrike',{targetId});assert.equal(b.enemies[0].state.ghostHealth,hp-3);
 assert.equal(b.turnEncounter!.history.at(-1)!.check!.total,20+r.w.characters!.p0.coreStats![powerAttacks[r.w.characters!.p0.profession].stat]);
 assert.equal(r.w.characters!.p0.focus,focus);assert.equal(b.active,'p1');
 assert.equal(b.turnEncounter!.history.at(-1)!.changes!.find(c=>c.id===targetId)!.hp!.after,hp-3);
 npcTurns(r);r.turn('dm','pass',{enemyId:b.enemies[0].id});r.turn('dm','pass',{enemyId:b.enemies[1].id});r.restore();
 assert.throws(()=>r.turn('p0','powerStrike',{targetId}),/ครั้งเดียว/);
 assert.deepEqual(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.powerUsed,['p0']);
 r.turn('p0','strike',{targetId},1);
});
test('a missed heavy attack still consumes its one attempt without changing Focus or enemy HP',()=>{
 const r=room(2),b=r.w.caseMap!.battle!,targetId=b.enemies[0].id;
 const hp=b.enemies[0].state.ghostHealth;
 r.turn('p0','powerStrike',{targetId},1);
 assert.equal(b.enemies[0].state.ghostHealth,hp);assert.deepEqual(b.turnEncounter!.powerUsed,['p0']);
 assert.equal(r.w.characters!.p0.focus,4);
});
test('invalid heavy targets do not consume the attempt and spirit attacks respect fear',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'medium');
 assert.throws(()=>r.turn('p0','powerStrike',{targetId:'forged'}));assert.equal(b.turnEncounter!.powerUsed,undefined);
 b.turnEncounter!.shaken={p0:1};assert.throws(()=>r.turn('p0','powerStrike',{targetId:b.enemies[0].id}),/หวาดกลัว/);
 assert.equal(b.turnEncounter!.powerUsed,undefined);
});

test('heavy attacks target their configured defense and require no Focus',()=>{
 const ritual=room(2);role(ritual,'ritual_specialist');ritual.w.characters!.p0.focus=0;
 const a=ritual.w.caseMap!.battle!.enemies[0],hp=a.state.ghostHealth;
 ritual.turn('p0','powerStrike',{targetId:a.id},7);assert.equal(a.state.ghostHealth,hp);
 const bodyguard=room(2);role(bodyguard,'containment_specialist');bodyguard.w.characters!.p0.focus=0;
 const z=bodyguard.w.caseMap!.battle!.enemies[0];bodyguard.turn('p0','powerStrike',{targetId:z.id},7);
 assert.equal(z.state.ghostHealth,hp-3);
});

test('new preset HP is fifteen while old save characters retain their old ceiling',()=>{
 const character=createCharacter('medium',undefined,undefined,true);
 assert.equal(character.hp,15);assert.equal(characterMaxHp(character),15);
 const old={...character,hp:7};delete old.maxHp;
 const restored=JSON.parse(JSON.stringify(old));assert.equal(restored.hp,7);assert.equal(characterMaxHp(restored),10);
});
test('ward absorption above ten HP does not clamp a fifteen-HP character back to ten',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;role(r,'ritual_specialist');
 r.w.characters!.p0.hp=15;r.w.characters!.p0.maxHp=15;
 r.turn('p0','classSkill',{targetId:'p0'});npcTurns(r);
 r.turn('dm','attack',{enemyId:b.enemies[0].id,attackId:'WET_CLAW',targetId:'p0'});
 assert.equal(r.w.characters!.p0.hp,14);
});
