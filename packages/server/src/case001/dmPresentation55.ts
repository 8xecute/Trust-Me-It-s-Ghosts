import {readFileSync} from 'node:fs';

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
export function playerAnswer55(question:{kind:string;answer:string}) {
 if(question.kind==='action')return '';
 let answer=question.answer.replace(/ F5 ต้องเข้าหลัง[\s\S]*$/,'').trim();
 if(question.kind==='npc') {
  const quotes=[...answer.matchAll(/“([^”]+)”/g)].map(match=>match[1]);
  if(quotes.length)answer=quotes.join(' ');
 }
 // Guidance remains available to the DM, but never pre-fills a player message.
 if(/\bDM\b|\bACT\b|\bAction\b|\bFull\b|\bFailure\b|\bOverlay\b|\bHP0\b|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|ให้ทีม|หากทีม|ไม่ให้|อย่าเฉลย/.test(answer))return '';
 return answer.replace(/\*\*|\x60/g,'').trim();
}
