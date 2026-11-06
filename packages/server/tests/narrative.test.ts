import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {newNarrative,enqueueNarrative,narrativeView,advanceNarrative} from '../src/narrative.js';
function fixture(){
 const store=new WorldStore(()=>20);store.create('r',2);
 for(const id of ['a','b','dm'])store.addPlayer('r',id);
 let seq=0;const act=(who:string,type:string,payload:object={})=>store.apply('r',who,{id:String(++seq),type,...payload});
 act('dm','claimDm');for(const id of ['a','b'])act(id,'createCharacter',{profession:'medium',bonus:'body'});
 act('a','caseStart');return {store,act};
}
test('E07 revelation survives subsequent dialogue, retries and snapshot recovery without blocking play',()=>{
 const {store,act}=fixture();act('a','caseAction',{actionId:'travel:B'});
 const request={id:'find',type:'caseAction',actionId:'clue:E07'};
 store.apply('r','a',request);const before=store.snapshot('r','a').narrative!;
 assert(before.history.some(b=>b.eventId==='EV15'));
 act('a','caseAction',{actionId:'talk:missing'});
 const after=store.snapshot('r','a');assert.equal(after.narrative!.current!.sequence,before.current!.sequence);
 assert(after.narrative!.history.some(b=>b.eventId==='EV15'));
 const count=after.narrative!.history.length;assert(store.apply('r','a',request).duplicate);
 assert.equal(store.snapshot('r','a').narrative!.history.length,count);
 assert.deepEqual(store.dmPreview('r','dm','a'),store.snapshot('r','a'));
 const cursor=after.narrative!.current!.sequence;act('a','narrativeNext',{sequence:cursor});
 assert.throws(()=>act('a','narrativeNext',{sequence:cursor}));
 assert.equal(store.snapshot('r','a').case001!.time,after.case001!.time);
});
test('split party receives shared clues with provenance but not another location local dialogue',()=>{
 const {store,act}=fixture();act('a','caseAction',{actionId:'travel:B'});act('a','caseAction',{actionId:'clue:E07'});
 act('a','caseAction',{actionId:'talk:missing'});
 const remote=store.snapshot('r','b').narrative!;
 assert(remote.history.some(b=>b.eventId==='clue:E07'&&b.site==='B'&&b.actor==='a'&&b.scope==='party'));
 assert(!remote.history.some(b=>b.eventId==='talk:missing'));
 assert(!JSON.stringify(remote).includes('recipients'));
 assert(!JSON.stringify(store.snapshot('r','b')).includes('ปิดบังบทบาท'));
 assert.throws(()=>store.dmPreview('r','b','a'));
});
test('queue is bounded and lagging readers recover without an acknowledgement barrier',()=>{
 const state=newNarrative();for(let i=0;i<220;i++)enqueueNarrative(state,{eventId:String(i),text:'บทเล่า',site:'A',actor:'a',scope:'local'},['a']);
 assert.equal(state.records.length,200);const view=narrativeView(state,'a');assert.equal(view.current!.sequence,21);
 advanceNarrative(state,'a',21);assert.equal(narrativeView(state,'a').current!.sequence,22);
 assert.equal(narrativeView(state,'b').history.length,0);
});
