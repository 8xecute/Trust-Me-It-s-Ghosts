import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCharacter, type Background } from '@baan/shared';
import { applyCaseAction, newCase, type CaseState } from '../src/case001/case001.js';

test('all legacy backgrounds are inert and cannot grant a bonus', () => {
  const setups: [Background, string, Partial<CaseState>][]=[
    ['rural_native','clue:E01',{site:'C'}],
    ['journalist','clue:E02',{site:'C'}],
    ['skeptic','clue:E03',{site:'D'}],
    ['technician','open',{site:'E',key:true}],
    ['rescuer','escort:ดล',{site:'E',opened:true}],
    ['temple_student','seal2',{site:'D',evidence:['E03']}],
  ];
  for (const [background,id,state] of setups) {
    const character=createCharacter('ritual_specialist','mind',{talent:'ritual_zone',background});
    let used=0;
    const actor={character,boost:'background' as const,backgroundUsed:false,onBoost:()=>{used++;}};
    const start={...newCase(),...state};
    assert.equal('background' in character,false);
    const legacy={...actor,character:{...character,background}};
    assert.throws(()=>applyCaseAction(start,id,()=>{throw Error('must not roll');},legacy),/ภูมิหลัง/);
    assert.equal(used,0);
    assert.throws(()=>applyCaseAction(start,id,()=>7,{...actor,backgroundUsed:true}));
    assert.throws(()=>applyCaseAction(start,'travel:A',()=>7,actor));
  }
});

test('a failed investigation leaves the clue reachable through a follow-up', () => {
  const character=createCharacter('ritual_specialist','mind');
  const actor={character,backgroundUsed:false,onBoost:()=>{}};
  const failed=applyCaseAction({...newCase(),site:'C'},'clue:E01',()=>1,actor);
  assert.deepEqual(failed.evidence,[]);
  const retried=applyCaseAction(failed,'clue:E01',()=>{throw Error('follow-up does not roll');},actor);
  assert.deepEqual(retried.evidence,['E01']);
  assert.equal(retried.minute,20);
});

test('deception, spirit sense, diagnostic and anomaly hint obey role and scene conditions', () => {
  const detective=createCharacter('paranormal_investigator','body',{talent:'detect_deception',background:'journalist'});
  const medium=createCharacter('medium','body');
  const engineer=createCharacter('occult_engineer','knowledge');
  let used=0;
  const base={backgroundUsed:false,onBoost:()=>{used++;}};
  const witness={...newCase(),site:'B' as const};
  const grove={...newCase(),site:'D' as const,ghost:'cautious' as const,evidence:['E03']};
  assert.match(applyCaseAction(witness,'clue:E08',()=>6,{...base,character:detective,boost:'deception'}).notice,/รวม 12/);
  assert.throws(()=>applyCaseAction(witness,'sense',()=>20,{...base,character:medium}));
  assert.match(applyCaseAction(grove,'sense',()=>20,{...base,character:medium}).notice,/ผ้ายันต์/);
  assert.match(applyCaseAction({...newCase(),site:'C'},'hint',()=>20,{...base,character:detective}).notice,/รอยเท้า/);
  assert.match(applyCaseAction({...newCase(),site:'E',key:true},'open',()=>6,{...base,character:engineer,boost:'diagnostic'}).notice,/รวม 12/);
  assert.equal(used,4);
});
