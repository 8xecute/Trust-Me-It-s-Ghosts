import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GameHud} from '../src/ui/combat/GameHud';
test('turn HUD presents remaining action and resources without legacy AP or haunt',()=>{
 const html=renderToStaticMarkup(createElement(GameHud,{hp:10,sanity:8,focus:3,ap:2,haunt:7,turnMode:true,actionStatus:'เหลือ 1 การกระทำ'}));
 assert.match(html,/เหลือ 1 การกระทำ/);assert.match(html,/สมาธิ/);assert.match(html,/>3</);
 assert.doesNotMatch(html,/แต้ม AP|ความหลอน|สำรวจ/);
});
test('legacy HUD retains its AP and haunt display',()=>{
 const html=renderToStaticMarkup(createElement(GameHud,{ap:2,haunt:7}));
 assert.match(html,/แต้ม AP/);assert.match(html,/2\/3/);assert.match(html,/ความหลอน/);assert.match(html,/7\/10/);
});
