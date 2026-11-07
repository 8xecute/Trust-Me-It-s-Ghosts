import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WorldStore, type World } from '../src/world.js';
import { Rooms } from '../src/rooms.js';
import { openRoomSaves } from '../src/roomSaves.js';
import { applyCaseAction, newCase } from '../src/case001/case001.js';
import { runStoryCheck, storyCheckHelp, storyCheckOptions } from '../src/case001/storyDice.js';

const roles=['medium','occult_engineer','field_medic','ritual_specialist'];
function room(count:number,die:number) {
 const rooms=new Rooms();
 const {code}=rooms.create('dm',2);
 const worlds=new WorldStore(()=>{rolls++;return die;},true,true);
 let rolls=0;
 let serial=0;
 const dm=rooms.playerId('dm')!;
 const tokens=[rooms.token('dm')];
 worlds.create(code,2);
 worlds.addPlayer(code,dm);
 const action=(id:string,type:string,fields:object={})=>
  worlds.apply(code,id,{id:String(++serial),type,...fields}).snapshot;
 action(dm,'claimDm');
 const players=roles.slice(0,count).map((profession,i)=>{
  const socket='p'+i;
  rooms.join(socket,code,2);
  tokens.push(rooms.token(socket));
  const id=rooms.playerId(socket)!;
  worlds.addPlayer(code,id);
  action(id,'createCharacter',{profession});
  return id;
 });
 action(dm,'caseStart',{mode:'story'});
 const panel=()=>{
  const result=worlds.dmPanel(code,dm);
  if(!('caseMode' in result)) throw Error('expected case panel');
  return result;
 };
 return {rooms,worlds,code,dm,players,tokens,action,panel,rolls:()=>rolls};
}

for(const [count,die,outcome] of [[2,9,'success'],[3,6,'partial'],[4,5,'failure']] as const) {
 test('v4.1 radio baseline, authoritative '+outcome+' and shared result with '+count+' investigators',()=>{
  const {worlds,code,dm,players,action,panel,rolls}=room(count,die);
  const p=players[0], option='dice:A2_RADIO_ECHO:SPI';
  const view=(id:string)=>worlds.snapshot(code,id);
  const available=()=>view(p).case001?.actions.find(entry=>entry.id===option);
  assert.equal(view(p).case001?.diceVersion,'4.1');
  assert.equal(available(),undefined);
  action(p,'caseAction',{actionId:'advance',site:'A'});
  const baseline=panel().narration.find(entry=>entry.eventId==='arrival-radio')!;
  assert.ok(baseline);
  assert.equal(available(),undefined);
  action(dm,'dmPublish',{cardId:baseline.id});
  assert.match(view(p).case001?.notice ?? '',/ยังมีคนอยู่/);
  assert.equal(rolls(),0);
  assert.deepEqual(available()?.dice,{stat:'SPI',dc:14,ap:0});
  action(p,'caseAction',{actionId:option,site:'A'});
  const check=panel().investigators.find(entry=>entry.id===p)!.check!;
  assert.throws(()=>action(dm,'dmRequestRoll',{targetId:players[1],checkId:check.id}));
  action(dm,'dmRequestRoll',{targetId:p,checkId:check.id});
  const card=view(p).diceRequest!;
  assert.equal(view(players[1]).diceRequest,null);
  assert.throws(()=>action(p,'dmRoll',{requestId:card.id,die:20}));
  action(p,'dmRoll',{requestId:card.id});
  assert.equal(rolls(),1);
  for(const viewer of [dm,...players]) {
   assert.equal(view(viewer).latestRoll?.die,die);
   assert.deepEqual(view(viewer).latestRoll?.result,{total:die+5,outcome});
  }
  const line={success:'ไม่ใช่ผู้พูดผ่านวิทยุสด',partial:'ไม่กล้าพูด',failure:'ไปดูข้อมูลที่บ้านผม'}[outcome];
  assert.ok(players.every(player=>!view(player).case001?.notice.includes(line)));
  const response=panel().narration.find(entry=>entry.answer?.rollId===card.id)!;
  action(dm,'dmPublish',{cardId:response.id});
  assert.ok(players.every(player=>view(player).case001?.notice.includes(line)));
  assert.throws(()=>action(p,'dmRoll',{requestId:card.id}));
  assert.throws(()=>action(players[1],'caseAction',{actionId:option,site:'A'}));
  action(dm,'dmTravel',{actionId:'travel:B',site:'A'});
  action(dm,'dmTravel',{actionId:'travel:C',site:'B'});
  assert.equal(view(p).case001?.actions.find(entry=>entry.id==='clue:E02')?.check,undefined);
  action(p,'caseAction',{actionId:'clue:E02',site:'C'});
  assert.equal(view(p).case001?.evidence,1);
  assert.equal(rolls(),1);
  assert.ok(view(p).case001?.actions.some(entry=>entry.id==='dice:C2_LAND_PATTERN:INT'));
 });
}

