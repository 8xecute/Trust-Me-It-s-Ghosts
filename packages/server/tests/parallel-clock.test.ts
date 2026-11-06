import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
function fixture(count=2){const store=new WorldStore(()=>20);store.create('r',2);let n=0;const ids=Array.from({length:count},(_,i)=>'p'+i);
 const act=(p:string,type:string,payload:object={})=>store.apply('r',p,{id:String(++n),type,...payload}).snapshot;
 for(const p of ids){store.addPlayer('r',p);act(p,'createCharacter',{profession:'medium',bonus:'body'});}act(ids[0],'caseStart');return {store,act,ids};}
test('two or six players travel together for ten minutes, sequential actions still sum',()=>{
 for(const count of [2,6]){const {store,act,ids}=fixture(count);
 for(const p of ids)act(p,'planSubmit',{actionId:'travel:B',minutes:0});
 const plan=store.snapshot('r',ids[0]).explorationPlan!;assert.equal(plan.minutes,10);
 const result=act(ids[0],'planResolve',{planId:plan.id});assert.equal(result.case001!.time,'23:10');
 for(const p of ids)assert.equal(store.snapshot('r',p).caseMap!.site,'B');
 assert.throws(()=>act(ids[0],'planResolve',{planId:plan.id}));
 }
 const {act}=fixture();act('p0','caseAction',{actionId:'travel:B'});assert.equal(act('p1','caseAction',{actionId:'travel:B'}).case001!.time,'23:20');
});
test('zero minute discussion and a ten minute search use max and preserve failed action atomicity',()=>{
 const {store,act}=fixture();for(const p of ['p0','p1'])act(p,'caseAction',{actionId:'travel:B'});
 act('p0','planSubmit',{actionId:'clue:E07'});act('p1','planSubmit',{actionId:'talk:missing'});
 const id=store.snapshot('r','p0').explorationPlan!.id;assert.equal(act('p0','planResolve',{planId:id}).case001!.time,'23:30');
 act('p0','planSubmit',{actionId:'clue:E08'});act('p1','planSubmit',{actionId:'clue:E08'});
 const before=store.snapshot('r','p0');assert.throws(()=>act('p0','planResolve',{planId:before.explorationPlan!.id}));assert.deepEqual(store.snapshot('r','p0'),before);
 act('p0','planCancel',{planId:before.explorationPlan!.id});
 assert.equal(store.snapshot('r','p0').case001!.time,'23:30');
});
test('reconnect snapshots preserve proposals; normal actions cancel a stale plan without waiting',()=>{
 const {store,act}=fixture();act('p0','planSubmit',{actionId:'travel:B'});const before=store.snapshot('r','p0');
 assert.deepEqual(store.snapshot('r','p0'),before);assert(!store.snapshot('r','p1').explorationPlan!.mine);
 act('p1','caseAction',{actionId:'travel:B'});assert(!store.snapshot('r','p0').explorationPlan);
 assert.throws(()=>act('p0','planResolve',{planId:before.explorationPlan!.id}));
});

test('third seal at 03:00 wins a coordinated block; an unstopped ritual still fails',()=>{
 for(const stop of [true,false]) {
 const {store,act}=fixture();
 for(const actionId of ['travel:B','travel:D','clue:E04','seal1','clue:E03','seal2','travel:E'])act('p0','caseAction',{actionId});
 act('p1','caseAction',{actionId:'travel:B'});
 for(let i=0;i<15;i++)act('p1','caseAction',{actionId:i%2===0?'travel:A':'travel:B'});
 assert.equal(store.snapshot('r','p0').case001!.time,'02:50');
 act('p0','planSubmit',{actionId:stop?'seal3':'key'});act('p1','planSubmit',{actionId:'travel:B'});
 const request={id:'resolve-deadline',type:'planResolve',planId:store.snapshot('r','p0').explorationPlan!.id};
 const result=store.apply('r','p0',request).snapshot;
 assert.equal(result.case001!.time,'03:00');
 if(stop){assert.equal(result.case001!.seals,3);assert.equal(result.case001!.report,null);}else assert.match(result.case001!.report!.text,/ตอนจบ D/);
 assert(store.apply('r','p0',request).duplicate);assert.deepEqual(store.snapshot('r','p0'),result);
 }
});
test('failed clue uses time and a new retry costs a new block',()=>{
 const store=new WorldStore(()=>1);store.create('f',2);let n=0;
 const act=(p:string,type:string,payload:object={})=>store.apply('f',p,{id:String(++n),type,...payload}).snapshot;
 for(const p of ['a','b']){store.addPlayer('f',p);act(p,'createCharacter',{profession:'medium',bonus:'body'});}act('a','caseStart');
 for(const p of ['a','b'])act(p,'caseAction',{actionId:'travel:B'});
 act('a','planSubmit',{actionId:'clue:E08'});act('b','planSubmit',{actionId:'talk:missing'});
 let result=act('a','planResolve',{planId:store.snapshot('f','a').explorationPlan!.id});
 assert.equal(result.case001!.time,'23:30');assert.equal(result.case001!.evidence,0);
 act('a','planSubmit',{actionId:'clue:E08'});act('b','planSubmit',{actionId:'travel:C'});
 result=act('a','planResolve',{planId:store.snapshot('f','a').explorationPlan!.id});assert.equal(result.case001!.time,'23:40');assert.equal(result.case001!.evidence,1);
});
