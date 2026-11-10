import { useRef, useState } from 'react';
import type { CaseDmPanel, GuidedView } from '../../network/onlineTypes';
import './DmStoryReader.css';

const groups=[['A','บท A'],['B','บท B'],['C','บท C'],['D','บท D'],['E','บท E'],['FINAL','ช่วงท้าย'],['ENDING','ตอนจบ']];
const branches=[['full','สำเร็จเต็มที่'],['partial','สำเร็จบางส่วน'],['failure','ไม่สำเร็จ']] as const;
const plain=(text:string)=>text.replace(/^>\s?/gm,'').replace(/\*\*|\x60/g,'').trim();
const stats:Record<string,string>={BODY:'ร่างกาย',PER:'การสังเกต',INT:'เชาวน์ปัญญา',SOC:'การเข้าสังคม',SPI:'จิตวิญญาณ',RES:'ความต้านทาน'};

export function DmStoryReader({reader,allowed,view,connected,action}:{reader:NonNullable<CaseDmPanel['storyReader']>;
 allowed:CaseDmPanel['guidedScenes'];view:GuidedView;connected:boolean;action:(type:string,payload?:object)=>void}) {
 const article=useRef<HTMLElement>(null);
 const [selected,setSelected]=useState<string>();
 const [query,setQuery]=useState('');
 const [drawer,setDrawer]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');
 const scenes=reader.scenes;
 const endings=Object.entries(reader.endings).map(([key,ending])=>({id:'ENDING '+key,title:ending.title,phase:'ENDING',brief:[ending.brief],dialogue:[]}));
 const items=[...scenes,...endings];
 const id=selected ?? view.scene;
 const scene=scenes.find(item=>item.id===id);
 const ending=id.startsWith('ENDING ') ? reader.endings[id.slice(-1)] : undefined;
 const check=scene && reader.checks.find(item=>item.scene_id===scene.id);
 const canStart=!!scene && !!allowed?.some(item=>item.id===id && item.canOpen!==false);
 const current=id===view.scene;
 const seen=reader.presented.includes(id);
 const currentCue=current ? allowed?.find(item=>item.id===id)?.cue : undefined;
 const terms=query.toLocaleLowerCase().trim().split(/\s+/);
 const matches=items.filter(item=>{
  const text=[item.id,item.title,...item.brief,...item.dialogue.map(line=>line.speaker+' '+line.text)].join(' ').toLocaleLowerCase();
  return terms.every(term=>text.includes(term));
 });
 const choose=(value?:string)=>{
  setSelected(value);setDrawer(false);setCopyStatus('');
  requestAnimationFrame(()=>article.current?.focus({preventScroll:false}));
 };
 const copy=async(text:string)=>{
  try {await navigator.clipboard.writeText(plain(text));setCopyStatus('คัดลอกแล้ว');}
  catch {setCopyStatus('คัดลอกไม่ได้ เลือกข้อความในกรอบเพื่อคัดลอก');}
 };
 return <div className="dm-reader">
  <header className="dm-reader-toolbar">
   <button type="button" className="dm-reader-menu" aria-expanded={drawer} aria-controls="dm-reader-scenes" onClick={()=>setDrawer(!drawer)}>สารบัญ</button>
   <div><span className="dm-reader-kicker">คู่มือสำหรับคนเล่า</span><strong>เสียงร้องจากสวนกล้วย</strong></div>
   <div className="dm-reader-toolbar-actions">
    <button type="button" onClick={()=>choose()}>ไปฉากปัจจุบัน · {view.scene}</button>
   </div>
  </header>
  <div className="dm-reader-layout">
   <aside id="dm-reader-scenes" className={'dm-reader-nav'+(drawer?' is-open':'')}>
    <label>ค้นหาฉากหรือ NPC
     <input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="รหัส ชื่อ ตัวละคร หรือข้อความ"/>
    </label>
    <nav aria-label="สารบัญฉาก">{groups.map(([phase,title])=>{
     const entries=matches.filter(item=>item.phase===phase);
     if(!entries.length)return null;
     return <section key={phase}><h4>{title}</h4>{entries.map(item=><button type="button" key={item.id} aria-pressed={item.id===id} onClick={()=>choose(item.id)}>
      <span><b>{item.phase==='ENDING'?item.id.slice(-1):item.id}</b> {item.title}</span>
      {view.scene===item.id && <small>ปัจจุบัน</small>}
      {reader.presented.includes(item.id) && <small>ส่งแล้ว</small>}
      {reader.observed.includes(item.id) && !reader.presented.includes(item.id) && <small>รอส่ง</small>}
     </button>)}</section>;
    })}{!matches.length && <p>ไม่พบฉาก</p>}</nav>
   </aside>
   <article className="dm-reader-article" key={id} ref={article} tabIndex={-1}>
    {scene && <>
     <div className="dm-reader-kicker">{scene.phase==='FINAL'?'ช่วงท้าย':scene.id==='H1'?'เล่าได้เมื่อหลักฐานครบ':'บท '+scene.phase} · {scene.id}</div>
     <h2>{scene.title}</h2>
     <div className="dm-reader-status">
      <span>{current?'ฉากปัจจุบัน':'ดูบทล่วงหน้า'} · {seen?'ส่งบทแล้ว':reader.observed.includes(id)?'รอส่งบท':'ยังไม่เริ่ม'}</span>
      {!current && <button type="button" disabled={!connected || !canStart} onClick={()=>action('guided',{command:'scene',target:id})}>เริ่มฉากนี้</button>}
      {!current && !canStart && <small>รอเงื่อนไขในเกม</small>}
     </div>
     <section aria-label="สรุปฉาก">
      <h3>เล่าอะไรในฉากนี้</h3><p>{scene.brief[0]}</p>
      <h4>ทางไปต่อ</h4><p>{scene.brief[1]}</p>
     </section>
     {currentCue && <details className="dm-reader-aloud">
      <summary>บทเปิดสำหรับอ่านให้ทีมฟัง</summary>
      <blockquote>{plain(currentCue)}</blockquote>
      <button type="button" onClick={()=>void copy(currentCue)}>คัดลอกบทเปิด</button> <span role="status">{copyStatus}</span>
     </details>}
     {scene.dialogue.length>0 && <details>
      <summary>ตัวอย่างบทพูดในฉาก</summary>
      <p className="note">เลือกบทที่ตรงกับเหตุการณ์และตัวละครที่อยู่จริง จากหน้าดำเนินเกม</p>
      {scene.dialogue.map(line=><div key={line.id} className="dm-reader-text">
       <h4>{line.speaker}{line.label && line.label!=='บทหลัก'?' · '+line.label:''}</h4>
       <p>{plain(line.text)}</p>
      </div>)}
     </details>}
     {scene.clues && <details><summary>เบาะแสและจุดตรวจ</summary><p className="story-text">{scene.clues}</p></details>}
     {scene.secret && <details><summary>ข้อมูลลับสำหรับ DM</summary><p className="story-text">{scene.secret}</p></details>}
     {current && !!reader.qa?.length && <details>
      <summary>คลังคำถามและคำตอบสำหรับ DM</summary>
      <p>ค้นจากช่องค้นหาด้านข้าง รายการนี้ใช้ตรวจบริบทก่อนเลือกคำตอบ</p>
      {reader.qa.filter(q=>[q.question,...q.aliases].some(label=>label.includes(query.trim()))).map(q=><details key={q.id}>
       <summary>{q.question}</summary><p>{q.answer}</p><p>{q.dm_note}</p>
       {!!q.requirements.length && <p>{q.requirements.join(' · ')}</p>}
      </details>)}
     </details>}
     {check && <details className="dm-reader-check">
      <summary>การทอยในฉาก · {check.title}</summary>
      {check.decision ? <p className="note">{check.decision}</p> : <>
       <p>ใช้{check.stat.split('|').map(stat=>stats[stat] ?? stat).join(' หรือ ')} · คะแนนเป้าหมาย {check.dc}</p>
       {branches.map(([key,label])=><details key={key}>
        <summary>{label} · {key==='full'?check.dc+' ขึ้นไป':key==='partial'?(check.dc-check.partial_margin)+'–'+(check.dc-1):'ไม่เกิน '+(check.dc-check.partial_margin-1)}</summary>
        <p>{plain(check[key])}</p>
       </details>)}
      </>}
     </details>}
    </>}
    {ending && <>
     <div className="dm-reader-kicker">ตอนจบ {id.slice(-1)}{current?' · ผลจริง':''}</div>
     <h2>{ending.title}</h2>
     <p>{ending.brief}</p>
     <details><summary>บทบรรยายตอนจบสำหรับเตรียมอ่าน</summary>
      {ending.paragraphs.map((paragraph,index)=><blockquote key={index}>{plain(paragraph)}</blockquote>)}
     </details>
    </>}
   </article>
  </div>
 </div>;
}
