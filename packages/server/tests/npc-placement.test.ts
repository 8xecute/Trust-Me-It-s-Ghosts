import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {Rooms} from '../src/rooms.js';
import {exportSession,importSession} from '../src/portableSession.js';

test('DM places, moves and removes NPCs with scene-scoped views and saved state',()=>{
 const store=new WorldStore(()=>20,true,true,true);store.create('NPC',2);let n=0;
 const act=(id:string,type:string,body:object={})=>store.apply('NPC',id,{id:String(++n),type,...body});
 for(const id of ['dm','a','b'])store.addPlayer('NPC',id);
 act('dm','claimDm');act('a','createCharacter',{profession:'medium'});act('b','createCharacter',{profession:'field_medic'});act('dm','caseStart',{mode:'story'});
 const place={site:'A',npcId:'prasert',position:{x:20,y:75}};
 assert.throws(()=>act('a','dmPlaceNpc',place));
 assert.throws(()=>act('dm','dmPlaceNpc',{...place,position:{x:101,y:0}}));
 assert.throws(()=>act('dm','dmPlaceNpc',{...place,npcId:'invalid'}));
 act('dm','dmPlaceNpc',place);
 assert.deepEqual(store.snapshot('NPC','a').caseMap!.npcs,[{id:'prasert',x:20,y:75}]);
 assert.deepEqual(store.dmPreview('NPC','dm','a').caseMap!.npcs,store.snapshot('NPC','b').caseMap!.npcs);
 act('dm','dmPlaceNpc',{...place,position:{x:43,y:40}});
 const restored=new WorldStore(()=>20,true,true,true);restored.restore('NPC',JSON.parse(JSON.stringify(store.checkpoint('NPC'))));
 assert.equal(restored.snapshot('NPC','a').caseMap!.npcs![0].x,43);
 const panel=()=>{const p=store.dmPanel('NPC','dm');if(!('caseMode' in p)) throw Error();return p;};
 act('dm','guided',{command:'scene',target:'A3'});
 act('dm','dmPublish',{cardId:panel().narration.find(c=>c.eventId==='guided-cue:A3')!.id});
 act('dm','guided',{command:'propose'});
 const transition=store.snapshot('NPC','a').guided!.transition!;
 act('dm','dmPlaceNpc',{...place,position:{x:45,y:40}});
 assert.equal(store.snapshot('NPC','a').guided!.transition!.id,transition.id);
 act('a','guided',{command:'confirm',target:transition.id});
 assert.deepEqual(store.snapshot('NPC','a').caseMap!.npcs,[]);
 assert.throws(()=>act('dm','dmPlaceNpc',place));
 act('dm','dmPlaceNpc',{site:'B',npcId:'ton',position:{x:60,y:60}});
 assert.deepEqual(store.snapshot('NPC','a').caseMap!.npcs,[{id:'ton',x:60,y:60}]);
 act('dm','dmPlaceNpc',{site:'B',npcId:'ton',position:null});
 assert.deepEqual(store.snapshot('NPC','a').caseMap!.npcs,[]);
});

test('all ART dicut characters can be placed by the DM',()=>{
 const store=new WorldStore(()=>20,true,true,true);store.create('ART',2);let n=0;
 const act=(id:string,type:string,body:object={})=>store.apply('ART',id,{id:String(++n),type,...body});
 for(const id of ['dm','a','b'])store.addPlayer('ART',id);
 act('dm','claimDm');act('a','createCharacter',{profession:'medium'});act('b','createCharacter',{profession:'field_medic'});act('dm','caseStart',{mode:'story'});
 for(const npcId of ['prasert','wichai','boonmee','ton','dol','nid','phoem','kaew','kaewFinal','drowned','ritual_specialist','paranormal_investigator','containment_specialist','medium','occult_engineer','field_medic']) act('dm','dmPlaceNpc',{site:'A',npcId,position:{x:50,y:50}});
 assert.equal(store.snapshot('ART','a').caseMap!.npcs!.length,16);
});

