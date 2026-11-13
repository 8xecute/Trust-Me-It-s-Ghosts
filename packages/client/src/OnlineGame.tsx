import {useCaseUpdates} from './ui/case/useCaseUpdates';
import { BASIC_RULES_MODE, professions } from '@baan/shared';
import { CaseNavIcon } from './ui/case/CaseNavIcon';
import { CaseStoryThread } from './ui/case/CaseStoryThread';
import { D20Card } from './ui/case/D20Card';
import { CaseNotebook } from './ui/case/CaseNotebook';
import { NarrativeJournal } from './ui/case/NarrativeJournal';
import type { PlayerPreview } from './ui/gm/DmPlayerView';
import { CharacterCreator, CoreStats } from './ui/characters/CharacterCreator';
import { GameHud } from './ui/combat/GameHud';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Biography } from '@baan/shared';
import { CaseScene } from './ui/case/CaseScene';
import { CastPortraits, portraitUrl, visibleCast } from './ui/characters/CastPortraits';
import { EncounterBoard } from './ui/combat/EncounterBoard';
import { TurnConclusion, TurnEncounter } from './ui/combat/TurnEncounter';
import { castProfiles } from '@baan/shared';

import { DmWorkspace } from './ui/gm/DmWorkspace';
import { DmHistory } from './ui/case/DmHistory';
import { Lobby } from './ui/lobby/Lobby';
import type { CaseDmPanel, PublicRoom, Reply, Room, Snapshot } from './network/onlineTypes';

const sessionKey = 'ghosts-room-session';
const savedSessionKey = 'ghosts-saved-room-session';
function actionCategory(id:string) {
  if(id.startsWith('travel:')) return 'travel';
  if(id.startsWith('talk:') || ['lore','confront','detain','surrender','sense'].includes(id)) return 'talk';
  if(['seal1','seal2','seal3','ritual','suppress','pacify','negotiate','show-clue','return','cut','unsafe-bracelet','study'].includes(id)) return 'ritual';
  if(['finish','advance','record-truth','bribe'].includes(id)) return 'mission';
  return 'explore';
}
const actionGroups = [
  {id:'explore',label:'สำรวจ'},
  {id:'talk',label:'สนทนา'},
  {id:'travel',label:'เดินทาง'},
  {id:'ritual',label:'พิธีกรรม'},
  {id:'mission',label:'จัดการภารกิจ'},
];

