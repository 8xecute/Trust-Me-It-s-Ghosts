import { useEffect, useMemo, useRef, useState } from 'react';
import { BASIC_RULES_MODE, professions, caseGrid, castProfiles, type CaseSite, type Character } from '@baan/shared';
import { TacticalTechniques } from './TacticalTechniques';
import { portraitUrl } from '../characters/CastPortraits';
import { illustrations } from '../case/CaseScene';
import { cellKey, combatPoint, movementPreview } from './combatPresentation';
const cutouts=import.meta.glob<string>('../../assets/case-001/combat/*.png',{eager:true,query:'?url',import:'default'});
const tokenArt=(key:string)=>cutouts['../../assets/case-001/combat/'+key+'.png'];

type Cell={x:number;y:number};
export type BattleView={
  final55?:{step:0|1|2|3;shield:'up'|'down';damageBlocked?:boolean};
  title:string; round:number; active:string|null; objective:boolean;
  turnEncounter?:{
    scene?:string;canPacify?:boolean;pacifyDescription?:string;npcActive?:string;
    declared?:{attackId:string;targetId:string;round:number};canWithhold?:boolean;
    party:string[]; acted:string[]; maxHp:number; ready:boolean;
    history:{round:number;actor:string;label:string;target?:string;check?:{die:number;total:number;outcome:'success'|'partial'|'failure'};effect?:string}[];
    attacks?:{id:string;name:string;resource:'HP'|'Sanity';damage:number}[];
  };
  phase?:'chains'|'flood_memory'|'choice';
  enemies:{id:string;maxHp?:number;resolved?:boolean;hesitating?:boolean;outcome?:string;name:string;position:Cell;hp:number;defense?:{PDEF:number;MDEF:number};telegraph?:{kind:'lash'|'wail';cells:Cell[];attack?:{name_th:string;telegraphOneBossTurnBeforeUse?:boolean}}}[];
  danger:Cell[]; flooded:Cell[]; projections:Cell[];
  reaction:Record<string,number>; restrained:Record<string,number>;
};
const at=(a:Cell,b?:Cell)=>a.x===b?.x && a.y===b?.y;
const cellName=({x,y}:Cell)=>String.fromCharCode(65+x)+(y+1);

