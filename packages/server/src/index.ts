import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Rooms, canStart } from './rooms.js';
import { WorldStore } from './world.js';

const port = Number(process.env.PORT ?? 3001);
const httpServer = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('เซิร์ฟเวอร์ บริษัท เรื่องผีไว้ใจผม จำกัด');
});

// Development-only origins. Configure trusted origins before deployment.
const io = new Server(httpServer, {
  cors: { origin: /^http:\/\/(localhost|127\.0\.0\.1):\d+$/ },
});

const rooms = new Rooms();
const worlds = new WorldStore();
io.on('connection', (socket) => {
  type Ack = (result: unknown) => void;
  const handle = (ack: unknown, fn: () => void) => { if (typeof ack !== 'function') return; try { fn(); } catch (error) { (ack as Ack)({ok:false,error:error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'}); } };
  socket.on('room:create', (ack: unknown) => handle(ack, () => {
    const room=rooms.create(socket.id); worlds.create(room.code); worlds.addPlayer(room.code,rooms.playerId(socket.id)!); socket.join(room.code); (ack as Ack)({ok:true,room,playerId:rooms.playerId(socket.id),snapshot:worlds.snapshot(room.code)});
  }));
  socket.on('room:join', (code: unknown, ack: unknown) => handle(ack, () => {
    const room=rooms.join(socket.id,code); worlds.addPlayer(room.code,rooms.playerId(socket.id)!); socket.join(room.code); (ack as Ack)({ok:true,room,playerId:rooms.playerId(socket.id),snapshot:worlds.snapshot(room.code)}); io.to(room.code).emit('game:snapshot',worlds.snapshot(room.code)); io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  }));
  socket.on('room:ready', (ready: unknown, ack: unknown) => handle(ack, () => {
    const room=rooms.ready(socket.id,ready); (ack as Ack)({ok:true,room}); io.to(room.code).emit('room:update',{...room,canStart:canStart(room)});
  }));
  socket.on('game:action', (action: unknown, ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id);
    if (!code || !player) throw Error('ไม่ได้อยู่ในห้อง');
    const result=worlds.apply(code,player,action);
    (ack as Ack)({ok:true,...result});
    if (!result.duplicate) io.to(code).emit('game:snapshot',result.snapshot);
  }));
  socket.on('game:snapshot', (ack: unknown) => handle(ack, () => {
    const code=rooms.roomCode(socket.id); if(!code) throw Error('ไม่ได้อยู่ในห้อง');
    (ack as Ack)({ok:true,snapshot:worlds.snapshot(code)});
  }));
  socket.on('disconnect', () => { const code=rooms.roomCode(socket.id), player=rooms.playerId(socket.id); const room=rooms.leave(socket.id); if(code && player) worlds.removePlayer(code,player); if(room) { io.to(room.code).emit('room:update',{...room,canStart:canStart(room)}); io.to(room.code).emit('game:snapshot',worlds.snapshot(room.code)); } else if(code) worlds.delete(code); });
});

httpServer.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
