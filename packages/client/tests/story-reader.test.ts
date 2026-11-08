import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DmScript} from '../src/ui/gm/DmScript';

test('scene reader exposes conditional dialogue while keeping DM secrets and dice folded',()=>{
 const source=readFileSync(new URL('../../server/scenarios/case-001/case-001.v4.3.script.md',import.meta.url),'utf8');
 const scene=source.match(/^### A2 — [^\n]+\n([\s\S]*?)(?=^### A3 )/m)![1];
 const html=renderToStaticMarkup(createElement(DmScript,{text:scene}));
 assert.match(html,/<section class="gm-script-response"><h5>หากถามประเสริฐ<\/h5>/);
 assert.match(html,/ผม\.\.\. ได้ยินครับ/);
 assert.match(html,/<details class="gm-script-rule">/);
 const secret=renderToStaticMarkup(createElement(DmScript,{text:'**[DM ลับ]** ข้อความลับ'}));
 assert.match(secret,/<details class="gm-script-secret">/);
});

test('latest event is not visually clamped',()=>{
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const rule=css.match(/\.player-shell \.case-response \.story-text\s*\{([^}]*)\}/)?.[1];
 assert.ok(rule);assert.doesNotMatch(rule,/line-clamp|overflow\s*:\s*hidden/);
});
