import {useEffect, useRef, useState, type CSSProperties, type PointerEvent} from 'react';
import {caseNpcs, type CaseNpcId, type CaseNpcPlacement, type CaseNpcPosition, type CaseSite} from '@baan/shared';
import {scenePlacement, scenePoint} from './scenePlacement';
import './CaseScene.css';
const npcCutouts=import.meta.glob<string>('../../assets/case-001/scene-cutouts/*.png',{eager:true,query:'?url',import:'default'});
const combatCutouts=import.meta.glob<string>('../../assets/case-001/combat/*.png',{eager:true,query:'?url',import:'default'});
const cutoutUrl=(id:string)=>npcCutouts['../../assets/case-001/scene-cutouts/'+id+'.png'] ?? combatCutouts['../../assets/case-001/combat/'+id+'.png'];
import entrance from '../../assets/case-001/scenes/roadside-sala.jpg';
import headmanHouse from '../../assets/case-001/scenes/headman-house.jpg';
import missingVillagerHouse from '../../assets/case-001/scenes/missing-villager-house.jpg';
import grove from '../../assets/case-001/scenes/banana-grove.jpg';
import abandonedHouse from '../../assets/case-001/scenes/abandoned-house.jpg';

export const illustrations: Record<CaseSite,string> = {
  A:entrance, B:headmanHouse, C:missingVillagerHouse, D:grove, E:abandonedHouse,
};

export type PlaceNpc = (id:CaseNpcId,position:CaseNpcPosition|null)=>void;
type Props={site:CaseSite;location:string;intro?:string;npcs?:CaseNpcPlacement[];placeNpc?:PlaceNpc;editingDisabled?:boolean};
type Drag={id:CaseNpcId;pointer:number;startX:number;startY:number;position:CaseNpcPosition;moved:boolean;latest?:CaseNpcPlacement};
const publicName=(id:CaseNpcId)=>id==='kaewFinal'?'นางตานี':caseNpcs.find(npc=>npc.id===id)?.name;

