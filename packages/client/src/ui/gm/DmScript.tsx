/** Render authored text without interpreting HTML or changing its content. */
export function DmScript({text}:{text:string}) {
  const blocks=text.split(/(?=^\*\*\[|^#### )/m).filter(block=>block.trim());
  return <div className="gm-script-reader">{blocks.map((block,index)=>{
    const secret=/^\*\*\[DM ลับ|^#### 🔒/.test(block);
    const dice=/^#### .*ทอยเต๋า/.test(block);
    const title=block.split('\n')[0].replace(/[*#]/g,'').trim();
    const body=<div className="gm-script-copy">{block.replace(/^>\s?/gm,'').replace(/\*\*/g,'')}</div>;
    const spoken=/^\*\*\[(?:DM อ่าน|.*พูดหลัก)|^#### (?:🎬|🗣️)/.test(block);
    return secret || dice ? <details className={secret?'gm-script-secret':'gm-script-rule'} key={index}>
      <summary>{secret?'เฉพาะ DM · ห้ามอ่านให้ผู้เล่นฟัง':'กติกาทอย · เปิดเมื่อเข้าเงื่อนไข'} · {title}</summary>{body}
    </details> : spoken ? <section className="gm-script-spoken" key={index}><span className="gm-label">บทอ่าน / สวมบท</span>{body}</section> :
      <details className="gm-script-context" key={index}><summary>เงื่อนไข / แนวทางฉาก · {title}</summary>{body}</details>;
  })}</div>;
}
