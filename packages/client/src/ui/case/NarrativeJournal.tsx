import type { NarrativeView } from '@baan/shared';
export function NarrativeJournal({view,onNext}:{view?:NarrativeView;onNext?:(sequence:number)=>void}) {
 if(!view?.current) return null;
 const beat=view.current;
 return <section className="narration-card" aria-label="บทเล่าและประวัติคดี">
  <h3>บทเล่า · พื้นที่ {beat.site}</h3>
  <p className="note">{beat.scope==='party'?'ข้อมูลที่ทีมแบ่งปัน':'เหตุการณ์ในพื้นที่'} · จากผู้สืบสวนในพื้นที่</p>
  <p className="story-text" aria-live="polite">{beat.text}</p>
  {onNext && view.pending>0 && <button onClick={()=>onNext(beat.sequence)}>อ่านต่อ · อีก {view.pending} รายการ</button>}
  <details><summary>ประวัติคดี · {view.history.length} รายการล่าสุด</summary>
   <ol>{view.history.map(entry=><li key={entry.sequence}><strong>พื้นที่ {entry.site} · {entry.scope==='party'?'ทีมแบ่งปัน':'เหตุการณ์ในพื้นที่'}</strong><p>{entry.text}</p></li>)}</ol>
  </details>
 </section>;
}
