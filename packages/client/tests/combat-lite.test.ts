import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { liteAttack, liteDefense, liteGhostHP } from '../../shared/src/combatLite.js';

test('Combat Lite defense and guard use BODY and RES independently', () => {
  const stats = {BODY:2, PER:4, INT:5, SOC:4, SPI:1, RES:2};
  assert.equal(liteDefense(stats, 'PDEF'), 12);
  assert.equal(liteDefense(stats, 'MDEF', true), 14);
});

test('Combat Lite scales ghost HP for two to four players', () => {
  assert.deepEqual([2,3,4,5,6].map(n => liteGhostHP(9,n)), [9,14,18,23,27]);
  assert.throws(() => liteGhostHP(9,7));
});

test('Combat Lite uses one roll, without automatic criticals, and blocks physical damage to incorporeal ghosts', () => {
  const attack = {bonus:3, defense:12, damage:2, physical:true, manifestation:'MANIFESTED' as const};
  assert.equal(liteAttack({...attack, roll:9}).damage, 2);
  assert.equal(liteAttack({...attack, roll:8}).damage, 0);
  assert.equal(liteAttack({...attack, roll:20, defense:24}).hit, false);
  assert.equal(liteAttack({...attack, roll:20, manifestation:'INCORPOREAL'}).damage, 0);
  assert.throws(() => liteAttack({...attack, roll:21}));
});
