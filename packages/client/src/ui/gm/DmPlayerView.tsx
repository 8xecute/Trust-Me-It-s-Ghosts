import { CaseNotebook } from '../case/CaseNotebook';
import type { CaseNotebookView } from '@baan/shared';
import { NarrativeJournal } from '../case/NarrativeJournal';
import type { NarrativeView } from '@baan/shared';
import type { Biography, CaseSite, Character } from '@baan/shared';
import { GameHud } from '../combat/GameHud';
import { CaseScene } from '../case/CaseScene';
import { CharacterCreator } from '../characters/CharacterCreator';
import { CastPortraits, visibleCast } from '../characters/CastPortraits';
import { EncounterBoard, type BattleView } from '../combat/EncounterBoard';

type Cell = {x:number;y:number};
export type PlayerPreview = {
  revision:number;
  narrative?:NarrativeView;
  players:Record<string,Cell>;
  characters?:Record<string,Character>;
  biography?:Biography;
  evidence:string[];
  inventory:Record<string,string[]>;
  caseMap?:{site:CaseSite;battle?:BattleView};
  case001?:{
    notebook?:CaseNotebookView;speakers?:string[];title:string;location:string;time:string;intro?:string;notice:string;haunt:number;
    rescued:number;evidence:number;seals:number;progress:number;
    actions:{id:string;label:string;minutes:number;speaker?:string}[];
    report:{text:string}|null;
  };
};

export function DmPlayerView({playerId,preview}:{playerId:string;preview:PlayerPreview}) {
  const character=preview.characters?.[playerId], story=preview.case001;
  return <section className="game-panel" aria-label="มุมมองผู้สืบสวน">
    <h2>มุมมองผู้สืบสวน</h2>
    {story && <>
      <p>{story.location} · {story.time} · ช่วยแล้ว {story.rescued}/3 · หลักฐาน {story.evidence}/8 · ผนึก {story.seals}/3</p>
    </>}
    {story && preview.caseMap && (preview.caseMap.battle ?
      <EncounterBoard site={preview.caseMap.site} battle={preview.caseMap.battle} players={preview.players} characters={preview.characters ?? {}} self={playerId}/> :
      <CaseScene site={preview.caseMap.site} location={story.location} intro={story.intro}/>)}
    {story && <CastPortraits roles={Object.values(preview.characters ?? {}).map(entry=>entry.profession)} speakers={[...(story.speakers ?? []),...visibleCast(story.actions)]}/>}
    <GameHud exploring={!!story} hp={character?.hp} sanity={character?.sanity} focus={character?.focus} haunt={story?.haunt}/>
    <CaseNotebook view={story?.notebook}/>
    {character && <CharacterCreator character={character} biography={preview.biography} taken={[]} disabled onCreate={()=>{}}/>}
    {preview.narrative?.current ? <NarrativeJournal view={preview.narrative}/> : story && <section className="narration-card"><h3>เหตุการณ์ที่ผู้เล่นเห็น</h3><p className="story-text">{story.notice}</p></section>}
    {story?.report ? <pre className="story-text">{story.report.text}</pre> :
      story && <details><summary>คำสั่งที่ผู้เล่นเห็น</summary>
        <ul>{story.actions.map(option=><li key={option.id}>{option.label} · {option.minutes} นาที</li>)}</ul>
      </details>}
    <p>หลักฐานในห้อง {preview.evidence.join(', ') || 'ยังไม่มี'} · คลัง {preview.inventory[playerId]?.join(', ') || 'ว่าง'}</p>
  </section>;
}
