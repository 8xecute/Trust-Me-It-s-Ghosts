import { OnlineGame } from './OnlineGame';
import { useEffect, useRef, useState } from 'react';
import { createGame } from './rendering/game';
import { actionsFor, initialObjects, transition, type Action } from './game/objects';

const labels: Record<Action,string> = {inspect:'ตรวจดู',open:'เปิด',close:'ปิด',collect:'เก็บหลักฐาน'};
export function App() {
  const [online,setOnline]=useState(false);
  return <><button onClick={()=>setOnline(!online)}>{online?'เล่นคนเดียว':'เล่นออนไลน์'}</button>{online?<OnlineGame/>:<SoloGame/>}</>;
}
function SoloGame() {
  const canvas = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const [ghost,setGhost] = useState<{manifestation:number;ghostHealth:number;playerHealth:number;disposition:string}|null>(null);
  const [outcome,setOutcome] = useState('');
  const [turn,setTurn] = useState({ap:3,focused:false});
  const [checkResult,setCheckResult] = useState('');
  const [mode,setMode] = useState<'exploration' | 'encounter'>('exploration');
  const [objects,setObjects] = useState(initialObjects);
  const [selected,setSelected] = useState<string | null>(null);
  const [log,setLog] = useState<string[]>([]);
  const [inventory,setInventory] = useState<string[]>([]);
  const [message,setMessage] = useState('');
  const [text,setText] = useState('');
  const [proposal,setProposal] = useState<{intent:string;target:string;cost:number}|null>(null);
  useEffect(() => { if (!canvas.current) return; const game = createGame(canvas.current,setSelected); gameRef.current = game; game.events.on('turn-update', setTurn); game.events.on('ghost-update', setGhost); game.events.on('encounter-resolved', (v:string) => { setMode('exploration'); setOutcome(v === 'pacified' ? 'ผีสงบแล้ว' : v === 'escaped' ? 'หนีสำเร็จ' : 'ผีพ่ายแพ้ชั่วคราว'); }); game.events.on('check-result', (r: {die:number;total:number;outcome:string}) => setCheckResult(`ทอย ${r.die} รวม ${r.total}: ${r.outcome === 'success' ? 'สำเร็จ' : r.outcome === 'partial' ? 'สำเร็จบางส่วน' : 'ไม่สำเร็จ'}`)); return () => { gameRef.current = null; game.destroy(true); }; }, []);
  const object = objects.find(o => o.id === selected);
  function act(action: Action) {
    if (!object || !actionsFor(object).includes(action)) return;
    if (action === 'inspect') setMessage(object.state === 'locked' ? 'วัตถุนี้ล็อกอยู่' : 'ตรวจดูวัตถุแล้ว');
    if (action === 'collect' && object.evidenceId && !inventory.includes(object.evidenceId)) {
      setInventory(items => [...items,object.evidenceId!]); setLog(items => items.includes(object.evidenceId!) ? items : [...items,object.evidenceId!]);
    }
    setObjects(items => items.map(item => item.id === object.id ? transition(item,action) : item));
  }
  return <main><header><div><p className="eyebrow">เกมสำรวจร่วมกัน</p><h1>บริษัท เรื่องผีไว้ใจผม จำกัด</h1><p>Trust Me, It’s Ghosts Co., Ltd.</p></div></header>
    <section aria-label="ฉากเกม"><div ref={canvas} className="game" /></section>
    <section><p>โหมด: {mode === 'exploration' ? 'สำรวจ' : 'เผชิญหน้า'}</p><button disabled={mode === 'encounter'} onClick={() => { const next = mode === 'exploration' ? 'encounter' : 'exploration'; gameRef.current?.events.emit('set-mode', next); setMode(next); }}>{mode === 'exploration' ? 'เริ่มเผชิญหน้า' : 'กลับไปสำรวจ'}</button>{mode === 'encounter' && <>{ghost && <p>ผี: {ghost.disposition === 'hostile' ? 'เป็นศัตรู' : 'สงบ'} · ปรากฏกาย {ghost.manifestation}/3 · พลังผี {ghost.ghostHealth} · พลังผู้เล่น {ghost.playerHealth}</p>}<button onClick={() => gameRef.current?.events.emit('ghost-action','pacify')}>ปลอบผี</button><button onClick={() => gameRef.current?.events.emit('ghost-action','strike')}>โจมตีผี</button><button onClick={() => gameRef.current?.events.emit('ghost-action','escape')}>หนีจากขอบแผนที่</button><p>ปลอบหรือโจมตีเมื่ออยู่ติดผี ใช้ 1 AP</p><button onClick={() => gameRef.current?.events.emit('end-turn')}>จบเทิร์น</button><p>AP: {turn.ap}/3 · {turn.focused ? 'มีสมาธิ (+2)' : 'ไม่มีโบนัสสมาธิ'}</p><p>เดิน 1 ช่อง: 1 AP · ตรวจทักษะ: 1 AP (DC 12) · สมาธิ: 1 AP</p><button disabled={turn.ap < 1 || turn.focused} onClick={() => gameRef.current?.events.emit('focus-action')}>ตั้งสมาธิ</button><button disabled={turn.ap < 1} onClick={() => gameRef.current?.events.emit('check-action')}>ทดสอบทักษะ</button><p>{checkResult}</p></>}</section>
    <p>{outcome}</p>
    <p className="note">คลิกเพื่อเดินหรือเลือกวัตถุ · ลูกศร/WASD เดิน · I J K L เลื่อนกล้อง · Q/E ซูม · F ติดตาม · R หลังคา</p>
    {object && <section aria-label="เมนูวัตถุ"><h2>{object.name}</h2><p>{object.state === 'locked' ? 'ล็อกอยู่' : object.state === 'open' ? 'เปิดอยู่' : object.state === 'closed' ? 'ปิดอยู่' : 'วัตถุทั่วไป'}</p>{actionsFor(object).map(a => <button key={a} onClick={() => act(a)}>{labels[a]}</button>)}<button onClick={() => {setSelected(null);setMessage('');}}>ปิดเมนู</button><p>{message}</p></section>}
    <section><h2>บันทึกหลักฐาน</h2><p>{log.length ? log.join(', ') : 'ยังไม่มีหลักฐาน'}</p><h2>คลังผู้เล่น</h2><p>{inventory.length ? inventory.join(', ') : 'ว่าง'}</p></section>
    <section><h2>การกระทำอิสระ</h2><form onSubmit={e => {e.preventDefault(); if (text.trim()) setProposal({intent:text.trim(),target:object?.name ?? 'ไม่ระบุ',cost:1});}}><label>ระบุการกระทำ <input value={text} onChange={e => setText(e.target.value)} /></label><button disabled={!!proposal}>เสนอ</button></form>{proposal && <div><p>เจตนา: {proposal.intent}</p><p>เป้าหมาย: {proposal.target}</p><p>ค่าใช้จ่ายโดยประมาณ: {proposal.cost}</p><button onClick={() => {setMessage('อนุมัติข้อเสนอในระบบจำลองแล้ว');setProposal(null);}}>อนุมัติ</button><button onClick={() => {setMessage('ปฏิเสธข้อเสนอแล้ว');setProposal(null);}}>ปฏิเสธ</button><button onClick={() => setProposal(null)}>ยกเลิก</button></div>}<p>{message}</p></section>
  </main>;
}
