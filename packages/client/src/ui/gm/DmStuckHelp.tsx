import type {CaseDmPanel} from '../../network/onlineTypes';

export function DmStuckHelp({backup,onReadGuide}:{backup:CaseDmPanel['backup'];onReadGuide:()=>void}) {
 if(!backup)return null;
 const exit=backup.exit.trim();
 const hints=[...new Set(backup.hints.map(text=>text.trim()).filter(Boolean))].filter(text=>text!==exit);
 const alternatives=[...new Set(backup.alternatives.map(text=>text.trim()).filter(Boolean))].filter(text=>text!==exit && !hints.includes(text));
 return <details className="dm-stuck-help" key={backup.scene}>
  <summary>ทีมติดขัด? ดูวิธีไปต่อ <span>{backup.scene}</span></summary>
  <div className="dm-stuck-content">
   {!backup.opened?<p className="inline-notice">ส่งบทเปิดฉากด้านบนก่อน เพื่อให้ทีมมีข้อมูลเริ่มต้น</p>:<>
    {backup.battle?<p>กำลังเผชิญหน้า ให้ดำเนินตามคิวและการกระทำที่ใช้ได้บนหน้าดำเนินเกม</p>:exit && <section><h4>พลาดหรือไม่ตรวจ ก็ไปต่ออย่างไร</h4><p>{exit}</p></section>}
    {hints.length>0 && <section><h4>ย้ำสิ่งที่สังเกตได้ในฉากนี้</h4>{hints.map(text=><p key={text}>{text}</p>)}</section>}
    {alternatives.length>0 && <section><h4>แหล่งข้อมูลสำรอง</h4>{alternatives.map(text=><p key={text}>{text}</p>)}</section>}
   </>}
   {backup.blockers.length>0 && <section className="dm-stuck-blockers"><h4>ก่อนเดินเรื่องต่อ</h4><ul>{backup.blockers.map(text=><li key={text}>{text}</li>)}</ul></section>}
   <footer><p className="note">เฉพาะ DM · ใช้เมื่อเข้าเงื่อนไขจริง การเปิดอ่านไม่ส่งข้อความหรือเปลี่ยนผลคดี</p><button type="button" onClick={onReadGuide}>เปิดคู่มือฉาก</button></footer>
  </div>
 </details>;
}
