import { GameHud, FieldJournal } from './GameHud';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GhostEncounter, TurnState, ScriptedDmView } from '@baan/shared';
import { initialObjects, actionsFor } from './game/objects';
import { createGame } from './rendering/game';

type Cell = {x:number;y:number};
type Snapshot = {
  revision:number;
  case001?: {
    title:string;location:string;time:string;notice:string;haunt:number;rescued:number;escorting:number;
    evidence:number;seals:number;progress:number;ghost:string|null;report:{text:string}|null;
    actions:{id:string;label:string;minutes:number}[];
  };
  humanDmId?:string|null;
  diceRequest?:{id:string;playerId:string;die:number|null}|null;
  dm?: ScriptedDmView;
  players:Record<string,Cell>;
  objects:Record<string,Partial<(typeof initialObjects)[number]>>;
  evidence:string[];
  inventory:Record<string,string[]>;
  activePlayer:string|null;
  turns:Record<string,TurnState>;
  encounter:GhostEncounter|null;
  lastCheck:{playerId:string;die:number;total:number;outcome:'success'|'partial'|'failure'}|null;
};
type DmPanel = {
  sceneId:string; script:string; secret:string;
  events:{id:string;text:string}[];
  dialogue:{id:string;text:string}[];
  scenes:{id:string;name:string}[];
};
type Room = {code:string; players:{id:string;ready:boolean}[]};
type Reply = {ok:boolean; error?:string; room?:Room; playerId?:string; token?:string; snapshot?:Snapshot};
const sessionKey = 'ghosts-room-session';

