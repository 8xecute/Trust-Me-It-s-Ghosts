import type {CaseNotebookView} from '@baan/shared';
export function CaseNotebook({view}:{view?:CaseNotebookView}) {
 if(!view)return null;
 return <section className="case-notebook" aria-label="เป้าหมายและสมุดคดี">
  <p className="objective-line"><strong>เป้าหมายตอนนี้</strong> {view.objective}</p>
  <details><summary>สมุดคดี · ยืนยันแล้ว {view.confirmed.length} · ข้อสันนิษฐาน {view.suspected.length}</summary>
   {([['confirmed','ยืนยันแล้ว'],['suspected','ข้อสันนิษฐาน'],['unknown','ยังไม่ทราบ']] as const).map(([key,label])=><section key={key}><h3>{label}</h3>
    {view[key].length?<ul>{view[key].map(item=><li key={item.id}><p>{item.text}</p><small>ที่มา: {item.source}</small></li>)}</ul>:<p className="note">ยังไม่มีรายการในหมวดนี้</p>}
   </section>)}
  </details>
 </section>;
}