export function OnlineGame() {
  const withdrawalDialog = useRef<HTMLDialogElement>(null);
  const socket = useRef<Socket|null>(null);
  const self = useRef('');
  const latest = useRef<Snapshot|null>(null);
  const [room,setRoom] = useState<Room|null>(null);
  const [world,setWorld] = useState<Snapshot|null>(null);
  const [previewPlayer,setPreviewPlayer] = useState('');
  const [preview,setPreview] = useState<PlayerPreview>();
  const [publicRooms,setPublicRooms]=useState<PublicRoom[]>([]);
  const [dmPanel,setDmPanel] = useState<CaseDmPanel|null>(null);
  const dmReader=useRef<CaseDmPanel['storyReader']>(undefined);
  const [status,setStatus] = useState('');
  const [leaving,setLeaving]=useState(false);
  const [connected,setConnected] = useState(false);
  const [biography,setBiography] = useState<Biography>();
  const [caseTab,setCaseTab]=useState<'scene'|'story'|'journal'|'character'|'report'>('scene');
  const [actionGroup,setActionGroup] = useState('explore');

  function receive(snapshot:Snapshot,persistent?:boolean) {
    if(persistent) {
      const token=sessionStorage.getItem(sessionKey);
      if(token) localStorage.setItem(savedSessionKey,token);
    }
    if (!latest.current || snapshot.revision >= latest.current.revision) {
      latest.current=snapshot;
      setWorld(snapshot);
    }
  }
  function request(event:string,args:unknown[]=[],onSuccess?:()=>void,onSettled?:(error?:string)=>void) {
    const connection=socket.current;
    if (!connection?.connected) {setStatus('กำลังรอการเชื่อมต่อ');onSettled?.('กำลังรอการเชื่อมต่อ');return;}
    connection.timeout(event==='session:import'?20000:5000).emit(event,...args,(error:Error|null,reply:Reply)=>{
      if(error || !reply?.ok) {
        const message=error ? 'เซิร์ฟเวอร์ไม่ตอบกลับ' : reply?.error ?? 'ทำรายการไม่ได้';
        setStatus(message);
        onSettled?.(message);
        if(event==='room:resume' && !error) {
          sessionStorage.removeItem(sessionKey);
          if(reply?.error!=='ห้องนี้เปิดอยู่ในอีกหน้าต่าง' && localStorage.getItem(savedSessionKey)===args[0]) localStorage.removeItem(savedSessionKey);
          latest.current=null;
          self.current='';
          setWorld(null);
          setRoom(null);
        }
        return;
      }
      if(reply.token) {sessionStorage.setItem(sessionKey,reply.token);if(event==='session:import')localStorage.setItem(savedSessionKey,reply.token);}
      if(reply.playerId) self.current=reply.playerId;
      if(reply.room) setRoom(reply.room);
      if(reply.snapshot) receive(reply.snapshot,reply.persistent);
      setStatus('');
      onSuccess?.();
      onSettled?.();
    });
  }
  function action(type:string, payload:object={},onSuccess?:()=>void,onSettled?:(error?:string)=>void) {
    if(world?.paused && type!=='dmSessionControl') {setStatus('DM พักคดีอยู่ รอเปิดเล่นต่อ');onSettled?.('paused');return;}
    request('game:action',[{id:crypto.randomUUID(),type,...payload}],onSuccess,onSettled);
  }
  function caseRequest(payload:{actionId:string;boost?:string}) {
    action('caseAction',{...payload,site:world?.caseMap?.site});
  }
  useEffect(()=>{
    const connection=io(import.meta.env.VITE_SERVER_URL?.trim() || 'http://localhost:3001',{autoConnect:false});
    socket.current=connection;
    connection.on('connect',()=>{
      setConnected(true);
      setStatus('');
      const token=sessionStorage.getItem(sessionKey);
      if(token) request('room:resume',[token]);
    });
    connection.on('disconnect',()=>{setConnected(false);setStatus('การเชื่อมต่อขาด กำลังลองใหม่');});
    connection.on('connect_error',()=>{setConnected(false);setStatus('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');});
    connection.on('game:snapshot',receive);
    connection.on('room:update',setRoom);
    connection.on('lobby:rooms',setPublicRooms);
    connection.connect();
    return ()=>{connection.removeAllListeners();connection.disconnect();socket.current=null;};
  },[]);
  const isHumanDm = !!world?.humanDmId && world.humanDmId === self.current;
  useEffect(()=>{
    if (!connected || !isHumanDm) { dmReader.current=undefined;setDmPanel(null); return; }
    let current = true;
    socket.current?.timeout(5000).emit('dm:panel',{includeReader:!dmReader.current},(error:Error|null,reply:{ok:boolean;panel?:CaseDmPanel})=>{
      if(!current)return;
      const panel=!error && reply?.ok ? reply.panel : undefined;
      if(!panel){setDmPanel(null);return;}
      if(panel.storyReader)dmReader.current=panel.storyReader;
      const storyReader=panel.storyProgress && dmReader.current ? {...dmReader.current,...panel.storyProgress} : panel.storyReader;
      setDmPanel({...panel,storyReader});
    });
    return ()=>{current=false;};
  },[connected,isHumanDm,world?.revision]);

  useEffect(()=>{
    if(!connected || !isHumanDm || !previewPlayer) {setPreview(undefined);return;}
    let live=true;
    socket.current?.timeout(5000).emit('dm:preview',previewPlayer,(error:Error|null,reply:{ok:boolean;preview?:PlayerPreview})=>{
      if(live) setPreview(!error && reply?.ok ? reply.preview : undefined);
    });
    return ()=>{live=false;};
  },[connected,isHumanDm,previewPlayer,world?.revision]);

  const investigators=room?.players.filter(player=>player.id!==world?.humanDmId) ?? [];
  function playerName(id:string) {
    if(id===world?.humanDmId) return 'ผู้ดำเนินเรื่อง';
    const index=investigators.findIndex(player=>player.id===id);
    const c=world?.characters?.[id];
    const savedNames=world?.playerNames?.[id];
    return (savedNames?.playerName ?? c?.playerName ?? (index<0 ? id : 'ผู้สืบสวน '+(index+1)))+((savedNames?.characterName ?? c?.characterName)?' ('+(savedNames?.characterName ?? c?.characterName)+')':'');
  }
  const limit=6;
  const canStart=connected && investigators.length>=2 && investigators.length<=limit &&
    investigators.every(player=>world?.characters?.[player.id]);
  const character=world?.characters?.[self.current];
  const battle=world?.caseMap?.battle;
  const turnEncounter=!!battle?.turnEncounter;
  const showEncounter=turnEncounter && caseTab==='scene';
  useEffect(()=>{if(turnEncounter) setCaseTab('scene');},[turnEncounter]);
  const waitingForRoll=!!world?.pendingCheck || !!(world?.manualDm && world.diceRequest?.die===null);
  const cast=investigators.flatMap(player=>world?.characters?.[player.id]?.profession ?? []);
  useEffect(()=>{
    if(!character || !connected) return;
    let live=true;
    socket.current?.timeout(5000).emit('character:biography',(error:Error|null,reply:{ok:boolean;biography?:Biography})=>{
      if(live && !error && reply?.ok) setBiography(reply.biography);
    });
    return ()=>{live=false;};
  },[!!character,connected,room?.code]);
  const dmLed=!!world?.manualDm && ['5.2','5.3','5.5'].includes(world.guided?.version ?? '');
  const caseActions=(dmLed?[]:world?.case001?.actions ?? [])
    .filter(option=>!battle || option.dice || ['seal1','seal2','seal3','ritual','suppress','show-clue'].includes(option.id))
    .filter(option=>option.id!=='hint' || character?.profession==='paranormal_investigator')
    .filter(option=>option.id!=='sense' || character?.profession==='medium');
  const readScope=room && self.current ? room.code+':'+self.current : '';
  const deliveredBeats=(world?.narrative?.history ?? []).filter(beat=>beat.sequence<=(world?.narrative?.current?.sequence ?? 0));
  const unreadStory=useCaseUpdates(readScope+':story',deliveredBeats.map(beat=>beat.sequence+':'+beat.eventId+':'+beat.text),caseTab==='story' && !isHumanDm);
  const notebook=world?.case001?.notebook;
  const evidenceEntries=world?.guided && !world.guided.cue ? [] : [...(notebook?.confirmed ?? []).map(e=>'confirmed:'+e.id+':'+e.text+':'+e.source),...(notebook?.suspected ?? []).map(e=>'suspected:'+e.id+':'+e.text+':'+e.source)];
  const unreadEvidence=useCaseUpdates(readScope+':evidence',evidenceEntries,caseTab==='journal' && !isHumanDm);
  const groups=actionGroups.filter(group=>caseActions.some(option=>actionCategory(option.id)===group.id));
  const visibleGroup=groups.some(group=>group.id===actionGroup) ? actionGroup : groups[0]?.id;
  useEffect(()=>{
    if(isHumanDm && !investigators.some(player=>player.id===previewPlayer)) setPreviewPlayer(investigators[0]?.id ?? '');
  },[isHumanDm,room?.players,previewPlayer]);

  function leaveRoom() {
    const temporary=!!world?.case001;
    if(leaving || !window.confirm(temporary?'ออกชั่วคราวและเก็บตัวละครไว้? DM ควรดาวน์โหลดเซฟก่อนปิดเกม':'ออกจากห้องนี้?'))return;
    setLeaving(true);
    request(temporary?'room:detach':'room:leave',[],()=>{
      const token=sessionStorage.getItem(sessionKey);
      sessionStorage.removeItem(sessionKey);
      if(temporary && token)localStorage.setItem(savedSessionKey,token);
      else if(token && localStorage.getItem(savedSessionKey)===token)localStorage.removeItem(savedSessionKey);
      latest.current=null;
      self.current='';
      setRoom(null);
      setWorld(null);
      setBiography(undefined);
      setPreview(undefined);
      setPreviewPlayer('');
      setCaseTab('scene');
    },()=>setLeaving(false));
  }

  if(isHumanDm && room) return <DmWorkspace socket={socket.current} room={room} world={world} investigators={investigators}
    leaveRoom={leaveRoom} leaving={leaving} preview={preview} previewPlayer={previewPlayer} setPreviewPlayer={setPreviewPlayer} dmPanel={dmPanel}
    action={action} playerName={id=>playerName(id)+(world?.characters?.[id]?' · '+professions[world.characters[id].profession].name:'')} canStart={canStart} status={status} connected={connected} limit={limit}/>;

  const savedToken=room ? null : localStorage.getItem(savedSessionKey);
  return <main className={`game-shell online-shell player-shell case-ui${room ? '' : ' lobby-shell'}${world?.case001?' case-ui-active':''}`}>
    <header className="online-heading"><div><p className="eyebrow">บริษัท เรื่องผีไว้ใจผม จำกัด · ปฏิบัติการภาคสนาม</p><h1>{world?.case001 ? world.case001.title : room ? 'เตรียมทีมสำรวจ' : 'รวมทีมรับคดี'}</h1></div><p className="turn-chip" role="status">{status || (connected?'เชื่อมต่อแล้ว':'กำลังเชื่อมต่อ')}</p></header>
    {!room ? <Lobby connected={connected} publicRooms={publicRooms}
      resumeRoom={savedToken ? ()=>{
        sessionStorage.setItem(sessionKey,savedToken);
        request('room:resume',[savedToken]);
      } : undefined}
      importSave={save=>request('session:import',[save])}
      recoverRoom={token=>{sessionStorage.setItem(sessionKey,token);request('room:resume',[token],()=>localStorage.setItem(savedSessionKey,token));}}
      createRoom={()=>request('room:create:v2')} joinRoom={roomCode=>request('room:join:v2',[roomCode])}/> : <>
      <details className="session-members" open={!world?.case001 && (room.version!==2 || !!character)}>
        <summary>ทีมของคุณ · ห้อง {room.code} · {room.players.length} คน</summary>
      <ul>{room.players.map((player,index)=><li key={player.id}>{world?.characters?.[player.id] ? playerName(player.id)+' · '+professions[world.characters[player.id].profession].name : playerName(player.id)}{player.id===self.current?' (คุณ)':''}{player.id===world?.humanDmId?' · ผู้ดำเนินเรื่อง':''} · {player.ready?'พร้อม':'ยังไม่พร้อม'}</li>)}</ul>
      {!world?.case001 && <button disabled={!connected} onClick={()=>request('room:ready',[!room.players.find(p=>p.id===self.current)?.ready])}>สลับสถานะพร้อม</button>}
      <button type="button" disabled={!connected || leaving} onClick={leaveRoom}>{world?.case001?'ออกชั่วคราว':'ออกจากห้อง'}</button>
      </details>
      {room.version===2 && !world?.case001 && <CharacterCreator character={character} biography={biography}
        taken={cast.filter(role=>role!==character?.profession)} takenBy={Object.fromEntries(investigators.flatMap((p,i)=>world?.characters?.[p.id] ? [[world.characters[p.id].profession,world.characters[p.id].playerName ?? 'ผู้เล่น '+(i+1)]] : []))} disabled={!connected}
        editable names={world?.playerNames?.[self.current]} onSaveNames={(playerName,characterName)=>action('setPlayerNames',{playerName,characterName})} onCreate={(profession,talent,playerName,characterName)=>action(character?'updateCharacter':'createCharacter',{profession,talent,playerName,characterName})}/>}
      {world?.case001 ? <section className="case-screen" aria-label="คดี 001">
        {world.inactivePlayers?.includes(self.current) && <p role="status">ตัวละครพักใน session นี้ ข้อมูลเดิมยังอยู่ รอ DM จัดทีมในครั้งถัดไป</p>}
        {world.paused && <p className="narration-card" role="status">พักคดีอยู่ · รอ DM เปิดเล่นต่อ สถานะและผลทอยเดิมยังอยู่</p>}

        {!showEncounter && <header className="case-heading case-mission-strip">
          <div><p className="eyebrow">แฟ้มภารกิจ · คดี 001</p><h2>{world.case001.location}</h2></div>
          {world.case001.notebook?.objective && <p><strong>เป้าหมายตอนนี้</strong> {world.case001.notebook.objective}</p>}
          {caseTab==='scene' && !dmLed && !turnEncounter && !world.case001.report && <a className="case-jump-action" href="#case-play-controls">ลงมือทำ <span aria-hidden="true">↓</span></a>}
          {world.case001.time && <div className="case-clock"><span>เวลาในภารกิจ</span><strong>{world.case001.time}</strong></div>}
        </header>}
        <nav className="workspace-tabs player-main-tabs case-main-navigation" aria-label="หน้าต่างคดี">
          {([
            ['scene','play',turnEncounter?'เผชิญหน้า':battle?'ต่อสู้':'เล่น'],
            ['story','story','เส้นเรื่อง'],['journal','journal','หลักฐาน'],['character','character','ตัวละคร'],
            ...(world.case001.report ? [['report','report','รายงาน']] as const : []),
          ] as const).map(([id,icon,label])=><button key={id} type="button" aria-pressed={caseTab===id} onClick={()=>setCaseTab(id)}>
            <CaseNavIcon name={icon}/><span>{label}</span>
            {id==='story' && unreadStory>0 && <span className="update-badge" aria-label={unreadStory+' บทที่ยังไม่อ่าน'}>{unreadStory}</span>}
            {id==='journal' && unreadEvidence>0 && <span className="update-badge" aria-label={unreadEvidence+' หลักฐานใหม่หรืออัปเดต'}>{unreadEvidence}</span>}
          </button>)}
        </nav>
        {!showEncounter && character && <div className="player-status-strip"><img src={portraitUrl(character.profession)} alt=""/><strong>{playerName(self.current)}</strong><span>{professions[character.profession].name}</span><span>ชีวิต {character.hp}</span><span>สติ {character.sanity}</span><span>สมาธิ {character.focus}</span>{battle && !turnEncounter && <span>AP {world.turns[self.current]?.ap ?? 0}/3</span>}</div>}
        {!showEncounter && <div className="team-identity" aria-label="ชื่อผู้เล่นและบทบาทในพื้นที่">{investigators.filter(p=>world.players[p.id] && world.characters?.[p.id]).map(p=><span key={p.id}>{playerName(p.id)} · {professions[world.characters![p.id].profession].name}</span>)}</div>}
        <div hidden={caseTab!=='character'}>
        {character ? <section className="case-character game-panel" aria-label="สถานะตัวละครของคุณ">
          <img className="case-character-portrait" src={portraitUrl(character.profession)} alt={castProfiles[character.profession].name}/>
          <div className="case-character-heading">
            <p className="eyebrow">ตัวละครของคุณ</p>
            <h3>{playerName(self.current)}</h3>
          </div>
          <div className="case-character-stats">
            <h4>สถานะปัจจุบัน</h4>
            <GameHud exploring={!battle || turnEncounter} haunt={world.case001.haunt} hp={character.hp} sanity={character.sanity} focus={character.focus} ap={battle && !turnEncounter ? world.turns[self.current]?.ap : undefined}/>
            {character.coreStats && <>
              <h4>ค่าสเตตัสพื้นฐาน</h4>
              <CoreStats stats={character.coreStats}/>
            </>}
            <CharacterCreator character={character} biography={biography}
              showCoreStats={!character.coreStats} taken={cast.filter(role=>role!==character?.profession)} takenBy={Object.fromEntries(investigators.flatMap((p,i)=>world?.characters?.[p.id] ? [[world.characters[p.id].profession,world.characters[p.id].playerName ?? 'ผู้เล่น '+(i+1)]] : []))} disabled={!connected}
              onCreate={(profession,talent,playerName)=>action('createCharacter',{profession,talent,playerName})}/>
          </div>
        </section> : <GameHud exploring={!battle} haunt={world.case001.haunt} ap={battle ? world.turns[self.current]?.ap : undefined}/>}

        </div>
        {world.pendingCheck && world.diceRequest?.die!==null &&
          <p className="narration-card d20-wait" role="status">ส่งคำขอทดสอบแล้ว · รอ DM ส่งการ์ด D20</p>}
        {world.diceRequest?.playerId===self.current && world.diceRequest.die===null &&
          <D20Card key={'request-'+world.diceRequest.id} card={world.diceRequest} connected={connected}
            onRoll={(requestId,settled)=>action('dmRoll',{requestId},undefined,settled)}/>}
        {world.latestRoll && <D20Card key={'result-'+world.latestRoll.id} card={world.latestRoll} rollerName={playerName(world.latestRoll.playerId)}/>}
        {world.case001.report && <section hidden={caseTab!=='report'} className="narration-card case-report" aria-label="รายงานคดี">
          <h3>รายงานคดี</h3><pre className="story-text">{world.case001.report.text}</pre>
        </section>}
        <div className={'case-workspace'+(battle?' case-workspace-encounter':'')+(turnEncounter?' case-workspace-c4':'')} data-view={caseTab}><div className="case-world-pane" hidden={caseTab!=='scene'}>
        {world.caseMap && <>
          {world.caseMap.turnConclusion && !battle && world.guided?.scene==='C4' && <TurnConclusion result={world.caseMap.turnConclusion}/>}
          {battle?.turnEncounter ? <TurnEncounter site={world.caseMap.site} battle={battle} characters={world.characters ?? {}}
            self={self.current} enabled={connected && !world.paused} paused={world.paused} action={action}
            storyOption={caseActions.find(option=>option.id.startsWith('dice:C4_DROWNED_ECHO_VISION:'))}
            waitingForStoryRoll={waitingForRoll} onStoryRoll={actionId=>caseRequest({actionId})}/> :
            battle ? <EncounterBoard site={world.caseMap.site} battle={battle} players={world.players}
            characters={world.characters ?? {}} self={self.current} ap={world.turns[self.current]?.ap} turns={world.turns} action={connected ? action : undefined}/> :
            <CaseScene site={world.caseMap.site} location={world.case001.location} intro={world.case001.intro} npcs={world.caseMap.npcs}/>}
          {!battle && <CastPortraits roles={cast} speakers={[...(world.case001.speakers ?? []),...visibleCast(caseActions)]}/>}
          {!turnEncounter && (!['5.2','5.3','5.5'].includes(world.guided?.version ?? '') || world.lastCheck) && <section className="narration-card case-response" aria-label="เหตุการณ์ล่าสุด" aria-live="polite">
            <h3>{['5.2','5.3','5.5'].includes(world.guided?.version ?? '')?'ผลการทอย':'เหตุการณ์ล่าสุด'} <button type="button" onClick={()=>setCaseTab('story')}>อ่านบทเต็ม</button></h3>
            {!['5.2','5.3','5.5'].includes(world.guided?.version ?? '') && <p className="story-text">{world.case001.notice}</p>}
            {world.lastCheck && !(!battle && world.latestRoll?.result && world.latestRoll.playerId===world.lastCheck.playerId && world.latestRoll.die===world.lastCheck.die && world.latestRoll.result.total===world.lastCheck.total && world.latestRoll.result.outcome===world.lastCheck.outcome) && <p className="roll-result" data-outcome={world.lastCheck.outcome}><strong>D20 {world.lastCheck.die} · รวม {world.lastCheck.total}</strong> · {
              world.lastCheck.outcome==='success'?'สำเร็จ':world.lastCheck.outcome==='partial'?'สำเร็จบางส่วน':'ไม่สำเร็จ'
            }</p>}
          </section>}
        </>}
        </div><aside className="case-actions-pane" hidden={!(['scene','story','journal'] as string[]).includes(caseTab) || (turnEncounter && caseTab==='scene')} aria-label="คำสั่งภารกิจ">

        {['5.2','5.3','5.5'].includes(world.guided?.version ?? '') && (caseTab==='scene' || caseTab==='story') && <CaseStoryThread
          view={world.guided!} beats={deliveredBeats}
          showHistory={caseTab==='story'} onHistory={caseTab==='story'?undefined:()=>setCaseTab('story')}
          />}
        <div hidden={caseTab!=='story'}>        {['5.2','5.3','5.5'].includes(world.guided?.version ?? '')?null:world.narrative?.current ? <NarrativeJournal view={world.narrative} onNext={world.manualDm ? undefined : sequence=>action('narrativeNext',{sequence})}/> : <section className="narration-card" aria-label="เหตุการณ์ล่าสุด">
          <h3>บทเล่า</h3><p className="note">อ่านบทที่ทีมได้รับแล้วในเหตุการณ์ล่าสุด หรือย้อนอ่านจากสมุดคดี</p>
        </section>}
        <details className="mission-progress"><summary>ความคืบหน้าคดี</summary>
          <dl className="progress-list">
            <div><dt>ผู้สูญหายที่ปลอดภัย</dt><dd>{world.case001.rescued}/3</dd></div>
            <div><dt>กำลังพาออกจากพื้นที่</dt><dd>{world.case001.escorting} คน</dd></div>
            <div><dt>หลักฐานที่พบ</dt><dd>{world.case001.evidence}/8</dd></div>
            <div><dt>ผนึกที่คลายแล้ว</dt><dd>{world.case001.seals}/3</dd></div>
            <div><dt>พิธีปลดปล่อย</dt><dd>{world.case001.progress}/6</dd></div>
            {world.case001.containment!==undefined && <div><dt>พิธีสะกด</dt><dd>{world.case001.containment}/4</dd></div>}
          </dl><p>{world.case001.ghost ?? 'ยังไม่พบวิญญาณ'}</p>
        </details>
</div>
        <div hidden={caseTab!=='journal'}>
          <CaseNotebook view={world.case001.notebook}/>
          {world.manualDm && <DmHistory entries={world.dmLog ?? []} playerName={playerName}/>}
        </div>
        <div hidden={caseTab!=='scene'} className="case-action-workbench" id="case-play-controls" tabIndex={-1}>
        {!dmLed && <h3 className="pane-heading">ลงมือทำ</h3>}
        {!dmLed && !caseActions.length && !battle && !world.case001.report && <p className="note">รอบทเปิดหรือการตอบจาก DM ก่อนเลือกการกระทำ</p>}
        {world.manualDm && !world.humanDmId && <button disabled={!connected || !!battle}
          onClick={()=>action('claimDm')}>รับช่วงเป็นผู้ดำเนินเรื่อง</button>}
        {world.caseMap?.opportunity && <button disabled={!connected || !character?.hp || world.paused} onClick={()=>action('start')}>เริ่มเผชิญหน้า</button>}
        {world.caseMap && !world.awaitingReport && !world.case001.report && <dialog ref={withdrawalDialog} className="case-withdrawal-dialog"
          aria-labelledby="case-withdrawal-title" aria-describedby="case-withdrawal-impact">
          <h3 id="case-withdrawal-title">ถอนทีมและปิดคดีหรือไม่</h3>
          <p id="case-withdrawal-impact">การยืนยันจะจบคดีของทุกคนในห้องทันที ทีมจะกลับมาสืบคดีนี้ต่อไม่ได้</p>
          <p>ช่วยผู้สูญหายแล้ว {world.case001.rescued}/3 · คลายผนึกแล้ว {world.case001.seals}/3</p>
          {!connected && <p role="status">กำลังรอการเชื่อมต่อ</p>}
          <form method="dialog">
            <button autoFocus>เล่นต่อ</button>
            <button className="danger" type="button" disabled={!connected} onClick={()=>{
              withdrawalDialog.current?.close();
              caseRequest({actionId:'finish'});
            }}>ยืนยันถอนทีม</button>
          </form>
        </dialog>}
        {world.awaitingReport ? <p>คดีสิ้นสุดแล้ว · รอผู้ดำเนินเรื่องเปิดบทสรุป</p> : world.case001.report ? null :
          <><nav className="action-tabs" aria-label="หมวดคำสั่ง">
            {groups.map(group=><button key={group.id} aria-pressed={visibleGroup===group.id}
              onClick={()=>setActionGroup(group.id)}>{group.label}
              <span>{caseActions.filter(option=>actionCategory(option.id)===group.id).length}</span>
            </button>)}
          </nav><div className="action-list">
          {caseActions.filter(option=>actionCategory(option.id)===visibleGroup).map(option=><div className="action-option" key={option.id}>
            <button disabled={!connected || isHumanDm || (!!battle && battle.active!==self.current) || (option.id==='finish' && !!world.caseMap?.withdrawalBlocked) || (!!option.check && waitingForRoll)}
              onClick={()=>{
                if(option.id==='finish' && world.caseMap) withdrawalDialog.current?.showModal();
                else caseRequest({actionId:option.id});
              }}><span className="action-copy">{option.speaker && <small>{option.speaker}</small>}{option.label}{option.dice && <small>{option.dice.stat} · DC {option.dice.dc}{option.dice.ap>0 && ' · '+option.dice.ap+' AP'}</small>}</span>
                <span className="action-meta">{world.pendingCheck===option.id ? 'รอการ์ด D20' : <>{option.check ? (world.manualDm && !battle ? 'ขอทอย D20' : 'ทอย D20') : ''}{option.minutes>0 && (option.check?' · ':'')+option.minutes+' นาที'}</>}</span></button>
            {option.id.startsWith('travel:') && <p className="note">คำสั่งนี้พาทั้งทีมไปฉากถัดไป</p>}
            {option.check && character && !isHumanDm && <details><summary>เพิ่มโอกาสสำเร็จ</summary>
              <button disabled={!connected || waitingForRoll || character.focus<1} onClick={()=>caseRequest({actionId:option.id,boost:'focus'})}>ใช้สมาธิ +2</button>

              {!BASIC_RULES_MODE && option.deception && character.talent==='detect_deception' && <button disabled={!connected || character.focus<1}
                onClick={()=>caseRequest({actionId:option.id,boost:'deception'})}>จับพิรุธ (สมาธิ 1)</button>}
              {!BASIC_RULES_MODE && option.id==='open' && character.profession==='occult_engineer' && <button disabled={!connected}
                onClick={()=>caseRequest({actionId:option.id,boost:'diagnostic'})}>ตรวจกลไก +2</button>}
            </details>}
          </div>)}</div></>}
        </div></aside></div>
      </section> : <>
      <p className="lobby-intro">{world?.humanDmId ? (canStart ? 'รอผู้ดำเนินเรื่องเริ่มคดี' : 'ต้องมีผู้สืบสวน 2–6 คนที่ยืนยันตัวละครแล้ว') : 'รอคนรับบทผู้ดำเนินเรื่อง'}</p>
      {!world?.humanDmId && <button disabled={!connected} onClick={()=>action('claimDm')}>รับบทผู้ดำเนินเรื่อง</button>}
      </>}
    </>}
  </main>;
}
