import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldStore } from '../src/world.js';

function storyRoom() {
 let rolls=0;
 const worlds=new WorldStore(()=>++rolls+10,true);
 const code='STORY';
 worlds.create(code,2);
 let sequence=0;
 const send=(player:string,type:string,fields:object={})=>
  worlds.apply(code,player,{id:String(++sequence),type,...fields}).snapshot;
 for(const id of ['dm','a','b']) worlds.addPlayer(code,id);
 send('dm','claimDm');
 send('a','createCharacter',{profession:'medium',bonus:'body'});
 send('b','createCharacter',{profession:'occult_engineer',bonus:'body'});
 send('dm','caseStart');
 const panel=()=>{
  const view=worlds.dmPanel(code,'dm');
  if(!('caseMode' in view)) throw Error('expected Case 001 DM panel');
  return view;
 };
 return {send,panel,view:(player:string)=>worlds.snapshot(code,player),rollCount:()=>rolls};
}

test('the team can withdraw after leaving the entrance and returning',()=>{
 const {send,view}=storyRoom();
 assert.ok(!view('a').case001?.actions.some(option=>option.id==='finish'));
 assert.throws(()=>send('a','caseAction',{actionId:'finish',site:'A'}));
 send('dm','dmTravel',{actionId:'travel:B',site:'A'});
 send('dm','dmTravel',{actionId:'travel:A',site:'B'});
 assert.ok(view('a').case001?.actions.some(option=>option.id==='finish'));
 send('a','caseAction',{actionId:'finish',site:'A'});
 assert.equal(view('a').awaitingReport,true);
});



test('D20 requests are private and committed results are shared with the room',()=>{
 const {send,panel,view,rollCount}=storyRoom();
 assert.throws(()=>send('a','dmRequestRoll',{targetId:'b'}));
 send('dm','dmRequestRoll',{targetId:'a'});
 const cardA=view('a').diceRequest!;
 assert.equal(view('b').diceRequest,null);
 assert.equal(view('b').latestRoll,undefined);
 assert.throws(()=>send('dm','dmRequestRoll',{targetId:'a'}));
 send('dm','dmRequestRoll',{targetId:'b'});
 const cardB=view('b').diceRequest!;
 assert.notEqual(cardA.id,cardB.id);
 assert.throws(()=>send('b','dmRoll',{requestId:cardA.id}));
 assert.throws(()=>send('a','dmRoll',{requestId:cardA.id,die:20}));
 assert.equal(send('b','dmRoll',{requestId:cardB.id}).diceRequest?.die,11);
 assert.equal(send('a','dmRoll',{requestId:cardA.id}).diceRequest?.die,12);
 assert.throws(()=>send('a','dmRoll',{requestId:cardA.id}));
 assert.equal(rollCount(),2);
 assert.equal(panel().investigators.find(player=>player.id==='b')?.diceRequest?.die,11);
 for(const player of ['a','b','dm']) {
  assert.equal(view(player).latestRoll?.id,cardA.id);
  assert.equal(view(player).latestRoll?.die,12);
 }
 assert.deepEqual(view('a').dmLog?.map(entry=>entry.kind),['roll-requested','roll-result','roll-result']);
 assert.deepEqual(view('dm').dmLog?.map(entry=>entry.kind),['roll-requested','roll-requested','roll-result','roll-result']);
});



