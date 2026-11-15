import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('./DM-ONLY.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]+)<\/script>/)[1];
assert.ok(!html.includes('__LEDGER__') && !html.includes('__CUE__'));
const storage=new Map();
function start(){
 const nodes=new Map(),checks=[];let blob;
 const element=()=>({hidden:false,textContent:'',value:'',dataset:{},children:[],replaceChildren(){this.children=[];},append(n){this.children.push(n);},click(){}});
 for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],element());
 for(const match of html.matchAll(/data-mark="([^"]+)"/g)){const node=element();node.dataset.mark=match[1];checks.push(node);}
 const document={getElementById:id=>{assert.ok(nodes.has(id),id);return nodes.get(id);},querySelectorAll:()=>checks,createElement:element};
 vm.runInNewContext(script,{document,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,val)=>storage.set(key,val)},Date,Blob,URL:{createObjectURL:val=>{blob=val;return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn(),FormData:class{constructor(form){return Object.entries(form.fields)[Symbol.iterator]();}}});
 return {nodes,checks,blob:()=>blob};
}
const page=start(),ledger=page.nodes.get('ledger');
assert.equal(page.checks.length,8);
assert.ok(ledger.children.every(n=>n.dataset.done==='false'));
assert.equal(storage.size,0,'reading the page must not mark any answer as delivered');
const check=page.checks[1];check.checked=true;check.onchange();
assert.equal(ledger.children.filter(n=>n.dataset.done==='true').length,1);
assert.ok(start().checks.find(n=>n.dataset.mark===check.dataset.mark).checked);
check.checked=false;check.onchange();assert.ok(ledger.children.every(n=>n.dataset.done==='false'));
page.nodes.get('next-plan').oninput({target:{value:'ทีมเสนอแผนเอง'}});
assert.ok(ledger.children.every(n=>n.dataset.done==='false'),'typing a plan must not confirm it');
const form=page.nodes.get('dm-feedback');form.fields={boundary:'3',recording:'4',roleplay:'2'};
form.onsubmit({preventDefault(){},currentTarget:form});
const report=JSON.parse(await page.blob().text());assert.equal(report.format,'ghosts-a1-dm-feedback');
assert.equal(report.notes.nextPlan,'ทีมเสนอแผนเอง');assert.equal(report.feedback.boundary,'3');
assert.deepEqual(readdirSync(new URL('./public/',import.meta.url)),['index.html']);
for(const text of ['fetch(','XMLHttpRequest','WebSocket','game:action'])assert.ok(!html.includes(text),text);
console.log('PASS: read without mutation, explicit marks, undo marks, reload persistence, plan not auto-confirmed, feedback JSON, no public DM file or game/network actions');