export function EncounterBoard({site,battle,players,characters,self,ap,turns,action}:{
  site:CaseSite; battle:BattleView; players:Record<string,Cell>; characters:Record<string,Character>;
  self:string; ap?:number; turns?:Record<string,{ap:number}>; action?:(type:string,payload?:object)=>void;
}) {
  const [selected,setSelected]=useState<Cell>();
  const [enemyId,setEnemyId]=useState('');
  const [ally,setAlly]=useState(()=>Object.keys(players).find(id=>id!==self) ?? self);
  useEffect(()=>{setSelected(undefined);setEnemyId('');},[site,battle.title]);
  const viewport=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const element=viewport.current,position=players[self];
    if(!element||!position)return;
    const center=()=>{const point=combatPoint(position,caseGrid(site).height);element.scrollTo({left:Math.max(0,point.left-element.clientWidth/2+32),top:Math.max(0,point.top-element.clientHeight/2)});};
    center();const observer=new ResizeObserver(center);observer.observe(element);return ()=>observer.disconnect();
  },[site,self,players[self]?.x,players[self]?.y]);
  const grid=caseGrid(site);
  const character=characters[self];
  const canAct=!!action && !!character?.hp && battle.active===self;
  const enemy=battle.enemies.find(entry=>entry.id===enemyId) ?? battle.enemies[0];
  const enemyDistance=enemy && players[self] ? Math.abs(players[self].x-enemy.position.x)+Math.abs(players[self].y-enemy.position.y) : undefined;
  const name=(id:string)=>characters[id] ? (characters[id].playerName ?? 'ผู้เล่น '+(Object.keys(players).filter(p=>characters[p]).indexOf(id)+1))+(characters[id].characterName?' ('+characters[id].characterName+')':'')+' · '+professions[characters[id].profession].name : 'ผู้สืบสวน';
  const occupant=(cell:Cell)=>Object.keys(players).find(id=>at(cell,players[id]));
  const ghost=(cell:Cell)=>battle.enemies.find(entry=>at(cell,entry.position));
  const reachable=useMemo(()=>players[self] ? movementPreview(grid,players[self],
    [...Object.entries(players).filter(([id])=>id!==self).map(([,cell])=>cell),...battle.enemies.map(e=>e.position)],battle.flooded) : new Map<string,number>(),[site,players,self,battle.enemies,battle.flooded]);
  const restrained=(battle.restrained[self] ?? 0)>=battle.round;
  const canMove=selected && reachable.has(cellKey(selected)) && !restrained;
  const canAid=ally!==self && characters[ally]?.hp===0 && players[ally] && players[self] &&
    Math.abs(players[ally].x-players[self].x)+Math.abs(players[ally].y-players[self].y)===1;
  const enemyArt=(spirit:BattleView['enemies'][number])=>spirit.name==='แม่แก้ว' ? (battle.phase==='flood_memory'||battle.phase==='choice'?'kaewFinal':'kaew') : spirit.name==='ผีเงาจมน้ำ'?'drowned':undefined;
  const send=(type:string,payload:object={})=>action?.(type,{...payload,enemyId:enemy?.id});
  return <section className="game-panel encounter-board" aria-label="กระดานเผชิญหน้า">
    <header className="combat-heading"><div><p className="eyebrow">การเผชิญหน้า · รอบ {battle.round}</p><h3>{battle.title}</h3></div>
      <p className="combat-turn" role="status">{battle.active===self && action ? 'เทิร์นของคุณ' : battle.active ? 'เทิร์น '+name(battle.active) : 'กำลังจบรอบ'}{ap!==undefined && ' · AP '+ap+'/3'}</p>
    </header>
    <div className="combat-layout">
      <aside className="combat-team" aria-label="สถานะทีม">{Object.keys(players).filter(id=>characters[id]).map(id=>{
        const member=characters[id];return <article key={id} data-active={battle.active===id}>
          <img src={portraitUrl(member.profession)} alt=""/><div><strong>{name(id)}{id===self?' · คุณ':''}</strong>
          <span>ชีวิต {member.hp} · สติ {member.sanity}</span><span>สมาธิ {member.focus}{turns?.[id] && ' · AP '+turns[id].ap+'/3'}</span>
          {battle.active===id && <span>กำลังเล่น</span>}
          {member.hp===0 && <span className="combat-warning">หมดสภาพ</span>}</div>
        </article>;
      })}</aside>
      <div className="combat-arena" style={{backgroundImage:'linear-gradient(#0a151c55,#0a151cbb),url('+illustrations[site]+')'}}>
        <div className="board-scroll" ref={viewport} tabIndex={0} aria-label="สนามต่อสู้ เลื่อนเพื่อดูทุกช่อง">
          <div className="combat-stage" style={{width:(grid.width+grid.height)*32+64,height:(grid.width+grid.height)*16+140}}>
            {Array.from({length:grid.width*grid.height},(_,i)=>{
              const cell={x:i%grid.width,y:Math.floor(i/grid.width)},id=occupant(cell),spirit=ghost(cell);
              const hazard=[...battle.danger,...battle.flooded].some(p=>at(p,cell));
              const objective=battle.projections.some(p=>at(p,cell)),blocked=grid.blocked.some(p=>at(p,cell));
              const label=id ? name(id) : spirit?.name ?? (hazard?'อันตราย':objective?'จุดอาคม':blocked?'สิ่งกีดขวาง':'ช่องว่าง');
              const tone=spirit?'ghost':id?'ally':hazard?'danger':objective?'objective':blocked?'wall':'';
              const content=blocked?'■':objective?'◎':hazard?'!':'';
              const art=id && characters[id] ? tokenArt(characters[id].profession) : spirit && enemyArt(spirit) ? tokenArt(enemyArt(spirit)!) : undefined;
              const selectedCell=at(cell,selected);
              return <div key={i} className="combat-cell" style={{...combatPoint(cell,grid.height),zIndex:cell.x+cell.y+1}} data-tone={tone} data-danger={hazard} data-selected={selectedCell}>
                {action ? <button type="button" className="combat-tile" data-reachable={canAct && !restrained && reachable.has(cellKey(cell)) && !!ap} aria-pressed={selectedCell} aria-label={cellName(cell)+' '+label+(hazard?' · พื้นที่อันตราย':'')}
                  onClick={()=>{setSelected(cell);if(spirit)setEnemyId(spirit.id);}}><span>{content}</span></button> : <span className="combat-tile" title={cellName(cell)+' '+label}><span>{content}</span></span>}
                {art && <img className="combat-token" src={art} alt="" draggable={false}/>}
                {(id||spirit) && <span className="combat-token-label">{id ? (id===self?'คุณ':name(id)) : spirit!.name}</span>}
              </div>;
            })}
          </div>
        </div>
        <p className="combat-legend">สีฟ้า = ช่องเดิน · แดง / ! = อันตราย · ◎ = จุดอาคม · ■ = สิ่งกีดขวาง · เลื่อนเพื่อดูสนาม</p>
      </div>
    </div>
    <div className="combat-enemies" aria-label="ศัตรูในฉาก">{battle.enemies.map(entry=><button key={entry.id} type="button" aria-pressed={enemy?.id===entry.id} disabled={!action} onClick={()=>setEnemyId(entry.id)}>
      {enemyArt(entry) && <img src={portraitUrl(enemyArt(entry)!)} alt=""/>}<span><strong>{entry.name} · HP {entry.hp}</strong>
      {entry.defense && <small>PDEF {entry.defense.PDEF} · MDEF {entry.defense.MDEF}</small>}
      {entry.telegraph && <small className="combat-warning">เตรียมใช้ {entry.telegraph.attack?.name_th ?? (entry.telegraph.kind==='wail'?'เสียงกรีดร้อง':'การฟาด')} · ระวังช่องสีแดง</small>}</span>
    </button>)}{!battle.enemies.length && <p>ยังไม่เห็นตำแหน่งผี</p>}</div>
    {action && character && <>
      <div className="combat-command-bar"><p className="combat-selection" aria-live="polite">ช่องที่เลือก {selected ? cellName(selected) : '—'}{enemy && ' · เป้าหมาย '+enemy.name}{enemyDistance!==undefined && ' · ห่าง '+enemyDistance+' ช่อง'}</p>
      {restrained && <p className="combat-warning">ถูกพันธนาการ · ต้องปลดพันธนาการก่อนเดิน</p>}
      <div className="battle-actions">
      <button disabled={!canAct || !canMove || !ap} onClick={()=>send('move',{target:selected})}>เดิน (1 AP)</button>
      <button disabled={!canAct || enemyDistance!==1 || (ap ?? 0)<2} onClick={()=>send('strike')}>โจมตี (2 AP · ระยะ 1{BASIC_RULES_MODE?' · 2 HP':''})</button>
      <button disabled={!canAct || enemyDistance!==1 || (ap ?? 0)<2} onClick={()=>send('pacify')}>เจรจา (2 AP · ระยะ 1)</button>
      {battle.final55 && <p role="status">เกราะ{battle.final55.shield==='up'?'ยังป้องกันร่างอยู่':'เปิดแล้ว'} · สำเร็จ {battle.final55.step}/3 ขั้น{battle.final55.damageBlocked?' · การโจมตีโดนแต่เกราะรับความเสียหายไว้':''}</p>}
      {battle.objective && <button disabled={!canAct || (ap ?? 0)<2} onClick={()=>send('caseObjective',battle.final55?{step:battle.final55.step}:undefined)}>
        {battle.final55?['ยึดจุดรับแรงสะท้อน','แยกสายคำสั่ง','คลายปมเกราะ','ปลดกำไลอย่างควบคุม'][battle.final55.step]:'คลายจุดอาคม'} (2 AP{battle.final55?' · INT DC12':''})
      </button>}
      <button disabled={!canAct} onClick={()=>send('escape')}>ถอยจากสนาม</button>
      {BASIC_RULES_MODE && <>
        <label className="combat-help-target">ช่วยเพื่อน <select value={ally} onChange={event=>setAlly(event.target.value)}>{Object.keys(players).map(id=><option key={id} value={id}>{name(id)}</option>)}</select></label>
        <button disabled={!canAct || !canAid || (ap ?? 0)<2} onClick={()=>send('stabilize',{targetId:ally})}>ช่วยเพื่อนหมดสภาพ (2 AP)</button>
        {restrained && <button disabled={!canAct || !ap} onClick={()=>send('breakRestraint')}>แก้พันธนาการ (1 AP)</button>}
      </>}
      <button disabled={!canAct} onClick={()=>send('endTurn')}>จบเทิร์น</button>
      </div>
      </div>
      {!BASIC_RULES_MODE && <details className="combat-techniques"><summary>ความสามารถอาชีพ / ช่วยเหลือ / Reaction</summary>
        <TacticalTechniques character={character} self={self} players={players} active myTurn={canAct}
          connected tactics={{...battle,telegraph:enemy?.telegraph}} action={send} boardTarget={selected} gridSize={grid}/>
      </details>}
    </>}
  </section>;
}
