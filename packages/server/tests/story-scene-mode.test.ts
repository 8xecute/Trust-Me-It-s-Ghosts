import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldStore } from '../src/world.js';
import { castProfiles, professions, attributes, type Profession } from '@baan/shared';

for (const size of [2, 3, 4]) {
  test(`story room of ${size} shares scenes, dialogue and scripted rolls`, () => {
    let rolls = 0;
    const worlds = new WorldStore(() => { rolls++; return 20; });
    worlds.create('ABC123',2);
    const players = Array.from({length:size},(_,index)=>'player-'+index);
    for(const player of players) {
      worlds.addPlayer('ABC123',player);
      worlds.apply('ABC123',player,{id:'create',type:'createCharacter',profession:'medium',bonus:'body'});
    }
    const action=(player:string,input:object)=>worlds.apply('ABC123',player,input).snapshot;
    const start=action(players[0],{id:'start',type:'caseStart',mode:'story'});
    assert.equal(start.sceneMode,true);
    const topic=start.case001?.actions.find(option=>option.id.startsWith('talk:'));
    assert.ok(topic?.speaker);
    const answer=action(players[1],{id:'talk',type:'caseAction',actionId:topic.id,site:'A'});
    assert.ok(answer.case001?.notice.includes(topic.speaker));
    assert.equal(rolls,0);
    assert.equal(worlds.snapshot('ABC123',players[0]).case001?.notice,answer.case001?.notice);
    assert.throws(()=>worlds.assertCanJoin(' abc123 '));
    action(players[1],{id:'travel-b',type:'caseAction',actionId:'travel:B',site:'A'});
    assert.throws(()=>action(players[0],{id:'stale',type:'caseAction',actionId:'travel:B',site:'A'}),/เปลี่ยนฉากแล้ว/);
    action(players[0],{id:'travel-c',type:'caseAction',actionId:'travel:C',site:'B'});
    assert.throws(()=>action(players[0],{id:'move',type:'move',target:{x:4,y:9}}));
    assert.throws(()=>action(players[0],{id:'forged',type:'caseAction',actionId:'clue:E01',site:'C',die:20}));
    const checked=action(players[0],{id:'clue',type:'caseAction',actionId:'clue:E01',site:'C'});
    assert.equal(rolls,1);
    assert.equal(checked.lastCheck?.die,20);
    for(const player of players) {
      const snapshot=worlds.snapshot('ABC123',player);
      assert.equal(snapshot.caseMap?.site,'C');
      assert.equal(snapshot.case001?.time,checked.case001?.time);
      assert.deepEqual(snapshot.lastCheck,checked.lastCheck);
      assert.equal(snapshot.caseMap?.opportunity,'EN01');
    }
    assert.equal(worlds.apply('ABC123',players[0],{id:'clue',type:'caseAction',actionId:'clue:E01',site:'C'}).duplicate,true);
    assert.equal(rolls,1);
    action(players[0],{id:'encounter',type:'start'});
    const battle=worlds.snapshot('ABC123',players[1]).caseMap?.battle;
    assert.equal(battle?.id,'EN01');
    assert.equal(battle?.enemies.length,1);
  });
}

test('six distinct investigators and a DM can start, with private preset profiles',()=>{
  const worlds=new WorldStore(()=>20,true);
  worlds.create('TEAM',2);
  worlds.addPlayer('TEAM','dm');
  worlds.apply('TEAM','dm',{id:'dm',type:'claimDm'});
  const roles=Object.keys(professions) as Profession[];
  roles.forEach((profession,index)=>{
    const player='p'+index;
    worlds.addPlayer('TEAM',player);
    const pick={id:'pick',type:'createCharacter',profession,bonus:attributes.find(stat=>professions[profession].stats[stat]<4)};
    if(index===1) assert.throws(()=>worlds.apply('TEAM',player,{...pick,profession:roles[0]}),/เลือกตัวละครนี้แล้ว/);
    worlds.apply('TEAM',player,pick);
  });
  const result=worlds.apply('TEAM','dm',{id:'start',type:'caseStart'}).snapshot;
  assert.equal(result.sceneMode,true);
  assert.equal(Object.keys(result.characters ?? {}).length,6);
  assert.deepEqual(worlds.dmPreview('TEAM','dm','p0').biography,castProfiles[roles[0]].biography);
  assert.throws(()=>worlds.dmPreview('TEAM','p1','p0'));
  assert.equal('biography' in worlds.snapshot('TEAM','p1'),false);
});