test('all sixteen authored checks resolve their own branches with valid phase conditions',()=>{
 const {worlds,code,players}=room(2,20);
 const base=worlds.checkpoint(code).world;
 const cases=storyCheckHelp.map(check=>check.id);
 assert.equal(cases.length,16);
 for(const id of cases) {
  const world=structuredClone(base) as World;
  delete world.dmSession;
  const s=world.case001!, p=players[0];
  const phase=id[0];
  s.site=phase==='H'?'B':phase==='F'?'E':phase as typeof s.site;
  world.caseMap!.sites[p]=s.site;
  s.story!.firedTriggers.push('arrival-radio','dialogue-wichai-land','dialogue-black-bundle','EV02','EV15','dialogue-spirit-controller');
  s.story!.objectives.push('v41-photo','met-boonmee','gate-testimony');
  s.evidence.push('E01','E02','E03','E04','E05','E06','E07');
  s.ghost='cautious';
  s.opened=true;
  s.key=true;
  s.wichai!.site=s.site;
  if(phase==='F') s.seals[2]=true;
  if(id.startsWith('C4_')) {
   world.turns[p].ap=3;
   world.caseMap!.battle={id:'EN01',active:p,enemies:[{state:{phase:'player'}}]} as unknown as NonNullable<NonNullable<World['caseMap']>['battle']>;
  }
  const option=storyCheckOptions(world,p).find(entry=>entry.id.startsWith('dice:'+id+':'));
  assert.ok(option,id);
  runStoryCheck(world,p,option.id,undefined,()=>20);
  assert.equal(s.storyChecks?.[id]?.[0]?.outcome,'full',id);
  assert.ok(s.narrativeEvents?.some(beat=>beat.eventId===option.id && beat.scope==='party'),id);
  assert.ok(!storyCheckOptions(world,p).some(entry=>entry.id===option.id),id);
  if(id.startsWith('C4_')) assert.equal(world.turns[p].ap,1);
 }
});

test('room save resumes pending and committed checks without rerolling',()=>{
 const {rooms,worlds,code,dm,players,tokens,action,panel}=room(2,9);
 const p=players[0], option='dice:A2_RADIO_ECHO:SPI';
 action(p,'caseAction',{actionId:'advance',site:'A'});
 action(dm,'dmPublish',{cardId:panel().narration.find(entry=>entry.eventId==='arrival-radio')!.id});
 action(p,'caseAction',{actionId:option,site:'A'});
 action(dm,'dmRequestRoll',{targetId:p,checkId:panel().investigators.find(entry=>entry.id===p)!.check!.id});
 const card=worlds.snapshot(code,p).diceRequest!;
 const directory=mkdtempSync(join(tmpdir(),'case001-v41-'));
 openRoomSaves(directory,rooms,worlds)(code);
 let rolls=0;
 const restored=new WorldStore(()=>{rolls++;return 9;},true,true), restoredRooms=new Rooms();
 const save=openRoomSaves(directory,restoredRooms,restored);
 assert.equal(restoredRooms.resume('new-socket',tokens[1]).id,p);
 assert.equal(restored.snapshot(code,p).diceRequest?.id,card.id);
 const request={id:'after-load',type:'dmRoll',requestId:card.id};
 restored.apply(code,p,request);
 save(code);
 const again=new WorldStore(()=>{throw Error('must not roll');},true,true);
 openRoomSaves(directory,new Rooms(),again);
 assert.equal(again.snapshot(code,p).latestRoll?.die,9);
 assert.equal(again.checkpoint(code).world.case001?.storyChecks?.A2_RADIO_ECHO.length,1);
 assert.equal(again.apply(code,p,request).duplicate,true);
 assert.throws(()=>again.apply(code,p,{...request,id:'new-id'}),/ไม่มีคำขอทอย/);
 assert.equal(rolls,1);
});

test('v4.1 story checks remain optional for all four existing endings',()=>{
 for(const ending of ['A','B','C','D']) {
  const s=newCase(true,4,'4.1');
  s.milestones.push('left-arrival');
  if(ending!=='D') s.seals[2]=true;
  if(ending==='A' || ending==='B') {
   s.evacuated=['ดล','นิด','เพิ่ม'];
   s.evidence=['E02'];
   s.story!.objectives.push('current-testimony','gate-truth','truth-recorded');
   s.ghost=ending==='A'?'freed':'sealed';
  }
  const final=applyCaseAction(s,'finish',()=>{throw Error('ending must not roll');});
  assert.equal(final.report?.ending,ending);
 }
});

test('v4.1 can go from briefing to ending A with a Human DM and no combat',()=>{
 const {worlds,code,dm,players,action,panel}=room(2,20);
 const p=players[0];
 const site=()=>worlds.snapshot(code,p).caseMap!.site;
 const play=(actionId:string)=>{
  if(actionId.startsWith('talk:')) {action(dm,'caseDm',{targetId:p,actionId});return;}
  if(actionId.startsWith('travel:')) {action(dm,'dmTravel',{actionId,site:site()});return;}
  assert.equal(worlds.snapshot(code,p).caseMap?.battle,undefined);
  action(p,'caseAction',{actionId,site:site()});
  const check=panel().investigators.find(entry=>entry.id===p)?.check;
  if(check) {
   action(dm,'dmRequestRoll',{targetId:p,checkId:check.id});
   action(p,'dmRoll',{requestId:worlds.snapshot(code,p).diceRequest!.id});
  }
 };
 for(const id of [
  'talk:arrival','travel:B','clue:E07','travel:C','clue:E02','visit-boonmee','talk:gate-history',
  'travel:B','talk:accuse-gate','travel:D','clue:E03','clue:E04','seal1','seal2',
  'travel:E','key','clue:E05','open','talk:don-land','escort:ดล','escort:นิด','escort:เพิ่ม',
  'seal3','return','ritual','ritual','ritual','travel:D','travel:B','travel:A','record-truth','finish',
 ]) assert.doesNotThrow(()=>play(id),id);
 const ending=panel().narration.find(entry=>entry.eventId==='ending:A')!;
 assert.ok(ending);
 assert.equal(worlds.snapshot(code,p).awaitingReport,true);
 action(dm,'dmPublish',{cardId:ending.id});
 assert.ok(players.every(player=>worlds.snapshot(code,player).case001?.report?.ending==='A'));
});