test('hidden staging stays DM-only, preserves story and supports legacy moves and portable saves',()=>{
 const rooms=new Rooms(),store=new WorldStore(()=>20,true,true,true,false,'5.5');
 const room=rooms.create('dm',2),code=room.code,dm=rooms.playerId('dm')!;rooms.token('dm');
 store.create(code,2);store.addPlayer(code,dm);let n=0;
 const act=(id:string,type:string,body:object={})=>store.apply(code,id,{id:String(++n),type,...body});
 act(dm,'claimDm');
 const players=['a','b'].map((socket,i)=>{
  rooms.join(socket,code,2);rooms.token(socket);const id=rooms.playerId(socket)!;store.addPlayer(code,id);
  act(id,'createCharacter',{profession:i?'field_medic':'medium'});return id;
 });
 act(dm,'caseStart',{mode:'story'});
 const before=store.checkpoint(code).world;
 const place={site:'A',npcId:'kaewFinal',position:{x:48,y:80,scale:1.25,hidden:true}};
 for(const player of players)assert.throws(()=>act(player,'dmPlaceNpc',place));
 for(const position of [{x:NaN,y:80},{x:10,y:Infinity},{x:50,y:80,scale:.59},{x:50,y:80,scale:1.61},{x:50,y:80,scale:NaN},{x:50,y:80,hidden:'true'}]){
  assert.throws(()=>act(dm,'dmPlaceNpc',{...place,position}));
 }
 act(dm,'dmPlaceNpc',place);
 assert.deepEqual(store.snapshot(code,dm).caseMap!.npcs,[{id:'kaewFinal',...place.position}]);
 for(const player of players){
  assert.deepEqual(store.snapshot(code,player).caseMap!.npcs,[]);
  assert.deepEqual(store.dmPreview(code,dm,player).caseMap!.npcs,[]);
 }
 assert.deepEqual(store.snapshot(code).caseMap!.npcs,[]);
 assert.throws(()=>store.dmPreview(code,players[0],players[1]));
 assert.throws(()=>store.dmPanel(code,players[0]));
 act(dm,'dmPlaceNpc',{...place,position:{x:52,y:82}});
 const hidden={id:'kaewFinal',x:52,y:82,scale:1.25,hidden:true};
 assert.deepEqual(store.snapshot(code,dm).caseMap!.npcs,[hidden]);
 const after=store.checkpoint(code).world;
 assert.deepEqual(after.case001,before.case001);
 assert.deepEqual(after.characters,before.characters);
 assert.deepEqual(after.turns,before.turns);
 assert.deepEqual(after.narrative,before.narrative);
 assert.deepEqual(after.dmSession,before.dmSession);
 assert.deepEqual(after.caseMap!.sites,before.caseMap!.sites);
 act(dm,'dmSessionControl',{command:'pause'});
 const file=JSON.parse(JSON.stringify(exportSession(rooms,store,code,dm)));
 const restored=new WorldStore(()=>20,true,true,true,false,'5.5');
 importSession(new Rooms(),restored,file);
 assert.deepEqual(restored.snapshot(code,dm).caseMap!.npcs,[hidden]);
 assert.deepEqual(restored.snapshot(code,players[0]).caseMap!.npcs,[]);
 act(dm,'dmSessionControl',{command:'resume'});
 act(dm,'dmPlaceNpc',{...place,position:{...hidden,hidden:false}});
 for(const player of players)assert.deepEqual(store.snapshot(code,player).caseMap!.npcs,[{...hidden,hidden:false}]);
 act(dm,'dmPlaceNpc',{...place,position:{...hidden,hidden:true}});
 act(dm,'dmPlaceNpc',{...place,position:null});
 assert.deepEqual(store.snapshot(code,dm).caseMap!.npcs,[]);
});