export function OnlineGame() {
  const canvas = useRef<HTMLDivElement>(null);
  const socket = useRef<Socket|null>(null);
  const self = useRef('');
  const latest = useRef<Snapshot|null>(null);
  const [room,setRoom] = useState<Room|null>(null);
  const [world,setWorld] = useState<Snapshot|null>(null);
  const [code,setCode] = useState('');
  const [dmPanel,setDmPanel] = useState<DmPanel|null>(null);
  const [status,setStatus] = useState('');
  const [connected,setConnected] = useState(false);
  const [selected,setSelected] = useState<string|null>(null);

  function receive(snapshot:Snapshot) {
    if (!latest.current || snapshot.revision >= latest.current.revision) {
      latest.current=snapshot;
      setWorld(snapshot);
    }
  }
  function request(event:string,args:unknown[]=[]) {
    const connection=socket.current;
    if (!connection?.connected) {setStatus('กำลังรอการเชื่อมต่อ');return;}
    connection.timeout(5000).emit(event,...args,(error:Error|null,reply:Reply)=>{
      if(error || !reply?.ok) {
        setStatus(error ? 'เซิร์ฟเวอร์ไม่ตอบกลับ' : reply?.error ?? 'ทำรายการไม่ได้');
        if(event==='room:resume' && !error) {
          sessionStorage.removeItem(sessionKey);
          latest.current=null;
          self.current='';
          setWorld(null);
          setRoom(null);
        }
        return;
      }
      if(reply.token) sessionStorage.setItem(sessionKey,reply.token);
      if(reply.playerId) self.current=reply.playerId;
      if(reply.room) setRoom(reply.room);
      if(reply.snapshot) receive(reply.snapshot);
      setStatus('');
    });
  }
  function action(type:string, payload:object={}) {
    request('game:action',[{id:crypto.randomUUID(),type,...payload}]);
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
    connection.connect();
    return ()=>{connection.removeAllListeners();connection.disconnect();socket.current=null;};
  },[]);
  useEffect(()=>{
    if(!room?.code || world?.case001 || !canvas.current) return;
    const game=createGame(canvas.current,setSelected,{
      read:()=>{
        const snapshot=latest.current;
        if(!snapshot?.players[self.current]) return null;
        return {self:snapshot.players[self.current],others:Object.entries(snapshot.players).filter(([id])=>id!==self.current).map(([,cell])=>cell),ghost:snapshot.encounter};
      },
      move:target=>action('move',{target}),
    });
    return ()=>game.destroy(true);
  },[room?.code,!!world?.case001]);

  const isHumanDm = !!world?.humanDmId && world.humanDmId === self.current;
  useEffect(()=>{
    if (!connected || !isHumanDm) { setDmPanel(null); return; }
    let current = true;
    socket.current?.timeout(5000).emit('dm:panel',(error:Error|null,reply:{ok:boolean;panel?:DmPanel})=>{
      if (current) setDmPanel(!error && reply?.ok ? reply.panel ?? null : null);
    });
    return ()=>{current=false;};
  },[connected,isHumanDm,world?.revision]);

  const base=initialObjects.find(object=>object.id===selected);
  const object=base && {...base,...world?.objects[base.id]};
  const encounter=world?.encounter;
  const active=encounter && encounter.phase!=='resolved';
  const myTurn=world?.activePlayer===self.current;
  const allReady=!!room && room.players.length>=2 && room.players.every(player=>player.ready);
  const myStats = world?.turns[self.current];
  return <main className="game-shell online-shell">
    <h1>เล่นออนไลน์</h1>
    <p className="turn-chip" role="status">{status || (connected?'เชื่อมต่อแล้ว':'กำลังเชื่อมต่อ')}</p>
    {!room ? <><button disabled={!connected} onClick={()=>request('room:create')}>สร้างห้อง</button>
      <form onSubmit={event=>{event.preventDefault();request('room:join',[code]);}}>
        <label>รหัสห้อง <input value={code} onChange={event=>setCode(event.target.value)} maxLength={6}/></label>
        <button disabled={!connected || code.trim().length!==6}>เข้าห้อง</button>
      </form></> : <>
      <p>รหัสห้อง {room.code} · ผู้เล่น {room.players.length}/4</p>
      <ul>{room.players.map((player,index)=><li key={player.id}>ผู้เล่น {index+1}{player.id===self.current?' (คุณ)':''} · {player.ready?'พร้อม':'ยังไม่พร้อม'}</li>)}</ul>
      <button disabled={!connected} onClick={()=>request('room:ready',[!room.players.find(p=>p.id===self.current)?.ready])}>สลับสถานะพร้อม</button>
      {world?.case001 ? <section className="game-panel" aria-label="คดี 001">
        <GameHud haunt={world.case001.haunt}/>
        <h2>{world.case001.title}</h2>
        <p>{world.case001.location} · {world.case001.time} · ความหลอน {world.case001.haunt}/10</p>
        <p aria-live="polite">{world.case001.notice}</p>
        <p>ช่วยแล้ว {world.case001.rescued}/3 · กำลังพาออก {world.case001.escorting} · หลักฐาน {world.case001.evidence}/8</p>
        <p>ผนึก {world.case001.seals}/3 · พิธีปลดปล่อย {world.case001.progress}/6 · {world.case001.ghost ?? 'ยังไม่พบวิญญาณ'}</p>
        {world.case001.report ? <pre style={{whiteSpace:'pre-wrap'}}>{world.case001.report.text}</pre> :
          world.case001.actions.map(option=><button key={option.id} disabled={!connected || isHumanDm}
            onClick={()=>action('caseAction',{actionId:option.id})}>{option.label} · {option.minutes} นาที</button>)}
      </section> : <>
      <button disabled={!connected || !!active || room.players.filter(p=>p.id!==world?.humanDmId).length<2}
        onClick={()=>action('caseStart')}>เริ่มคดี 001</button>
      {!world?.humanDmId && <button disabled={!connected} onClick={()=>action('claimDm')}>รับบทผู้ดำเนินเรื่อง</button>}
      {isHumanDm && <section className="game-panel" aria-label="แผงผู้ดำเนินเรื่อง">
        <h2>แผงผู้ดำเนินเรื่อง</h2>
        <button disabled={!connected} onClick={()=>action('releaseDm')}>คืนบทผู้ดำเนินเรื่อง</button>
        {connected && dmPanel && <>
          <p><strong>บทฉาก</strong> {dmPanel.script}</p>
          <p><strong>ข้อมูลลับ</strong> {dmPanel.secret}</p>
          <p>เหตุการณ์</p>
          {dmPanel.events.map(event=><button key={event.id} onClick={()=>action('dmEvent',{targetId:event.id})}>{event.text}</button>)}
          <p>บทสนทนา NPC</p>
          {dmPanel.dialogue.map(line=><button key={line.id} onClick={()=>action('dmDialogue',{targetId:line.id})}>{line.text}</button>)}
          <p>เปลี่ยนฉาก</p>
          {dmPanel.scenes.map(scene=><button key={scene.id} disabled={!!active} onClick={()=>action('dmScene',{targetId:scene.id})}>{scene.name}</button>)}
          <p>ขอให้ผู้เล่นทอย D20</p>
          {room.players.map((player,index)=><button key={player.id} disabled={world.diceRequest?.die===null} onClick={()=>action('dmRequestRoll',{targetId:player.id})}>ผู้เล่น {index+1}</button>)}
        </>}
      </section>}
      {world?.diceRequest && <p aria-live="polite">
        {world.diceRequest.die===null ? 'รอผู้เล่นทอย D20' : `ผลทอย D20: ${world.diceRequest.die}`}
        {world.diceRequest.die===null && world.diceRequest.playerId===self.current &&
          <button disabled={!connected} onClick={()=>action('dmRoll',{requestId:world.diceRequest?.id})}>ทอย D20</button>}
      </p>}
      <GameHud hp={myTurn ? encounter?.playerHealth : undefined} focused={active ? myStats?.focused : undefined} ap={active ? myStats?.ap : undefined}/>
      <div ref={canvas} className="game"/>
      {world?.dm && <section className="game-panel narration-panel" aria-label="ผู้ดำเนินเรื่อง">
        <h2>{world.dm.title}</h2>
        <div aria-live="polite">
          {world.dm.narration && <p>{world.dm.narration}</p>}
          {world.dm.dialogue && <blockquote><strong>{world.dm.dialogue.speaker}</strong><p>{world.dm.dialogue.text}</p></blockquote>}
          {world.dm.ending && <p>{world.dm.ending}</p>}
        </div>
        {world.dm.dialogue?.choices.map(choice => <button key={choice.id} disabled={!connected}
          onClick={() => action('chooseDialogue',{dialogueId:world.dm?.dialogue?.id,choiceId:choice.id})}>{choice.text}</button>)}
        <ul>{world.dm.objectives.map(objective => <li key={objective.id}>{objective.complete ? 'สำเร็จแล้ว' : 'ยังไม่สำเร็จ'} · {objective.description}</li>)}</ul>
      </section>}
      <p>ใช้ลูกศรหรือ WASD หรือคลิกช่องที่อยู่ติดกันเพื่อเดิน</p>
      {!active && <button disabled={!connected || !allReady} onClick={()=>action('start')}>เริ่มเผชิญหน้า</button>}
      {active && <section className="game-panel encounter-controls">
        <p className={myTurn ? "turn-chip current-turn" : "turn-chip"}>{myTurn?'เทิร์นของคุณ':'รอผู้เล่นคนอื่น'} · AP {world?.turns[self.current]?.ap ?? 0}/3</p>
        <p>พลังผี {encounter.ghostHealth}</p>
        <button disabled={!connected || !myTurn || (world?.turns[self.current]?.ap ?? 0)<1 || world?.turns[self.current]?.focused} onClick={()=>action('focus')}>ตั้งสมาธิ (1 AP)</button>
        <button disabled={!connected || !myTurn || (world?.turns[self.current]?.ap ?? 0)<1} onClick={()=>action('check')}>ทดสอบทักษะ DC 12 (1 AP)</button>
        {world?.lastCheck && <p>ทอย {world.lastCheck.die} รวม {world.lastCheck.total} · {world.lastCheck.outcome==='success'?'สำเร็จ':world.lastCheck.outcome==='partial'?'สำเร็จบางส่วน':'ไม่สำเร็จ'}</p>}
        <button disabled={!connected || !myTurn} onClick={()=>action('endTurn')}>จบเทิร์น</button>
        <button disabled={!connected || !myTurn} onClick={()=>action('pacify')}>ปลอบผี</button>
        <button disabled={!connected || !myTurn} onClick={()=>action('strike')}>โจมตีผี</button>
        <button disabled={!connected || !myTurn} onClick={()=>action('escape')}>หนี</button>
      </section>}
      {encounter?.outcome && <p>{({escaped:'หนีสำเร็จ',pacified:'ผีสงบแล้ว',defeated:'ผีพ่ายแพ้ชั่วคราว'})[encounter.outcome]}</p>}
      {object && <section className="game-panel context-panel"><h2>{object.name}</h2>
        <p>{({open:'เปิดอยู่',closed:'ปิดอยู่',locked:'ล็อกอยู่',static:'วัตถุทั่วไป'})[object.state]}</p>
        {actionsFor(object).filter(type=>type!=='inspect').map(type=><button key={type} disabled={!connected} onClick={()=>action(type,{objectId:object.id})}>{{open:'เปิด',close:'ปิด',collect:'เก็บหลักฐาน',inspect:'ตรวจดู'}[type]}</button>)}
      </section>}
      <FieldJournal clues={world?.evidence ?? []} items={world?.inventory[self.current] ?? []}/>
      </>}
    </>}
  </main>;
}
