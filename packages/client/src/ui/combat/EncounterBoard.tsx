import { useState } from 'react';
import { caseGrid, castProfiles, type CaseSite, type Character } from '@baan/shared';
import { TacticalTechniques } from './TacticalTechniques';
import { portraitUrl } from '../characters/CastPortraits';

type Cell={x:number;y:number};
export type BattleView={
  title:string; round:number; active:string|null; objective:boolean;
  phase?:'chains'|'flood_memory'|'choice';
  enemies:{id:string;name:string;position:Cell;hp:number;defense?:{PDEF:number;MDEF:number};telegraph?:{kind:'lash'|'wail';cells:Cell[];attack?:{name_th:string}}}[];
  danger:Cell[]; flooded:Cell[]; projections:Cell[];
  reaction:Record<string,number>; restrained:Record<string,number>;
};
const at=(a:Cell,b?:Cell)=>a.x===b?.x && a.y===b?.y;
const cellName=({x,y}:Cell)=>String.fromCharCode(65+x)+(y+1);

export function EncounterBoard({site,battle,players,characters,self,ap,action}:{
  site:CaseSite; battle:BattleView; players:Record<string,Cell>; characters:Record<string,Character>;
  self:string; ap?:number; action?:(type:string,payload?:object)=>void;
}) {
  const [selected,setSelected]=useState<Cell>();
  const [enemyId,setEnemyId]=useState('');
  const grid=caseGrid(site);
  const character=characters[self];
  const canAct=!!action && !!character?.hp && battle.active===self;
  const enemy=battle.enemies.find(entry=>entry.id===enemyId) ?? battle.enemies[0];
  const enemyDistance=enemy && players[self] ? Math.abs(players[self].x-enemy.position.x)+Math.abs(players[self].y-enemy.position.y) : undefined;
  const name=(id:string)=>characters[id] ? (characters[id].playerName ?? castProfiles[characters[id].profession].name) : 'ผู้สืบสวน';
  const occupant=(cell:Cell)=>Object.keys(players).find(id=>at(cell,players[id]));
  const ghost=(cell:Cell)=>battle.enemies.find(entry=>at(cell,entry.position));
  const canMove=selected && players[self] && !occupant(selected) && !ghost(selected) &&
    !grid.blocked.some(cell=>at(cell,selected)) && Math.abs(players[self].x-selected.x)+Math.abs(players[self].y-selected.y)<=4;
  const send=(type:string,payload:object={})=>action?.(type,{...payload,enemyId:enemy?.id});
  return <section className="game-panel encounter-board" aria-label="กระดานเผชิญหน้า">
    <h3>{battle.title} · รอบ {battle.round}</h3>
    <p>{battle.active===self && action ? 'เทิร์นของคุณ' : battle.active ? 'เทิร์น '+name(battle.active) : 'กำลังจบรอบ'}{ap!==undefined && ' · AP '+ap+'/3'}</p>
    <div className="board-scroll">
      <div className="battle-grid" style={{gridTemplateColumns:`repeat(${grid.width}, minmax(var(--battle-cell,32px),1fr))`}}>
        {Array.from({length:grid.width*grid.height},(_,i)=>{
          const cell={x:i%grid.width,y:Math.floor(i/grid.width)};
          const id=occupant(cell), spirit=ghost(cell);
          const hazard=[...battle.danger,...battle.flooded].some(p=>at(p,cell));
          const objective=battle.projections.some(p=>at(p,cell));
          const blocked=grid.blocked.some(p=>at(p,cell));
          const label=id ? name(id) : spirit?.name ?? (hazard?'อันตราย':objective?'จุดอาคม':blocked?'สิ่งกีดขวาง':'ช่องว่าง');
          const content=id ? (id===self?'คุณ':Object.keys(players).indexOf(id)+1) : spirit ? 'ผี' : hazard ? '!' : objective ? '◎' : blocked ? '■' : cellName(cell);
          const tone=hazard?'danger':spirit?'ghost':id?'ally':objective?'objective':blocked?'wall':'';
          return action ? <button key={i} type="button" data-tone={tone} aria-pressed={at(cell,selected)} aria-label={cellName(cell)+' '+label}
            onClick={()=>{setSelected(cell);if(spirit) setEnemyId(spirit.id);}}>{content}</button> :
            <span key={i} data-tone={tone} title={cellName(cell)+' '+label}>{content}</span>;
        })}
      </div>
    </div>
    <p className="note battle-pan-hint">ปัดซ้ายหรือขวาเพื่อดูกระดานทั้งหมด</p>
    <p className="note">เลข = เพื่อนร่วมทีม · ผี = ศัตรู · ! = พื้นที่อันตราย · ◎ = จุดอาคม · ■ = สิ่งกีดขวาง</p>
    {battle.enemies.length ? <ul className="cast-strip" aria-label="ศัตรูในฉาก">
      {battle.enemies.map(entry=>{
        const key=entry.name==='แม่แก้ว' ? (battle.phase==='flood_memory' || battle.phase==='choice' ? 'kaewFinal' : 'kaew') :
          entry.name==='ผีเงาจมน้ำ' ? 'drowned' : undefined;
        return <li key={entry.id}>{key && <img src={portraitUrl(key)} alt="" loading="lazy"/>}{entry.name} · พลัง {entry.hp}{entry.defense && ' · PDEF '+entry.defense.PDEF+' · MDEF '+entry.defense.MDEF}{entry.telegraph?.attack && ' · เตรียมใช้ '+entry.telegraph.attack.name_th}</li>;
      })}
    </ul> : <p>ยังไม่เห็นตำแหน่งผี</p>}
    {action && character && <>
      <p>ช่องที่เลือก {selected ? cellName(selected) : '—'}{enemy && ' · เป้าหมาย '+enemy.name}{enemyDistance!==undefined && ' · ห่าง '+enemyDistance+' ช่อง'}</p>
      <div className="battle-actions">
      <button disabled={!canAct || !canMove || !ap} onClick={()=>send('move',{target:selected})}>เดิน (1 AP)</button>
      <button disabled={!canAct || enemyDistance!==1 || (ap ?? 0)<2} onClick={()=>send('strike')}>โจมตี (2 AP · ระยะ 1)</button>
      <button disabled={!canAct || enemyDistance!==1 || (ap ?? 0)<2} onClick={()=>send('pacify')}>เจรจา (2 AP · ระยะ 1)</button>
      {battle.objective && <button disabled={!canAct || (ap ?? 0)<2} onClick={()=>send('caseObjective')}>คลายจุดอาคม (2 AP)</button>}
      <button disabled={!canAct} onClick={()=>send('escape')}>ถอยจากสนาม</button>
      <button disabled={!canAct} onClick={()=>send('endTurn')}>จบเทิร์น</button>
      </div>
      <details><summary>ความสามารถและการช่วยเหลือ</summary>
        <TacticalTechniques character={character} self={self} players={players} active myTurn={canAct}
          connected tactics={{...battle,telegraph:enemy?.telegraph}} action={send} boardTarget={selected} gridSize={grid}/>
      </details>
    </>}
  </section>;
}
