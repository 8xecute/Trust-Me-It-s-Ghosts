import {readFileSync} from 'node:fs';
import type {CaseState} from './case001.js';
import {alive51, wichaiHere51} from './storyV51.js';

type Branch={dmNarration:string;npcDialogue:{speaker:string;text:string}|null;note:string};
const pack=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.v5.5.overrides.json',import.meta.url),'utf8')) as {
 overrides:{checkId:string;scene:string;results:Record<'full'|'partial'|'failure',Branch>}[];
};

export function presentation55(s:CaseState,id:string,outcome:'full'|'partial'|'failure') {
 if(s.guided?.version!=='5.5')return;
 const entry=pack.overrides.find(entry=>entry.checkId===id);
 if(!entry)return;
 const branch=entry.results[outcome];
 let dialogue:string|undefined;
 if(branch.npcDialogue?.speaker==='ดล' && s.v51?.dolUngagged55 && alive51(s,'ดล') && !s.evacuated.includes('ดล'))
  dialogue='ดล · '+branch.npcDialogue.text;
 if(branch.npcDialogue?.speaker==='วิชัย' && wichaiHere51(s))
  dialogue='วิชัย · '+branch.npcDialogue.text;
 return {narration:branch.dmNarration,dialogue};
}
