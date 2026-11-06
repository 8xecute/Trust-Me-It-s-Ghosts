export interface NarrativeBeat {
  sequence:number; eventId:string; text:string; site:string; actor:string; scope:'local'|'party';
}
export interface NarrativeView { current:NarrativeBeat|null; history:NarrativeBeat[]; pending:number; }

export type StoryDiceInfo = {stat:keyof import('./combatLite.js').LiteStats;dc:number;ap:number};
export type DmRollCard = {id:string;playerId:string;die:number|null;label?:string;dice?:StoryDiceInfo;result?:{total:number;outcome:'success'|'partial'|'failure'}};
export type DmLogEntry = {
  sequence:number;
  kind:'travel'|'question'|'answer'|'dismissed'|'narration'|'roll-requested'|'roll-result'|'roll-canceled'|'check-requested'|'check-canceled';
  actor:string;
  recipients:string[];
  text:string;
};
