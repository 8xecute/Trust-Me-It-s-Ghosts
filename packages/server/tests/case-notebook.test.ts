import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {newCase} from '../src/case001/case001.js';
import {caseNotebook} from '../src/case001/caseNotebook.js';
import {dmEventPreviews} from '../src/case001/caseStory.js';
test('notebook separates source-backed evidence from inference and hides undiscovered plot facts',()=>{
 const state=newCase(true);const before=structuredClone(state);const fresh=caseNotebook(state);
 assert(fresh.unknown.length);assert(!JSON.stringify(fresh).includes('วิชัย'));assert(!JSON.stringify(fresh).includes('CASE 017'));assert.deepEqual(state,before);
 state.evidence=['E01','E02'];const view=caseNotebook(state);assert(view.confirmed.some(e=>e.id==='E01'));assert(!view.confirmed.some(e=>e.id==='E02'));assert(view.suspected.some(e=>e.id==='E02'));
 state.opened=true;assert(!caseNotebook(state).unknown.some(e=>e.id==='missing-question'));
});
test('DM previews explain unmet prerequisites, missing NPCs and already fired events without mutating state',()=>{
 const s={...newCase(true),site:'B' as const};const before=structuredClone(s);
 const previews=dmEventPreviews(s);assert(previews.find(e=>e.id==='dialogue-gate-history')!.reasons.length);assert.equal(previews.find(e=>e.id==='EV01')!.status,'fired');
 s.wichai!.site='E';assert(dmEventPreviews(s).find(e=>e.id==='dialogue-grove-alibi')!.reasons.some(r=>r.includes('ผู้พูด')));
 s.wichai!.site='B';assert.deepEqual(s,before);
});
test('only Human DM can inspect private prerequisites or advance another player presentation; time unchanged',()=>{
 const store=new WorldStore(()=>20);store.create('r',2);let n=0;const act=(p:string,type:string,payload:object={})=>store.apply('r',p,{id:String(++n),type,...payload}).snapshot;
 for(const p of ['a','b','dm'])store.addPlayer('r',p);act('dm','claimDm');
 for(const p of ['a','b'])act(p,'createCharacter',{profession:'medium',bonus:'body'});act('a','caseStart');
 const panel=store.dmPanel('r','dm');assert('investigators' in panel);assert(panel.investigators![0].events.length);
 const publicView=store.snapshot('r','a');assert(!JSON.stringify(publicView).includes('reasons'));assert(!JSON.stringify(publicView).includes('dialogue-gate-history'));assert(!JSON.stringify(publicView.case001!.notebook).includes('ประเสริฐเป็นคน'));
 const sequence=publicView.narrative!.current!.sequence;assert.throws(()=>act('b','dmNarrativeNext',{targetId:'a',sequence}));assert.throws(()=>store.dmPanel('r','b'));
 const after=act('dm','dmNarrativeNext',{targetId:'a',sequence});assert.equal(after.case001!.time,publicView.case001!.time);assert(store.snapshot('r','a').narrative!.current!.sequence>sequence);
 assert.deepEqual(store.dmPreview('r','dm','a'),store.snapshot('r','a'));
});

test('NPC dossiers are available only through the DM panel',()=>{
 const store=new WorldStore(()=>20,true,true,true);store.create('private',2);let n=0;
 const act=(p:string,type:string,payload:object={})=>store.apply('private',p,{id:String(++n),type,...payload});
 for(const p of ['dm','a','b'])store.addPlayer('private',p);
 act('dm','claimDm');act('a','createCharacter',{profession:'medium'});act('b','createCharacter',{profession:'field_medic'});
 act('dm','caseStart',{mode:'story'});
 const panel=store.dmPanel('private','dm');assert('npcDossiers' in panel && panel.npcDossiers);
 assert(panel.npcDossiers.some(npc=>npc.name==='นายวิชัย' && npc.secret));
 assert(panel.npcDossiers.every(npc=>npc.roleplay));
 assert.throws(()=>store.dmPanel('private','a'));
 const player=JSON.stringify(store.snapshot('private','a'));
 for(const npc of panel.npcDossiers) {assert(!player.includes(npc.secret));assert(!player.includes(npc.roleplay));}
 assert(!player.includes('npcDossiers'));
});
