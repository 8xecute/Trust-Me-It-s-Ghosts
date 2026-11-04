import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCaseAction,newCase} from '../src/case001.js';
import {WorldStore} from '../src/world.js';

const toGrove=['travel:B','lore','travel:C','clue:E02','travel:D','clue:E03','clue:E04','study'];
const rescue=['key','open','escort:ดล','escort:นิด','escort:เพิ่ม'];
const home=['travel:D','travel:B','travel:A','finish'];
function play(actions:string[]) {
 return actions.reduce((state,action)=>applyCaseAction(state,action,()=>15),newCase());
}

test('peaceful route frees the ghost, commits rewards and deducts advance once',()=>{
 const s=play(['advance',...toGrove,'seal1','seal2','pacify','travel:E','seal3','clue:E05','return',
  ...rescue,...home.slice(0,-1),'travel:B','travel:D','travel:E','ritual','ritual','ritual',...home]);
 assert.equal(s.report?.ending,'A');
 assert.equal(s.report?.payable,13000);
 assert.equal(s.report?.reputation,3);
 assert.equal(s.progress,6);
 assert.match(s.report!.text,/ช่วยผู้สูญหาย 3\/3/);
 assert.throws(()=>applyCaseAction(s,'finish',()=>20));
});

test('blind seal cutting increases haunt and a suppression route resolves as B',()=>{
 const s=play([...toGrove,'cut','seal2','travel:E','seal3','suppress',...rescue,...home]);
 assert.equal(s.report?.ending,'B');
 assert.equal(s.report?.payable,11000);
 assert.equal(s.report?.reputation,1);
 assert.ok(s.haunt>=4);
});

test('rescue only grants rescue bonus and deadline failure grants none',()=>{
 const rescued=play(['travel:B','travel:D','travel:E',...rescue,...home]);
 assert.equal(rescued.report?.ending,'C');
 assert.equal(rescued.report?.rescueBonus,3000);
 assert.equal(rescued.report?.base,null);
 const travel=Array.from({length:12},()=>['travel:B','travel:A']).flat();
 const failed=play(travel);
 assert.equal(failed.report?.ending,'D');
 assert.equal(failed.report?.time,'03:00');
 assert.equal(failed.report?.rescueBonus,0);
 assert.throws(()=>applyCaseAction(failed,'travel:B',()=>20));
});

test('seal 3 must have both earlier seals and wins a tie at the deadline',()=>{
 const before={...newCase(),site:'E' as const,minute:230};
 assert.throws(()=>applyCaseAction(before,'seal3',()=>20));
 before.seals=[true,true,false];
 const sealed=applyCaseAction(before,'seal3',()=>20);
 assert.equal(sealed.minute,240);
 assert.equal(sealed.seals[2],true);
 assert.equal(sealed.report,null);
 const failed=applyCaseAction(before,'seal3',()=>1);
 assert.equal(failed.report?.ending,'D');
});

test('System DM and Human DM rooms commit the same case rules and hide private state',()=>{
 const store=new WorldStore(()=>15);
 for(const code of ['system','human']) {
  store.create(code);
  for(const player of ['a','b']) store.addPlayer(code,player);
 }
 store.addPlayer('human','dm');
 store.apply('human','dm',{id:'claim',type:'claimDm'});
 for(const code of ['system','human']) {
  store.apply(code,'a',{id:'start',type:'caseStart'});
  store.apply(code,'a',{id:'travel',type:'caseAction',actionId:'travel:B'});
  assert.equal(store.apply(code,'a',{id:'travel',type:'caseAction',actionId:'travel:B'}).duplicate,true);
 }
 assert.deepEqual(store.snapshot('system').case001,store.snapshot('human').case001);
 assert.throws(()=>store.apply('human','dm',{id:'travel',type:'caseAction',actionId:'travel:D'}));
 assert.throws(()=>store.apply('human','b',{id:'fake',type:'caseAction',actionId:'finish',die:20}));
 assert.ok(!Object.hasOwn(store.snapshot('human').case001!,'lore'));
});
