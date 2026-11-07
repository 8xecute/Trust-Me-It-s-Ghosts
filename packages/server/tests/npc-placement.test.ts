import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';

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
