import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newCase} from '../src/case001/case001.js';
import {newGuided,guidedCommand} from '../src/case001/guidedCase.js';
import {newState51,dmOptions51,command51,wichaiHere51} from '../src/case001/storyV51.js';
import type {World} from '../src/world.js';
import {addFact} from '../src/case001/caseStory.js';

function fixture(scene='E4') {
 const s=newCase(true,4,'4.1');
 s.guided=newGuided('5.5');s.guided.phase='E';s.guided.scene=scene;s.guided.presented=[scene];
 s.v51=newState51(false,true);s.site='E';s.key=true;s.v51.bagSearched=true;
 const w={case001:s,humanDmId:'dm',players:{},characters:{}} as unknown as World;
 return {s,w};
}

test('v5.5 reads the gate source without duplicate collection or unsupported people proof',()=>{
 const {s,w}=fixture();
 assert.ok(dmOptions51(s).some(o=>o.id==='read-gate:E4'));
 assert.ok(!dmOptions51(s).some(o=>o.id==='collect-flood'));
 command51(w,'read-gate:E4');
 assert.equal(s.v51!.floodSources53?.gate,true);
 assert.equal(s.v51!.FLOOD_EVIDENCE_COLLECTED,true);
 assert.ok(s.evidence.includes('E07'));
 s.guided!.scene='H1';s.guided!.presented.push('H1');s.v51!.floodSources53!.shelter=true;
 assert.ok(!dmOptions51(s).some(o=>o.id==='flood-people-proven'));
 assert.throws(()=>command51(w,'flood-people-proven'));
 assert.equal(s.v51!.floodSources53!.peopleProven,undefined);
});

test('recording a Wichai route never substitutes for actual arrival',()=>{
 const {s,w}=fixture();
 command51(w,'wichai-route:called');
 assert.equal(wichaiHere51(s),false);
 assert.ok(dmOptions51(s).some(o=>o.id==='wichai-arrived'));
 command51(w,'wichai-arrived');
 assert.equal(wichaiHere51(s),true);
});

test('v5.5 rejects contacting Prasert in H1 or before the ritual stops',()=>{
 const {s,w}=fixture('H1');
 assert.throws(()=>guidedCommand(w,'dm','contactPrasert'));
 s.guided!.scene='F5';s.guided!.phase='FINAL';s.guided!.presented.push('F5');
 addFact(s,'gate-truth');
 assert.throws(()=>guidedCommand(w,'dm','contactPrasert'));
 s.v51!.RITUAL_STATUS='stopped';
 assert.doesNotThrow(()=>guidedCommand(w,'dm','contactPrasert'));
 assert.equal(s.guided!.prasertContact,true);
 assert.equal(s.v51!.pastDisclosed,false);
 assert.throws(()=>guidedCommand(w,'dm','contactPrasert'));
});
