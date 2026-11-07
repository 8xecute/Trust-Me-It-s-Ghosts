import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {newCase,applyCaseAction,tick,failCase} from '../src/case001/case001.js';
import {createCharacter} from '@baan/shared';
function fixture(){const store=new WorldStore(()=>20);store.create('r',2);let seq=0;
 for(const id of ['a','b']){store.addPlayer('r',id);store.apply('r',id,{id:'char',type:'createCharacter',profession:'medium',bonus:'body'});}
 const act=(id:string,type:string,payload:object={})=>store.apply('r',id,{id:String(++seq),type,...payload}).snapshot;
 act('a','caseStart');return {store,act};}
test('scene setup is local, precedes discovery, and does not repeat on revisiting',()=>{
 const {store,act}=fixture();const snap=act('a','caseAction',{actionId:'travel:B'});
 const beats=snap.narrative!.history;assert(beats.findIndex(b=>b.eventId==='entry:B')<beats.findIndex(b=>b.eventId==='travel:B'));
 assert(!store.snapshot('r','b').narrative!.history.some(b=>b.eventId==='entry:B'));
 act('a','caseAction',{actionId:'travel:A'});act('a','caseAction',{actionId:'travel:B'});
 assert.equal(store.snapshot('r','a').narrative!.history.filter(b=>b.eventId==='entry:B').length,1);
 const other=act('b','caseAction',{actionId:'travel:B'});assert.equal(other.narrative!.history.filter(b=>b.eventId==='entry:B').length,1);
});
test('encounter setup survives later actions and escape is not narrated as victory',()=>{
 const {store,act}=fixture();act('a','caseAction',{actionId:'travel:B'});act('a','caseAction',{actionId:'travel:C'});
 act('a','caseAction',{actionId:'clue:E01'});act('a','start');
 assert(!store.snapshot('r','b').narrative!.history.some(b=>b.eventId==='EN01:start'));
 act('a','move',{target:{x:4,y:9}});const escaped=act('a','escape');
 assert.match(escaped.narrative!.history.find(b=>b.eventId==='EN01:end')!.text,/ถอย/);
 assert(!escaped.narrative!.history.some(b=>b.eventId==='EN01:vision'));
 assert(escaped.narrative!.history.some(b=>b.eventId==='EN01:start'));
});
test('ending cause changes prose without changing D, rewards or duplicate protection',()=>{
 const early=applyCaseAction(newCase(true),'finish',()=>20);assert.equal(early.report!.ending,'D');
 assert.match(early.narrativeEvents!.find(b=>b.eventId==='ending:D')!.text,/ถอนตัว/);
 const deadline=newCase(true);tick(deadline,240);assert.equal(deadline.report!.ending,'D');assert.match(deadline.notice,/ระฆัง/);
 const down=newCase(true);failCase(down);failCase(down);assert.equal(down.narrativeEvents!.filter(b=>b.eventId==='ending:D').length,1);assert.match(down.notice,/หมดสภาพ/);
});
test('unsafe early discovery is not falsely recorded as a midnight grove apparition',()=>{
 const actor={character:createCharacter('medium','body'),backgroundUsed:false,onBoost:()=>{}};
 let s=newCase(true);for(const id of ['travel:B','travel:D','travel:E','key','unsafe-bracelet'])s=applyCaseAction(s,id,()=>20,actor);
 assert(s.minute<60);assert.equal(s.ghost,'hostile');assert(!s.story!.firedTriggers.includes('EV03'));
});
