import type {NarrativeBeat} from '@baan/shared';
import type {GuidedView} from '../../network/onlineTypes';
import './CaseStoryThread.css';

export function CaseStoryThread({view,beats,isDm=false,showHistory=false,onHistory}:{
 view:GuidedView;beats:NarrativeBeat[];isDm?:boolean;showHistory?:boolean;
 onHistory?:()=>void;
}) {
 const ordered=[...beats].sort((a,b)=>a.sequence-b.sequence);
 const latest=ordered.at(-1);
 const sceneOf=(beat:NarrativeBeat)=>beat.scene ?? (beat.eventId.startsWith('guided-cue:')?beat.eventId.slice('guided-cue:'.length):undefined);
 const sameScene=latest && sceneOf(latest)===view.scene;
 const currentBeats=ordered.filter(beat=>sceneOf(beat)===view.scene && beat.eventId!=='guided-cue:'+view.scene && beat.text!==view.cue);
 const next=view.transition?.to;
 const destination=next==='FINAL'?'ช่วงท้าย':'บท '+next;
 return <section className="case-story-thread" aria-label="เส้นเรื่องของทีม">
  <header><span>เส้นเรื่องของทีม</span><strong>{isDm?(view.title ? view.scene+' · '+view.title : view.phase==='ENDING'?'บทสรุป':'ฉาก '+view.scene):(view.title ?? (view.phase==='ENDING'?'บทสรุป':'เรื่องราวของทีม'))}</strong></header>
  {view.previousLead && <p className="case-thread-bridge"><strong>เหตุผลที่มาถึงช่วงนี้</strong> {view.previousLead}</p>}
  {!view.cue && view.phase!=='ENDING' && <p className="case-thread-bridge" role="status">ฉากนี้ยังรอ DM จ่ายบทเปิด</p>}
  {!showHistory && view.cue && <div className="case-thread-latest">
   <h4>เปิดฉากนี้</h4><p className="story-text">{view.cue}</p>
  </div>}
  {!showHistory && currentBeats.length>0 && <ol className="case-thread-history" aria-label="เหตุการณ์ในฉากนี้ตามลำดับ">
   {currentBeats.map(beat=><li key={beat.sequence}><p className="story-text">{beat.text}</p></li>)}
  </ol>}
  {!showHistory && !view.cue && latest && <div className="case-thread-latest" aria-live="polite">
   <h4>{sameScene?'เรื่องล่าสุดในฉากนี้':latest.scope==='party'?'เรื่องที่ทีมได้รับล่าสุด':'เรื่องล่าสุดที่คุณได้รับ'}{isDm && !sameScene && sceneOf(latest) ? ' · '+sceneOf(latest) : ''}</h4>
   <p className="story-text">{latest.text}</p>
  </div>}
  {isDm && view.transition && <section className="case-thread-handoff" aria-label="สรุปก่อนเปลี่ยนบท">
   <h4>DM ยืนยันไป{destination}</h4>
   <p>{view.transition.next_destination_rationale}</p>
   <details><summary>ทวนสิ่งที่ทีมรู้ก่อนเดินทาง</summary>
    <ul>{view.transition.known_facts.map((fact,index)=><li key={index}>{fact}</li>)}</ul>
   </details>
  </section>}
  {showHistory && ordered.length>0 && <ol className="case-thread-history">
   {ordered.map(beat=><li key={beat.sequence}>{isDm && <small>{sceneOf(beat)?'ฉาก '+sceneOf(beat):'พื้นที่ '+beat.site}</small>}<p>{beat.text}</p></li>)}
  </ol>}
  {onHistory && latest && <button type="button" onClick={onHistory}>ย้อนอ่านเรื่องตามลำดับ</button>}
 </section>;
}
