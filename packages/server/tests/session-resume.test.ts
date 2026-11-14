import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Rooms} from '../src/rooms.js';
import {WorldStore} from '../src/world.js';
import {exportSession,importSession,sessionRecovery} from '../src/portableSession.js';
import {startCaseBattle} from '../src/case001/caseBattle.js';
import {caseGrid} from '@baan/shared';

function fixture() {
 const rooms=new Rooms(),store=new WorldStore(()=>20,true,true,true,false,'5.5');
 const room=rooms.create('dm',2),code=room.code,dm=rooms.playerId('dm')!;
 store.create(code,2);store.addPlayer(code,dm);rooms.token('dm');let n=0;
 const act=(player:string,command:string,rest:object={})=>store.apply(code,player,{id:String(++n),type:'dmSessionControl',command,...rest});
 store.apply(code,dm,{id:'claim',type:'claimDm'});
 const roles=['medium','field_medic','occult_engineer','ritual_specialist','containment_specialist','paranormal_investigator'];
 const ids=roles.map((profession,i)=>{rooms.join('s'+i,code,2);const id=rooms.playerId('s'+i)!;rooms.token('s'+i);store.addPlayer(code,id);store.apply(code,id,{id:'character',type:'createCharacter',profession});return id;});
 store.apply(code,dm,{id:'start',type:'caseStart',mode:'story'});
 return {rooms,store,code,dm,ids,act};
}
test('DM-only portable save restores all six identities and exact state, paused before the next session',()=>{
 const r=fixture();assert.throws(()=>exportSession(r.rooms,r.store,r.code,r.dm));r.act(r.dm,'pause');
 assert.throws(()=>exportSession(r.rooms,r.store,r.code,r.ids[0]));
 const file=JSON.parse(JSON.stringify(exportSession(r.rooms,r.store,r.code,r.dm)));
 const rooms=new Rooms(),store=new WorldStore(()=>{throw Error('reroll');});
 const loaded=importSession(rooms,store,file);
 const dm=rooms.resume('new-dm',loaded.token);assert.equal(dm.id,r.dm);
 for(const id of r.ids){const token=file.membership.tokens.find(([,s]:any)=>s.id===id)[0];assert.equal(rooms.resume('new-'+id,token).id,id);}
 assert.equal(store.snapshot(r.code,r.dm).paused,true);
 assert.deepEqual(store.checkpoint(r.code).world.characters,file.state.world.characters);
 assert.deepEqual(store.checkpoint(r.code).world.case001,file.state.world.case001);
 assert.deepEqual(store.checkpoint(r.code).world.turns,file.state.world.turns);
 assert.equal(rooms.connectedIds(r.code).length,7);
 assert.throws(()=>importSession(rooms,store,file));
});
test('session attendance preserves an absent character and blocks actions until reactivated',()=>{
 const r=fixture();r.act(r.dm,'pause');const before=r.store.checkpoint(r.code).world;
 const id=r.ids[5];r.act(r.dm,'attendance',{targetId:id,absent:true});
 assert.throws(()=>r.act(r.ids[0],'attendance',{targetId:id,absent:false}));
 r.act(r.dm,'resume');assert.throws(()=>r.store.apply(r.code,id,{id:'act',type:'guided',command:'evacuate'}));
 assert.deepEqual(r.store.checkpoint(r.code).world.characters![id],before.characters![id]);
 assert.deepEqual(r.store.checkpoint(r.code).world.turns[id],before.turns[id]);
 assert.equal(r.store.checkpoint(r.code).world.case001!.minute,before.case001!.minute);
 assert.equal(r.store.snapshot(r.code,r.ids[0]).players[id],undefined);
 assert.ok(r.store.checkpoint(r.code).world.players[id]);
 assert.throws(()=>r.act(r.dm,'attendance',{targetId:id,absent:false}));
 r.act(r.dm,'pause');r.act(r.dm,'attendance',{targetId:id,absent:false});r.act(r.dm,'resume');
 assert.deepEqual(r.store.snapshot(r.code,id).inactivePlayers,[]);
 assert.deepEqual(r.store.checkpoint(r.code).world.characters![id],before.characters![id]);
 assert.equal(r.rooms.checkpoint(r.code).room.players.length,7);
});
test('malformed portable import has no partially published room',()=>{
 const r=fixture();r.act(r.dm,'pause');const data=exportSession(r.rooms,r.store,r.code,r.dm);
 delete (data.state.world.case001!.v51 as any).KAEW_D_RESULT;
 const rooms=new Rooms(),store=new WorldStore();
 assert.throws(()=>importSession(rooms,store,data));assert.equal(rooms.has(r.code),false);assert.equal(store.hasStarted(r.code),false);
});
test('a missing member recovery token or an inactive DM is rejected before import',()=>{
 const r=fixture();r.act(r.dm,'pause');
 for(const kind of ['token','dm']) {
  const data=exportSession(r.rooms,r.store,r.code,r.dm);
  if(kind==='token')data.membership.tokens=data.membership.tokens.filter(([,s])=>s.id!==r.ids[0]);
  else data.state.world.inactivePlayers=[r.dm];
  const rooms=new Rooms(),store=new WorldStore();assert.throws(()=>importSession(rooms,store,data));assert.equal(rooms.has(r.code),false);
 }
});
test('pending rolls can be explicitly cancelled for attendance without inventing a result',()=>{
 let serial=0;const r=fixture(),apply=(player:string,type:string,body:object={})=>r.store.apply(r.code,player,{id:'pending-'+(++serial),type,...body});
 const panel=()=>r.store.dmPanel(r.code,r.dm) as any;
 apply(r.dm,'dmPublish',{cardId:panel().narration.find((c:any)=>c.eventId==='guided-cue:A1').id});
 apply(r.dm,'guided',{command:'scene',target:'A2'});
 apply(r.dm,'dmPublish',{cardId:panel().narration.find((c:any)=>c.eventId==='guided-cue:A2').id});
 apply(r.dm,'caseDm',{targetId:r.ids[0],actionId:'dice:A2_RADIO_ECHO:SPI'});
 const check=panel().investigators.find((p:any)=>p.id===r.ids[0]).check;
 apply(r.dm,'dmRequestRoll',{targetId:r.ids[0],checkId:check.id});r.act(r.dm,'pause');
 assert.throws(()=>r.act(r.dm,'attendance',{targetId:r.ids[0],absent:true}));
 const before=r.store.checkpoint(r.code).world;r.act(r.dm,'clearPending');
 const after=r.store.checkpoint(r.code).world;
 assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.turns,before.turns);
 assert.equal(after.case001!.storyChecks,undefined);assert.equal(after.case001!.minute,before.case001!.minute);
 assert.equal(Object.keys(after.dmSession!.checks).length,0);assert.equal(Object.keys(after.dmSession!.rolls).length,0);
 r.act(r.dm,'attendance',{targetId:r.ids[0],absent:true});
});
test('changing attendance in a saved encounter advances no clock, spends no AP and selects an active investigator',()=>{
 const r=fixture(),saved=r.store.checkpoint(r.code),w=saved.world;
 w.case001!.site='C';w.case001!.evidence=['E02'];w.case001!.guided!.phase='C';
 for(const id of r.ids)w.caseMap!.sites[id]='C';
 const actual={...w,backgroundUses:new Set<string>()};startCaseBattle(actual,'a' in w.players?'a':r.ids[0],caseGrid('C'),()=>20);
 saved.world=actual;r.store.delete(r.code);r.store.restore(r.code,saved);
 const active=r.store.checkpoint(r.code).world.caseMap!.battle!.active!;
 r.act(r.dm,'pause');const before=r.store.checkpoint(r.code).world;
 r.act(r.dm,'attendance',{targetId:active,absent:true});const after=r.store.checkpoint(r.code).world;
 assert.equal(after.caseMap!.battle!.active,active);assert.equal(after.caseMap!.battle!.round,before.caseMap!.battle!.round);
 assert.equal(after.case001!.minute,before.case001!.minute);assert.deepEqual(after.turns,before.turns);
 r.act(r.dm,'resume');assert.notEqual(r.store.checkpoint(r.code).world.caseMap!.battle!.active,active);
});