test('a scripted exploration check waits for the assigned card and commits exactly once',()=>{
 const {send,panel,view,rollCount}=storyRoom();
 send('dm','dmTravel',{actionId:'travel:B',site:'A'});
 send('dm','dmTravel',{actionId:'travel:C',site:'B'});
 const before=view('a').case001;
 send('a','caseAction',{actionId:'clue:E01',site:'C'});
 assert.equal(view('a').pendingCheck,'clue:E01');
 assert.equal(view('a').case001?.time,before?.time);
 assert.equal(view('a').case001?.evidence,before?.evidence);
 assert.equal(rollCount(),0);
 const check=panel().investigators.find(entry=>entry.id==='a')!.check!;
 assert.throws(()=>send('dm','dmRequestRoll',{targetId:'a',checkId:'stale'}));
 assert.throws(()=>send('dm','dmRequestRoll',{targetId:'b',checkId:check.id}));
 send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});
 const card=view('a').diceRequest!;
 assert.equal(card.label,check.label);
 assert.equal(view('b').diceRequest,null);
 assert.throws(()=>send('b','dmRoll',{requestId:card.id}));
 const resolved=send('a','dmRoll',{requestId:card.id});
 assert.equal(resolved.lastCheck?.die,11);
 assert.equal(resolved.characters?.a.coreStats?.PER,2);
 assert.equal(resolved.lastCheck?.total,13);
 assert.equal(resolved.diceRequest?.die,11);
 assert.deepEqual(resolved.diceRequest?.result,{total:13,outcome:resolved.lastCheck?.outcome});
 assert.deepEqual(panel().investigators.find(entry=>entry.id==='a')?.diceRequest?.result,resolved.diceRequest?.result);
 assert.equal(view('b').diceRequest,null);
 assert.equal(resolved.pendingCheck,undefined);
 assert.throws(()=>send('a','dmRoll',{requestId:card.id}));
 assert.equal(rollCount(),1);
 assert.deepEqual(view('dm').dmLog?.slice(-3).map(entry=>entry.kind),['check-requested','roll-requested','roll-result']);
});

test('moving the team away cancels a pending scripted roll without using dice',()=>{
 const {send,panel,view,rollCount}=storyRoom();
 send('dm','dmTravel',{actionId:'travel:B',site:'A'});
 send('dm','dmTravel',{actionId:'travel:C',site:'B'});
 send('a','caseAction',{actionId:'clue:E01',site:'C'});
 const check=panel().investigators.find(entry=>entry.id==='a')!.check!;
 send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});
 const card=view('a').diceRequest!;
 send('dm','dmTravel',{actionId:'travel:B',site:'C'});
 assert.equal(view('a').pendingCheck,undefined);
 assert.equal(view('a').diceRequest,null);
 assert.throws(()=>send('a','dmRoll',{requestId:card.id}));
 assert.equal(rollCount(),0);
 assert.deepEqual(view('a').dmLog?.slice(-2).map(entry=>entry.kind),['roll-canceled','check-canceled']);
});




test('DM chooses a validated DC and the server resolves the shared result',()=>{
 const {send,view,rollCount}=storyRoom();
 assert.throws(()=>send('a','dmRequestRoll',{targetId:'b',stat:'PER',difficulty:14}));
 assert.throws(()=>send('dm','dmRequestRoll',{targetId:'a',stat:'PER',difficulty:13}));
 send('dm','dmRequestRoll',{targetId:'a',stat:'SPI',difficulty:17});
 const card=view('a').diceRequest!;
 assert.deepEqual(card.dice,{stat:'SPI',dc:17,ap:0});
 assert.throws(()=>send('a','dmRoll',{requestId:card.id,die:20}));
 send('a','dmRoll',{requestId:card.id});
 assert.deepEqual(view('b').latestRoll?.result,{total:16,outcome:'partial'});
 assert.equal(rollCount(),1);
 assert.throws(()=>send('a','dmRoll',{requestId:card.id}));
});

test('DM selected stat and DC govern a pending legacy scene action',()=>{
 const {send,panel,view}=storyRoom();
 send('dm','dmTravel',{actionId:'travel:B',site:'A'});
 send('dm','dmTravel',{actionId:'travel:C',site:'B'});
 send('a','caseAction',{actionId:'clue:E01',site:'C'});
 const check=panel().investigators.find(entry=>entry.id==='a')!.check!;
 send('dm','dmRequestRoll',{targetId:'a',checkId:check.id,stat:'BODY',difficulty:17});
 const card=view('a').diceRequest!;
 assert.deepEqual(card.dice,{stat:'BODY',dc:17,ap:0});
 send('a','dmRoll',{requestId:card.id});
 assert.deepEqual(view('b').latestRoll!.result,{total:12,outcome:'failure'});
 assert.equal(view('a').case001!.evidence,0);
});
