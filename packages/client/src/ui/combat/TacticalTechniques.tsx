import { useState } from 'react';
import { professionTechniques, type Character } from '@baan/shared';

type Cell = { x:number; y:number };
type Props = {
  character: Character; self: string; players: Record<string,Cell>;
  active: boolean; myTurn: boolean; connected: boolean;
  tactics: { round:number; reaction:Record<string,number>; restrained:Record<string,number>; telegraph?:{kind:'lash'|'wail';cells:Cell[]} };
  action: (type:string,payload?:object)=>void;
  boardTarget?:Cell;
  gridSize?:{width:number;height:number};
};

export function TacticalTechniques({character,self,players,active,myTurn,connected,tactics,action,boardTarget,gridSize}:Props) {
  const [ally,setAlly]=useState('');
  const [manualTarget,setTarget]=useState<Cell>({x:0,y:0});
  const target=boardTarget ?? manualTarget;
  const [allyTarget,setAllyTarget]=useState<Cell>({x:0,y:0});
  const technique=professionTechniques[character.profession];
  const talent=technique.talents.find(entry=>entry.id===character.talent);
  const reactionReady=!!tactics.telegraph && tactics.reaction[self]!==tactics.round;
  const targetId=players[ally] ? ally : self;
  const available=active && connected && character.hp>0;
  const coordinate=(label:string, cell:Cell, update:(cell:Cell)=>void)=><fieldset>
    <legend>{label}</legend>
    <label>แนวนอน <input type="number" min={0} max={(gridSize?.width ?? 10)-1} value={cell.x} onChange={event=>update({...cell,x:Number(event.target.value)})}/></label>
    <label>แนวตั้ง <input type="number" min={0} max={(gridSize?.height ?? 10)-1} value={cell.y} onChange={event=>update({...cell,y:Number(event.target.value)})}/></label>
  </fieldset>;
  return <section className="game-panel" aria-label="พรสวรรค์และปฏิกิริยาตอบโต้">
    <h3>พรสวรรค์และปฏิกิริยาตอบโต้</h3>
    <p role="status">รอบ {tactics.round}
      {tactics.telegraph && ` · ระวัง${tactics.telegraph.kind==='wail'?'เสียงกรีดร้อง':'การฟาด'} ที่ช่อง ${tactics.telegraph.cells.map(cell=>`(${cell.x}, ${cell.y})`).join(', ')}`}
      <button disabled={!available || !myTurn} onClick={()=>action('stabilize',{targetId})}>ช่วยเพื่อนที่หมดสภาพ (2 AP)</button>
    {(tactics.restrained[self] ?? 0)>=tactics.round && ' · ถูกพันธนาการ'}
    </p>
    <label>เป้าหมาย <select value={targetId} onChange={event=>setAlly(event.target.value)}>
      {Object.keys(players).map((id,index)=><option key={id} value={id}>{id===self?'ตัวเอง':`ผู้เล่น ${index+1}`}</option>)}
    </select></label>
    {(['ritual_zone','evasive_step','electric_talisman_trap','emergency_drag'].includes(talent?.id ?? '') || technique.passive==='field_technician') &&
      (gridSize ? <p>เลือกช่องเป้าหมายจากกระดาน</p> : coordinate('ช่องเป้าหมาย',target,setTarget))}
    {talent?.id==='emergency_drag' && coordinate('ช่องปลายทางของเพื่อน',allyTarget,setAllyTarget)}
    {talent && talent.id!=='detect_deception' && <button
      disabled={!available || character.focus<talent.focus || !(talent.reaction?reactionReady:myTurn)}
      onClick={()=>action('useTalent',{targetId,target,allyTarget})}>{talent.name} ({talent.reaction?'ตอบโต้':`${talent.ap} AP`}, สมาธิ {talent.focus})</button>}
    {talent && ['soothe_spirit','spirit_binding','clearing_bash','silence_wail','ritual_jammer'].includes(talent.id) &&
      <button disabled={!available || !myTurn || character.focus<talent.focus+1}
        onClick={()=>action('useTalent',{targetId,target,allyTarget,boost:'focus'})}>ใช้{talent.name}พร้อมสมาธิเพิ่ม (+2, สมาธิ {talent.focus+1})</button>}
    {technique.passive==='bodyguard' && <button disabled={!available || !reactionReady} onClick={()=>action('usePassive',{targetId})}>รับการโจมตีแทนเพื่อน</button>}
    {technique.passive==='field_technician' && <button disabled={!available || !myTurn} onClick={()=>action('usePassive',{target})}>วางอุปกรณ์เตือนภัย (0 AP)</button>}
    {technique.passive==='emergency_response' && <button disabled={!available || !myTurn} onClick={()=>action('usePassive',{targetId})}>ช่วยชีวิตฉุกเฉิน (2 AP)</button>}
    <button disabled={!available || !myTurn} onClick={()=>action('stabilize',{targetId})}>ช่วยเพื่อนที่หมดสภาพ (2 AP)</button>
    {(tactics.restrained[self] ?? 0)>=tactics.round && <button disabled={!available || !myTurn} onClick={()=>action('breakRestraint')}>แก้พันธนาการ (1 AP)</button>}
  </section>;
}
