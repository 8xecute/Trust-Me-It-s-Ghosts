import type { Background, CaseNotebookView, CaseSite, Character, DmEventPreview, DmLogEntry, DmRollCard, StoryDiceInfo, NarrativeView } from '@baan/shared';
import type { BattleView } from '../ui/combat/EncounterBoard';

export type Snapshot = {
  revision:number;
  narrative?:NarrativeView;
  manualDm?:true;
  awaitingReport?:boolean;
  dmLog?:DmLogEntry[];
  pendingQuestionCount?:number;
  pendingCheck?:string;
  caseMap?:{site:CaseSite;opportunity?:string;withdrawalBlocked?:boolean;battle?:BattleView};
  players:Record<string,{x:number;y:number}>;
  turns:Record<string,{ap:number}>;
  characters?:Record<string,Character>;
  case001?: {
    notebook?:CaseNotebookView;speakers?:string[];title:string;location:string;time:string;intro?:string;notice:string;haunt:number;rescued:number;escorting:number;
    evidence:number;seals:number;progress:number;containment?:number;ghost:string|null;report:{text:string}|null;
    actions:{id:string;label:string;minutes:number;speaker?:string;check?:'ritual'|'spirit'|'investigation'|'physical'|'social';background?:Background;deception?:boolean;dice?:StoryDiceInfo}[];
  };
  humanDmId?:string|null;
  diceRequest?:DmRollCard|null;
  latestRoll?:DmRollCard;
  lastCheck:{playerId:string;die:number;total:number;outcome:'success'|'partial'|'failure'}|null;
};
export type GmChapter = {
  id:string;
  title:string;
  goal:string;
  beats:{id:string;title:string;when:string;read:string[];track?:'main'|'support';fullScript?:string}[];
};

export type CaseDmPanel = {
  caseMode:true;
  guide?:GmChapter[];
  diceGuide?:{id:string;scene_id:string;title:string;stat:string;dc:number;trigger:string;baseline:string;bypass:string;fallback:string}[];
  narration:{id:string;eventId:string;site:string;text:string;recipients?:string[];current?:boolean;speakers?:string[]}[];
  speakers?:string[];
  travel:{id:string;label:string}[];
  wichai?:{baseHPFor2:number;PDEF:number;MDEF:number;ATK:number;INIT:number;MOVE:number};
  questions?:{id:string;playerId:string;label:string;open:boolean}[];
  investigators:{id:string;site:string;script:string;secret:string;check?:{id:string;label:string;dice?:StoryDiceInfo};diceRequest?:DmRollCard;narrative?:NarrativeView;events?:DmEventPreview[];choices:{id:string;label:string;speaker?:string;answer?:string}[]}[]};
export type PublicRoom = {code:string;occupied:number;capacity:number};
export type Room = {code:string; version?:2; players:{id:string;ready:boolean}[]};
export type Reply = {ok:boolean; persistent?:boolean; error?:string; room?:Room; playerId?:string; token?:string; snapshot?:Snapshot};
