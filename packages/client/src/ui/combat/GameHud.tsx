import { MAX_AP } from '@baan/shared';

type HudProps = {
  turnMode?:boolean;
  actionStatus?:string;
  hp?:number;maxHp?:number;
  sanity?:number;
  focused?:boolean;
  focus?:number;
  ap?:number;
  haunt?:number;
  exploring?:boolean;
};

export function GameHud({hp,maxHp,sanity,focus,focused,ap,haunt,exploring,turnMode,actionStatus}:HudProps) {
  const stats = [
    {label:'พลังชีวิต',value:hp===undefined?'—':maxHp===undefined?hp:`${hp}/${maxHp}`} ,
    {label:'สติ',value:sanity ?? '—'},
    {label:'สมาธิ',value:focus ?? (focused === undefined ? '—' : focused ? 'พร้อม +2' : 'ยังไม่ตั้งสมาธิ')},
    ...(turnMode ? [{label:'การกระทำ',value:actionStatus ?? 'ยังไม่เริ่ม encounter'}] : [{label:'แต้ม AP',value:ap === undefined ? (exploring ? 'สำรวจ' : '—') : `${ap}/${MAX_AP}`},
    {label:'ความหลอน',value:haunt === undefined ? '—' : `${haunt}/10`}]),
  ];
  return <dl className="game-hud" aria-label="สถานะการเล่น">
    {stats.map(({label,value})=><div key={label}><dt>{label}</dt><dd>{value === '—' ? <span aria-label="ไม่มีข้อมูล">—</span> : value}</dd></div>)}
  </dl>;
}

export function FieldJournal({clues,items}:{clues:string[];items:string[]}) {
  return <details className="game-panel journal">
    <summary>สมุดภาคสนาม · หลักฐาน {clues.length} · คลัง {items.length}</summary>
    <div className="journal-columns">
      <section><h3>กระดานหลักฐาน</h3>{clues.length ? <ul>{clues.map(clue=><li key={clue}>{clue}</li>)}</ul> : <p>ยังไม่มีหลักฐาน</p>}</section>
      <section><h3>คลังของคุณ</h3>{items.length ? <ul>{items.map(item=><li key={item}>{item}</li>)}</ul> : <p>ยังไม่มีไอเท็ม</p>}</section>
    </div>
  </details>;
}
