import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Rooms, canStart } from './rooms.js';
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
  cors: { origin },
  allowRequest: (request, callback) => {
    const requested = request.headers.origin;
    callback(null, requested === undefined || (typeof origin === 'string' ? requested === origin : origin.test(requested)));
  },
});

const rooms = new Rooms();
const worlds = new WorldStore();
const expirations = new Map<string, ReturnType<typeof setTimeout>>();
function broadcastSnapshot(code:string) {
  for(const socketId of io.sockets.adapter.rooms.get(code) ?? []) {
    const player=rooms.playerId(socketId);
    if(player) io.to(socketId).emit('game:snapshot',worlds.snapshot(code,player));
  }
}
io.on('connection', (socket) => {
  type Ack = (result: unknown) => void;
  const handle = (ack: unknown, fn: () => void) => { if (typeof ack !== 'function') return; try { fn(); } catch (error) { (ack as Ack)({ok:false,error:error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'}); } };
  const createRoom = (ack: unknown, version?:2) => handle(ack, () => {
    const room=rooms.create(socket.id,version); worlds.create(room.code,room.version); worlds.addPlayer(room.code,rooms.playerId(socket.id)!); socket.join(room.code); (ack as Ack)({ok:true,room,playerId:rooms.playerId(socket.id),snapshot:worlds.snapshot(room.code,rooms.playerId(socket.id)!),token:rooms.token(socket.id)});
  });
  socket.on('room:create', ack => createRoom(ack));
  socket.on('room:create:v2', ack => createRoom(ack,2));
  const joinRoom = (code: unknown, ack: unknown, version?:2) => handle(ack, () => {
    const room=rooms.join(socket.id,code,version); worlds.addPlayer(room.code,rooms.playerId(socket.id)!); socket.join(room.code); (ack as Ack)({ok:true,room,playerId:rooms.playerId(socket.id),snapshot:worlds.snapshot(room.code,rooms.playerId(socket.id)!),token:rooms.token(socket.id)}); broadcastSnapshot(room.code); io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  });
  socket.on('room:join', (code, ack) => joinRoom(code,ack));
  socket.on('room:join:v2', (code, ack) => joinRoom(code,ack,2));
  socket.on('room:ready', (ready: unknown, ack: unknown) => handle(ack, () => {
    const room=rooms.ready(socket.id,ready); (ack as Ack)({ok:true,room}); io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  }));
  socket.on('game:action', (action: unknown, ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
    if (!code || !player) throw Error('ไม่ได้อยู่ในห้อง');
    const result=worlds.apply(code,player,action);
    (ack as Ack)({ok:true,...result});
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
  socket.on('dm:panel', (ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
    if (!code || !player) throw Error('ไม่ได้อยู่ในห้อง');
    (ack as Ack)({ok:true,panel:worlds.dmPanel(code,player)});
  }));
  socket.on('game:snapshot', (ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id); if(!code) throw Error('ไม่ได้อยู่ในห้อง');
    (ack as Ack)({ok:true,snapshot:worlds.snapshot(code,rooms.playerId(socket.id)!)});
  }));
  socket.on('room:resume', (token: unknown, ack: unknown) => handle(ack, () => {
    const {room,id}=rooms.resume(socket.id,token);
    clearTimeout(expirations.get(id));
    expirations.delete(id);
    socket.join(room.code);
    (ack as Ack)({ok:true,room,playerId:id,snapshot:worlds.snapshot(room.code,rooms.playerId(socket.id)!)});
    io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  }));
  socket.on('disconnect', () => {
    const session=rooms.detach(socket.id); if(!session) return;
    io.to(session.code).emit('room:update',{...session.room,canStart:canStart(session.room)});
    expirations.set(session.id,setTimeout(() => {
      expirations.delete(session.id);
      const room=rooms.expire(session.code,session.id);
      if(room?.players.some(p=>p.id===session.id)) return;
      worlds.removePlayer(session.code,session.id);
      if(room) {io.to(session.code).emit('room:update',{...room,canStart:canStart(room)});broadcastSnapshot(session.code);}
      else worlds.delete(session.code);
    }, 120000).unref());
  });
});

httpServer.listen(port,'0.0.0.0', () => console.log(`Server listening on http://localhost:${port}`));