export function CaseScene({site,location,intro,npcs=[],placeNpc,editingDisabled=false}:Props) {
  const [selected,setSelected]=useState<CaseNpcId>('prasert');
  const [placing,setPlacing]=useState(false);
  const [playerView,setPlayerView]=useState(false);
  const [draft,setDraft]=useState<CaseNpcPlacement>();
  const stage=useRef<HTMLDivElement>(null);
  const drag=useRef<Drag>();
  const selectedNpc=npcs.find(npc=>npc.id===selected);
  const editable=!!placeNpc && !editingDisabled && !playerView;
  useEffect(()=>{setPlacing(false);setDraft(undefined);drag.current=undefined;},[site,editingDisabled,playerView]);
  const choose=(id:CaseNpcId)=>{setSelected(id);setPlacing(false);};
  const save=(id:CaseNpcId,position:CaseNpcPosition)=>{
    const {x,y}=scenePlacement(position);
    placeNpc?.(id,{...position,x:Math.round(x*10)/10,y:Math.round(y*10)/10});
  };
  const cancelDrag=()=>{drag.current=undefined;setDraft(undefined);};
  const moveDrag=(event:PointerEvent<HTMLButtonElement>)=>{
    const current=drag.current;
    if(!current || current.pointer!==event.pointerId || !stage.current || !editable)return;
    if(Math.hypot(event.clientX-current.startX,event.clientY-current.startY)>4) current.moved=true;
    if(!current.moved)return;
    const rect=stage.current.getBoundingClientRect();
    const position={...current.position,x:current.position.x+(event.clientX-current.startX)/rect.width*100,y:current.position.y+(event.clientY-current.startY)/rect.height*100};
    const {x,y}=scenePlacement(position);
    current.latest={id:current.id,...position,x,y};
    setDraft(current.latest);
  };
  const tokens=npcs.filter(npc=>!npc.hidden || (!!placeNpc && !playerView))
    .map(npc=>draft?.id===npc.id ? draft : npc)
    .sort((a,b)=>scenePlacement(a).y-scenePlacement(b).y || a.id.localeCompare(b.id))
    .map((npc,index)=>{
      const geometry=scenePlacement(npc);
      const style={left:`${geometry.x}%`,top:`${geometry.y}%`,width:`${geometry.width}%`,height:`${geometry.height}%`,zIndex:index+1} satisfies CSSProperties;
      const picture=<><img src={cutoutUrl(npc.id)} alt="" draggable={false}/><span className="scene-npc-name">{publicName(npc.id)}{npc.hidden && ' · ซ่อน'}</span></>;
      return placeNpc && !playerView ? <button type="button" key={npc.id} className="scene-figure scene-figure-editable" style={style}
        data-selected={selected===npc.id} data-hidden={!!npc.hidden} disabled={editingDisabled}
        aria-label={'เลือก '+publicName(npc.id)+(npc.hidden?' · ซ่อนจากผู้เล่น':' · ผู้เล่นเห็น')} aria-pressed={selected===npc.id}
        onClick={event=>{event.stopPropagation();choose(npc.id);}}
        onPointerDown={event=>{
          if(!editable || event.button!==0)return;
          event.stopPropagation();choose(npc.id);
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current={id:npc.id,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,position:{...npc,x:geometry.x,y:geometry.y},moved:false};
        }} onPointerMove={moveDrag} onPointerUp={event=>{
          const current=drag.current;
          moveDrag(event);
          if(current?.pointer===event.pointerId && current.moved && current.latest && editable)save(current.id,current.latest);
          cancelDrag();
        }} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
        onKeyDown={event=>{
          if(event.key==='Escape'){cancelDrag();setPlacing(false);return;}
          const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
          const direction=directions[event.key];if(!direction || !editable)return;
          event.preventDefault();const step=event.shiftKey?5:1;
          save(npc.id,{...npc,x:geometry.x+direction[0]*step,y:geometry.y+direction[1]*step});
        }}>{picture}</button> : <span key={npc.id} className="scene-figure" style={style}>{picture}</span>;
    });
  return <figure className="case-illustration scene-composition" data-editor={!!placeNpc}>
    {placeNpc && <header className="scene-editor-heading"><div><strong>{location}</strong><small>จัดภาพเท่านั้น · ไม่เปลี่ยนสถานะ NPC ในเรื่อง</small></div>
      <button type="button" aria-pressed={playerView} onClick={()=>setPlayerView(!playerView)}>{playerView?'กลับไปจัดฉาก':'ดูภาพฝั่งผู้เล่น'}</button>
    </header>}
    <div className="scene-editor-layout">
      <div className="scene-canvas-column">
        <div ref={stage} className="case-scene-stage" data-placing={placing && editable} aria-label={'ภาพฉาก '+location}
          onClick={event=>{
            if(!placing || !editable || !stage.current || event.detail===0)return;
            const point=scenePoint(event.clientX,event.clientY,stage.current.getBoundingClientRect());
            save(selected,{...selectedNpc,...point,hidden:selectedNpc?.hidden ?? true});setPlacing(false);
          }}><img className="case-scene-image" src={illustrations[site]} alt={location} draggable={false} width={1672} height={941}/><div className="scene-figures">{tokens}</div></div>
        {placeNpc && <p className="scene-editor-hint" role="status">{editingDisabled?'จัดภาพได้เมื่อเชื่อมต่อ เปิดเล่นคดี และอยู่นอกการเผชิญหน้า':playerView?'ภาพฝั่งผู้เล่น · ไม่แสดงตัวที่ซ่อน':placing?'แตะจุดวางเท้าบนภาพ · หรือกดยกเลิก':selectedNpc?'ลากตัวละครเพื่อย้าย · ใช้ปุ่มลูกศรเมื่อเลือกตัวละครได้':'เลือกตัวละคร แล้วกดเลือกจุดวาง'}</p>}
      </div>
      {placeNpc && !playerView && <aside className="scene-npc-controls" aria-label="เครื่องมือจัดภาพตัวละคร">
        <label>ตัวละคร <select value={selected} disabled={editingDisabled} onChange={event=>choose(event.target.value as CaseNpcId)}>{caseNpcs.map(npc=><option key={npc.id} value={npc.id}>{npc.name} · {npcs.some(item=>item.id===npc.id)?npcs.find(item=>item.id===npc.id)?.hidden?'ซ่อน':'แสดง':'ยังไม่วาง'}</option>)}</select></label>
        <div className="scene-selected-card"><img src={cutoutUrl(selected)} alt=""/><div><strong>{caseNpcs.find(npc=>npc.id===selected)?.name}</strong><p>{selectedNpc?selectedNpc.hidden?'ซ่อนจากผู้เล่น':'ผู้เล่นในฉากนี้เห็นอยู่':'ยังไม่อยู่บนภาพ · เริ่มแบบซ่อน'}</p></div></div>
        <div className="scene-placement-actions"><button type="button" disabled={editingDisabled} aria-pressed={placing} onClick={()=>setPlacing(!placing)}>{placing?'ยกเลิกเลือกจุด':selectedNpc?'เลือกจุดย้าย':'เลือกจุดวาง'}</button>
          <button type="button" disabled={editingDisabled || !selectedNpc} onClick={()=>selectedNpc && save(selected,{...selectedNpc,hidden:!selectedNpc.hidden})}>{selectedNpc?.hidden?'แสดงให้ผู้เล่น':'ซ่อนจากผู้เล่น'}</button></div>
        <details><summary>ตำแหน่งและขนาด · ใช้แทนการลาก</summary>
          <form key={site+selected+JSON.stringify(selectedNpc)} onSubmit={event=>{
            event.preventDefault();const data=new FormData(event.currentTarget);
            save(selected,{x:Number(data.get('x')),y:Number(data.get('y')),scale:Number(data.get('scale'))/100,hidden:selectedNpc?.hidden ?? true});setPlacing(false);
          }}><fieldset disabled={editingDisabled}>
            <label>แนวนอน % <input name="x" type="number" min="0" max="100" step="0.1" defaultValue={selectedNpc?.x ?? 50} required/></label>
            <label>จุดวางเท้า % <input name="y" type="number" min="0" max="100" step="0.1" defaultValue={selectedNpc?.y ?? 78} required/></label>
            <label>ขนาด % <input name="scale" type="number" min="60" max="160" step="1" defaultValue={Math.round((selectedNpc?.scale ?? 1)*100)} required/></label>
            <button type="submit">บันทึกตำแหน่งและขนาด</button>
          </fieldset></form>
          <p>เท้าอยู่ต่ำจะดูใกล้และใหญ่ขึ้น · ตัวที่อยู่ใกล้จะบังตัวด้านหลัง · ขอบภาพจำกัดตำแหน่งอัตโนมัติ</p>
        </details>
        <div className="scene-placed-list" aria-label="ตัวละครที่จัดไว้ในฉาก">{npcs.length===0?<p>ยังไม่มีตัวละครในภาพ</p>:npcs.map(npc=><button type="button" key={npc.id} disabled={editingDisabled} aria-pressed={selected===npc.id} onClick={()=>choose(npc.id)}><span>{publicName(npc.id)}</span><small>{npc.hidden?'ซ่อน':'แสดง'}</small></button>)}</div>
        <button type="button" disabled={editingDisabled || !selectedNpc} onClick={()=>{placeNpc(selected,null);setPlacing(false);}}>นำออกจากภาพ</button>
      </aside>}
    </div>
    {intro && <figcaption>{intro}</figcaption>}
  </figure>;
}
