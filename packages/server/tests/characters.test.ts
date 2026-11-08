import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes, createCharacter, professions, professionTechniques, resolveCheck, type Profession } from '@baan/shared';
import { Rooms } from '../src/rooms.js';
import { WorldStore } from '../src/world.js';

test('all six professions allocate exactly one point without exceeding four', () => {
  assert.equal(Object.keys(professions).length, 6);
  for (const [profession, { stats }] of Object.entries(professions)) {
    assert.equal(Object.values(stats).reduce((a, b) => a + b), 9);
    for (const bonus of attributes) {
      if (stats[bonus] === 4) {
        assert.throws(() => createCharacter(profession, bonus));
        continue;
      }
      const character = createCharacter(profession, bonus);
      assert.deepEqual(character.stats, { ...stats, [bonus]: stats[bonus] + 1 });
      assert.equal(Object.values(character.stats).reduce((a, b) => a + b), 10);
      assert.deepEqual([character.hp, character.sanity, character.focus], [10, 10, 4]);
    }
  }
  assert.throws(() => createCharacter('__proto__', 'body'));
  assert.throws(() => createCharacter('medium', ['body', 'mind']));
});

test('only v2 rooms accept one authoritative character per investigator', () => {
  const worlds = new WorldStore();
  worlds.create('legacy');
  worlds.create('upgrade', 2);
  worlds.addPlayer('legacy', 'a');
  worlds.addPlayer('upgrade', 'a');
  worlds.addPlayer('upgrade', 'b');

  const create = { id: 'profile', type: 'createCharacter', profession: 'field_medic', bonus: 'mind', hp: 99 };
  assert.throws(() => worlds.apply('legacy', 'a', create));
  assert.equal(worlds.snapshot('legacy').characters, undefined);
  assert.throws(() => worlds.apply('upgrade', 'a', { id: 'start', type: 'caseStart' }));
  assert.throws(() => worlds.apply('upgrade', 'a', { ...create, bonus: 'invalid' }));
  assert.deepEqual(worlds.snapshot('upgrade').characters, {});
  assert.equal(worlds.apply('upgrade', 'a', create).snapshot.characters?.a.hp, 10);
  assert.equal(worlds.apply('upgrade', 'a', create).duplicate, true);
  assert.throws(() => worlds.apply('upgrade', 'a', { ...create, id: 'second-profile' }));
  worlds.apply('upgrade', 'b', create);
  assert.ok(worlds.apply('upgrade', 'a', { id: 'start', type: 'caseStart' }).snapshot.case001);
});

test('talents are profession restricted and legacy backgrounds are ignored', () => {
  for (const [role, entry] of Object.entries(professionTechniques)) {
    assert.equal(entry.talents.length, 3);
    for (const talent of entry.talents) {
      const bonus = attributes.find(stat => professions[role as Profession].stats[stat] < 4);
      assert.equal(createCharacter(role, bonus, { talent: talent.id, background: 'technician' }).talent, talent.id);
    }
  }
  assert.throws(() => createCharacter('medium', 'body', { talent: 'field_first_aid', background: 'rescuer' }));
  assert.equal('background' in createCharacter('medium', 'body', { talent: 'soothe_spirit', background: ['rescuer'] }),false);
  assert.equal(createCharacter('medium','body',{talent:'soothe_spirit'}).talent,'soothe_spirit');
});

test('shared checks distinguish natural rolls and require explicit partial outcomes', () => {
  const options = { dc: 12, attribute: 2 };
  assert.equal(resolveCheck({ ...options, attribute: 30 }, () => 1).outcome, 'failure');
  assert.equal(resolveCheck({ ...options, dc: 25 }, () => 20).critical, true);
  assert.equal(resolveCheck(options, () => 8).outcome, 'failure');
  assert.equal(resolveCheck({ ...options, partial: true }, () => 8).outcome, 'partial');
  assert.equal(resolveCheck({ ...options, help: true, boost: 'focus' }, () => 6).total, 12);
});