test('DM can recover team codes without exporting or pausing; players cannot',()=>{
 const r=fixture(),before=JSON.stringify(r.store.checkpoint(r.code));
 assert.throws(()=>sessionRecovery(r.rooms,r.store,r.code,r.ids[0]),/DM/);
 const codes=sessionRecovery(r.rooms,r.store,r.code,r.dm);
 for(const id of [r.dm,...r.ids])assert.ok(codes.some(entry=>entry.id===id && /^[a-f0-9]{64}$/.test(entry.token)));
 assert.equal(JSON.stringify(r.store.checkpoint(r.code)),before);
 r.act(r.dm,'pause');
 const file=JSON.parse(JSON.stringify(exportSession(r.rooms,r.store,r.code,r.dm)));
 const rooms=new Rooms(),worlds=new WorldStore();importSession(rooms,worlds,file);
 assert.deepEqual(sessionRecovery(rooms,worlds,r.code,r.dm),codes);
});

test('character choice can be released and reclaimed only before the case starts',()=>{
 const store=new WorldStore(()=>20,true,true,true,true,'5.5');store.create('SELECT',2);
 for(const id of ['dm','one','two'])store.addPlayer('SELECT',id);
 let n=0;const act=(id:string,type:string,payload:object={})=>store.apply('SELECT',id,{id:String(++n),type,...payload});
 act('dm','claimDm');act('one','createCharacter',{profession:'medium',playerName:'คนแรก'});
 act('one','setPlayerNames',{playerName:'ชื่อเก่า'});
 act('one','updateCharacter',{profession:'field_medic',playerName:'ชื่อใหม่',characterName:'หมอ'});
 assert.equal(store.snapshot('SELECT','one').playerNames?.one.playerName,'ชื่อใหม่');
 act('one','releaseCharacter');assert.equal(store.snapshot('SELECT','one').characters?.one,undefined);
 act('two','createCharacter',{profession:'field_medic'});
 assert.throws(()=>act('one','createCharacter',{profession:'field_medic'}),/เลือกตัวละคร/);
 act('one','createCharacter',{profession:'medium'});act('dm','caseStart',{mode:'story'});
 assert.throws(()=>act('one','releaseCharacter'));
});


