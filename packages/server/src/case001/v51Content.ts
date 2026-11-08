import { readFileSync } from 'node:fs';

export type V51Line={id:string;scene:string;speaker:string;label:string;text:string;context:string;field:string};
export type V51Scene={id:string;title:string;phase:string;purpose:string;presence:string;dmReadAloud:string;npcLines:string;responses:string;clues:string;fallback:string;nextSceneHandoff:string;dmSecret:string;sourceMarkdown:string;cue:string;questions:string[];checkId:string|null;dialogue:V51Line[]};
const read=(suffix:string)=>JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.v5.1.'+suffix,import.meta.url),'utf8'));
export const scenes51=Object.assign({},...['A','B','C','D','E','F'].map(act=>read(act+'.json'))) as Record<string,V51Scene>;
export const endings51=read('endings.json') as Record<string,{title:string;script:string;paragraphs:string[]}>;
export const script51=readFileSync(new URL('../../scenarios/case-001/case-001.v5.1.script.md',import.meta.url),'utf8');
if(Object.keys(scenes51).length!==31 || Object.keys(endings51).join('')!=='ABCD' ||
 Object.values(scenes51).some(scene=>scene.dialogue.some(line=>!script51.includes(line.text)))) throw Error('ต้นฉบับ CASE 001 v5.1 ไม่ครบ');

