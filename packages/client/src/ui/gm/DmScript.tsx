/** Render authored text without interpreting HTML. */
export function DmScript({text}:{text:string}) {
  const blocks=text.split(/(?=^\*\*\[|^#### )/m).filter(block=>block.trim());
  return <div className="gm-script-reader">{blocks.map((block,index)=>{
    const title=(block.match(/^\*\*\[[^\]]+\]\*\*/)?.[0] ?? block.split('\n')[0]).replace(/[*#]/g,'').trim();
    const secret=/^\*\*\[DM ลับ/.test(block);
    const dice=/^#### .*ทอยเต๋า/.test(block);
    const guidance=/^#### .*การนำฉาก/.test(block);
    const trigger=/^\*\*\[Trigger\]/.test(block);
    const spoken=/^\*\*\[(?:DM อ่าน|.*พูดหลัก)/.test(block);
    const response=/^\*\*\[(?:ตอบสนองต่อผู้เล่น|หาก|เมื่อ|ถ้า)/.test(block);
    const content=block.replace(/^\*\*\[[^\]]+\]\*\*\s*/, '').replace(/^>\s?/gm,'').replace(/\*\*/g,'').trim();
    const body=<div className="gm-script-copy">{content}</div>;
    if (secret || dice || guidance) return <details className={secret?'gm-script-secret':dice?'gm-script-rule':'gm-script-context'} key={index}>
      <summary>{secret?'ข้อมูลลับ · ห้ามอ่านให้ผู้เล่น':dice?'จุดทอยและผลลัพธ์':'แนวทางดำเนินฉาก'} · {title}</summary>{body}
    </details>;
    if (trigger) return <section className="gm-script-trigger" key={index}><strong>เริ่มเมื่อ</strong>{' '}{content}</section>;
    if (spoken) return <section className="gm-script-spoken" key={index}><span className="gm-label">{title.includes('DM อ่าน')?'อ่านให้ผู้เล่นฟัง':title.replace(/[\[\]]/g,'')}</span>{body}</section>;
    if (response) return <section className="gm-script-response" key={index}><h5>{title.replace(/[\[\]]/g,'')}</h5>{body}</section>;
    return <details className="gm-script-context" key={index}><summary>ข้อมูลประกอบ · {title}</summary>{body}</details>;
  })}</div>;
}
