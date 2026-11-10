import type { Background, CaseNotebookView, CaseSite, Character, DmEventPreview, DmLogEntry, DmRollCard, NarrativeBeat, StoryDiceInfo, NarrativeView } from '@baan/shared';
import type { BattleView } from '../ui/combat/EncounterBoard';
import type { TurnConclusionView } from '../ui/combat/TurnEncounter';

export type GuidedJournal = {known_facts:string[];open_questions:string[];next_destination_rationale:string};
export type GuidedScene = {id:string;cue:string;script:string;sent?:boolean;canOpen?:boolean};
export type GuidedView = {disclosureOptions?:{id:string;label:string}[];version:string;phase:string;scene:string;title?:string;previousLead?:string;canAnalyzeHistory:boolean;escorting:number;cue?:string;prompts:string[];questionOptions?:{label:string;speaker:string}[];hint?:string;journals:(GuidedJournal & {phase:string})[];transition?:GuidedJournal & {id:string;from:string;to:string}};

export type Snapshot = {
  playerNames?:Record<string,{playerName?:string;characterName?:string}>;
  inactivePlayers?:string[];preparingSession?:boolean;
  paused?:boolean;
  guided?:GuidedView;
  revision:number;
  narrative?:NarrativeView;
  manualDm?:true;
  awaitingReport?:boolean;
  dmLog?:DmLogEntry[];
  pendingQuestionCount?:number;
  pendingCheck?:string;
  caseMap?:{site:CaseSite;npcs?:import('@baan/shared').CaseNpcPlacement[];opportunity?:string;withdrawalBlocked?:boolean;battle?:BattleView;turnConclusion?:TurnConclusionView};
  players:Record<string,{x:number;y:number}>;
  turns:Record<string,{ap:number}>;
  characters?:Record<string,Character>;
  case001?: {
    notebook?:CaseNotebookView;speakers?:string[];title:string;location:string;time?:string;intro?:string;notice:string;haunt:number;rescued:number;escorting:number;
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

type ReaderScene = {
 secret?:string;clues?:string;
 id:string;title:string;phase:string;brief:[string,string];
 dialogue:{id:string;speaker:string;label:string;text:string}[];
};
type ReaderCheck = {
 scene_id:string;title:string;stat:string;dc:number;partial_margin:number;decision?:string;
 full:string;partial:string;failure:string;
};

export type CaseDmPanel = {
  storyProgress?:{observed:string[];presented:string[]};
  storyReader?:{qa?:{id:string;question:string;aliases:string[];answer:string;speaker:string;kind:string;dm_note:string;requirements:string[];guard_ids:string[]}[];scenes:ReaderScene[];endings:Record<string,{title:string;brief:string;paragraphs:string[]}>;checks:ReaderCheck[];observed:string[];presented:string[]};
  caseMode:true;
  sent?:Record<string,{text:string;site:string;sequence:number;count:number}>;
  guide?:GmChapter[];
  guidedScenes?:GuidedScene[];
  storyEvents?:{id:string;label:string;detail?:string}[];
  storySummary?:string[];
  sharedStory?:NarrativeBeat[];
  backup?:{phase:string;scene:string;title:string;opened:boolean;hints:string[];alternatives:string[];exit:string;delivered:{sequence:number;text:string}[];blockers:string[];progression?:{to?:string;leadScenes:string[];canPropose:boolean;reason?:string};battle:boolean};
  npcDossiers?:{id:string;name:string;background:string;motivation:string;knowledge:string;secret:string;roleplay:string}[];
  diceGuide?:{id:string;scene_id:string;title:string;stat:string;dc:number;trigger:string;baseline:string;bypass:string;fallback:string}[];
  narration:{id:string;eventId:string;site:string;text:string;recipients?:string[];current?:boolean;speakers?:string[];answer?:import('@baan/shared').DmOutcomeAnswer}[];
  speakers?:string[];
  travel:{id:string;label:string}[];
  wichai?:{baseHPFor2:number;PDEF:number;MDEF:number;ATK:number;INIT:number;MOVE:number};
  questions?:{id:string;playerId:string;label:string;open:boolean;suggestions?:{id:string;speaker:string;label:string;answer:string;confirmContext:boolean;qa?:boolean}[]}[];
  investigators:{id:string;site:string;script:string;secret:string;check?:{id:string;label:string;stat?:keyof import('@baan/shared').LiteStats;dice?:StoryDiceInfo};diceRequest?:DmRollCard;narrative?:NarrativeView;events?:DmEventPreview[];choices:{id:string;label:string;speaker?:string;answer?:string}[]}[]};
export type PublicRoom = {code:string;occupied:number;capacity:number};
export type Room = {code:string; version?:2; players:{id:string;ready:boolean}[]};
export type Reply = {ok:boolean; persistent?:boolean; error?:string; room?:Room; playerId?:string; token?:string; snapshot?:Snapshot};
