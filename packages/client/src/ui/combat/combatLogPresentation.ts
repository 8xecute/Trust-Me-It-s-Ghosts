import type {Character} from '@baan/shared';
import type {BattleView} from './EncounterBoard';
export type CombatBeat=NonNullable<BattleView['turnEncounter']>['history'][number];
export function describeBeat(beat:CombatBeat,name:(id:string)=>string) {
 const actor=beat.actorName ?? name(beat.actor),target=beat.targetName ?? (beat.target?name(beat.target):undefined);
 if(beat.label.startsWith('ประกาศ '))return actor+' '+beat.label+(target?' เล็ง'+target:'');
 if(['ผ่านตา','พาทีมถอย','รอดูท่าที','ผีถอยกลับไปในคราบน้ำ','ผีชะงักตามเสียงเรียก'].includes(beat.label))return actor+' '+beat.label.replace(/^ผี/,'');
 return actor+' ใช้ “'+beat.label+'”'+(target?' กับ'+target:'')+(beat.intendedTargetName?' (รับแทน'+beat.intendedTargetName+')':'');
}
export function describeChanges(beat:CombatBeat) {
 return beat.changes?.flatMap(change=>(['hp','sanity','focus'] as const).flatMap(key=>{
  const value=change[key];
  return value ? [change.name+' · '+({hp:'ชีวิต',sanity:'สติ',focus:'สมาธิ'}[key])+' '+value.before+' → '+value.after] : [];
 })) ?? [];
}
export type CombatStatus={label:string;effect:string;expiry:string};
export function combatStatuses(battle:BattleView,id:string,characters:Record<string,Character>,name:(id:string)=>string):CombatStatus[] {
 const turn=battle.turnEncounter,character=characters[id],enemy=battle.enemies.find(e=>e.id===id),result:CombatStatus[]=[];
 const add=(label:string,effect:string,expiry:string)=>result.push({label,effect,expiry});
 const through=(until:number)=>'ถึงจบรอบ '+until+' หรือจนถูกปลด';
 if(character) {
  if(turn?.powerUsed?.includes(id))add('ใช้โจมตีหนักแล้ว','ใช้ท่าโจมตีหนักซ้ำไม่ได้ ยังใช้ท่าปกติได้','จนจบ encounter');
  if(character.hp===0)add('ล้ม','ลงมือไม่ได้ ต้องให้เพื่อนพยุง','จนฟื้น HP');
  if(character.sanity===0)add('สติหมด','เรียกสติผีและใช้ท่าอาชีพไม่ได้','จนฟื้นสติ');
  if((battle.restrained[id] ?? 0)>=battle.round)add('พันธนาการ','โจมตี นำทีมถอย และท่ากายภาพบางท่าไม่ได้',through(battle.restrained[id]));
  if((turn?.shaken?.[id] ?? 0)>=battle.round)add('หวาดกลัว','เรียกสติผีและใช้ท่าอาชีพไม่ได้',through(turn!.shaken![id]));
  if((turn?.unsteady?.[id] ?? 0)>=battle.round)add('เสียหลัก','ตั้งรับเองและยืนคุ้มกันไม่ได้',through(turn!.unsteady![id]));
  if(turn?.guarded?.[id]===battle.round)add('ตั้งรับ','ป้องกันกายและจิต +2','จบตาผีรอบนี้ หรือถูกทำลาย');
  if(turn?.conditions?.ward[id])add('ยันต์คุ้มภัย','ลดความเสียหายครั้งแรก 1','เมื่อรับความเสียหาย หรือจบตาผีรอบนี้');
  const protector=turn?.conditions?.cover[id];
  if(protector)add('มีผู้คุ้มกัน',name(protector)+' รับการโจมตี HP ครั้งถัดไปแทน หากยังลงมือได้','เมื่อถูกโจมตี HP หรือจบตาผีรอบนี้');
 }
 if(enemy) {
  if(enemy.resolved || enemy.hp===0) {
   add(enemy.outcome==='pacified'?'สงบแล้ว':'ร่างสลาย','ไม่โจมตี'+(battle.final55?' แต่พิธียังไม่หยุด':''),'สิ้นสุดการต่อสู้ของร่างนี้');
   return result;
  }
  if(enemy.hesitating)add('ชะงัก','งดโจมตีตานี้ ยังไม่จบ encounter','จบตาผีรอบนี้');
  if(turn?.conditions?.silenced[id])add('สะกดเสียง','ใช้ท่าโจมตีทางจิตไม่ได้ ยังโจมตีทางกายได้','จบตาผีรอบนี้');
  if(enemy.opening && enemy.opening.until>=battle.round)add('มีช่องเปิด','ผู้โจมตีที่ไม่ใช่ '+name(enemy.opening.actor)+' ได้ +2 ครั้งเดียว','เมื่อใช้โจมตี หรือจบรอบ '+enemy.opening.until);
  if(battle.final55?.shield==='up')add('เกราะพิธี','เกราะรับความเสียหายไว้','จนจัดการอาคมครบ 3 ขั้น');
  if(enemy.telegraph)add('เตรียมโจมตี',enemy.telegraph.attack?.name_th ?? 'ท่าที่ประกาศแล้ว','จนใช้ท่าหรือยกเลิก');
 }
 return result;
}
