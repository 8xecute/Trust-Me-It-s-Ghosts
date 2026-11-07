import type {DmOutcomeAnswer} from '@baan/shared';

export function DmOutcomeCard({id,answer,current,connected,action,playerName}:{
 id:string;answer:DmOutcomeAnswer;current:boolean;connected:boolean;
 action:(type:string,payload?:object)=>void;playerName:(id:string)=>string;
}) {
 const labels={success:'Full · สำเร็จเต็มที่',partial:'Partial · สำเร็จบางส่วน',failure:'Fail · ไม่สำเร็จ'};
 const send=(part:'narration'|'dialogue'|'all')=>action('dmPublish',{cardId:id,part});
 return <article className="gm-outcome-card" data-outcome={answer.outcome} aria-label="บทตอบหลังทอย">
   <p className="eyebrow">ผลคำนวณแล้ว · รอ DM เลือกจ่ายบท</p>
   <h3>{answer.label} · {playerName(answer.playerId)}</h3>
   <p className="gm-roll-equation">D20 {answer.die} + {answer.stat} {answer.statValue} + โบนัส {answer.bonus} = <strong>{answer.total}</strong> / DC {answer.dc}</p>
   <div className="gm-outcome-levels">{(['success','partial','failure'] as const).map(outcome=><span key={outcome} data-active={outcome===answer.outcome}>
     {labels[outcome]}<small>{outcome==='success'?'รวมตั้งแต่ '+answer.dc:outcome==='partial'?'รวม '+(answer.dc-3)+'–'+(answer.dc-1):'รวมไม่เกิน '+(answer.dc-4)}</small>
   </span>)}</div>
   <p>ใช้บทตอบ <strong>{labels[answer.outcome]}</strong> ตามคะแนน ระบบบันทึกผลแล้ว ไม่ต้องทอยซ้ำ</p>
   {(['narration','dialogue'] as const).filter(part=>answer[part]).map(part=><section key={part} className="gm-read-aloud">
     <h4>{part==='narration'?'บทบรรยายตามผล':'บทพูด NPC ตามผล'}</h4><p className="story-text">{answer[part]}</p>
     <button disabled={!connected || !current || answer.sentParts.includes(part)} onClick={()=>send(part)}>{answer.sentParts.includes(part)?'จ่ายแล้ว':part==='narration'?'ส่งบทบรรยายให้ทีม':'ส่งบทพูด NPC ให้ทีม'}</button>
   </section>)}
   {!current && <p className="combat-warning">ฉากเปลี่ยนแล้ว บทตอบนี้ส่งไม่ได้</p>}
   <button className="primary" disabled={!connected || !current} onClick={()=>send('all')}>ส่งบทตอบที่เหลือทั้งหมด</button>
 </article>;
}
