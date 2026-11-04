import { randomBytes, randomUUID } from 'node:crypto';
export interface Player { id: string; ready: boolean }
export interface Room { code: string; players: Player[] }
export class Rooms {
 private rooms = new Map<string,Room>();
 private tokens = new Map<string,{code:string;id:string}>();
 private memberships = new Map<string,string>();
 create(socket: string): Room {
  if (this.memberships.has(socket)) throw new Error('อยู่ในห้องแล้ว');
  let code: string; do { code = randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
  const room={code,players:[]}; this.rooms.set(code,room); return this.join(socket,code);
 }
 join(socket: string, raw: unknown): Room {
  if(this.memberships.has(socket)) throw new Error('อยู่ในห้องแล้ว');
  if(typeof raw !== 'string' || !/^[A-F0-9]{6}$/.test(raw.trim().toUpperCase())) throw new Error('รหัสห้องไม่ถูกต้อง');
  const code=raw.trim().toUpperCase(), room=this.rooms.get(code);
  if(!room) throw new Error('ไม่พบห้อง');
  if(room.players.length>=4) throw new Error('ห้องเต็ม');
  room.players.push({id:randomUUID(),ready:false}); this.memberships.set(socket,code); this.ids.set(socket,room.players[room.players.length-1].id); return this.snapshot(room);
 }
 token(socket:string):string { const id=this.ids.get(socket),code=this.memberships.get(socket); if(!id||!code) throw Error('ไม่ได้อยู่ในห้อง'); const token=randomBytes(32).toString('hex'); this.tokens.set(token,{id,code}); return token; }
 detach(socket:string) { const code=this.memberships.get(socket), id=this.ids.get(socket); this.memberships.delete(socket); this.ids.delete(socket); if(!code||!id) return null; const room=this.rooms.get(code)!; const player=room.players.find(p=>p.id===id); if(player) player.ready=false; return {code,id,room:this.snapshot(room)}; }
 resume(socket:string, token:unknown) { if(this.memberships.has(socket)||typeof token!=='string') throw Error('ข้อมูลเชื่อมต่อไม่ถูกต้อง'); const session=this.tokens.get(token); if(!session || !this.rooms.get(session.code)?.players.some(p=>p.id===session.id) || [...this.ids.values()].includes(session.id)) throw Error('ไม่สามารถกลับเข้าห้อง'); this.memberships.set(socket,session.code); this.ids.set(socket,session.id); return {room:this.snapshot(this.rooms.get(session.code)!),id:session.id}; }
 expire(code:string,id:string):Room|null { if([...this.ids.values()].includes(id)) return this.rooms.get(code) ? this.snapshot(this.rooms.get(code)!) : null; const room=this.rooms.get(code); if(!room) return null; room.players=room.players.filter(p=>p.id!==id); for(const [token,s] of this.tokens) if(s.id===id && s.code===code) this.tokens.delete(token); if(!room.players.length) {this.rooms.delete(code);return null;} return this.snapshot(room); }
 private ids = new Map<string,string>();
 ready(socket:string, ready:unknown): Room {
  if(typeof ready !== 'boolean') throw new Error('สถานะไม่ถูกต้อง');
  const room=this.roomFor(socket); const player=room.players.find(p=>p.id===this.ids.get(socket))!; player.ready=ready; return this.snapshot(room);
 }
 leave(socket:string): Room | null {
  const code=this.memberships.get(socket); if(!code) return null; const room=this.rooms.get(code)!;
  room.players=room.players.filter(p=>p.id!==this.ids.get(socket)); this.memberships.delete(socket); this.ids.delete(socket);
  if(!room.players.length){this.rooms.delete(code);return null;} return this.snapshot(room);
 }
 roomCode(socket:string) { return this.memberships.get(socket); }
 playerId(socket:string) { return this.ids.get(socket); }
 private roomFor(socket:string):Room { const code=this.memberships.get(socket); const room=code && this.rooms.get(code); if(!room) throw new Error('ไม่ได้อยู่ในห้อง'); return room; }
 private snapshot(room:Room):Room { return {code:room.code,players:room.players.map(p=>({...p}))}; }
}
export function canStart(room: Room): boolean { return room.players.length>=2 && room.players.length<=4 && room.players.every(p=>p.ready); }
