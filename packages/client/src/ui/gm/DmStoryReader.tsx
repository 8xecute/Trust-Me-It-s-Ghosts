import { useRef, useState } from 'react';
import type { CaseDmPanel, GuidedView } from '../../network/onlineTypes';
import './DmStoryReader.css';
import {groupQuestions,importantQuestions} from './qaPresentation';

const groups=[['A','บท A'],['B','บท B'],['C','บท C'],['D','บท D'],['E','บท E'],['FINAL','ช่วงท้าย'],['ENDING','ตอนจบ']];
const branches=[['full','สำเร็จเต็มที่'],['partial','สำเร็จบางส่วน'],['failure','ไม่สำเร็จ']] as const;
const plain=(text:string)=>text.replace(/^>\s?/gm,'').replace(/\*\*|\x60/g,'').trim();
const stats:Record<string,string>={BODY:'ร่างกาย',PER:'การสังเกต',INT:'เชาวน์ปัญญา',SOC:'การเข้าสังคม',SPI:'จิตวิญญาณ',RES:'ความต้านทาน'};
const answerRole=(kind:string,speaker:string)=>kind==='action'?'เฉพาะ DM · ห้ามอ่านให้ผู้เล่น':kind==='npc'?'NPC พูด · '+speaker:kind==='document'?'DM อ่านเอกสาร':'DM บรรยาย';
const dialogueKey=(text:string)=>plain(text).normalize('NFC').replace(/[\p{White_Space}\p{Punctuation}]/gu,'');