test('two investigators cannot spend another turn or pay a talent boost twice on retry', () => {
  let rolls = 0;
  const worlds = new WorldStore(() => { rolls++; return 9; });
  worlds.create('tactics', 2);
  worlds.addPlayer('tactics', 'a');
  worlds.addPlayer('tactics', 'b');
  for (const player of ['a', 'b']) worlds.apply('tactics', player, {
    id: 'profile', type: 'createCharacter', profession: 'medium', bonus: 'body',
    talent: 'soothe_spirit', background: 'temple_student',
  });
  worlds.apply('tactics', 'a', { id: 'start', type: 'start' });
  const use = { id: 'talent', type: 'useTalent', boost: 'focus' };
  assert.throws(() => worlds.apply('tactics', 'b', use));
  assert.throws(() => worlds.apply('tactics', 'a', use));
  assert.equal(rolls, 0);
  assert.throws(() => worlds.apply('tactics', 'a', { id: 'occupied', type: 'move', target: { x: 3, y: 7 } }));
  for (const x of [5, 6, 7]) {
    worlds.apply('tactics', 'a', { id: 'move-' + x, type: 'move', target: { x, y: 7 } });
  }
  assert.throws(() => worlds.apply('tactics', 'a', use), /AP/);
  worlds.apply('tactics', 'a', { id: 'end-a', type: 'endTurn' });
  worlds.apply('tactics', 'b', { id: 'end-b', type: 'endTurn' });
  assert.throws(() => worlds.apply('tactics', 'a', { ...use, die: 20 }));
  const { snapshot } = worlds.apply('tactics', 'a', use);
  assert.equal(snapshot.turns.a.ap, 1);
  assert.equal(snapshot.characters?.a.focus, 2);
  assert.equal(snapshot.encounter?.outcome, 'pacified');
  assert.equal(worlds.apply('tactics', 'a', use).duplicate, true);
  assert.equal(rolls, 1);
});

test('Case 001 rejects removed background boosts and retains Focus', () => {
  const worlds = new WorldStore(() => 1);
  worlds.create('case', 2);
  for (const player of ['a', 'b']) {
    worlds.addPlayer('case', player);
    worlds.apply('case', player, { id: 'profile', type: 'createCharacter', profession: 'ritual_specialist',
      bonus: 'body', talent: 'ritual_zone', background: 'temple_student' });
  }
  worlds.apply('case', 'a', { id: 'start', type: 'caseStart' });
  const act = (id: string, actionId: string, boost?: unknown) => worlds.apply('case', 'a', { id, type: 'caseAction', actionId, boost });
  act('travel-b', 'travel:B');
  act('travel-d', 'travel:D');
  act('clue', 'clue:E03');
  act('clue-follow-up', 'clue:E03');
  assert.throws(() => act('forged', 'seal2', ['focus', 'background']));
  assert.throws(() => act('boost', 'seal2', 'background'));
  assert.equal(worlds.snapshot('case','a').characters?.a.focus,4);
  assert.equal('background' in worlds.snapshot('case','a').characters!.a,false);
  assert.equal(act('focus', 'seal2', 'focus').snapshot.characters?.a.focus, 3);
});

test('v2 rooms accept seven members and cap investigators at six', () => {
  const rooms = new Rooms();
  const room = rooms.create('s0',2);
  const worlds = new WorldStore();
  worlds.create(room.code,2);
  worlds.addPlayer(room.code,rooms.playerId('s0')!);
  for(let i=1;i<7;i++) {
    const socket='s'+i;
    rooms.join(socket,room.code,2);
    worlds.addPlayer(room.code,rooms.playerId(socket)!);
  }
  assert.throws(()=>rooms.join('s7',room.code,2));
  const dm=rooms.playerId('s6')!;
  const host=rooms.playerId('s0')!;
  assert.throws(()=>worlds.apply(room.code,host,{id:'early',type:'caseStart'}));
  worlds.apply(room.code,dm,{id:'dm',type:'claimDm'});
  assert.throws(()=>worlds.apply(room.code,dm,{id:'release',type:'releaseDm'}));
  for(let i=0;i<6;i++) worlds.apply(room.code,rooms.playerId('s'+i)!,{id:'char',type:'createCharacter',profession:'medium',bonus:'body'});
  assert.ok(worlds.apply(room.code,host,{id:'start',type:'caseStart'}).snapshot.case001);
});

