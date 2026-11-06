import type { NarrativeBeat, NarrativeView } from '@baan/shared';
export interface NarrativeState { sequence:number; records:(NarrativeBeat & {recipients:string[]})[]; cursors:Record<string,number>; }
export const newNarrative=():NarrativeState=>({sequence:0,records:[],cursors:{}});
export function enqueueNarrative(state:NarrativeState, beat:Omit<NarrativeBeat,'sequence'>,recipients:string[]) {
 const record={...beat,sequence:++state.sequence,recipients:[...new Set(recipients)]};
 state.records.push(record);
 if(state.records.length>200) state.records.splice(0,state.records.length-200);
 for(const id of record.recipients) if(!state.cursors[id]) state.cursors[id]=record.sequence;
}
export function narrativeView(state:NarrativeState|undefined,player:string):NarrativeView {
 const records=state?.records.filter(r=>r.recipients.includes(player)) ?? [];
 const cursor=state?.cursors[player] ?? 0;
 const clean=({recipients,...beat}:NarrativeBeat & {recipients:string[]})=>beat;
 const current=records.find(r=>r.sequence>=cursor) ?? records.at(-1);
 return {current:current?clean(current):null,history:records.map(clean),pending:current?records.filter(r=>r.sequence>current.sequence).length:0};
}
export function advanceNarrative(state:NarrativeState,player:string,sequence:unknown) {
 const view=narrativeView(state,player);
 if(!view.current || sequence!==view.current.sequence) throw Error('บทเล่านี้เปลี่ยนไปแล้ว');
 const next=view.history.find(r=>r.sequence>view.current!.sequence);
 if(next) state.cursors[player]=next.sequence;
}