export function DmStoryReader({reader,allowed,view,connected,action}:{reader:NonNullable<CaseDmPanel['storyReader']>;
 allowed:CaseDmPanel['guidedScenes'];view:GuidedView;connected:boolean;action:(type:string,payload?:object,onSuccess?:()=>void)=>void}) {
 const article=useRef<HTMLElement>(null);
 const [selected,setSelected]=useState<string>();
 const [query,setQuery]=useState('');
 const [drawer,setDrawer]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');
 const [qaQuery,setQaQuery]=useState('');
 const [allQuestions,setAllQuestions]=useState(false);
 const [roleFilter,setRoleFilter]=useState('all');
 const [openQuestion,setOpenQuestion]=useState<string>();
 const [importantOnly,setImportantOnly]=useState(false);
 const answers=reader.answers ?? [];
 const id=selected ?? view.scene;
 const questions=(reader.qa ?? []).filter(q=>(allQuestions || q.scene===id) &&
  (!importantOnly || !!importantQuestions[q.id]) &&
  (roleFilter==='all' || (roleFilter==='dm'?q.kind!=='npc' && q.kind!=='action':q.kind===roleFilter)) &&
  [q.question,q.answer,q.speaker,...q.aliases].join(' ').toLocaleLowerCase().includes(qaQuery.trim().toLocaleLowerCase()));
 const scenes=reader.scenes;
 const endings=Object.entries(reader.endings).map(([key,ending])=>({id:'ENDING '+key,title:ending.title,phase:'ENDING',brief:[ending.brief],dialogue:[]}));
 const items=[...scenes,...endings];
 const scene=scenes.find(item=>item.id===id);
 const sceneAnswers=(reader.qa ?? []).filter(q=>q.scene===id && q.kind==='npc');
 const openingDialogue=scene?.dialogue.filter(line=>!sceneAnswers.some(q=>
  q.speaker===line.speaker && dialogueKey(q.answer)===dialogueKey(line.text))) ?? [];
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
  setSelected(value);setDrawer(false);setCopyStatus('');setOpenQuestion(undefined);
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
     <div className="dm-reader-kicker">v{view.version} · {scene.phase==='FINAL'?'ช่วงท้าย':scene.id==='H1'?'เล่าได้เมื่อหลักฐานครบ':'บท '+scene.phase} · {scene.id}</div>
     <h2>{scene.title}</h2>
     <div className="dm-reader-status">
      <span>{current?'ฉากปัจจุบัน':'ดูบทล่วงหน้า'} · {seen?'ส่งบทแล้ว':reader.observed.includes(id)?'รอส่งบท':'ยังไม่เริ่ม'}</span>
      {!current && <button type="button" disabled={!connected || !canStart} onClick={()=>action('guided',{command:'scene',target:id})}>เริ่มฉากนี้</button>}
      {!current && !canStart && <small>รอเงื่อนไขในเกม</small>}
     </div>
     {scene.beginner && <section className="dm-beginner" aria-label="สรุปสำหรับ DM มือใหม่">
      <h3>สรุปสำหรับ DM มือใหม่</h3>
      <p className="note">ใช้เป็นแนวทาง เลือกเล่าตามสิ่งที่ผู้เล่นทำ การอ่านส่วนนี้ไม่เปลี่ยนผลเกม</p>
      <div className="dm-beginner-grid">
       <div><h4>เห็นอะไร</h4><p>{scene.beginner.see}</p></div>
       <div><h4>ชวนถามอะไร</h4><p>{scene.beginner.ask}</p></div>
       <div><h4>เลือกผลแบบไหนได้</h4><p>{scene.beginner.outcomes}</p></div>
      </div>
     </section>}
     <section aria-label="สรุปฉาก">
      <h3>เล่าอะไรในฉากนี้</h3><p>{scene.brief[0]}</p>
      <h4>ทางไปต่อ</h4><p>{scene.brief[1]}</p>
     </section>
     {currentCue && <details className="dm-reader-aloud dm-reader-important" open>
      <summary><span className="dm-important-badge">บทบรรยายสำคัญ</span> DM บรรยาย · บทเปิดอ่านให้ทีมฟัง</summary>
      <p className="note">อ่านเมื่อเปิดฉากจริง ไม่ต้องอ่านสรุปและข้อมูลลับของ DM ให้ผู้เล่นฟัง</p>
      <blockquote>{plain(currentCue)}</blockquote>
      <button type="button" onClick={()=>void copy(currentCue)}>คัดลอกบทเปิด</button> <span role="status">{copyStatus}</span>
     </details>}
     {openingDialogue.length>0 && <details>
      <summary>บทพูดเปิดและปฏิกิริยาในฉาก</summary>
      <p className="note">อ่านเมื่อเหตุการณ์เกิดขึ้นจริง ส่วนบทตอบผู้เล่นอยู่ในคลังคำถาม–คำตอบด้านล่าง</p>
      {openingDialogue.map(line=><div key={line.id} className="dm-reader-text">
       <h4><span className="dm-role-badge">{line.speaker==='DM'?'DM บรรยาย':'NPC พูด · '+line.speaker}</span>{line.label && line.label!=='บทหลัก'?' · '+line.label:''}</h4>
       <p>{plain(line.text)}</p>
      </div>)}
     </details>}
     {scene.clues && <details className="dm-reader-important"><summary>จุดสำคัญสำหรับ DM · เบาะแสและจุดตรวจ</summary><p className="note">บรรยายเฉพาะสิ่งที่ทีมพบหรือตรวจจริง ไม่อ่านเบาะแสที่ยังไม่เปิดเผย</p><p className="story-text">{scene.clues}</p></details>}
     {scene.secret && <details><summary>ข้อมูลลับสำหรับ DM</summary><p className="story-text">{scene.secret}</p></details>}
     {!!reader.qa?.length && <section aria-label="คลังคำถามและคำตอบสำหรับ DM">
      <h3>คำถาม–คำตอบ <small>{questions.length} รายการ</small></h3>
      <p className="note">เลือกคำถามเพื่ออ่านคำตอบ ป้ายระบุว่าใครเป็นผู้พูด การเปิดอ่านไม่ส่งข้อความและไม่เปลี่ยนสถานะเกม</p>
      <p className="note">เรียง NPC ตามผู้พูด ตามด้วย DM บรรยาย และเฉพาะ DM ข้อสำคัญอยู่บนสุดของแต่ละกลุ่ม ใช้เมื่อเงื่อนไขครบเท่านั้น</p>
      <div className="dm-qa-tools">
       <label className="dm-qa-search">ค้นหาคำถามหรือคำตอบ<input type="search" value={qaQuery} onChange={event=>setQaQuery(event.target.value)} placeholder="เช่น คนหาย ตำรวจ ประเสริฐ"/></label>
       <label>ประเภทคำตอบ<select value={roleFilter} onChange={event=>setRoleFilter(event.target.value)}><option value="all">ทั้งหมด</option><option value="npc">NPC พูด</option><option value="dm">DM บรรยาย / อ่านเอกสาร</option><option value="action">คำแนะนำเฉพาะ DM</option></select></label>
       <label className="dm-qa-scope"><input type="checkbox" checked={allQuestions} onChange={event=>setAllQuestions(event.target.checked)}/> ค้นทุกฉาก</label>
       <label className="dm-qa-scope"><input type="checkbox" checked={importantOnly} onChange={event=>setImportantOnly(event.target.checked)}/> เฉพาะข้อสำคัญ</label>
      </div>
      {groupQuestions(questions).map(group=><section key={group.id} className="dm-qa-group" data-role={group.kind} aria-label={group.title}>
       <h4 className="dm-qa-group-title">{group.title} <small>{group.items.length} รายการ</small></h4>
       <div className="dm-qa-grid">{group.items.map(q=>{
       const sent=answers.filter(answer=>answer.qaId===q.id);
       return <details className="dm-qa-card" key={q.id} data-kind={q.kind} data-important={!!importantQuestions[q.id]} data-sent={!!sent.length} open={openQuestion===q.id}>
        <summary onClick={event=>{event.preventDefault();setOpenQuestion(openQuestion===q.id?undefined:q.id);}}>
         <span className="dm-qa-question">{importantQuestions[q.id] && <span className="dm-important-badge">คำถามสำคัญ</span>}{q.question}</span>
         {importantQuestions[q.id] && <small className="dm-qa-priority">{importantQuestions[q.id]}</small>}
         <span className="dm-qa-meta"><span className="dm-role-badge">{answerRole(q.kind,q.speaker)}</span><small>{q.scene} · {sent.length?'ส่งแล้ว '+sent.length+' ครั้ง':'ยังไม่ส่ง'}</small></span>
        </summary>
        <div className="dm-qa-body">
        <p className="dm-qa-answer-label">{answerRole(q.kind,q.speaker)}</p>
        {q.kind==='action'?<blockquote className="dm-qa-answer">{q.guidance || q.answer || 'ดูแนวทางสำหรับ DM ด้านล่าง'}</blockquote>:
         q.answer?<blockquote className="dm-qa-answer">{q.answer}</blockquote>:<p className="note">ยังไม่มีบทพร้อมอ่าน ใช้แนวทางเฉพาะ DM ด้านล่าง แล้วเขียนคำตอบให้เหมาะกับสถานการณ์ก่อนส่ง</p>}
        {q.kind==='action'?<p className="note">ใช้ประกอบการตัดสินของ DM เท่านั้น ไม่มีปุ่มส่งให้ผู้เล่น</p>:<details className="dm-qa-send"><summary>แก้ข้อความและส่งให้ผู้เล่น</summary><form key={q.id+':'+view.scene} onSubmit={event=>{
         event.preventDefault();const form=event.currentTarget;
         action('dmSendQa',{qaId:q.id,text:new FormData(form).get('answer')});
        }}>
         <label>{q.kind==='npc'?'บทพูดของ '+q.speaker:'บทบรรยายที่ผู้เล่นจะได้รับ'}<textarea name="answer" required maxLength={1000} defaultValue={q.answer} placeholder="เขียนบทตอบให้ทีม โดยอิงข้อมูลที่พบจริง"/></label>
         <button type="submit" className="primary" disabled={!connected || !reader.sendableQaIds?.includes(q.id)}>ยืนยันส่งคำตอบให้ผู้เล่น</button>
         {!reader.sendableQaIds?.includes(q.id) && <p className="note">ยังส่งไม่ได้: ต้องเปิดฉาก ส่งบทเปิด และผ่านเงื่อนไขของคำตอบก่อน</p>}
        </form></details>}
        {(q.guidance || q.dm_note || !!q.requirements.length) && <details><summary>เงื่อนไขและแนวทางสำหรับ DM</summary>
         {q.guidance && <p>{q.guidance}</p>}{q.dm_note && <p>{q.dm_note}</p>}
         {!!q.requirements.length && <p>ใช้เมื่อ: {q.requirements.join(' · ')}</p>}
        </details>}
        {!!sent.length && <p className="note">ส่งล่าสุด: {sent.at(-1)!.text}</p>}
        </div>
       </details>;
      })}</div></section>)}
      {!questions.length && <p>ไม่พบคำถามที่ตรงกับตัวกรอง</p>}
      <details><summary>ประวัติคำตอบที่ส่งจริง · {answers.filter(answer=>allQuestions || answer.scene===id).length} รายการ</summary>
      {answers.filter(answer=>allQuestions || answer.scene===id).slice().reverse().map(answer=><section className="dm-qa-card" key={answer.sequence}>
       <small>{answer.scene} · ส่งแล้ว · ลำดับ {answer.sequence}</small><h4>{answer.question}</h4><p>{answer.text}</p>
      </section>)}</details>
     </section>}
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