test('five and six investigators rotate through AP before one Ghost Phase, excluding the DM', () => {
  for(const count of [5,6]) {
    const world=new WorldStore(()=>10);
    world.create('party',2);
    world.addPlayer('party','dm');
    world.apply('party','dm',{id:'dm',type:'claimDm'});
    const players=Array.from({length:count},(_,i)=>'p'+i);
    for(const id of players) {
      world.addPlayer('party',id);
      world.apply('party',id,{id:'char',type:'createCharacter',profession:'medium',bonus:'body'});
    }
    world.apply('party',players[0],{id:'start',type:'start'});
    for(const [i,id] of players.entries()) {
      assert.equal(world.snapshot('party').activePlayer,id);
      assert.equal(world.snapshot('party').tactics?.round,1);
      if(i+1<count) assert.throws(()=>world.apply('party',players[i+1],{id:'skip',type:'endTurn'}));
      const request={id:'check',type:'tacticalCheck',boost:'focus'};
      assert.equal(world.apply('party',id,request).snapshot.turns[id].ap,2);
      assert.equal(world.apply('party',id,request).duplicate,true);
      assert.equal(world.snapshot('party').characters?.[id].focus,3);
      world.apply('party',id,{id:'end',type:'endTurn'});
    }
    const next=world.snapshot('party');
    assert.equal(next.activePlayer,players[0]);
    assert.equal(next.tactics?.round,2);
    assert.equal(next.turns.dm.ap,0);
    for(const id of players) assert.equal(next.turns[id].ap,3);
  }
});

test('players can edit both names and their profession before start, shared with the team and locked afterwards',()=>{
 const store=new WorldStore(()=>20,true,true,true);store.create('names',2);let n=0;
 const act=(p:string,type:string,data:object={})=>store.apply('names',p,{id:String(++n),type,...data});
 for(const id of ['dm','a','b'])store.addPlayer('names',id);
 act('dm','claimDm');act('a','createCharacter',{profession:'medium',playerName:'แฟรงค์',characterName:'หมอก'});act('b','createCharacter',{profession:'field_medic'});
 act('a','updateCharacter',{profession:'ritual_specialist',playerName:'แฟรงค์ใหม่',characterName:'สายหมอก'});
 const c=store.snapshot('names','b').characters!.a;assert.equal(c.playerName,'แฟรงค์ใหม่');assert.equal(c.characterName,'สายหมอก');assert.equal(c.profession,'ritual_specialist');
 assert.throws(()=>act('a','updateCharacter',{profession:'field_medic',playerName:'ผิด',characterName:'ผิด'}));
 assert.equal(store.snapshot('names','b').characters!.a.characterName,'สายหมอก');
 assert.throws(()=>act('a','updateCharacter',{profession:'ritual_specialist',characterName:'แยก\nบรรทัด'}));
 act('dm','caseStart',{mode:'story'});
 assert.throws(()=>act('a','updateCharacter',{profession:'medium',playerName:'เปลี่ยน',characterName:'เปลี่ยน'}),/ก่อนเริ่มคดี/);
 assert.equal(store.snapshot('names','b').characters!.a.characterName,'สายหมอก');
});

test('names can be saved before choosing a role and changed without resetting the character',()=>{
 const store=new WorldStore(()=>20,true,true,true);store.create('split',2);let n=0;
 const act=(p:string,type:string,data:object={})=>store.apply('split',p,{id:String(++n),type,...data});
 for(const id of ['dm','a','b'])store.addPlayer('split',id);act('dm','claimDm');
 act('a','setPlayerNames',{playerName:'แฟรงค์',characterName:'หมอก'});
 assert.equal(store.snapshot('split','b').playerNames!.a.characterName,'หมอก');assert(!store.snapshot('split','a').characters!.a);
 act('a','createCharacter',{profession:'medium'});const before=store.snapshot('split','a').characters!.a;
 act('a','setPlayerNames',{playerName:'แฟรงค์ใหม่',characterName:'สายหมอก'});
 const after=store.snapshot('split','b').characters!.a;assert.equal(after.characterName,'สายหมอก');assert.equal(after.profession,before.profession);assert.deepEqual(after.coreStats,before.coreStats);
 act('a','updateCharacter',{profession:'ritual_specialist'});assert.equal(store.snapshot('split','b').characters!.a.characterName,'สายหมอก');
 act('b','createCharacter',{profession:'field_medic'});act('dm','caseStart',{mode:'story'});
 assert.throws(()=>act('a','setPlayerNames',{playerName:'เปลี่ยนหลังเริ่ม'}));
});
