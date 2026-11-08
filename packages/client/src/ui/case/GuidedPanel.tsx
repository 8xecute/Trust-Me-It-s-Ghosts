import type { GuidedView, GuidedScene } from '../../network/onlineTypes';
import { DmScript } from '../gm/DmScript';

export function GuidedPanel({view,scenes,events,storyState,connected,action,isDm=false}:{
 view:GuidedView;scenes?:GuidedScene[];connected:boolean;isDm?:boolean;site?:string;
 events?:{id:string;label:string}[];storyState?:Record<string,unknown>;
 action:(type:string,payload?:object,onSuccess?:()=>void)=>void;
}) {
 const send=(command:string,target?:string)=>action('guided',{command,target});
 return <section className="case-notebook guided-panel" aria-label="การดำเนินบท">
   <h3>บท {view.phase} · ฉาก {view.scene}</h3>
   {view.version==='5.1' && <p>Story v5.1 · {view.lethal?'Lethal Variant เปิด':'Lethal Variant ปิด'}</p>}
   {view.cue ? <p className="story-text">{view.cue}</p> : <p>รอผู้ดำเนินเรื่องเปิดบทให้ทีมสังเกต</p>}
   {!isDm && view.prompts.length>0 && <div aria-label="หัวข้อสงสัย">
     <p className="note">หัวข้อชวนคุยกับผู้ดำเนินเรื่อง</p>
     <ul>{view.prompts.slice(0,3).map(text=><li key={text}>{text}</li>)}</ul>
   </div>}
   {view.canAnalyzeHistory && <button disabled={!connected} onClick={()=>send('history')}>อ่านบันทึกพร้อมข้อมูลประกอบ · ไม่ต้องทอย</button>}
   {!isDm && view.escorting>0 && <button disabled={!connected} onClick={()=>send('evacuate')}>พาผู้ที่กำลังช่วยไปจุดปลอดภัย · {view.escorting} คน</button>}
   {isDm && <>
     {events && <details><summary>บันทึกเหตุจริงและเงื่อนไขบท · เฉพาะ DM</summary>
       <p>ยืนยันเฉพาะการกระทำที่เกิดขึ้นจริง ใช้ Core/Combat เดิมตัดสินระยะและผลการป้องกันก่อนบันทึก</p>
       {events.map(event=><details key={event.id}><summary>{event.label}</summary><button disabled={!connected} onClick={()=>send('v51:'+event.id)}>ยืนยันเหตุนี้เกิดจริง</button></details>)}
     </details>}
     {storyState && <details><summary>สถานะคดี · เฉพาะ DM</summary><pre>{JSON.stringify(storyState,null,2)}</pre></details>}
     {view.scene==='B3' && <button disabled={!connected} onClick={()=>send('protect')}>ยืนยันจัดที่คุยส่วนตัวและคุ้มครองต้นแล้ว</button>}
     <details><summary>ฉากย่อยในบทปัจจุบัน</summary>
       {scenes?.map(scene=><details key={scene.id}><summary>{scene.id} · {scene.cue} {scene.sent && <span className="dm-sent-mark">✓ ส่งเปิดฉากแล้ว</span>}</summary>
         {view.phase!=='ENDING' && <button disabled={!connected} onClick={()=>send('scene',scene.id)}>เปิดฉากนี้ให้ DM เตรียมส่ง</button>}
         <DmScript text={scene.script}/>
       </details>)}
     </details>
     <button disabled={!connected || !!view.transition || view.phase==='FINAL' || view.phase==='ENDING'} onClick={()=>send('propose')}>เตรียมสมุดคดีเพื่อไปบทต่อไป</button>
   </>}
   {view.transition && <section className="narration-card" aria-label="ยืนยันเปลี่ยนบท">
     <h3>สรุปก่อนออกบท {view.transition.from}</h3>
     <Journal journal={view.transition}/>
     <p>เมื่อยืนยันแล้ว ทีมจะปิดบทนี้และเดินหน้าต่อ</p>
     <button disabled={!connected} onClick={()=>send('cancel')}>สำรวจต่อในบทนี้</button>
     {!isDm && <button className="primary" disabled={!connected} onClick={()=>send('confirm',view.transition!.id)}>ยืนยันไปบท {view.transition.to}</button>}
     {isDm && <p>รอผู้สืบสวนยืนยันให้ทีมเดินทาง</p>}
   </section>}
   {!!view.journals.length && <details><summary>สมุดคดีจากบทก่อน · {view.journals.length}</summary>
     {view.journals.map(journal=><section key={journal.phase}><h4>บท {journal.phase}</h4><Journal journal={journal}/></section>)}
   </details>}
 </section>;
}
function Journal({journal}:{journal:{known_facts:string[];open_questions:string[];next_destination_rationale:string}}) {
 return <>
   <h4>ข้อมูลที่ทีมได้รับ</h4><p>คำให้การยังต้องเทียบกับหลักฐาน</p><ul>{journal.known_facts.map((text,i)=><li key={i}>{text}</li>)}</ul>
   <h4>ยังสงสัย</h4>{journal.open_questions.length ? <ul>{journal.open_questions.map((text,i)=><li key={i}>{text}</li>)}</ul> : <p>ยังไม่มีคำถามที่ทีมบันทึกไว้</p>}
   <h4>เหตุผลที่ไปต่อ</h4><p>{journal.next_destination_rationale}</p>
 </>;
}
