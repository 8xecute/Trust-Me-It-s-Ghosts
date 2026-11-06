import type { DmLogEntry } from '@baan/shared';

const logLabels:Record<DmLogEntry['kind'],string> = {
  travel:'พาทีมเดินทาง', question:'ส่งคำถาม', answer:'จ่ายคำตอบ', dismissed:'ปิดคำถาม', narration:'จ่ายบทเล่า',
  'roll-requested':'ขอทอย', 'roll-result':'ผลทอย', 'roll-canceled':'ยกเลิกการทอย',
  'check-requested':'ขอทดสอบจากฉาก', 'check-canceled':'ปิดคำขอทดสอบ',
};

export function DmHistory({entries,playerName,roomCode}:{entries:DmLogEntry[];playerName:(id:string)=>string;roomCode?:string}) {
  function download() {
    const lines=entries.map(entry=>[
      entry.sequence, logLabels[entry.kind], playerName(entry.actor),
      'ผู้รับ '+entry.recipients.map(playerName).join(', '), entry.text,
    ].join(' · '));
    const url=URL.createObjectURL(new Blob([lines.join('\n\n')],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='บันทึกคดี-'+roomCode+'.txt';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <details className="mission-progress">
    <summary>บันทึกการดำเนินเรื่อง · {entries.length} รายการ</summary>
    {roomCode && <button type="button" disabled={!entries.length} onClick={download}>ดาวน์โหลดบันทึกห้อง</button>}
    {!entries.length && <p>ยังไม่มีรายการ</p>}
    <ol>{entries.map(entry=><li key={entry.sequence}>
      <strong>{logLabels[entry.kind]} · {playerName(entry.actor)}</strong>
      <p>{entry.text}</p>
    </li>)}</ol>
  </details>;
}
