import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const html=readFileSync(new URL('./player.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]+)<\/script>/)[1];
const storage=new Map();
function start(store=storage){
 const nodes=new Map();let lastBlob;
 function element(){return {textContent:'',value:'',hidden:false,dataset:{},children:[],append(n){this.children.push(n);},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},focus(){},click(){},showModal(){this.open=true;},close(){this.open=false;}};}
 for(const id of html.matchAll(/id="([^"]+)"/g))nodes.set(id[1],element());
 nodes.get('note-kind').value='observed';
 nodes.get('note-form').reset=()=>{for(const name of ['title','body','source'])nodes.get('note-'+name).value='';nodes.get('note-kind').value='observed';};
 const document={getElementById:id=>{assert.ok(nodes.has(id),id);return nodes.get(id);},createElement:element};
 const context={document,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID},Date,Math,Blob,
  URL:{createObjectURL:b=>{lastBlob=b;return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn(),FormData:class{constructor(form){return Object.entries(form.fields)[Symbol.iterator]();}}};
 vm.runInNewContext(script,context);return {nodes,blob:()=>lastBlob};
}
const page=start(),n=page.nodes;
function submitNote(title,kind='observed'){
 n.get('note-kind').value=kind;n.get('note-title').value=title;n.get('note-body').value='<img src=x onerror=alert(1)>';
 n.get('note-source').value='DM';n.get('note-form').onsubmit({preventDefault(){}});
}
submitNote('ตรวจแฟ้ม');assert.equal(n.get('note-count').textContent,'1');
let card=n.get('notes-list').children[0];assert.equal(card.children[2].textContent,'<img src=x onerror=alert(1)>');
card.children.at(-1).children[0].onclick();submitNote('แก้เป็นคำถามค้าง','guess');
assert.equal(n.get('note-count').textContent,'1');assert.equal(n.get('notes-list').children[0].dataset.kind,'guess');
n.get('notes-list').children[0].children.at(-1).children[1].onclick();assert.equal(n.get('note-count').textContent,'0');
n.get('undo-delete').onclick();assert.equal(n.get('note-count').textContent,'1');
assert.equal(start().nodes.get('note-count').textContent,'1');
const form=n.get('feedback-form');form.fields={nickname:'test',understoodGoal:'test',nextAction:'test',clarity:'3',freedom:'4',curiosity:'3'};
form.onsubmit({preventDefault(){},currentTarget:form});
let report=JSON.parse(await page.blob().text());assert.equal(report.format,'ghosts-a1-playtest-feedback');assert.equal(report.noteCount,1);assert.ok(!('notes' in report));
form.fields.includeNotes='on';form.onsubmit({preventDefault(){},currentTarget:form});report=JSON.parse(await page.blob().text());assert.equal(report.notes.length,1);
for(const text of ['แม่แก้ว','วิชัย','กำไล','2534','fetch(','WebSocket','XMLHttpRequest'])assert.ok(!html.includes(text),text);
const unavailable={get(){throw Error('storage unavailable');},set(){throw Error('storage unavailable');}};
assert.equal(start(unavailable).nodes.get('storage-warning').hidden,false);
console.log('PASS: note create/edit/delete/undo/persistence, text escaping, feedback JSON, opt-in notes, no secret payload, storage fallback');
