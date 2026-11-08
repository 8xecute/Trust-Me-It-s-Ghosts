import { useState } from 'react';
import { caseNpcs, type CaseNpcId, type CaseNpcPlacement, type CaseSite } from '@baan/shared';
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

type PlaceNpc = (id:CaseNpcId,position:{x:number;y:number}|null)=>void;
export function CaseScene({site,location,intro,npcs=[],placeNpc}:{site:CaseSite;location:string;intro?:string;npcs?:CaseNpcPlacement[];placeNpc?:PlaceNpc}) {
  const [selected,setSelected]=useState<CaseNpcId>('prasert');
  const selectedNpc=npcs.find(npc=>npc.id===selected);
  const tokens=npcs.map(npc=>{
    const character=caseNpcs.find(item=>item.id===npc.id);
    return character && <span className="scene-npc" key={npc.id} style={{left:`${npc.x}%`,top:`${npc.y}%`}}>
      <img src={cutoutUrl(npc.id)} alt=""/><span>{character.name}</span>
    </span>;
  });
  const picture=<><img className="case-scene-image" src={illustrations[site]} alt={location}/>{tokens}</>;
  return <figure className="case-illustration">
    {placeNpc && <div className="scene-npc-controls">
      <label>วางตัวละคร <select value={selected} onChange={event=>setSelected(event.target.value as CaseNpcId)}>{caseNpcs.map(npc=><option value={npc.id} key={npc.id}>{npc.name}</option>)}</select></label>
      <p>คลิกภาพเพื่อวางหรือย้ายตัวละครที่เลือก ผู้เล่นในฉากนี้จะเห็นทันที</p>
      <form key={site+selected+(selectedNpc?.x ?? '')+':'+(selectedNpc?.y ?? '')} onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);placeNpc(selected,{x:Number(data.get('x')),y:Number(data.get('y'))});}}>
        <label>แนวนอน % <input name="x" type="number" min="0" max="100" step="0.1" defaultValue={selectedNpc?.x ?? 50} required/></label>
        <label>แนวตั้ง % <input name="y" type="number" min="0" max="100" step="0.1" defaultValue={selectedNpc?.y ?? 50} required/></label>
        <button type="submit">วางตามตำแหน่ง</button>
        <button type="button" disabled={!selectedNpc} onClick={()=>placeNpc(selected,null)}>นำออกจากฉาก</button>
      </form>
    </div>}
    {placeNpc ? <button type="button" className="case-scene-stage case-scene-placement" aria-label={'คลิกเพื่อวาง '+caseNpcs.find(n=>n.id===selected)?.name+' บนฉาก'} onClick={event=>{
      const rect=event.currentTarget.getBoundingClientRect();
      if(event.detail===0) return;
      placeNpc(selected,{x:Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))});
    }}>{picture}</button> : <div className="case-scene-stage">{picture}</div>}
    {intro && <figcaption>{intro}</figcaption>}
  </figure>;
}
