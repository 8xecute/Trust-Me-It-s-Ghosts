import { useEffect, useRef } from 'react';
import type { CaseSite, GhostEncounter } from '@baan/shared';
import { GameHud } from './GameHud';
import { createGame } from './rendering/game';

type Cell = {x:number;y:number};
export type PlayerPreview = {
  revision:number;
  players:Record<string,Cell>;
  characters?:Record<string,{hp:number;sanity:number;focus:number}>;
  turns:Record<string,{ap:number}>;
  encounter:GhostEncounter|null;
  evidence:string[];
  inventory:Record<string,string[]>;
  caseMap?:{site:CaseSite;battle?:{
    title:string;round:number;active:string|null;
    enemies:{name:string;position:Cell;hp:number}[];
    danger:Cell[];flooded:Cell[];projections:Cell[];
  }};
  case001?:{
    title:string;location:string;time:string;notice:string;haunt:number;
    rescued:number;evidence:number;seals:number;progress:number;
    actions:{id:string;label:string;minutes:number}[];
    report:{text:string}|null;
  };
};

export function DmPlayerView({playerId,preview}:{playerId:string;preview:PlayerPreview}) {
  const canvas=useRef<HTMLDivElement>(null);
  const current=useRef(preview);
  current.current=preview;
  useEffect(()=>{
    if(!canvas.current) return;
    const game=createGame(canvas.current,()=>{},{
      read:()=>{
        const view=current.current, self=view.players[playerId];
        if(!self) return null;
        const battle=view.caseMap?.battle;
        return {
          self,others:Object.entries(view.players).filter(([id])=>id!==playerId).map(([,cell])=>cell),
          ghost:view.caseMap ? null : view.encounter,
          encounterActive:view.caseMap ? !!battle : view.encounter?.phase==='player',
          enemies:battle?.enemies,danger:[...(battle?.danger ?? []),...(battle?.flooded ?? [])],
          objectives:battle?.projections,
        };
      },
      move:()=>{},
    },preview.caseMap?.site);
    return ()=>game.destroy(true);
  },[playerId,preview.caseMap?.site]);
  const character=preview.characters?.[playerId], battle=preview.caseMap?.battle, story=preview.case001;
  return <section className="game-panel" aria-label="มุมมองผู้สืบสวน">
    <h2>มุมมองผู้สืบสวน</h2>
    <p>ดูข้อมูลและแผนที่ของผู้เล่นที่เลือก</p>
    <GameHud hp={character?.hp} sanity={character?.sanity} focus={character?.focus}
      ap={battle ? preview.turns[playerId]?.ap : undefined} haunt={story?.haunt}/>
    {story && <>
      <h3>{story.title}</h3>
      <p>{story.location} · {story.time} · ช่วยแล้ว {story.rescued}/3 · หลักฐาน {story.evidence}/8 · ผนึก {story.seals}/3</p>
      <p>{story.notice}</p>
    </>}
    <div ref={canvas} className="game"/>
    {battle && <section>
      <h3>{battle.title} · รอบ {battle.round}</h3>
      <p>{battle.active===playerId?'เทิร์นของผู้สืบสวนคนนี้':'รอผู้สืบสวนคนอื่น'}</p>
      <ul>{battle.enemies.map((enemy,index)=><li key={index}>{enemy.name} · พลัง {enemy.hp}</li>)}</ul>
    </section>}
    {story?.report ? <pre style={{whiteSpace:'pre-wrap'}}>{story.report.text}</pre> :
      story && <details><summary>คำสั่งที่ผู้เล่นเห็น</summary>
        <ul>{story.actions.map(option=><li key={option.id}>{option.label} · {option.minutes} นาที</li>)}</ul>
      </details>}
    <p>หลักฐานในห้อง {preview.evidence.join(', ') || 'ยังไม่มี'} · คลัง {preview.inventory[playerId]?.join(', ') || 'ว่าง'}</p>
  </section>;
}
