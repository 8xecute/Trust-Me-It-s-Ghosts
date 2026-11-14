import {readFileSync} from 'node:fs';
export const beginner55=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.v5.5.beginner.json',import.meta.url),'utf8')) as Record<string,{see:string;ask:string;outcomes:string}>;

const bank=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.v5.5.qa.json',import.meta.url),'utf8')) as {
 scenes:{scene:string;actionGuidance?:{cueWhenVisible:string;possiblePlayerActions:string}}[];
};
export function plainDm55(text:string) {
 return text.replace(/<[^>]*>/g,'').replace(/^\s*>\s?/gm,'').replace(/\*\*|\x60/g,'')
  .replace(/ACTION-DRIVEN\s*[—–-]\s*DM ONLY[^\n]*/g,'')
  .replace(/\bactive\/weakened\b/g,'ยังทำงานหรืออ่อนลง').replace(/\bTrigger\b/g,'เหตุการณ์ที่กำหนด')
  .replace(/\bPhase 2\b/g,'ช่วงที่สอง').replace(/ACT D/g,'บท D').trim();
}
export function brief55(id:string,source:string):[string,string] {
 const guidance=bank.scenes.find(scene=>scene.scene===id)?.actionGuidance;
 const bridge=source.match(/\*\*(?:ไปต่อ|เชื่อม|ไม่สืบ\/ทอยพลาดก็ไปต่อ):\*\*\s*([^\n]+)/)?.[1];
 return [plainDm55(guidance?.cueWhenVisible ?? ''),plainDm55(bridge ?? '')];
}
export function playerAnswer55(question:{kind:string;answer:string;playerAnswer?:string}) {
 // Only explicitly authored player text can pre-fill a message. The source
 // answer remains private DM guidance, even when it contains quoted dialogue.
 return question.kind==='action'?'':question.playerAnswer?.trim() ?? '';
}
