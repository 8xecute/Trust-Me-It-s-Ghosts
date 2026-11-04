import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor, transition, initialObjects } from '../src/game/objects';
test('open and close preserve state; locked objects cannot open',()=>{ const box=initialObjects[0]; assert.equal(transition(box,'open').state,'open'); assert.equal(transition(transition(box,'open'),'close').state,'closed'); assert.equal(transition(initialObjects[1],'open').state,'locked'); });
test('evidence can only be collected once and identifiers are unique',()=>{ const ids=initialObjects.flatMap(o=>o.evidenceId?[o.evidenceId]:[]); assert.equal(new Set(ids).size,ids.length); const item=transition(initialObjects[2],'collect'); assert.equal(item.collected,true); assert.equal(actionsFor(item).includes('collect'),false); assert.equal(transition(item,'collect'),item); });
