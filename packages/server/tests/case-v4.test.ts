import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyCaseAction, caseOptions, caseView, newCase, tick} from '../src/case001/case001.js';
import {WorldStore} from '../src/world.js';

const act=(s:ReturnType<typeof newCase>,id:string)=>applyCaseAction(s,id,()=>20);
const options=(s:ReturnType<typeof newCase>)=>caseOptions(s,true).map(({id})=>id);

test('v4 requires corroboration for the floodgate reveal',()=>{
 let s=newCase(true,4);
 assert.match(caseView(s).intro,/หนองตาล/);
 assert.ok(!s.narrativeEvents?.some(beat=>beat.eventId==='arrival-radio'));
 s=act(s,'talk:arrival');
 assert.equal(s.narrativeEvents?.filter(beat=>beat.eventId==='arrival-radio').length,1);
 s=act(s,'travel:B');
 assert.ok(!options(s).includes('clue:E08'));
 s=act(s,'clue:E07');
 assert.ok(!options(s).includes('talk:accuse-gate'));
 s=act(s,'travel:C');
 assert.ok(!options(s).includes('talk:gate-history'));
 s=act(s,'visit-boonmee');
 s=act(s,'talk:history');
 s=act(s,'talk:boonmee-child');
 assert.match(s.notice,/วิชัย/);
 s=act(s,'talk:gate-history');
 s=act(s,'travel:B');
 assert.match(act(s,'talk:accuse-gate').notice,/เปิดประตู/);
});

test('v4 allows action after 03:00 and keeps a detained Wichai away from E',()=>{
 let s=newCase(true,4);
 s.wichai!.status='detained';
 s.minute=239;
 tick(s,1);
 tick(s,20);
 assert.equal(s.report,null);
 assert.equal(s.haunt,10);
 assert.equal(s.narrativeEvents?.filter(beat=>beat.eventId==='ritual-entrenched').length,1);
 s={...s,site:'E',seals:[true,true,false]};
 assert.ok(!options(s).includes('talk:confront-e'));
 assert.ok(!options(s).includes('seal3'));
 s=act(s,'key');
 s=act(s,'clue:E05');
 s=act(s,'seal3');
 assert.equal(s.seals[2],true);
 assert.ok(options(s).includes('talk:spirit-choice'));
});

test('v4 endings account for the ritual, survivor safety and both investigations',()=>{
 const base=newCase(true,4);
 base.evacuated=['ดล','นิด','เพิ่ม'];
 base.story!.objectives.push('current-testimony','gate-truth','truth-recorded');
 assert.equal(act(base,'finish').report?.ending,'D');
 base.seals=[true,true,true];
 assert.equal(act({...base,evacuated:['ดล','นิด'],escorts:['เพิ่ม']},'finish').report?.ending,'C');
 assert.equal(act({...base,ghost:'sealed'},'finish').report?.ending,'B');
 assert.equal(act({...base,ghost:'freed'},'finish').report?.ending,'A');
});

test('v4 plays from briefing to the full ending without starting a battle',()=>{
 const worlds=new WorldStore(()=>20);
 worlds.create('V4',2);
 for(const id of ['a','b']) {
  worlds.addPlayer('V4',id);
  worlds.apply('V4',id,{id:'build',type:'createCharacter',profession:'ritual_specialist',bonus:'body'});
 }
 worlds.apply('V4','a',{id:'start',type:'caseStart',mode:'story'});
 const actions=[
  'talk:arrival','travel:B','clue:E07','travel:C','clue:E02','visit-boonmee','talk:gate-history',
  'travel:B','talk:accuse-gate','travel:D','clue:E03','clue:E04','seal1','seal2',
  'travel:E','key','clue:E05','open','talk:don-land','escort:ดล','escort:นิด','escort:เพิ่ม',
  'seal3','return','ritual','ritual','travel:D','travel:B','travel:A','record-truth','finish',
 ];
 for(const [i,actionId] of actions.entries()) {
  const before=worlds.snapshot('V4','a');
  assert.ok(!before.caseMap?.battle,actionId);
  assert.doesNotThrow(()=>worlds.apply('V4','a',{id:'step-'+i,type:'caseAction',site:before.caseMap?.site,actionId}),actionId);
 }
 assert.equal(worlds.snapshot('V4','b').case001?.report?.ending,'A');
});