test('retired exploration plans are discarded on import without changing case progress',()=>{
 const r=fixture();r.act(r.dm,'pause');
 const file=JSON.parse(JSON.stringify(exportSession(r.rooms,r.store,r.code,r.dm)));
 const progress=JSON.stringify(file.state.world.case001);
 file.state.world.explorationPlan={id:'old-plan',actions:{[r.ids[0]]:{actionId:'travel:B',minutes:10}}};
 if(file.state.rewind)file.state.rewind.world.explorationPlan={id:'old-rewind-plan',actions:{}};
 const rooms=new Rooms(),worlds=new WorldStore();importSession(rooms,worlds,file);
 const restored=worlds.checkpoint(r.code);
 assert.ok(!('explorationPlan' in restored.world));
 assert.ok(!restored.rewind || !('explorationPlan' in restored.rewind.world));
 assert.equal(JSON.stringify(restored.world.case001),progress);
 for(const type of ['planSubmit','planResolve','planCancel']){
  const before=JSON.stringify(worlds.checkpoint(r.code));
  assert.throws(()=>worlds.apply(r.code,r.ids[0],{id:type,type} as any),/เลิกใช้/);
  assert.equal(JSON.stringify(worlds.checkpoint(r.code)),before);
 }
});


test('legacy inbox is discarded but confirmed answer history survives restoring a save',()=>{
 const r=fixture();r.act(r.dm,'pause');
 const file=JSON.parse(JSON.stringify(exportSession(r.rooms,r.store,r.code,r.dm)));
 file.state.world.dmSession.questions=[{id:'old',label:'คำถามค้าง',playerId:r.ids[0],site:'A'}];
 file.state.world.dmSession.answers=[{question:'ส่งแล้ว',text:'คำตอบเดิม',sequence:1}];
 const rooms=new Rooms(),worlds=new WorldStore();importSession(rooms,worlds,file);
 assert.ok(!('questions' in worlds.checkpoint(r.code).world.dmSession!));
 assert.deepEqual(worlds.checkpoint(r.code).world.dmSession!.answers,file.state.world.dmSession.answers);
 for(const type of ['askGm','dmReply','dmAnswer']){
  const before=JSON.stringify(worlds.checkpoint(r.code));
  assert.throws(()=>worlds.apply(r.code,r.ids[0],{id:type,type} as any),/เลิกใช้/);
  assert.equal(JSON.stringify(worlds.checkpoint(r.code)),before);
 }
});


test('pre-v5.5 portable saves are rejected before publishing any room',()=>{
 const r=fixture();r.act(r.dm,'pause');
 const file=JSON.parse(JSON.stringify(exportSession(r.rooms,r.store,r.code,r.dm)));
 for(const version of ['4.3','5.1','5.2','5.3']){
  file.state.world.case001.guided.version=version;
  const rooms=new Rooms(),worlds=new WorldStore();
  assert.throws(()=>importSession(rooms,worlds,file),/เฉพาะเซฟ CASE 001 v5.5/);
  assert.equal(rooms.has(r.code),false);assert.throws(()=>worlds.snapshot(r.code,r.dm));
 }
});
