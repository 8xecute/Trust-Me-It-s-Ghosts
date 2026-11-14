import type { GuidedView, GuidedScene, CaseDmPanel } from '../../network/onlineTypes';
import {useState} from 'react';
import { DmScript } from '../gm/DmScript';

export function GuidedPanel({view,scenes,events,npcDossiers,connected,action,isDm=false,dmNavigation=true,showStory=true}:{
 view:GuidedView;scenes?:GuidedScene[];connected:boolean;isDm?:boolean;dmNavigation?:boolean;showStory?:boolean;
 npcDossiers?:CaseDmPanel['npcDossiers'];events?:CaseDmPanel['storyEvents'];
 action:(type:string,payload?:object,onSuccess?:()=>void)=>void;
}) {
 if(!isDm)return null;
 const send=(command:string,target?:string)=>action('guided',{command,target});
 return <section className="case-notebook guided-panel" aria-label="การดำเนินบท">
   {showStory && <><h3>{view.phase==='FINAL'?'ช่วงท้าย':view.phase==='ENDING'?'บทสรุป':'บท '+view.phase} · {view.scene}</h3>
   {view.cue ? <p className="story-text">{view.cue}</p> : <p>รอผู้ดำเนินเรื่องเปิดบทให้ทีมสังเกต</p>}</>}
   {isDm && <>
     {events && <DmStoryEvents events={events} connected={connected} action={action}/>}
     {dmNavigation && view.scene==='B3' && <button disabled={!connected} onClick={()=>send('protect')}>{view.version==='5.5'?'DM อนุญาตให้ต้นเล่า':'ยืนยันจัดที่คุยส่วนตัวและคุ้มครองต้นแล้ว'}</button>}
     {scenes?.filter(scene=>scene.id===view.scene).map(scene=><section className="gm-current-scene" key={scene.id}>
       <h4>บทฉากปัจจุบัน · {scene.id}</h4>
       <p className="note">{scene.sent ? 'ส่งเปิดฉากแล้ว' : 'บทนี้ยังรอส่งให้ผู้เล่น'} · อ่านตามสถานการณ์และส่งจากหน้าดำเนินเกม</p>
       {!!npcDossiers?.filter(npc=>scene.script.includes(npc.name.replace(/^นาย/,''))).length && <aside className="gm-acting" aria-label="แนวทางสวมบท NPC">
         <h5>ตัวละครที่กล่าวถึง · อารมณ์และวิธีสวมบท</h5><p className="note">แนวทางเริ่มต้น ปรับตามสิ่งที่เกิดขึ้นในเกม</p>
         {npcDossiers.filter(npc=>scene.script.includes(npc.name.replace(/^นาย/,''))).map(npc=><p key={npc.id}><strong>{npc.name}</strong> · {npc.roleplay}</p>)}
       </aside>}
       <DmScript text={scene.script}/>
     </section>)}
     {scenes && <details><summary>ฉากย่อยอื่นในบทปัจจุบัน</summary>
       {scenes?.filter(scene=>scene.id!==view.scene).map(scene=><details key={scene.id}><summary>{scene.id} · {scene.cue} {scene.sent && <span className="dm-sent-mark">✓ ส่งเปิดฉากแล้ว</span>}</summary>
         {view.phase!=='ENDING' && <button disabled={!connected} onClick={()=>send('scene',scene.id)}>เปิดฉากนี้ให้ DM เตรียมส่ง</button>}
         <DmScript text={scene.script}/>
       </details>)}
     </details>}
     {dmNavigation && <button disabled={!connected || !!view.transition || view.phase==='FINAL' || view.phase==='ENDING'} onClick={()=>send('propose')}>เตรียมสมุดคดีเพื่อไปบทต่อไป</button>}
   </>}
   {showStory && (!isDm || dmNavigation) && view.transition && <section className="narration-card" aria-label="ยืนยันเปลี่ยนบท">
     <h3>สรุปก่อนออกบท {view.transition.from}</h3>
     <Journal journal={view.transition}/>
     <p>เมื่อยืนยันแล้ว ทีมจะปิดบทนี้และเดินหน้าต่อ</p>
     <button disabled={!connected} onClick={()=>send('cancel')}>สำรวจต่อในบทนี้</button>
     <p>DM เลือกเปิดฉากถัดไปจากหน้าดำเนินเกม</p>
   </section>}
   {showStory && !!view.journals.length && <details><summary>สมุดคดีจากบทก่อน · {view.journals.length}</summary>
     {view.journals.map(journal=><section key={journal.phase}><h4>บท {journal.phase}</h4><Journal journal={journal}/></section>)}
   </details>}
 </section>;
}
export function DmStoryEvents({events,connected,action,dialogue=false,expanded=false}:{dialogue?:boolean;expanded?:boolean;events:NonNullable<CaseDmPanel['storyEvents']>;connected:boolean;action:(type:string,payload?:object)=>void}) {
 const [selected,setSelected]=useState('');
 if(!events.length)return null;
 const event=events.find(event=>event.id===selected);
 const items=<div className="dm-event-actions">
  <label>ทีมทำอะไรสำเร็จหรือเกิดเหตุใดขึ้นแล้ว
   <select value={event?.id ?? ''} disabled={!connected} onChange={event=>setSelected(event.target.value)}>
    <option value="">เลือกผลที่เกิดขึ้นจริง</option>
    {events.map(event=><option key={event.id} value={event.id}>{event.label}</option>)}
   </select>
  </label>
  {event && <div className="dm-event-action">
   <h4>{event.label}</h4>
   {event.when && <p><strong>กดเมื่อ</strong> {event.when}</p>}
   {event.detail && <p className="note">{event.detail}</p>}
   <p><strong>หลังกด</strong> {event.effect ?? (dialogue?'เปิดบทนี้ให้เลือกส่ง':'บันทึกเหตุการณ์นี้ตามที่ยืนยัน')}</p>
   <button type="button" disabled={!connected} onClick={()=>{action('guided',{command:'v51:'+event.id});setSelected('');}}>{dialogue?'ยืนยันเปิดใช้บทนี้':'ยืนยันบันทึกผล'}</button>
  </div>}
 </div>;
 if(expanded)return items;
 return <details className="dm-secondary-disclosure"><summary>{dialogue?'เตรียมบทพูดเสริม':'บันทึกผลที่เกิดขึ้นจริง'}</summary>{items}</details>;
}

function Journal({journal}:{journal:{known_facts:string[];open_questions:string[];next_destination_rationale:string}}) {
 return <>
   <h4>ข้อมูลที่ทีมได้รับ</h4><p>คำให้การยังต้องเทียบกับหลักฐาน</p><ul>{journal.known_facts.map((text,i)=><li key={i}>{text}</li>)}</ul>
   <h4>ยังสงสัย</h4>{journal.open_questions.length ? <ul>{journal.open_questions.map((text,i)=><li key={i}>{text}</li>)}</ul> : <p>ยังไม่มีคำถามที่ทีมบันทึกไว้</p>}
   <h4>เหตุผลที่ไปต่อ</h4><p>{journal.next_destination_rationale}</p>
 </>;
}
