import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GhostEncounter, TurnState } from '@baan/shared';
import { initialObjects, actionsFor } from './game/objects';
import { createGame } from './rendering/game';

type Cell = {x:number;y:number};
type Snapshot = {
  revision:number;
  players:Record<string,Cell>;
  objects:Record<string,Partial<(typeof initialObjects)[number]>>;
  evidence:string[];
  inventory:Record<string,string[]>;
  activePlayer:string|null;
  turns:Record<string,TurnState>;
  encounter:GhostEncounter|null;
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
    const connection=io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',{autoConnect:false});
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
    if(!room?.code || !canvas.current) return;
    const game=createGame(canvas.current,setSelected,{
      read:()=>{
        const snapshot=latest.current;
        if(!snapshot?.players[self.current]) return null;
        return {self:snapshot.players[self.current],others:Object.entries(snapshot.players).filter(([id])=>id!==self.current).map(([,cell])=>cell),ghost:snapshot.encounter};
      },
      move:target=>action('move',{target}),
    });
    return ()=>game.destroy(true);
  },[room?.code]);

  const base=initialObjects.find(object=>object.id===selected);
  const object=base && {...base,...world?.objects[base.id]};
  const encounter=world?.encounter;
  const active=encounter && encounter.phase!=='resolved';
  const myTurn=world?.activePlayer===self.current;
  const allReady=!!room && room.players.length>=2 && room.players.every(player=>player.ready);
  return <main>
    <h1>เล่นออนไลน์</h1>
    <p role="status">{status || (connected?'เชื่อมต่อแล้ว':'กำลังเชื่อมต่อ')}</p>
    {!room ? <><button disabled={!connected} onClick={()=>request('room:create')}>สร้างห้อง</button>
      <form onSubmit={event=>{event.preventDefault();request('room:join',[code]);}}>
        <label>รหัสห้อง <input value={code} onChange={event=>setCode(event.target.value)} maxLength={6}/></label>
        <button disabled={!connected || code.trim().length!==6}>เข้าห้อง</button>
      </form></> : <>
      <p>รหัสห้อง {room.code} · ผู้เล่น {room.players.length}/4</p>
      <ul>{room.players.map((player,index)=><li key={player.id}>ผู้เล่น {index+1}{player.id===self.current?' (คุณ)':''} · {player.ready?'พร้อม':'ยังไม่พร้อม'}</li>)}</ul>
      <button disabled={!connected} onClick={()=>request('room:ready',[!room.players.find(p=>p.id===self.current)?.ready])}>สลับสถานะพร้อม</button>
      <div ref={canvas} className="game"/>
      <p>ใช้ลูกศรหรือ WASD หรือคลิกช่องที่อยู่ติดกันเพื่อเดิน</p>
      {!active && <button disabled={!connected || !allReady} onClick={()=>action('start')}>เริ่มเผชิญหน้า</button>}
      {active && <section>
        <p>{myTurn?'เทิร์นของคุณ':'รอผู้เล่นคนอื่น'} · AP {world?.turns[self.current]?.ap ?? 0}/3</p>
        <p>พลังผี {encounter.ghostHealth}</p>
        <button disabled={!connected || !myTurn} onClick={()=>action('endTurn')}>จบเทิร์น</button>
        <button disabled={!connected || !myTurn} onClick={()=>action('pacify')}>ปลอบผี</button>
        <button disabled={!connected || !myTurn} onClick={()=>action('strike')}>โจมตีผี</button>
        <button disabled={!connected || !myTurn} onClick={()=>action('escape')}>หนี</button>
      </section>}
      {encounter?.outcome && <p>{({escaped:'หนีสำเร็จ',pacified:'ผีสงบแล้ว',defeated:'ผีพ่ายแพ้ชั่วคราว'})[encounter.outcome]}</p>}
      {object && <section><h2>{object.name}</h2>
        <p>{({open:'เปิดอยู่',closed:'ปิดอยู่',locked:'ล็อกอยู่',static:'วัตถุทั่วไป'})[object.state]}</p>
        {actionsFor(object).filter(type=>type!=='inspect').map(type=><button key={type} disabled={!connected} onClick={()=>action(type,{objectId:object.id})}>{{open:'เปิด',close:'ปิด',collect:'เก็บหลักฐาน',inspect:'ตรวจดู'}[type]}</button>)}
      </section>}
      <p>หลักฐานในห้อง {world?.evidence.join(', ') || 'ยังไม่มี'}</p>
      <p>คลังของคุณ {world?.inventory[self.current]?.join(', ') || 'ว่าง'}</p>
    </>}
  </main>;
}
