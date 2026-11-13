import {exportSession,importSession} from './portableSession.js';
import {fileURLToPath} from 'node:url';
import { BASIC_RULES_MODE } from '@baan/shared';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Rooms, canStart } from './rooms.js';
import { openRoomSaves } from './roomSaves.js';
import { WorldStore } from './world.js';

import { readServerConfig } from './config.js';

const {port,origin} = readServerConfig(process.env);
const httpServer = createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
    response.end(JSON.stringify({ok:true}));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('เซิร์ฟเวอร์ บริษัท เรื่องผีไว้ใจผม จำกัด');
});

// Socket.IO CORS covers polling. Check the Origin header on the upgrade as well.
const io = new Server(httpServer, {
  maxHttpBufferSize:9*1024*1024,
  cors: { origin },
  allowRequest: (request, callback) => {
    const requested = request.headers.origin;
    callback(null, requested === undefined || (typeof origin === 'string' ? requested === origin : origin.test(requested)));
  },
});

const rooms = new Rooms();
const worlds = new WorldStore(undefined,true,true,process.env.CASE_STORY_VERSION!=='4.1',BASIC_RULES_MODE,
 process.env.CASE_STORY_VERSION==='4.3'?'4.3':process.env.CASE_STORY_VERSION==='5.1'?'5.1':process.env.CASE_STORY_VERSION==='5.2'?'5.2':process.env.CASE_STORY_VERSION==='5.3'?'5.3':'5.5',process.env.CASE001_LETHAL==='true');
