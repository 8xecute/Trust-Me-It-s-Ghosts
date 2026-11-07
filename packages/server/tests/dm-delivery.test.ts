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

test('the DM releases narration and NPC answers while the server commits effects only after approval',()=>{
 const {send,panel,view,rollCount}=storyRoom();
 const briefing=panel().narration.find(beat=>beat.eventId==='briefing')!;
 assert.ok(briefing.text);
 assert.equal(panel().narration.filter(beat=>beat.eventId==='entry:A').length,1);
 for(const player of ['a','b']) {
  const snapshot=view(player);
  assert.equal(snapshot.case001?.intro,'');
  assert.equal(snapshot.narrative?.current,null);
  assert.equal(JSON.stringify(snapshot).includes(briefing.text),false);
 }
 assert.throws(()=>send('a','dmPublish',{cardId:briefing.id}));
 send('dm','dmPublish',{cardId:briefing.id});
 assert.throws(()=>send('dm','dmPublish',{cardId:briefing.id}));
 assert.equal(view('b').narrative?.current?.text,briefing.text);

 const before=view('a').case001;
 send('a','askGm',{text:'เกิดอะไรขึ้นที่หมู่บ้านครับ',site:'A'});
 const question=panel().questions![0];
 assert.equal(question.label,'เกิดอะไรขึ้นที่หมู่บ้านครับ');
 const scripted=panel().investigators.find(entry=>entry.id==='a')!.choices.find(choice=>choice.id==='talk:arrival')!;
 assert.match(scripted.answer!,/ประเสริฐ/);
 assert.equal(view('a').case001?.time,before?.time);
 assert.equal(view('a').case001?.evidence,before?.evidence);
 assert.equal(view('a').pendingQuestionCount,1);
 assert.ok(!view('a').case001?.actions.some(option=>option.id.startsWith('talk:') || option.id.startsWith('travel:')));
 assert.equal(JSON.stringify(view('b')).includes(scripted.answer!),false);
 assert.throws(()=>send('b','dmAnswer',{cardId:question.id,actionId:'talk:arrival'}));
 assert.throws(()=>send('a','caseAction',{actionId:'talk:arrival',site:'A'}));
 send('dm','dmAnswer',{cardId:question.id,actionId:'talk:arrival'});
 assert.throws(()=>send('dm','dmAnswer',{cardId:question.id,actionId:'talk:arrival'}));
 assert.equal(panel().questions?.length,0);
 assert.equal(view('b').case001?.notice,scripted.answer);
 assert.equal(view('b').narrative?.current?.text,scripted.answer);
 assert.equal(rollCount(),0);
 assert.deepEqual(view('dm').dmLog?.map(entry=>entry.kind),['narration','question','answer']);
 assert.deepEqual(view('b').dmLog?.map(entry=>entry.kind),['narration','answer']);
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

test('the DM can close stale questions and the report stays private until the ending is released',()=>{
 const {send,panel,view}=storyRoom();
 assert.throws(()=>send('a','caseAction',{actionId:'travel:B',site:'A'}));
 assert.throws(()=>send('a','dmTravel',{actionId:'travel:B',site:'A'}));
 assert.throws(()=>send('dm','dmTravel',{actionId:'travel:E',site:'A'}));
 send('a','askGm',{text:'เกิดอะไรขึ้นที่หมู่บ้านครับ',site:'A'});
 const question=panel().questions![0];
 send('dm','dmTravel',{actionId:'travel:B',site:'A'});
 assert.equal(panel().questions![0].open,false);
 assert.throws(()=>send('dm','dmAnswer',{cardId:question.id,actionId:'talk:arrival'}));
 send('dm','dmDismiss',{cardId:question.id});
 assert.equal(view('a').dmLog?.at(-1)?.kind,'dismissed');
 send('dm','dmRequestRoll',{targetId:'a'});
 send('dm','dmTravel',{actionId:'travel:A',site:'B'});
 send('b','caseAction',{actionId:'finish',site:'A'});
 const ending=panel().narration.find(beat=>beat.eventId.startsWith('ending:'))!;
 assert.equal(view('a').case001?.report,null);
 assert.equal(view('a').awaitingReport,true);
 assert.equal(view('a').diceRequest,null);
 assert.equal(view('a').dmLog?.at(-1)?.kind,'roll-canceled');
 send('dm','dmPublish',{cardId:ending.id});
 assert.equal(view('a').awaitingReport,false);
 assert.match(view('a').case001!.report!.text,/รายงาน/);
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
 assert.equal(resolved.characters?.a.coreStats?.PER,3);
 assert.equal(resolved.lastCheck?.total,14);
 assert.equal(resolved.diceRequest?.die,11);
 assert.deepEqual(resolved.diceRequest?.result,{total:14,outcome:resolved.lastCheck?.outcome});
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

test('the GM can answer in their own words, and only the released text is shared',()=>{
 const {send,panel,view}=storyRoom();
 assert.throws(()=>send('a','askGm',{text:'   ',site:'A'}));
 send('a','askGm',{text:'ขอไปบ้านผู้ใหญ่ได้ไหม',site:'A'});
 const cardId=panel().questions![0].id;
 assert.equal(view('b').dmLog?.length,0);
 assert.throws(()=>send('a','dmReply',{cardId,text:'ได้'}));
 send('dm','dmReply',{cardId,text:'ได้ ผู้ใหญ่บ้านกำลังรออยู่'});
 assert.equal(view('b').narrative?.current?.text,'ได้ ผู้ใหญ่บ้านกำลังรออยู่');
 assert.equal(view('a').pendingQuestionCount,0);
 assert.equal(view('b').caseMap?.site,'A');
 assert.throws(()=>send('dm','dmReply',{cardId,text:'ตอบซ้ำ'}));
 const moved=send('dm','dmTravel',{actionId:'travel:B',site:'A'});
 assert.equal(moved.caseMap?.site,'B');
 assert.equal(view('b').caseMap?.site,'B');
 assert.equal(view('b').dmLog?.at(-1)?.kind,'travel');
});

test('DM pauses narration from another scene and validates the speaker of a custom reply',()=>{
 const {send,panel,view}=storyRoom();
 const arrival=panel().narration.find(beat=>beat.eventId==='entry:A')!;
 assert.equal(arrival.current,true);
 send('dm','dmTravel',{actionId:'travel:B',site:'A'});
 const afterTravel=panel();
 assert.equal(afterTravel.narration.find(beat=>beat.id===arrival.id)?.current,false);
 assert.equal(afterTravel.narration.find(beat=>beat.eventId==='entry:B')?.current,true);
 assert.throws(()=>send('dm','dmPublish',{cardId:arrival.id}),/คนละฉาก/);
 send('a','askGm',{text:'ใครอยู่ที่นี่',site:'B'});
 const cardId=panel().questions![0].id;
 assert.ok(panel().speakers?.includes('วิชัย'));
 assert.throws(()=>send('dm','dmReply',{cardId,text:'สวัสดี',speaker:'แม่แก้ว'}),/ยังพูด/);
 send('dm','dmReply',{cardId,text:'สวัสดี',speaker:'วิชัย'});
 assert.equal(view('a').narrative?.current?.text,'วิชัย · สวัสดี');
 assert.equal(view('b').narrative?.current?.text,'วิชัย · สวัสดี');
 send('dm','dmTravel',{actionId:'travel:A',site:'B'});
 assert.equal(panel().narration.find(beat=>beat.id===arrival.id)?.current,true);
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
 assert.deepEqual(view('b').latestRoll!.result,{total:13,outcome:'failure'});
 assert.equal(view('a').case001!.evidence,0);
});
