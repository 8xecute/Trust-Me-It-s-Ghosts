import {spawn} from 'node:child_process';import {writeFileSync,mkdirSync} from 'node:fs';import path from 'node:path';
const count=Number(process.argv[2]||2);const root=process.cwd(),out=path.join(root,'artifacts','browser-playtest-'+Date.now());mkdirSync(out,{recursive:true});
const storyVersion=process.env.CASE_STORY_VERSION || '4.3';
const children=[];const log=[];let serial=0,ws;let dump=async()=>'';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function start(file,args,cwd,env={}){const p=spawn(file,args,{cwd,env:{...process.env,...env},stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(p);p.stdout.on('data',d=>log.push(String(d)));p.stderr.on('data',d=>log.push(String(d)));return p;}
async function wait(fn,label){for(let i=0;i<100;i++){try{const v=await fn();if(v)return v;}catch{}await delay(150);}throw Error('Timeout: '+label);}
let server;
const launchServer=()=>server=start(process.execPath,['packages/server/dist/index.js'],root,{PORT:'39201',CASE_SAVE_DIR:path.join(out,'saves'),CASE_STORY_VERSION:storyVersion});
try{
 launchServer();await wait(async()=> (await fetch('http://127.0.0.1:39201/healthz')).ok,'server');
 start(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5179','--strictPort'],path.join(root,'packages/client'),{VITE_SERVER_URL:'http://127.0.0.1:39201'});
 await wait(async()=> (await fetch('http://127.0.0.1:5179')).ok,'client');
 start('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=9237','--window-size=1440,1100','--user-data-dir='+path.join(out,'profile'),'about:blank'],root);
 const info=await wait(async()=> (await (await fetch('http://127.0.0.1:9237/json/version')).json()),'chrome');
 ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening')ws.send(JSON.stringify({id:++serial,method:'Page.handleJavaScriptDialog',params:{accept:true},sessionId:m.sessionId}));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
 const cmd=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 async function tab(){const {browserContextId}=await cmd('Target.createBrowserContext');const {targetId}=await cmd('Target.createTarget',{url:'http://127.0.0.1:5179',browserContextId});const {sessionId}=await cmd('Target.attachToTarget',{targetId,flatten:true});await cmd('Runtime.enable',{},sessionId);await cmd('Page.enable',{},sessionId);await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);return sessionId;}
 async function evaluate(t,expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},t);if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
 const text=t=>evaluate(t,'document.body.innerText');
 async function click(t,label,prefix=false){await cmd('Page.bringToFront',{},t);await wait(()=>evaluate(t,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&!b.disabled&&b.textContent.trim()${prefix?'.startsWith('+JSON.stringify(label)+')':'==='+JSON.stringify(label)});if(!b)return false;for(let e=b.parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=true;if(!b.checkVisibility())return false;b.click();return true;})()`),'button '+label);await delay(180);}
 async function set(t,selector,value){await wait(()=>evaluate(t,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`),selector);await delay(120);}
 const dm=await tab(),a=await tab(),b=await tab();const others=[];for(let i=2;i<count;i++)others.push(await tab());dump=async()=>JSON.stringify(await Promise.all([dm,a,b,...others].map(text)));for(const t of [dm,a,b,...others])await wait(async()=> (await text(t)).includes('เชื่อมต่อแล้ว'),'connection');
 await click(dm,'สร้างห้อง');const code=await wait(async()=> (await text(dm)).match(/ห้อง\s*([A-F0-9]{6})/)?.[1],'room code');
 await click(dm,'รับบทผู้ดำเนินเรื่อง');
 for(const [t,role] of [[a,'ritual_specialist'],[b,'medium'],...others.map((t,i)=>[t,['field_medic','occult_engineer','paranormal_investigator','containment_specialist'][i]])]){
  await set(t,'form input[maxlength="6"]',code);await click(t,'เข้าห้อง');await set(t,'.cast-picker select',role);await set(t,'input[placeholder="ชื่อเล่นที่เพื่อนเรียก"]',role==='ritual_specialist'?'QA หนึ่ง':'QA ทีม');await set(t,'.player-names-form .character-name:nth-of-type(2) input',role==='ritual_specialist'?'หมอก':'ตัวละคร '+role);await click(t,'บันทึกชื่อ');await click(t,'ยืนยันตัวละคร');
 }
 await set(a,'.player-names-form .character-name:nth-of-type(2) input','สายหมอก');await click(a,'บันทึกชื่อ');
 await click(dm,'เริ่มคดี 001');await wait(async()=> (await text(b)).includes('QA หนึ่ง (สายหมอก)'),'shared character names');
 const queue=async()=>click(dm,'อ่าน / จ่ายบท',true);
 async function publish(){await queue();await click(dm,'ส่งข้อความนี้ให้ผู้เล่น');}
 async function scene(id){await click(dm,'ฉาก / คู่มือ');await wait(()=>evaluate(dm,`(()=>{const d=[...document.querySelectorAll('details')].find(d=>d.querySelector(':scope > summary')?.textContent.trim().startsWith(${JSON.stringify(id+' ·')}));if(!d)return false;for(let e=d;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=true;const b=[...d.querySelectorAll('button')].find(b=>b.textContent.includes('เปิดฉากนี้'));if(!b)return false;for(let e=b.parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=true;if(!b.checkVisibility())return false;b.click();return true;})()`),'scene '+id);await delay(180);await publish();}
 async function next(){await click(dm,'ฉาก / คู่มือ');await click(dm,'เตรียมสมุดคดีเพื่อไปบทต่อไป');await click(a,'ลงมือทำ',true);await click(a,'ยืนยันไปบท',true);await publish();}
 async function screenshot(t,name){const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},t);writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));}
 await publish();
 await click(dm,'ย้อนต้นบท');await delay(250);
 await click(dm,'เปิดเล่นต่อ');await publish();await click(dm,'พักคดี');await wait(async()=> (await text(a)).includes('พักคดีอยู่'),'pause broadcast');
 await new Promise(r=>{server.once('exit',r);server.kill();});launchServer();await wait(async()=> (await fetch('http://127.0.0.1:39201/healthz')).ok,'restart');
 await wait(async()=> (await text(dm)).includes('เปิดเล่นต่อ'),'restored DM');await click(dm,'เปิดเล่นต่อ');
 await set(dm,'.scene-npc-controls select','prasert');await click(dm,'วางตามตำแหน่ง');await wait(()=>evaluate(a,'!!document.querySelector(".scene-npc")'),'NPC broadcast');await screenshot(dm,'dm-controls');
 if(storyVersion==='5.1'){
  await scene('A3');await screenshot(dm,'v51-dm-scene');await screenshot(a,'v51-player-scene');
  const snapshotText=await text(a);for(const secret of ['contextConfirmed','KAEW_D_RESULT'])if(snapshotText.includes(secret))throw Error('DM data leaked: '+secret);
  await next();
  console.log('PASS: v5.1 browser smoke, '+count+' investigators + DM, separate names and roles, public names, NPC sync, persisted recovery and A to B. Artifacts: '+out);
  writeFileSync(path.join(out,'result.txt'),'PASS v5.1 smoke\nRoom '+code+'\n'+await text(a));
 }else{
 await scene('A3');await click(a,'บทเล่า',true);await wait(async()=>!(await evaluate(a,`!!document.querySelector('[aria-label$="บทที่ยังไม่อ่าน"]')`)),'story read badge clears');await next();await scene('B5');await next();await scene('C2');await wait(()=>evaluate(a,`!!document.querySelector('[aria-label$="หลักฐานใหม่หรืออัปเดต"]')`),'new evidence badge');await click(a,'หลักฐาน / สมุดคดี',true);await wait(async()=>!(await evaluate(a,`!!document.querySelector('[aria-label$="หลักฐานใหม่หรืออัปเดต"]')`)),'evidence badge clears');await next();await scene('D5');await next();
 await scene('E2');await click(a,'ลงมือทำ',true);await click(a,'เปิดกลอนห้องเก็บผลผลิต',true);await publish();
 for(const name of ['ดล','นิด','เพิ่ม'])await click(a,'พา '+name+' ออกจากห้องเก็บผลผลิต',true);
 await click(a,'พาผู้ที่กำลังช่วยไปจุดปลอดภัย',true);
 await scene('E4');await click(a,'พิธีกรรม',true);await evaluate(a,`document.querySelectorAll('.case-actions-pane details').forEach(d=>d.open=true)`);
 for(let retry=0;retry<15;retry++){
  const available=await evaluate(a,`[...document.querySelectorAll('button')].some(b=>b.checkVisibility()&&b.textContent.trim().startsWith('ปลดอาคมที่กำไล'))`);if(!available)break;
  await click(a,'ปลดอาคมที่กำไล',true);await click(dm,'D20',true);await click(dm,'ส่งการ์ดตามคำขอ');await click(a,'ทอย D20');await delay(250);
 }
 await next();await click(a,'ลงมือทำ',true);await click(a,'จัดการภารกิจ',true);
 await click(a,'สรุปผลและปิดคดี',true);
 await evaluate(a,`document.querySelector('dialog button.danger').click()`);await delay(250);await publish();
 await click(a,'รายงาน');await click(b,'รายงาน');for(const t of others)await click(t,'รายงาน');
 await wait(async()=> (await text(a)).includes('ตอนจบ'),'report a');await wait(async()=> (await text(b)).includes('ตอนจบ'),'report b');
 for(const t of others)await wait(async()=> (await text(t)).includes('ตอนจบ'),'additional player ending');
 await screenshot(a,'player-a-ending');await screenshot(b,'player-b-ending');
 console.log('PASS: '+count+' investigators + DM in isolated browser sessions, live NPC sync, pause, server restart/resume, A to Final, E2 rescue and delivered ending report. Artifacts: '+out);
 writeFileSync(path.join(out,'result.txt'),'PASS\nRoom '+code+'\n'+await text(a));
 }
}catch(error){writeFileSync(path.join(out,'error.txt'),String(error)+'\n'+await dump());console.error(error);process.exitCode=1;}finally{writeFileSync(path.join(out,'process.log'),log.join(''));ws?.close();for(const p of children.reverse())p.kill();}
