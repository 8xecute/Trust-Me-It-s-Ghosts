import { DmOutcomeCard } from './DmOutcomeCard';
import { useState } from 'react';
import type { CaseDmPanel, GmChapter, Room, Snapshot } from '../../network/onlineTypes';
import { GuidedPanel } from '../case/GuidedPanel';
import { D20Card, D20Result } from '../case/D20Card';
import { DmHistory } from '../case/DmHistory';
import { DmPlayerView, type PlayerPreview } from './DmPlayerView';

function GmGuide({chapters,current}:{chapters:GmChapter[];current:string}) {
  const [selected,setSelected]=useState('');
  const chapter=chapters.find(item=>item.id===(selected || current)) ?? chapters[0];
  if(!chapter) return null;
  return <section className="gm-guide" aria-label="คู่มือเตรียมบท">
    <label>อ่านบท <select value={selected} onChange={event=>setSelected(event.target.value)}>
      <option value="">ตามฉากปัจจุบัน</option>
      {chapters.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>
    <header><h3>{chapter.title}</h3><p>{chapter.goal}</p></header>
    {(['main','support'] as const).map(track=>{
      const beats=chapter.beats.filter(beat=>(beat.track ?? 'main')===track);
      return beats.length>0 && <section key={chapter.id+track} className="gm-script-track">
        <h4>{track==='main'?'บทหลัก':'บทเสริมและบทตอบตามสถานการณ์'} <small>{beats.length}</small></h4>
        <ol className="gm-beats">
          {beats.map((beat,index)=><li key={beat.id}>
            <details open={track==='main' && index===0}>
              <summary><small>{beat.id}</small> {beat.title}</summary>
              <p className="gm-trigger"><strong>อ่านเมื่อ</strong> {beat.when}</p>
              {!!beat.read.length && <div className="gm-read">
                {beat.read.map((line,i)=><p key={i}>{line}</p>)}
              </div>}
              {beat.fullScript && <details><summary>บทเต็ม v4.1 · เฉพาะ DM</summary><pre>{beat.fullScript}</pre></details>}
            </details>
          </li>)}
        </ol>
      </section>;
    })}
  </section>;
}

export function DmWorkspace({
  room, world, investigators, preview, previewPlayer, setPreviewPlayer, dmPanel,
  action, playerName, canStart, status, connected, limit, leaveRoom, leaving,
}: {
  room:Room;
  world:Snapshot|null;
  investigators:Room['players'];
  preview?:PlayerPreview;
  previewPlayer:string;
  setPreviewPlayer:(id:string)=>void;
  dmPanel:CaseDmPanel|null;
  action:(type:string,payload?:object,onSuccess?:()=>void)=>void;
  playerName:(id:string)=>string;
  canStart:boolean;
  status:string;
  connected:boolean;
  limit:number;
  leaveRoom:()=>void;
  leaving:boolean;
}) {
  const [dmTab,setDmTab]=useState<'guide'|'queue'|'questions'|'dice'|'team'|'history'>('queue');
  const [selectedRole,setSelectedRole]=useState('');
  const dicePlayers=dmPanel?.investigators ?? [];
  const pendingDice=dicePlayers.filter(entry=>entry.check && entry.diceRequest?.die!==null);
  const battle=world?.caseMap?.battle;
  const currentScene=world?.caseMap?.site;
  const queue=(dmPanel?.narration ?? []).filter(card=>card.current ?? card.site===currentScene).sort((a,b)=>Number(!!b.answer)-Number(!!a.answer));
  const otherScenes=(dmPanel?.narration ?? []).filter(card=>!(card.current ?? card.site===currentScene));
  const speakerNames=dmPanel?.speakers ?? [];
  const lead=dmPanel?.investigators.find(entry=>entry.id===previewPlayer && entry.site===currentScene)
    ?? dmPanel?.investigators.find(entry=>entry.site===currentScene);
  const answers=lead?.choices.filter(choice=>choice.answer) ?? [];
  const roles=[...new Set(answers.map(choice=>choice.speaker ?? 'ผู้บรรยาย'))];
  const sent=dmPanel?.sent ?? {};
  const recentlySent=Object.entries(sent).filter(([,entry])=>entry.site===currentScene).sort(([,a],[,b])=>b.sequence-a.sequence);
  const activeRole=roles.includes(selectedRole)?selectedRole:roles[0];
  const nextCard=queue[0];
  return <main className="game-shell online-shell dm-shell">
    <header className="online-heading"><div><p className="eyebrow">บริษัท เรื่องผีไว้ใจผม จำกัด · ผู้ดำเนินเรื่อง</p><h1>ห้องควบคุมภารกิจ</h1></div><p className="turn-chip" role="status">{status || (connected?'เชื่อมต่อแล้ว':'กำลังเชื่อมต่อ')}</p></header>
    <p className="room-reference">รหัสห้อง <strong>{room.code}</strong> · ผู้สืบสวน {investigators.length}/{limit}</p>
    <button className="danger" disabled={!connected || leaving} onClick={leaveRoom}>ออกจากห้อง</button>
    <details className="session-members"><summary>ทีมผู้สืบสวน · {investigators.length} คน</summary><ul>{investigators.map(player=><li key={player.id}>{playerName(player.id)} · {player.ready?'พร้อม':'ยังไม่พร้อม'}</li>)}</ul></details>
    <div className="dm-workspace"><div className="dm-preview-pane">
    <label className="dm-view-selector">เลือกมุมมองผู้สืบสวน <select value={previewPlayer} onChange={event=>setPreviewPlayer(event.target.value)}>
      <option value="">เลือกผู้สืบสวน</option>
      {investigators.map(player=><option key={player.id} value={player.id}>{playerName(player.id)}</option>)}
    </select></label>
    {preview && preview.players[previewPlayer] ? <DmPlayerView playerId={previewPlayer} preview={preview}/> : <section className="game-panel"><h2>มุมมองผู้สืบสวน</h2><p>{investigators.length ? 'กำลังโหลดฉากของผู้เล่น' : 'รอผู้สืบสวนเข้าห้อง ฉากและสถานะของทีมจะแสดงที่นี่'}</p></section>}
    </div><div className="dm-controls-pane">
    <h2 className="pane-heading">เครื่องมือดำเนินเรื่อง</h2>
    {world?.case001 ? <section className="game-panel">
      <h2>{world.case001.title}</h2>
      <p>{world.case001.location} · {world.case001.time} · ช่วยแล้ว {world.case001.rescued}/3</p>
      <section className="gm-focus" aria-label="โฟกัสตอนนี้">
        <p className="eyebrow">โฟกัสตอนนี้ · {world.guided ? 'ฉาก '+world.guided.scene : world.case001.location}</p>
        <h3>{world.guided?.transition ? 'รอทีมยืนยันออกบท' : nextCard?.answer ? 'ทอยแล้ว · เลือกบทตอบตามคะแนน' : nextCard ? 'อ่านบทนี้ แล้วส่งให้ผู้เล่น' : battle ? 'ดำเนินการเผชิญหน้า' : 'ฟังผู้เล่น แล้วสวมบทตอบ'}</h3>
        <p><span className="gm-role-badge">สวมบท · {nextCard?.speakers?.length ? nextCard.speakers.join(' / ') : nextCard ? 'ผู้บรรยาย' : activeRole ?? 'ผู้บรรยาย'}</span></p>
        <p>{world.guided?.transition ? 'ผู้สืบสวนยืนยันแทนทีมได้ หรือเลือกสำรวจต่อในบทเดิม' : nextCard ? nextCard.text.slice(0,150)+(nextCard.text.length>150?'…':'') : 'บทตอบอยู่ด้านล่าง เลือกตัวละครและหัวข้อให้ตรงกับสิ่งที่ผู้เล่นพูด'}</p>
        <div className="gm-focus-actions">
          <button type="button" className="primary" onClick={()=>setDmTab('queue')}>อ่านและจ่ายบท{queue.length>0?' · '+queue.length:''}</button>
          <button type="button" onClick={()=>setDmTab('guide')}>ดูฉาก / เปลี่ยนบท</button>
          {!!pendingDice.length && <button type="button" onClick={()=>setDmTab('dice')}>จัดการ D20 · {pendingDice.length}</button>}
        </div>
      </section>
      {world.latestRoll && <D20Card key={world.latestRoll.id} card={world.latestRoll} rollerName={playerName(world.latestRoll.playerId)}/>}
      <nav className="workspace-tabs gm-tabs" aria-label="เครื่องมือผู้ดำเนินเรื่อง">
        {([
          ['guide','ฉาก / คู่มือ'],['queue','อ่าน / จ่ายบท '+queue.length],
          ['questions','คำถาม '+(dmPanel?.questions?.length ?? 0)],['dice','D20'+(pendingDice.length ? ' · '+pendingDice.length : '')],['team','ทีม / NPC'],['history','บันทึก'],
        ] as const).map(([id,label])=><button key={id} type="button" aria-pressed={dmTab===id} onClick={()=>setDmTab(id)}>{label}</button>)}
      </nav>
      {!!pendingDice.length && dmTab!=='dice' && <button className="gm-alert" type="button" onClick={()=>setDmTab('dice')}>คำขอทอย D20 รอส่งการ์ด · {pendingDice.length}</button>}
      {world.manualDm && dmPanel && <>
      <section hidden={dmTab!=='guide'} className="gm-pane">
        <p className="note">คู่มือนี้มีไว้ให้ DM อ่านและสวมบทบาท ข้อความในคู่มือจะไม่ส่งไปถึงผู้เล่น</p>
        {!!queue.length && <button type="button" onClick={()=>setDmTab('queue')}>เปิดคิวพร้อมส่ง · {queue.length}</button>}
        {world.guided && <GuidedPanel view={world.guided} scenes={dmPanel.guidedScenes} connected={connected} action={action} isDm/>}
        {!world.guided && dmPanel.guide && <GmGuide chapters={dmPanel.guide}
          current={world.case001.report ? 'ENDINGS' : (battle?.phase || currentScene==='E' && world.case001.seals===3) ? 'FINAL' : world.caseMap?.site ?? 'A'}/>}
        {dmPanel.investigators[0]?.secret && <details className="dm-private">
          <summary>ข้อมูลลับของฉากปัจจุบัน</summary><p>{dmPanel.investigators[0].secret}</p>
        </details>}
      </section>
      <section hidden={dmTab!=='queue'} className="gm-pane">
        <h3>บทเล่าที่รอส่ง</h3>
        <p className="note">อ่านหรือสวมบทก่อน แล้วกดส่งเมื่อพร้อมให้ผู้เล่นเห็นข้อความนี้</p>
        {!queue.length && <p>ตอนนี้ไม่มีบทพร้อมส่ง</p>}
        {queue.map((card,index)=>card.answer ? <DmOutcomeCard key={card.id} id={card.id} answer={card.answer} current={!!card.current} connected={connected} action={action} playerName={playerName}/> : <details className={index===0?"gm-publish gm-next-beat":"gm-publish"} key={card.id} open={index===0}>
          <summary>{index===0?'แนะนำให้อ่านถัดไป':'บทในคิว'} · {card.eventId.startsWith('entry:')?'เปิดฉาก':card.eventId.startsWith('ending:')?'ตอนจบ':'ฉาก '+card.site}{index!==0 && ' · '+card.text.slice(0,52)}</summary>
          <p className="note">อ่านในบท · {card.speakers?.length ? 'ผู้บรรยาย / '+card.speakers.join(' / ') : 'ผู้บรรยาย'}</p>
          <div className="gm-read-aloud"><span className="gm-label">อ่านให้ผู้เล่นฟัง</span><p className="story-text">{card.text}</p></div>
          {card.recipients && <p className="note">ผู้รับ · {card.recipients.map(playerName).join(', ')}</p>}
          <button type="button" className="primary" disabled={!connected} onClick={()=>action('dmPublish',{cardId:card.id})}>ส่งข้อความนี้ให้ผู้เล่น</button>
        </details>)}
        {!!recentlySent.length && <details className="dm-sent-list"><summary>✓ ส่งแล้วในสถานที่นี้ · {recentlySent.length} บท</summary>
          <ul>{recentlySent.map(([id,entry])=><li key={id}><span className="dm-sent-mark">✓ ส่งแล้ว{entry.count>1?' · '+entry.count+' ครั้ง':''}</span><p>{entry.text}</p></li>)}</ul>
        </details>}
        {!!roles.length && <section>
          <h3>ส่งบทพูดจากตัวละครในฉาก</h3>
          <p className="note">เลือกตัวละคร แล้วอ่านบทหรือส่งข้อความให้ทั้งทีม</p>
          <label className="gm-role-picker">กำลังสวมบท <select value={activeRole ?? ''} onChange={event=>setSelectedRole(event.target.value)}>{roles.map(role=><option key={role}>{role}</option>)}</select></label>
          {roles.filter(role=>role===activeRole).map(role=><section key={role} className="gm-publish gm-dialogue">
            <h4 className="gm-role-badge">{role}</h4>
            {answers.filter(choice=>(choice.speaker ?? 'ผู้บรรยาย')===role).map(choice=><details key={choice.id}>
              <summary>{choice.label} {sent[choice.id] && <span className="dm-sent-mark">✓ ส่งแล้ว</span>}</summary>
              <p className="story-text">{choice.answer}</p>
              <button disabled={!connected} onClick={()=>action('caseDm',{targetId:lead?.id,actionId:choice.id})}>{sent[choice.id]?'ส่งบทนี้อีกครั้ง':'ส่งบทนี้ให้ทีม'}</button>
            </details>)}
          </section>)}
        </section>}
        {!!otherScenes.length && <details><summary>บทพักจากฉากอื่น · {otherScenes.length}</summary>
          <p className="note">บทพักนี้ไม่พร้อมส่ง บทที่ปิดไปแล้วใน v4.3 ย้อนกลับไม่ได้</p>
          <ul>{otherScenes.map(card=><li key={card.id}>ฉาก {card.site} · {card.text.slice(0,75)}</li>)}</ul>
        </details>}
      </section>
      <section hidden={dmTab!=='questions'} className="gm-pane dm-event-list">
        {!dmPanel.questions?.length && <p className="note">ตอนนี้ไม่มีคำถามรออยู่</p>}
        <details open><summary>คำถามจากผู้เล่น · {dmPanel.questions?.length ?? 0} รายการ</summary>
          {dmPanel.questions?.map((card,index)=><details key={card.id} open={index===0}>
            <summary>{playerName(card.playerId)} · {card.label}</summary>
            {card.open ? <>
              <details open><summary>บทตอบตามสคริปต์ที่ใช้ได้</summary>
                {dmPanel.investigators.find(entry=>entry.id===card.playerId)?.choices.filter(choice=>choice.answer).map(choice=><details key={choice.id}>
                  <summary>{choice.speaker ? choice.speaker+' · ' : ''}{choice.label}</summary>
                  <p className="story-text">{choice.answer}</p>
                  <button disabled={!connected} onClick={()=>action('dmAnswer',{cardId:card.id,actionId:choice.id})}>ส่งคำตอบนี้ให้ทีม</button>
                </details>)}
              </details>
              <details><summary>ตอบด้วยคำพูดของ DM</summary>
              <form onSubmit={event=>{
                event.preventDefault();
                const form=event.currentTarget;
                const text=new FormData(form).get('reply');
                const speaker=new FormData(form).get('speaker') || undefined;
                action('dmReply',{cardId:card.id,text,speaker},()=>form.reset());
              }}>
                <label>พูดในบท <select name="speaker">
                  <option value="">ผู้บรรยาย</option>
                  {speakerNames.map(name=><option key={name}>{name}</option>)}
                </select></label>
                <label>คำตอบหรือสรุปที่เล่าไปแล้ว <textarea name="reply" required maxLength={1000}/></label>
                <button disabled={!connected}>ส่งคำตอบให้ทีม</button>
              </form>
              </details>
            </> : <p>คำถามนี้อยู่คนละฉาก หรือทีมยังไม่พร้อมคุย</p>}
            <button disabled={!connected} onClick={()=>action('dmDismiss',{cardId:card.id})}>ปิดคำถาม</button>
          </details>)}
        </details>
      </section></>}
      <section hidden={dmTab!=='dice'} className="gm-pane gm-dice">
        <h3>บทตอบหลังทอย</h3>
        {queue.filter(card=>card.answer).map(card=><DmOutcomeCard key={card.id} id={card.id} answer={card.answer!} current={!!card.current} connected={connected} action={action} playerName={playerName}/>)}
        {!queue.some(card=>card.answer) && <p className="note">เมื่อจุดทอยตามสคริปต์จบ บทตอบตามคะแนนจะปรากฏที่นี่ การทอยที่ DM กำหนดเองให้เลือกบทตอบจากคู่มือฉาก</p>}
        <h3>การ์ดทอย D20 รายคน</h3>
        <p className="note">ส่งให้ผู้เล่นที่เลือก ผู้เล่นกดทอยเองและระบบบันทึกผลให้</p>
        {!!dmPanel?.diceGuide?.length && <details><summary>เงื่อนไขจุดทอย CASE 001</summary>
          {dmPanel.diceGuide.map(check=><details key={check.id}><summary>{check.scene_id} · {check.title} · {check.stat} DC {check.dc}</summary>
            <p><strong>ทอยเมื่อ</strong> {check.trigger}</p><p><strong>ข้อมูลพื้นฐาน</strong> {check.baseline}</p>
            <p><strong>ข้ามการทอย</strong> {check.bypass}</p><p><strong>ทางสำรอง</strong> {check.fallback}</p>
          </details>)}
        </details>}
        {!dicePlayers.length && <p>ยังไม่มีผู้สืบสวน</p>}
        {[...dicePlayers].sort((a,b)=>Number(!!b.check && b.diceRequest?.die!==null)-Number(!!a.check && a.diceRequest?.die!==null)).map(entry=>{
          const card=entry.diceRequest;
          const waiting=world.manualDm ? card?.die===null : world.diceRequest?.die===null;
          return <article className="gm-roll-entry" key={entry.id}>
            <h4>{playerName(entry.id)}</h4>
            {entry.check && <p><strong>ทดสอบ:</strong> {entry.check.label}{entry.check.dice && ' · '+entry.check.dice.stat+' · DC '+entry.check.dice.dc}</p>}
            {waiting ? <p role="status">ส่งแล้ว · รอผู้เล่นทอย</p> :
              entry.check ?
              <form key={entry.check.id} onSubmit={event=>{
                event.preventDefault();const data=new FormData(event.currentTarget);
                action('dmRequestRoll',{targetId:entry.id,checkId:entry.check!.id,difficulty:Number(data.get('difficulty')),...(!entry.check!.dice ? {stat:data.get('stat')} : {})});
              }}>
                {entry.check.dice ? <p className="note">ใช้ {entry.check.dice.stat} ตามจุดทอยในบท · DC แนะนำ {entry.check.dice.dc}</p> :
                  <label>ค่าสถานะ <select name="stat" defaultValue="PER"><option value="BODY">ร่างกาย BODY</option><option value="PER">การสังเกต PER</option><option value="INT">เชาวน์ปัญญา INT</option><option value="SOC">การเข้าสังคม SOC</option><option value="SPI">จิตวิญญาณ SPI</option><option value="RES">ความต้านทาน RES</option></select></label>}
                <label>ความยากก่อนส่งการ์ด <select name="difficulty" defaultValue={entry.check.dice?.dc ?? 14}>
                  <option value="11">ง่าย · DC 11</option><option value="14">ปกติ · DC 14</option><option value="17">ยาก · DC 17</option><option value="20">ยากมาก · DC 20</option><option value="22">พิเศษ · DC 22</option>
                </select></label>
                <button type="submit" className="primary" disabled={!connected || !!world.case001?.report}>ส่งการ์ดตามคำขอ</button>
              </form> :
              <form onSubmit={event=>{
                event.preventDefault();
                const data=new FormData(event.currentTarget);
                action('dmRequestRoll',{targetId:entry.id,stat:data.get('stat'),difficulty:Number(data.get('difficulty'))});
              }}>
                <label>ค่าสถานะ <select name="stat" defaultValue="PER">
                  <option value="BODY">ร่างกาย BODY</option><option value="PER">การสังเกต PER</option>
                  <option value="INT">เชาวน์ปัญญา INT</option><option value="SOC">การเข้าสังคม SOC</option>
                  <option value="SPI">จิตวิญญาณ SPI</option><option value="RES">ความต้านทาน RES</option>
                </select></label>
                <label>ความยาก <select name="difficulty" defaultValue="14">
                  <option value="11">ง่าย · DC 11</option><option value="14">ปกติ · DC 14</option>
                  <option value="17">ยาก · DC 17</option><option value="20">ยากมาก · DC 20</option>
                  <option value="22">พิเศษ · DC 22</option>
                </select></label>
                <button type="submit" disabled={!connected || !!world.case001?.report}>ส่งการ์ดทดสอบ</button>
              </form>}
            {entry.check && <button type="button" disabled={!connected}
              onClick={()=>action('dmCancelCheck',{targetId:entry.id,checkId:entry.check?.id})}>ยกเลิกคำขอ</button>}
            {card && card.die!==null && card.id!==world.latestRoll?.id && <p className="note">{entry.check?'ผลทอยก่อนหน้า':'ผลล่าสุด'} · <D20Result card={card}/></p>}
          </article>;
        })}
      </section>
      <div hidden={dmTab!=='history'} className="gm-pane">
      {world.manualDm && <DmHistory entries={world.dmLog ?? []} playerName={playerName} roomCode={room?.code}/>}
      <details><summary>บันทึกสถานการณ์</summary><p>{world.case001.notice}</p></details>
      {world.case001.report && <pre className="story-text">{world.case001.report.text}</pre>}
      </div>
      <section hidden={dmTab!=='team'} className="gm-pane">
      {dmPanel && <section className="gm-travel">        {dmPanel.wichai && <details><summary>สเตตัสวิชัย</summary>
          <p>HP {dmPanel.wichai.baseHPFor2} · PDEF {dmPanel.wichai.PDEF} · MDEF {dmPanel.wichai.MDEF} · ATK {dmPanel.wichai.ATK} · INIT {dmPanel.wichai.INIT} · MOVE {dmPanel.wichai.MOVE}</p>
        </details>}
        <h3>พาทีมเดินทาง</h3>
        {!world.guided && dmPanel.travel.length ? dmPanel.travel.map(option=><button key={option.id} disabled={!connected}
          onClick={()=>action('dmTravel',{actionId:option.id,site:world.caseMap?.site})}>{option.label}</button>) :
          <p className="note">ตอนนี้ทีมยังเปลี่ยนฉากไม่ได้</p>}
</section>}
      {connected && dmPanel && 'caseMode' in dmPanel && dmPanel.investigators.map(entry=><details key={entry.id} open={entry.id===previewPlayer}>
        <summary>{playerName(entry.id)} · สถานที่ {entry.site}</summary>
        <details><summary>คิวบทเล่าของผู้เล่น · รอ {entry.narrative?.pending ?? 0} รายการ</summary>
         <p><strong>กำลังแสดง</strong> {entry.narrative?.current?.text ?? 'ยังไม่มีบทเล่า'}</p>
         {!!entry.narrative?.pending && <button disabled={!connected} onClick={()=>action('dmNarrativeNext',{targetId:entry.id,sequence:entry.narrative!.current!.sequence})}>เปิดบทถัดไปให้ผู้เล่นคนนี้</button>}
         <ol>{entry.narrative?.history.filter(beat=>beat.sequence>(entry.narrative?.current?.sequence ?? 0)).map(beat=><li key={beat.sequence}>พื้นที่ {beat.site} · {beat.text}</li>)}</ol>
        </details>
        <details className="dm-event-list"><summary>เหตุการณ์และเงื่อนไข · เฉพาะผู้ดำเนินเรื่อง</summary>
         {entry.events?.map(event=><details key={event.id}><summary>{event.label} · {{ready:'เงื่อนไขครบ',blocked:'ยังใช้ไม่ได้',fired:'เกิดขึ้นแล้ว'}[event.status]}</summary>
          <p>{event.text}</p>{event.reasons.length?<ul>{event.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>:<p>ระบบจะตรวจอีกครั้งเมื่อมีการกระทำที่เกี่ยวข้อง</p>}
         </details>)}
        </details>
        {entry.choices.filter(choice=>!choice.answer || !world.manualDm).map(choice=>
          <button key={choice.id} onClick={()=>action('caseDm',{targetId:entry.id,actionId:choice.id})}>{choice.label}</button>)}
      </details>)}
      </section>
    </section> : <section className="game-panel" aria-label="แผงผู้ดำเนินเรื่อง">
        <h2>แผงผู้ดำเนินเรื่อง</h2>
        <p>ให้ผู้สืบสวน 2–6 คนเลือกตัวละครก่อนเริ่มคดี</p>
        <button className="primary" disabled={!canStart} onClick={()=>action('caseStart',{mode:'story'})}>เริ่มคดี 001</button>
        <button disabled={!connected} onClick={()=>action('releaseDm')}>คืนบทผู้ดำเนินเรื่อง</button>
        {dmPanel?.guide && <GmGuide chapters={dmPanel.guide} current="A"/>}
      </section>}
    </div></div>
  </main>;
}
