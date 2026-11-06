import { useEffect, useState } from 'react';
import type { DmRollCard } from '@baan/shared';

const outcomes = {success:'สำเร็จ',partial:'สำเร็จบางส่วน',failure:'ไม่สำเร็จ'} as const;

export function D20Result({card}:{card:DmRollCard}) {
  return <span>หน้าเต๋า <strong>{card.die}</strong>{card.result && <> · รวม <strong>{card.result.total}</strong> · {outcomes[card.result.outcome]}</>}</span>;
}

export function D20Card({card,connected,onRoll,rollerName}:{
  card:DmRollCard;connected?:boolean;rollerName?:string;onRoll?:(id:string,settled:(error?:string)=>void)=>void;
}) {
  const [sending,setSending]=useState(false);
  const [error,setError]=useState<string>();
  const resolved=card.die!==null;
  const [revealed,setRevealed]=useState(()=>!resolved || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    if(revealed || !resolved) return;
    const timer=window.setTimeout(()=>setRevealed(true),1600);
    return ()=>window.clearTimeout(timer);
  },[resolved,revealed]);
  return <section className="narration-card d20-card" aria-label="การ์ดทอย D20">
    <div key={resolved?'result':'request'} className="d20-face"
      data-motion={resolved && !revealed?'land':!resolved && sending?'roll':undefined} aria-hidden="true">
      <svg viewBox="0 0 80 80" focusable="false">
        <path d="M40 3 73 21 73 58 40 77 7 58 7 21Z"/>
        <path d="M40 3 19 52 61 52 40 3 M7 21 19 52 7 58 M73 21 61 52 73 58 M19 52 40 77 61 52"/>
      </svg>
      <span>{revealed ? card.die ?? '?' : '?'}</span>
    </div>
    <div className="d20-copy">
      <h3>{resolved ? 'D20 · '+rollerName : 'ถึงตาคุณทอย D20'}</h3>
      {card.label && <p>{card.label}</p>}
      {card.dice && <p>{card.dice.stat} · DC {card.dice.dc}{card.dice.ap>0 && ' · '+card.dice.ap+' AP'}</p>}
      <p role="status">{resolved ? (revealed ? <D20Result card={card}/> : 'ลูกเต๋ากำลังชะลอ…') : sending ? 'กำลังรอผลจากเซิร์ฟเวอร์…' : error ?? 'ผู้ดำเนินเรื่องส่งการ์ดให้คุณ'}</p>
      {!resolved && onRoll && <button type="button" className="primary" disabled={!connected || sending} onClick={()=>{
        setError(undefined);
        setSending(true);
        onRoll(card.id,message=>{setSending(false);setError(message);});
      }}>ทอย D20</button>}
    </div>
  </section>;
}