const saveDirectory=process.env.CASE_SAVE_DIR===undefined ? fileURLToPath(new URL('../saves/',import.meta.url)) : process.env.CASE_SAVE_DIR.trim();
const saveRoom=saveDirectory ? openRoomSaves(saveDirectory,rooms,worlds) : undefined;
function saveStartedRoom(code:string) {
 if(!saveRoom || !worlds.hasStarted(code)) return;
 try {saveRoom(code);}
 catch (error) {console.error('Unable to save room '+code,error);}
}
const expirations = new Map<string, ReturnType<typeof setTimeout>>();
const publicRooms=()=>rooms.publicRooms(code=>!worlds.hasStarted(code) && !!io.sockets.adapter.rooms.get(code)?.size);
const broadcastRooms=()=>io.emit('lobby:rooms',publicRooms());
function broadcastSnapshot(code:string) {
  for(const socketId of io.sockets.adapter.rooms.get(code) ?? []) {
    const player=rooms.playerId(socketId);
    if(player) io.to(socketId).emit('game:snapshot',worlds.snapshot(code,player),!!saveRoom && worlds.hasStarted(code));
  }
}
io.on('connection', (socket) => {
  socket.emit('lobby:rooms',publicRooms());
  type Ack = (result: unknown) => void;
  const handle = (ack: unknown, fn: () => void) => { if (typeof ack !== 'function') return; try { fn(); } catch (error) { (ack as Ack)({ok:false,error:error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'}); } };
  const createRoom = (ack: unknown, version?:2) => handle(ack, () => {
    const room=rooms.create(socket.id,version); worlds.create(room.code,room.version); worlds.addPlayer(room.code,rooms.playerId(socket.id)!); socket.join(room.code); (ack as Ack)({ok:true,room,playerId:rooms.playerId(socket.id),snapshot:worlds.snapshot(room.code,rooms.playerId(socket.id)!),token:rooms.token(socket.id)});
    broadcastRooms();
  });
  socket.on('room:create', ack => createRoom(ack));
  socket.on('room:create:v2', ack => createRoom(ack,2));
  const joinRoom = (code: unknown, ack: unknown, version?:2) => handle(ack, () => {
    worlds.assertCanJoin(code);
    const room=rooms.join(socket.id,code,version); worlds.addPlayer(room.code,rooms.playerId(socket.id)!); socket.join(room.code); (ack as Ack)({ok:true,room,playerId:rooms.playerId(socket.id),snapshot:worlds.snapshot(room.code,rooms.playerId(socket.id)!),token:rooms.token(socket.id)}); broadcastRooms(); broadcastSnapshot(room.code); io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  });
  socket.on('room:join', (code, ack) => joinRoom(code,ack));
  socket.on('room:join:v2', (code, ack) => joinRoom(code,ack,2));
  socket.on('room:ready', (ready: unknown, ack: unknown) => handle(ack, () => {
    const room=rooms.ready(socket.id,ready); (ack as Ack)({ok:true,room}); io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  }));
  socket.on('game:action', (action: unknown, ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
    if (!code || !player) throw Error('ไม่ได้อยู่ในห้อง');
    if((action as {type?:string;command?:string})?.type==='dmSessionControl' && (action as {command?:string}).command==='resume') {
     const w=worlds.checkpoint(code).world;
     if(w.preparingSession && Object.keys(w.players).some(id=>id!==w.humanDmId && !w.inactivePlayers?.includes(id) && !rooms.connectedIds(code).includes(id)))throw Error('ยังมีผู้เล่นที่เลือกเล่นวันนี้ไม่กลับเข้าห้อง ให้พักตัวละครหรือรอสมาชิกก่อน');
    }
    const started=worlds.hasStarted(code);
    const result=worlds.apply(code,player,action);
    if(!result.duplicate) saveStartedRoom(code);
    if(!started && worlds.hasStarted(code)) broadcastRooms();
    (ack as Ack)({ok:true,...result,persistent:!!saveRoom && worlds.hasStarted(code)});
    if (!result.duplicate) broadcastSnapshot(code);
  }));
  socket.on('character:biography', (ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
    if (!code || !player) throw Error('ไม่ได้อยู่ในห้อง');
    (ack as Ack)({ok:true,biography:worlds.biography(code,player)});
  }));
  socket.on('dm:preview', (target: unknown, ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
    if(!code || !player) throw Error('ไม่ได้อยู่ในห้อง');
    (ack as Ack)({ok:true,preview:worlds.dmPreview(code,player,target)});
  }));
  socket.on('dm:panel', (options: unknown, callback?: unknown) => {
    const ack=typeof options==='function' ? options : callback;
    handle(ack, () => {
      const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
      if (!code || !player) throw Error('ไม่ได้อยู่ในห้อง');
      const includeReader=typeof options!=='object' || options===null || !('includeReader' in options) || options.includeReader!==false;
      (ack as Ack)({ok:true,panel:worlds.dmPanel(code,player,includeReader)});
    });
  });
  socket.on('game:snapshot', (ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id); if(!code) throw Error('ไม่ได้อยู่ในห้อง');
    (ack as Ack)({ok:true,snapshot:worlds.snapshot(code,rooms.playerId(socket.id)!)});
  }));
  socket.on('session:export',(ack:unknown)=>handle(ack,()=>{
   const code=rooms.roomCode(socket.id),player=rooms.playerId(socket.id);
   if(!code || !player)throw Error('ไม่ได้อยู่ในห้อง');
   (ack as Ack)({ok:true,save:exportSession(rooms,worlds,code,player)});
  }));
  socket.on('session:import',(input:unknown,ack:unknown)=>handle(ack,()=>{
   if(rooms.roomCode(socket.id))throw Error('นำเข้าได้จากหน้าเข้าห้องเท่านั้น');
   const {code,token}=importSession(rooms,worlds,input);
   const {room,id}=rooms.resume(socket.id,token);socket.join(code);saveStartedRoom(code);
   (ack as Ack)({ok:true,room,playerId:id,token,persistent:!!saveRoom,snapshot:worlds.snapshot(code,id)});
  }));
  socket.on('room:resume', (token: unknown, ack: unknown) => handle(ack, () => {
    const {room,id}=rooms.resume(socket.id,token);
    clearTimeout(expirations.get(id));
    expirations.delete(id);
    socket.join(room.code);
    broadcastRooms();
    (ack as Ack)({ok:true,room,playerId:id,snapshot:worlds.snapshot(room.code,rooms.playerId(socket.id)!)});
    io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  }));
  socket.on('room:detach',(ack:unknown)=>handle(ack,()=>{
   const code=rooms.roomCode(socket.id),player=rooms.playerId(socket.id);
   if(!code || !player || !worlds.hasStarted(code))throw Error('ยังไม่มีคดีให้พัก');
   if(worlds.checkpoint(code).world.humanDmId===player)worlds.prepareSession(code);
   rooms.detach(socket.id);socket.leave(code);saveStartedRoom(code);broadcastSnapshot(code);
   (ack as Ack)({ok:true});
  }));
  socket.on('room:leave', (ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
    if(code && player) {
      worlds.removePlayer(code,player);
      const room=rooms.leave(socket.id);
      socket.leave(code);
      if(room) {
        saveStartedRoom(code);
        io.to(code).emit('room:update',{...room,canStart:canStart(room)});
        broadcastSnapshot(code);
      } else {
        try {saveRoom?.close(code);}
        catch (error) {console.error('Unable to close saved room '+code,error);}
        worlds.delete(code);
      }
      broadcastRooms();
    }
    (ack as Ack)({ok:true});
  }));
  socket.on('disconnect', () => {
    const session=rooms.detach(socket.id); if(!session) return;
    broadcastRooms();
    io.to(session.code).emit('room:update',{...session.room,canStart:canStart(session.room)});
    if(saveRoom && worlds.hasStarted(session.code)) return;
    expirations.set(session.id,setTimeout(() => {
      expirations.delete(session.id);
      const room=rooms.expire(session.code,session.id);
      if(room?.players.some(p=>p.id===session.id)) return;
      worlds.removePlayer(session.code,session.id);
      if(room) {io.to(session.code).emit('room:update',{...room,canStart:canStart(room)});broadcastSnapshot(session.code);}
      else worlds.delete(session.code);
      broadcastRooms();
    }, 120000).unref());
  });
});

httpServer.listen(port,'0.0.0.0', () => console.log(`Server listening on http://localhost:${port}`));
