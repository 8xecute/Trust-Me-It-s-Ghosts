import {powerAttacks} from '@baan/shared';
import {readFileSync} from 'node:fs';
export type CombatFlavour={text:string;dialogue?:{speaker:string;text:string}};
type Line={text:string;line?:string};
type Bank=Record<string,Line[]>;
const content=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.combat-flavour-v55.json',import.meta.url),'utf8')) as {common:Bank;actions:Bank;scenes:Record<string,Bank>};
export function combatFlavour(input:{scene:string;actor:string;target?:string;label:string;effect?:string;enemyActor:boolean;outcome?:string;down?:boolean;dispersed?:boolean;sequence:number}):CombatFlavour|undefined {
 const strike=input.label==='ขับไล่ผี' || Object.values(powerAttacks).some(attack=>attack.name===input.label);
 const failed=input.outcome==='failure',effect=input.effect ?? '';
 let key='actionSuccess';
 if(input.label.startsWith('ประกาศ '))key='declare';
 else if(input.label==='พาทีมถอย')key='withdraw';
 else if(input.label==='ผ่านตา')key='pass';
 else if(input.label==='ผีถอยกลับไปในคราบน้ำ')return {text:input.actor+' ค่อย ๆ ถอยห่างจากการเผชิญหน้า'};
 else if(input.enemyActor) {
  key=input.label==='ผีชะงักตามเสียงเรียก'?'hesitate':input.label==='รอดูท่าที'?'enemyPass':failed?'enemyMiss':input.down?'enemyDown':effect.includes('ถูกพันธนาการ')?'root':effect.includes('หวาดกลัว')?'fear':effect.includes('แนวตั้งรับถูกทำลาย')?'guardBreak':'enemyHit';
 } else if(failed)key=strike?'strikeMiss':'actionFailure';
 else if(strike)key=effect.includes('เกราะรับ')?'blocked':input.dispersed?'dispersed':'strikeHit';
 else if(input.label==='เรียกสติผี')key='pacify';
 const scene=content.scenes[input.scene];
 const options=scene?.[key] ?? (!failed && !input.enemyActor && key!=='declare' ? content.actions[input.label]:undefined) ?? content.common[key] ?? content.common.actionSuccess;
 if(!options?.length)return undefined;
 const selected=options[Math.abs(input.sequence)%options.length];
 const replace=(text:string)=>text.replace(/\{(actor|target|action)\}/g,(_,name:string)=>({actor:input.actor,target:input.target ?? 'เป้าหมาย',action:input.label.replace(/^ประกาศ /,'')}[name] ?? ''));
 return {text:replace(selected.text),...(selected.line?{dialogue:{speaker:input.actor,text:replace(selected.line)}}:{})};
}
