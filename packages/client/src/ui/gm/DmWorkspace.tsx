import './DmWorkspace.css';
import { CaseNavIcon } from '../case/CaseNavIcon';
import { CaseStoryThread } from '../case/CaseStoryThread';
import { DmStoryReader } from './DmStoryReader';
import {SessionSaveControls} from './SessionSaveControls';
import type {Socket} from 'socket.io-client';
import { DmOutcomeCard } from './DmOutcomeCard';
import { useEffect, useRef, useState } from 'react';
import type { CaseDmPanel, GmChapter, Room, Snapshot } from '../../network/onlineTypes';
import { DmStoryEvents, GuidedPanel } from '../case/GuidedPanel';
import { D20Card, D20Result } from '../case/D20Card';
import { DmHistory } from '../case/DmHistory';
import { DmPlayerView, type PlayerPreview } from './DmPlayerView';
import { CaseScene } from '../case/CaseScene';
import { TurnConclusion, TurnEncounter } from '../combat/TurnEncounter';

function DmAdjudication({panel,enabled,action,playerName,onPrepared,checksOnly=false}:{
 panel:CaseDmPanel;enabled:boolean;playerName:(id:string)=>string;checksOnly?:boolean;onPrepared?:()=>void;
 action:(type:string,payload?:object,onSuccess?:()=>void)=>void;
}) {
 const [actor,setActor]=useState('');
 const [selected,setSelected]=useState('');
 const investigators=panel.investigators.filter(entry=>entry.actions?.some(option=>!checksOnly || option.check));
 const investigator=investigators.find(entry=>entry.id===actor) ?? investigators[0];
 const options=investigator?.actions?.filter(option=>!checksOnly || option.check) ?? [];
 const choice=options.find(option=>option.id===selected);
 return <section className="dm-quick-card" aria-label="DM ตัดสินการกระทำ">
  <h4>{checksOnly?'เลือกการทอยที่ฉากรองรับ':'ผู้เล่นบอกว่าอยากทำอะไร?'}</h4>
  <p className="note">ฟังคำถามหรือวิธีลงมือก่อน ถ้าได้ข้อมูลแน่นอน ให้ตอบได้เลย ไม่ต้องทอย</p>
  {investigator ? <form onSubmit={event=>{
   event.preventDefault();if(!choice)return;
   action('caseDm',{targetId:investigator.id,actionId:choice.id},()=>{setSelected('');if(choice.check)onPrepared?.();});
  }}>
   <label>ผู้ลงมือ <select value={investigator.id} onChange={event=>{setActor(event.target.value);setSelected('');}}>
    {investigators.map(entry=><option key={entry.id} value={entry.id}>{playerName(entry.id)}</option>)}
   </select></label>
   <label>ผลหรือการทอยที่ใช้ได้ในฉากนี้ <select value={choice?.id ?? ''} onChange={event=>setSelected(event.target.value)}>
    <option value="">เลือกให้ตรงกับสิ่งที่ผู้เล่นประกาศ</option>
    {options.map(option=><option key={option.id} value={option.id}>{option.label}{option.check?' · ต้องทอย':''}</option>)}
   </select></label>
   <button type="submit" disabled={!enabled || !choice || !!investigator.check || investigator.diceRequest?.die===null}>{choice?.check?'เตรียมการ์ดทอยให้ผู้เล่น':'ยืนยันทำการกระทำนี้'}</button>
  </form> : <p>ตอนนี้ไม่มี{checksOnly?'จุดทอย':'การกระทำที่ต้องบันทึก'}ที่ผ่านเงื่อนไขของฉาก คุยและเล่าผลได้ตามสถานการณ์</p>}
 </section>;
}

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
  socket, room, world, investigators, preview, previewPlayer, setPreviewPlayer, dmPanel,
  action, playerName, canStart, status, connected, limit, leaveRoom, leaving,
}: {
  socket:Socket|null;
  room:Room;
  world:Snapshot|null;
  investigators:Room['players'];
  preview?:PlayerPreview;
  previewPlayer:string;
  setPreviewPlayer:(id:string)=>void;
  dmPanel:CaseDmPanel|null;
  action:(type:string,payload?:object,onSuccess?:()=>void,onSettled?:(error?:string)=>void)=>void;
  playerName:(id:string)=>string;
  canStart:boolean;
  status:string;
  connected:boolean;
  limit:number;
  leaveRoom:()=>void;
  leaving:boolean;
}) {
  const [selectedTab,setDmTab]=useState<'guide'|'queue'|'dice'|'team'|'npcs'|'backup'|'history'|'scene'>();
  const dmTab=selectedTab ?? 'queue';
  useEffect(()=>{if(world?.paused)setDmTab('team');},[world?.paused]);
  const nextStep=useRef<HTMLElement>(null);
  const [previewOpen,setPreviewOpen]=useState(false);
  const [selectedLine,setSelectedLine]=useState('');
  const [selectedBeat,setSelectedBeat]=useState('');
  const dicePlayers=dmPanel?.investigators ?? [];
  const pendingDice=dicePlayers.filter(entry=>entry.check && entry.diceRequest?.die!==null);
  const battle=world?.caseMap?.battle;
  const turnEncounter=!!battle?.turnEncounter;
  useEffect(()=>{if(turnEncounter) setDmTab('queue');},[turnEncounter]);
  const currentScene=world?.caseMap?.site;
  const queue=(dmPanel?.narration ?? []).filter(card=>card.current ?? card.site===currentScene).sort((a,b)=>Number(b.eventId.startsWith('guided-cue:'))-Number(a.eventId.startsWith('guided-cue:')) || Number(!!b.answer)-Number(!!a.answer));
  const otherScenes=(dmPanel?.narration ?? []).filter(card=>!(card.current ?? card.site===currentScene));
  const lead=dmPanel?.investigators.find(entry=>entry.id===previewPlayer && entry.site===currentScene)
    ?? dmPanel?.investigators.find(entry=>entry.site===currentScene);
  const answers=lead?.choices.filter(choice=>choice.answer) ?? [];
  const sent=dmPanel?.sent ?? {};
  const recentlySent=Object.entries(sent).filter(([,entry])=>entry.site===currentScene).sort(([,a],[,b])=>b.sequence-a.sequence);
  const nextCard=queue[0];
  const canChooseBeat=queue.length>1 && !nextCard?.eventId.startsWith('guided-cue:');
  const visibleBeat=(canChooseBeat && queue.find(card=>card.id===selectedBeat)) || nextCard;
  const reactionEvents=(dmPanel?.storyEvents ?? []).filter(event=>['prevented','fatal','backlash-prevented','backlash-resolved'].includes(event.id));
  const sceneEvents=(dmPanel?.storyEvents ?? []).filter(event=>event.id!=='enable-lethal' && !event.id.startsWith('context:') && !reactionEvents.includes(event));
  const lethalSetting=dmPanel?.storyEvents?.find(event=>event.id==='enable-lethal');
  const lines=[
    ...answers.map(choice=>({id:choice.id,label:[choice.speaker,choice.label==='บทหลัก'?null:choice.label].filter(Boolean).join(' · ') || 'บทบรรยาย',text:choice.answer,prepare:false})),
    ...(dmPanel?.storyEvents ?? []).filter(event=>event.id.startsWith('context:')).map(event=>({
      id:'guided-talk:'+event.id.slice('context:'.length),label:event.label,text:event.detail,prepare:true,
    })),
  ];
  const line=lines.find(item=>item.id===selectedLine) ?? lines[0];
  const guided=world?.guided;
  const progression=dmPanel?.backup?.progression;
  const destination=guided?.transition?.to ?? progression?.to;
  const nextChapter=destination==='FINAL'?'ช่วงท้าย':'บท '+(destination ?? 'ถัดไป');
  const currentTitle=dmPanel?.storyReader?.scenes.find(scene=>scene.id===guided?.scene)?.title ?? world?.case001?.location;
  const readyScenes=dmPanel?.guidedScenes?.filter(scene=>scene.canOpen!==false && scene.id!==guided?.scene && !scene.id.startsWith('ENDING ')) ?? [];
  const leadScenes=readyScenes.filter(scene=>progression?.leadScenes.includes(scene.id) && !scene.sent);
  const extraScenes=readyScenes.filter(scene=>!leadScenes.includes(scene));
  const sceneName=(id:string)=>[id,dmPanel?.storyReader?.scenes.find(scene=>scene.id===id)?.title].filter(Boolean).join(' · ');
  const available=connected && !world?.paused;
  const openScene=(id:string)=>action('guided',{command:'scene',target:id},()=>setDmTab('queue'));
  const sendBeat=(type:string,payload?:object)=>action(type,payload,()=>{
    const step=nextStep.current;
    if(step && step.getBoundingClientRect().top<76)step.scrollIntoView({block:'start'});
  });
  const showPreview=previewOpen && dmTab==='team' && !!world?.case001;
  const handlingRoll=dmTab==='dice';
  return <main className="game-shell online-shell dm-shell case-ui">
    <header className="online-heading dm-case-heading">
      <div><p className="eyebrow">บริษัท เรื่องผีไว้ใจผม จำกัด · ห้อง {room.code}</p><h1>{world?.case001?.title ?? 'ห้องผู้ดำเนินเรื่อง'}</h1></div>
      <p className="turn-chip" role="status">{status || (connected?'เชื่อมต่อแล้ว':'กำลังเชื่อมต่อ')}</p>
    </header>
    <div className="dm-workspace" data-preview={showPreview}><div className="dm-preview-pane" hidden={!showPreview}>
    <label className="dm-view-selector">เลือกมุมมองผู้สืบสวน <select value={previewPlayer} onChange={event=>setPreviewPlayer(event.target.value)}>
      <option value="">เลือกผู้สืบสวน</option>
      {investigators.map(player=><option key={player.id} value={player.id}>{playerName(player.id)}</option>)}
    </select></label>
    {preview && preview.players[previewPlayer] ? <DmPlayerView playerId={previewPlayer} preview={preview}/> : <section className="game-panel"><h2>มุมมองผู้สืบสวน</h2><p>{world?.inactivePlayers?.includes(previewPlayer)?'ตัวละครนี้พักใน session วันนี้ ข้อมูลเดิมยังอยู่':investigators.length ? 'กำลังโหลดฉากของผู้เล่น' : 'รอผู้สืบสวนเข้าห้อง ฉากและสถานะของทีมจะแสดงที่นี่'}</p></section>}
    </div><div className="dm-controls-pane">
    {world?.case001 ? <section className="game-panel">
      <div className="dm-case-status">
        <div><span className="eyebrow">{guided ? (guided.phase==='FINAL'?'ช่วงท้าย':guided.phase==='ENDING'?'บทสรุป':'บท '+guided.phase)+' · '+guided.scene : 'สถานที่ปัจจุบัน'}</span><strong>{currentTitle}</strong></div>
        <span>{investigators.length}/{limit} คน · ช่วยแล้ว {world.case001.rescued}/3{world.case001.time && ' · '+world.case001.time}</span>
      </div>
      <nav className="dm-case-tabs case-main-navigation" aria-label="หน้าหลัก DM">
        <button type="button" aria-pressed={dmTab==='queue' || handlingRoll} onClick={()=>setDmTab('queue')}><CaseNavIcon name="play"/><span>{turnEncounter?'เผชิญหน้า':'ดำเนินเกม'}</span>{queue.length ? ' · '+queue.length : ''}</button>
        <button type="button" aria-pressed={['guide','npcs','backup','history'].includes(dmTab)} onClick={()=>setDmTab('guide')}><CaseNavIcon name="journal"/><span>คู่มือฉาก</span></button>
        <button type="button" aria-pressed={dmTab==='team'} onClick={()=>setDmTab('team')}><CaseNavIcon name="room"/><span>จัดการห้อง</span></button>
        <button type="button" aria-pressed={dmTab==='scene'} onClick={()=>setDmTab('scene')}><CaseNavIcon name="play"/><span>จัดฉาก</span></button>
      </nav>
      {(dmTab==='queue' || handlingRoll) && <div className="dm-case-secondary" aria-label="เครื่องมือระหว่างเล่น">
        {handlingRoll && <button type="button" onClick={()=>setDmTab('queue')}>{turnEncounter?'กลับไปฉากเผชิญหน้า':'กลับไปจ่ายบท'}</button>}
        <button type="button" onClick={()=>setDmTab('guide')}><CaseNavIcon name="questions"/>คลังคำตอบ</button>
        <button type="button" aria-pressed={dmTab==='dice'} onClick={()=>setDmTab('dice')}><CaseNavIcon name="dice"/>D20{pendingDice.length>0?' · '+pendingDice.length:''}</button>
      </div>}
      {['guide','npcs','backup','history'].includes(dmTab) && <div className="dm-case-secondary" aria-label="เอกสารอ้างอิง DM">
        {(['guide','npcs','backup','history'] as const).map((tab,index)=><button key={tab} type="button" aria-pressed={dmTab===tab} onClick={()=>setDmTab(tab)}>{['สารบัญฉาก','แฟ้ม NPC','ทางสำรอง','บันทึก'][index]}</button>)}
      </div>}
      {world.paused && <p className="gm-alert" role="status">คดีพักอยู่ <button type="button" onClick={()=>setDmTab('team')}>ไปเปิดเล่นต่อ</button></p>}
      {dmTab==='dice' && world.latestRoll && <D20Card key={world.latestRoll.id} card={world.latestRoll} rollerName={playerName(world.latestRoll.playerId)}/>}
      {!dmPanel && dmTab==='queue' && <p role="status">กำลังโหลดคิวและสถานะฉาก</p>}
      {world.manualDm && dmPanel && <>
      {dmTab==='scene' && <section className="gm-pane" aria-label="จัดฉากเฉพาะ DM">
        <h3>จัดภาพฉาก</h3>
        <p className="note">วางใหม่จะซ่อนก่อน กดแสดงเมื่อต้องการให้ผู้เล่นเห็น · การย้ายภาพไม่ย้าย NPC ในเนื้อเรื่อง</p>
        {world.caseMap && <CaseScene key={world.caseMap.site} site={world.caseMap.site} location={world.case001.location}
          npcs={world.caseMap.npcs} editingDisabled={!available || !!world.caseMap.battle || !!world.case001.report}
          placeNpc={(npcId,position)=>action('dmPlaceNpc',{site:world.caseMap!.site,npcId,position})}/>}
      </section>}
      <section hidden={dmTab!=='guide'} className="gm-pane">
        <p className="note">คู่มือนี้มีไว้ให้ DM อ่านและสวมบทบาท ข้อความในคู่มือจะไม่ส่งไปถึงผู้เล่น</p>
        {world.guided && !dmPanel.storyReader && <GuidedPanel view={world.guided} scenes={dmPanel.storyReader?undefined:dmPanel.guidedScenes} npcDossiers={dmPanel.npcDossiers} dmNavigation={false} connected={connected && !world.paused} action={action} isDm/>}
        {world.guided && dmPanel.storyReader && <DmStoryReader reader={dmPanel.storyReader} allowed={dmPanel.guidedScenes} view={world.guided} connected={available} action={(type,payload)=>type==='guided' && payload && 'target' in payload && typeof payload.target==='string' ? openScene(payload.target) : action(type,payload)}/>}
        {!world.guided && dmPanel.guide && <GmGuide chapters={dmPanel.guide}
          current={world.case001.report ? 'ENDINGS' : (battle?.phase || currentScene==='E' && world.case001.seals===3) ? 'FINAL' : world.caseMap?.site ?? 'A'}/>}
        {!dmPanel.storyReader && dmPanel.investigators[0]?.secret && <details className="dm-private">
          <summary>ข้อมูลลับของฉากปัจจุบัน</summary><p>{dmPanel.investigators[0].secret}</p>
        </details>}
      </section>
      <section hidden={dmTab!=='backup'} className="gm-pane gm-backup" aria-label="แผนสำรองสำหรับ DM">
       {dmPanel.backup ? <>
        <h3>ทีมติดขัด · บท {dmPanel.backup.phase} / ฉาก {dmPanel.backup.scene}</h3>
        <p className="note">เฉพาะ DM · ใช้ตามสิ่งที่เกิดขึ้นจริง ตรวจเงื่อนไขและผู้ที่อยู่ในฉากก่อนเล่า คำแนะนำไม่ส่งให้ผู้เล่นอัตโนมัติ</p>
        {!dmPanel.backup.opened && <p className="gm-alert">บทเปิดฉากยังไม่ได้ส่ง ให้เปิดคิวและส่งก่อนใช้คำใบ้</p>}
        {dmPanel.backup.battle && <section><h4>ระหว่างเผชิญหน้า</h4><p>ให้ทีมตรวจพื้นที่อันตราย จุดอาคม และตัวเลือกเจรจาหรือถอยตามสถานการณ์ การถอยใช้คำสั่งในเทิร์นของผู้เล่น</p><p>การเปลี่ยนบทยังทำไม่ได้จนกว่าการเผชิญหน้าจะจบ</p></section>}
        <section><h4>สิ่งที่ส่งให้ทั้งทีมล่าสุด</h4>{dmPanel.backup.delivered.length ? <ol>{dmPanel.backup.delivered.map(item=><li key={item.sequence}>{item.text}</li>)}</ol> : <p>ยังไม่มีบทที่ส่งให้ทั้งทีม</p>}<p className="note">เป็นประวัติล่าสุด ไม่ใช่รายการความรู้ทั้งหมดของทีม</p></section>
        <section><h4>คำใบ้แบบค่อยเป็นค่อยไป</h4><p className="note">เลือกให้เหมาะกับฉากและสิ่งที่ทีมพบแล้ว อย่าเล่าข้อมูลที่ยังไม่ควรรู้</p><ol>{dmPanel.backup.hints.map((hint,i)=><li key={i}>{hint}</li>)}</ol></section>
        <details><summary>พลาดเบาะแสหรือทอยไม่ผ่าน</summary><p className="note">ข้อมูลเตรียมบทเฉพาะ DM: ใช้แหล่งสำรองเมื่อทีมไปถึงและเข้าเงื่อนไขจริง</p><ul>{dmPanel.backup.alternatives.map((item,i)=><li key={i}>{item}</li>)}</ul></details>
        <section><h4>ทางไปต่อ</h4><p>{dmPanel.backup.exit}</p>{dmPanel.backup.blockers.length ? <ul>{dmPanel.backup.blockers.map(item=><li key={item}>{item}</li>)}</ul> : <p>ส่งสรุปและขอยืนยันจากหน้าดำเนินเกม</p>}<button type="button" onClick={()=>setDmTab('queue')}>กลับไปดำเนินเกม</button>{!dmPanel.backup.opened && <button type="button" onClick={()=>setDmTab('queue')}>ไปคิวบท</button>}</section>
        <details><summary>เมื่อทีมอยากพักหรือปิดคดี</summary><p>ใช้ปุ่มพักคดีหรือถอนทีมในหน้าจัดการห้อง ปุ่มพักจะหยุดการกระทำของทุกคนและเปิดเล่นต่อได้ ตกลงพักกับทีมได้ และให้สมาชิกกลับเข้าห้องเดิมเมื่อพร้อมตามการตั้งค่าบันทึกของเซิร์ฟเวอร์ ออกชั่วคราวแล้วกลับด้วยปุ่มเล่นต่อหรือรหัสส่วนตัวได้</p><p>DM ถอนทีมได้ทุกบท และระบบใช้ผลที่เกิดขึ้นจริง การปิดคดีแล้วกลับมาสืบต่อไม่ได้</p></details>
       </> : <p>แผนสำรองนี้ใช้กับคดีแบบนำทางที่กำลังเล่น</p>}
      </section>
      {dmTab==='queue' && battle?.turnEncounter && world.caseMap &&
        <TurnEncounter site={world.caseMap.site} battle={battle} characters={world.characters ?? {}}
          isDm enabled={available} paused={world.paused} action={action}
          onManageRoll={pendingDice.some(entry=>entry.id===battle.active)?()=>setDmTab('dice'):undefined}/>}
      <section hidden={dmTab!=='queue'} className="gm-pane dm-live-grid">
        <div className="dm-live-main">
        {world.caseMap?.turnConclusion && !battle && <TurnConclusion result={world.caseMap.turnConclusion}/>}
        <section className="dm-next-step" aria-label="ขั้นตอนถัดไป" aria-live="polite" ref={nextStep}>
          <p className="eyebrow">ทำตอนนี้</p>
          {nextCard ? <h3>{visibleBeat?.answer?'จ่ายบทตอบตามผลทอย':'อ่านและจ่ายบท'} <small>รอส่ง {queue.length}</small></h3> :
           world.case001.report ? <><h3>ปิดคดีแล้ว</h3><button type="button" onClick={()=>setDmTab('history')}>เปิดรายงานคดี</button></> :
           guided?.transition ? <>
            <h3>DM เลือกไป{nextChapter}</h3>
            <button type="button" disabled={!available} onClick={()=>action('guided',{command:'confirm',target:guided.transition!.id})}>ยืนยันเปิด{nextChapter}</button>
            <button type="button" disabled={!available} onClick={()=>action('guided',{command:'cancel'})}>ยกเลิกการเปลี่ยนบท</button>
           </> : leadScenes.length>0 ? <>
            <h3>เล่าฉากนี้จบแล้ว · เลือกทำต่อ</h3>
            <p>ตรวจคำถามหรือบันทึกผลที่เกิดขึ้นในฉากนี้ก่อน เมื่อทีมพร้อมจึงเปิดฉากถัดไป</p>
            {leadScenes.map(scene=><button key={scene.id} type="button" className="primary" disabled={!available} onClick={()=>openScene(scene.id)}>เปิด {sceneName(scene.id)}</button>)}
           </> : progression?.canPropose ? <>
            <h3>DM เปิด{nextChapter}</h3>
            <p>เมื่อเล่าเรื่องและตัดสินผลครบแล้ว DM เปิดช่วงถัดไปได้เอง</p>
            <button type="button" className="primary" disabled={!available} onClick={()=>action('guided',{command:'propose'})}>เปิด{nextChapter}</button>
           </> : !guided && dmPanel.travel.length>0 ? <>
            <h3>คิวหมดแล้ว · เลือกจุดหมาย</h3>
            {dmPanel.travel.map(option=><button key={option.id} type="button" disabled={!available} onClick={()=>action('dmTravel',{actionId:option.id,site:currentScene})}>{option.label}</button>)}
           </> : <>
            <h3>{battle?'กำลังเผชิญหน้า':'คิวหมดแล้ว'}</h3>
            <p>{progression?.reason ?? 'รอการกระทำหรือคำถามจากทีม'}</p>
           </>}
        </section>
        {canChooseBeat && <label className="dm-beat-picker">เลือกบทที่จะส่ง <select value={visibleBeat?.id} onChange={event=>setSelectedBeat(event.target.value)}>
          {queue.map(card=><option key={card.id} value={card.id}>{card.answer?.label ?? card.text.slice(0,75)}</option>)}
        </select></label>}
        {visibleBeat && ((card)=>card.answer ? <DmOutcomeCard key={card.id} id={card.id} answer={card.answer} current={card.current ?? true} connected={available} action={sendBeat} playerName={playerName}/> : <article className="gm-publish gm-next-beat" key={card.id}>
          <h4>{card.eventId.startsWith('guided-cue:')?'เปิด '+sceneName(card.eventId.slice('guided-cue:'.length)):card.eventId.startsWith('entry:')?'เปิดฉาก':card.eventId.startsWith('ending:')?'ตอนจบ':'พื้นที่ '+card.site}</h4>
          <p className="note">อ่านในบท · {card.speakers?.length ? 'ผู้บรรยาย / '+card.speakers.join(' / ') : 'ผู้บรรยาย'}</p>
          <div className="gm-read-aloud"><span className="gm-label">อ่านให้ผู้เล่นฟัง</span><p className="story-text">{card.text}</p></div>
          {card.recipients && <p className="note">ผู้รับ · {card.recipients.map(playerName).join(', ')}</p>}
          <button type="button" className="primary" disabled={!available} onClick={()=>sendBeat('dmPublish',{cardId:card.id})}>ส่งข้อความนี้ให้ผู้เล่น</button>
        </article>)(visibleBeat)}
        {queue.length>1 && !canChooseBeat && <p className="note">รออีก {queue.length-1} บท จะขึ้นต่อหลังจากจ่ายบทนี้</p>}
        {!nextCard && !guided?.transition && !world.case001.report && reactionEvents.length>0 &&
          <div className="dm-flow-followup"><h4>ให้ทีมรับมือก่อนเดินเรื่องต่อ</h4>
            <DmStoryEvents events={reactionEvents} connected={available} action={action} expanded/>
          </div>}
          {guided && ['5.2','5.3','5.5'].includes(guided.version) && <CaseStoryThread view={guided} beats={dmPanel.sharedStory ?? []} isDm onHistory={()=>setDmTab('history')}/>}
            {!nextCard && (sceneEvents.length>0 || guided?.scene==='H1' || guided?.scene==='B3') && <section className="dm-quick-card">
              <h4>บันทึกข้อเท็จจริงที่เกิดขึ้นแล้ว</h4>
              <p className="note">ใช้หลังทีมลงมือจริง เพื่อให้บทพูดและฉากถัดไปสอดคล้องกับผลที่เกิดขึ้น การเปิดอ่านยังไม่บันทึกผล</p>
              {guided?.scene==='H1' && <button type="button" disabled={!available} onClick={()=>action('guided',{command:'contactPrasert'})}>โทรหาประเสริฐหลังวิเคราะห์หลักฐานครบ</button>}
              {guided?.scene==='B3' && <button type="button" disabled={!available} onClick={()=>action('guided',{command:'protect'})}>ยืนยันว่าคุยส่วนตัวและคุ้มครองต้นแล้ว</button>}
              <DmStoryEvents events={sceneEvents} connected={available} action={action} expanded/>
            </section>}
        </div>
        <aside className="dm-live-side" aria-label="เครื่องมือประจำฉาก">
          <DmAdjudication panel={dmPanel} enabled={available} action={action} playerName={playerName} onPrepared={()=>setDmTab('dice')}/>
          {!!guided?.escorting && <button type="button" disabled={!available || !!battle} onClick={()=>action('guided',{command:'evacuate'})}>บันทึกว่าพาผู้สูญหายถึงจุดปลอดภัยแล้ว · {guided.escorting} คน</button>}
          {!!guided?.disclosureOptions?.length && <form className="dm-quick-card" onSubmit={event=>{
           event.preventDefault();const data=new FormData(event.currentTarget);
           action('guided',{command:'select-disclosure',target:JSON.stringify({evidence:data.getAll('evidence'),recipient:data.get('recipient')})});
          }}>
           <h4>บันทึกหลักฐานที่จะส่งมอบในบทส่งท้าย</h4>
           {guided.disclosureOptions.map(item=><label key={item.id}><input type="checkbox" name="evidence" value={item.id} required={item.id==='E07'}/>{item.label}</label>)}
           <label>ผู้รับหลักฐาน<input name="recipient" required maxLength={120}/></label>
           <button disabled={!available}>บันทึกผู้รับและหลักฐาน</button>
           <p className="note">ยังไม่ถือว่าเปิดเผยสำเร็จ จนยืนยันการส่งมอบจริง</p>
          </form>}
          {!guided?.transition && !world.case001.report && <div className="dm-quick-grid">
            {extraScenes.length>0 && <section className="dm-quick-card">
              <h4>DM เลือกเปิดฉาก</h4>
              <p className="note">เลือกตามสิ่งที่ทีมสนใจ บทที่ยังไม่ส่งจะไม่ถูกเล่าให้ผู้เล่นเอง</p>
              <div className="dm-quick-actions">{extraScenes.map(scene=><button key={scene.id} type="button" disabled={!available} onClick={()=>openScene(scene.id)}>{sceneName(scene.id)}{scene.sent?' · เคยเปิดแล้ว':''}</button>)}</div>
            </section>}
            {line && <section className="dm-quick-card">
              <h4>บทพูดในฉาก</h4>
              {lines.length>1 && <label>เลือกบทพูด <select value={line.id} onChange={event=>setSelectedLine(event.target.value)}>
                {lines.map(item=><option key={item.id} value={item.id}>{item.label}{item.prepare?' · บทเสริม':''}</option>)}
              </select></label>}
              {lines.length===1 && <p className="note">{line.label}</p>}
              <p className="story-text">{line.text}</p>
              {line.prepare ? <>
                <p className="note">เปิดใช้เมื่อสถานการณ์ตรงกับบทพูดนี้</p>
                <button type="button" disabled={!available || !!nextCard} onClick={()=>{setSelectedLine(line.id);action('guided',{command:'v51:context:'+line.id.slice('guided-talk:'.length)});}}>เปิดใช้บทนี้</button>
              </> : <button type="button" disabled={!available} onClick={()=>action('caseDm',{targetId:lead?.id,actionId:line.id})}>{sent[line.id]?'ส่งอีกครั้ง':'ส่งบทพูดให้ทีม'}</button>}
            </section>}

          </div>}
          <section className="dm-quick-card dm-quick-reference">
            <h4>สถานะคดี</h4>
            {!!dmPanel.storySummary?.length && <ul>{dmPanel.storySummary.map(text=><li key={text}>{text}</li>)}</ul>}
            {recentlySent.length>0 && <p className="note">ส่งแล้วในพื้นที่นี้ {recentlySent.length} บท</p>}
            <button type="button" onClick={()=>setDmTab('history')}>ดูประวัติการเล่น</button>
          </section>
        </aside>
      </section>
      </>}
      <section hidden={dmTab!=='dice'} className="gm-pane gm-dice">
        <h3>บทตอบหลังทอย</h3>
        {queue.filter(card=>card.answer).map(card=><DmOutcomeCard key={card.id} id={card.id} answer={card.answer!} current={!!card.current} connected={connected} action={action} playerName={playerName}/>)}
        {!queue.some(card=>card.answer) && <p className="note">เมื่อจุดทอยตามสคริปต์จบ บทตอบตามคะแนนจะปรากฏที่นี่ การทอยที่ DM กำหนดเองให้เลือกบทตอบจากคู่มือฉาก</p>}
        <h3>การ์ดทอย D20 รายคน</h3>
        {dmPanel && ['5.2','5.3','5.5'].includes(guided?.version ?? '') && <DmAdjudication panel={dmPanel} enabled={available} action={action} playerName={playerName} checksOnly/>}
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
                action('dmRequestRoll',{targetId:entry.id,checkId:entry.check!.id,difficulty:['5.1','5.2','5.3','5.5'].includes(world.guided?.version ?? '') && entry.check!.dice ? entry.check!.dice.dc : Number(data.get('difficulty')),...(!entry.check!.dice ? {stat:data.get('stat')} : {})});
              }}>
                {entry.check.dice ? <p className="note">ใช้ {entry.check.dice.stat} ตามจุดทอยในบท · DC แนะนำ {entry.check.dice.dc}</p> :
                  <label>ค่าสถานะ <select name="stat" defaultValue={entry.check.stat ?? 'PER'}><option value="BODY">ร่างกาย BODY</option><option value="PER">การสังเกต PER</option><option value="INT">เชาวน์ปัญญา INT</option><option value="SOC">การเข้าสังคม SOC</option><option value="SPI">จิตวิญญาณ SPI</option><option value="RES">ความต้านทาน RES</option></select></label>}
                <label>ความยากก่อนส่งการ์ด <select name="difficulty" disabled={['5.1','5.2','5.3','5.5'].includes(world.guided?.version ?? '') && !!entry.check.dice} defaultValue={entry.check.dice?.dc ?? 14}>
                  <option value="11">ง่าย · DC 11</option><option value="14">ปกติ · DC 14</option><option value="17">ยาก · DC 17</option><option value="20">ยากมาก · DC 20</option><option value="22">พิเศษ · DC 22</option>
                </select></label>
                <button type="submit" className="primary" disabled={!connected || !!world.case001?.report}>ส่งการ์ดตามคำขอ</button>
              </form> : ['5.2','5.3','5.5'].includes(guided?.version ?? '') ? <p className="note">เลือกการกระทำที่ฉากรองรับด้านบนก่อน จึงส่งการ์ดให้ผู้เล่นได้</p> :
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
      {guided && ['5.2','5.3','5.5'].includes(guided.version) && <CaseStoryThread view={guided} beats={dmPanel?.sharedStory ?? []} isDm showHistory/>}
      {!!recentlySent.length && <details><summary>บทที่ส่งแล้วในพื้นที่นี้ · {recentlySent.length}</summary>
        <ul>{recentlySent.map(([id,entry])=><li key={id}>{entry.text}</li>)}</ul>
      </details>}
      {!!otherScenes.length && <details><summary>บทที่พักไว้จากฉากอื่น · {otherScenes.length}</summary>
        <ul>{otherScenes.map(card=><li key={card.id}>{card.text}</li>)}</ul>
      </details>}
      <details><summary>บันทึกสถานการณ์</summary><p>{world.case001.notice}</p></details>
      {world.case001.report && <pre className="story-text">{world.case001.report.text}</pre>}
      </div>
      <section hidden={dmTab!=='npcs'} className="gm-pane" aria-label="แฟ้ม NPC เฉพาะ DM">
        <h3>แฟ้ม NPC · เฉพาะ DM</h3><p className="note">ใช้เตรียมสวมบท ข้อมูลในแฟ้มไม่ได้ส่งให้ผู้เล่น</p>
        {dmPanel?.npcDossiers?.map(npc=><details className="dm-private npc-dossier" key={npc.id}>
          <summary>{npc.name}</summary>
          <dl><dt>อารมณ์และวิธีสวมบท</dt><dd>{npc.roleplay}</dd><dt>ประวัติ</dt><dd>{npc.background}</dd><dt>แรงจูงใจ</dt><dd>{npc.motivation}</dd><dt>สิ่งที่รู้</dt><dd>{npc.knowledge}</dd><dt>ข้อมูลลับ / เงื่อนไข</dt><dd>{npc.secret}</dd></dl>
        </details>)}
      </section>
      <section hidden={dmTab!=='team'} className="gm-pane">
        <div className="dm-case-secondary">
          <button type="button" aria-pressed={previewOpen} onClick={()=>setPreviewOpen(!previewOpen)}>{previewOpen?'ซ่อน':'แสดง'}มุมมองผู้สืบสวน</button>
          <button type="button" disabled={!connected || leaving} onClick={leaveRoom}>ออกชั่วคราว</button>
        </div>
        <details><summary>รายชื่อทีม · {investigators.length} คน</summary><ul>{investigators.map(player=><li key={player.id}>{playerName(player.id)} · {player.connected===false?'ยังไม่กลับเข้าห้อง':'อยู่ในห้อง'}</li>)}</ul></details>
    {dmTab==='team' && world?.case001 && !world.case001.report && <section className="session-tools" aria-label="จัดการคดี">
     {lethalSetting && <section className="dm-quick-card">
      <h4>ตั้งค่าความเสี่ยงของคดี · ไม่ใช่ผลการกระทำ</h4>
      <p>เปิดใช้เหตุถึงตายตามบท และเตรียมข้อความแจ้งทีม ไม่ทำให้ตัวละครเสียชีวิตทันที ไม่มีการตายจากเวลาที่ผ่านไป</p>
      <button type="button" disabled={!available} onClick={()=>action('guided',{command:'v51:enable-lethal'})}>เปิดใช้เหตุถึงตายตามบทและเตรียมแจ้งทีม</button>
     </section>}
     <SessionSaveControls socket={socket} connected={connected} paused={!!world.paused} playerName={playerName} investigators={investigators} inactive={world.inactivePlayers} action={action}/>
     <details className="session-advanced"><summary>ย้อนบทหรือปิดคดี</summary>
     <button disabled={!connected} onClick={()=>{if(window.confirm('ย้อนกลับจุดเริ่มบทปัจจุบันสำหรับทุกคน? การกระทำหลังจุดนั้นจะถูกยกเลิก และคดีจะพักให้ตรวจสถานะก่อนเล่นต่อ'))action('dmSessionControl',{command:'rewind'});}}>ย้อนต้นบท</button>
     <button disabled={!connected} className="danger" onClick={()=>{if(window.confirm('ถอนทีมและปิดคดีสำหรับทุกคน? ระบบจะสรุปตามผลที่เกิดขึ้นจริง และกลับมาสืบต่อในห้องนี้ไม่ได้'))action('dmSessionControl',{command:'withdraw'});}}>ถอนทีมและปิดคดี</button>
     </details>
    </section>}
      {dmPanel && <section className="gm-travel">        {dmPanel.wichai && <details><summary>ข้อมูลวิชัยสำหรับฉากต่อสู้</summary>
          <p>พลังชีวิต {dmPanel.wichai.baseHPFor2} · ป้องกันกาย {dmPanel.wichai.PDEF} · ป้องกันใจ {dmPanel.wichai.MDEF} · โจมตี {dmPanel.wichai.ATK} · ลำดับลงมือ {dmPanel.wichai.INIT} · ระยะเดิน {dmPanel.wichai.MOVE}</p>
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
        <p>ส่งรหัสห้องให้ทีม เลือกตัวละครครบอย่างน้อย 2 คนแล้วเริ่มได้</p>
        <div className="room-code-display"><span>รหัสห้อง</span><strong>{room.code}</strong><button type="button" onClick={()=>void navigator.clipboard?.writeText(room.code)}>คัดลอกรหัส</button></div>
        <ul className="attendance-list">{investigators.map(p=><li key={p.id}><strong>{playerName(p.id)}</strong><span className={'state-badge '+(world?.characters?.[p.id]?'success':'')}>{world?.characters?.[p.id]?'เลือกแล้ว':'กำลังเลือกตัวละคร'}</span></li>)}</ul>
        <button className="primary" disabled={!canStart} onClick={()=>action('caseStart',{mode:'story'})}>เริ่มคดี 001</button>
        <button disabled={!connected} onClick={()=>action('releaseDm')}>คืนบทผู้ดำเนินเรื่อง</button>
        <button disabled={!connected || leaving} onClick={leaveRoom}>ออกจากห้อง</button>
        {dmPanel?.guide && <GmGuide chapters={dmPanel.guide} current="A"/>}
      </section>}
    </div></div>
  </main>;
}
