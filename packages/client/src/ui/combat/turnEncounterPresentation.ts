import type { BattleView } from './EncounterBoard';

// Presentation uses only the battle view already published to this participant.
const briefs:Record<string,{title:string;goal:string;plan:string}> = {
  C4:{title:'อ่านท่าทีในคราบน้ำ',goal:'เลือกว่าจะขับไล่ กล่อมให้สงบ หรือพาทีมถอย',plan:'เทียบพละกำลังกับพลังจิต แล้วตกลงกันว่าจะสู้หรือเจรจา'},
  D4:{title:'ฝ่าแรงกดดันของอาคม',goal:'รับมือผี พร้อมจัดการจุดอาคมที่ยังเหลือ',plan:'แบ่งคนคลายอาคม คนรับมือผี และคนช่วยเพื่อนที่ล้ม'},
  F1:{title:'หยุดพิธีที่กำไล',goal:'เปิดเกราะทั้งสามขั้น แล้วปลดกำไลให้สำเร็จอีกครั้ง',plan:'แบ่งคนจัดการอาคม คนรับมือผี และคนพยุงทีม ร่างผีสลายไม่ได้หยุดพิธี'},
};

export const shieldSteps=['ยึดจุดรับแรงสะท้อน','แยกสายคำสั่ง','คลายปมเกราะ','ปลดกำไลอย่างควบคุม'];

export function encounterBrief(battle:BattleView) {
  if(battle.turnEncounter?.pacifyDescription && battle.turnEncounter.scene==='C4')return {title:'อ่านท่าทีในคราบน้ำ',goal:'เลือกขับไล่ เรียกสติให้ผีชะงัก หรือพาทีมถอย',plan:'การเรียกสติช่วยหยุดการโจมตีชั่วคราว แต่ไม่จบการเผชิญหน้า'};
  return briefs[battle.turnEncounter?.scene ?? ''] ?? {title:'ร่วมกันรับมือ',goal:'รับมือการเผชิญหน้า',plan:'ดูสถานะเพื่อนก่อนเลือกการกระทำ'};
}

export function encounterState(battle:BattleView) {
  if(battle.final55 && battle.enemies[0].hp===0) return 'dispersed';
  if(battle.final55?.shield==='up') return 'shielded';
  if(battle.final55?.shield==='down') return 'exposed';
  return 'manifested';
}

export function threatMessage(battle:BattleView) {
  const attack=battle.enemies[0].telegraph?.attack;
  if(!battle.enemies[0].telegraph)return undefined;
  return {
    title:battle.enemies[0].name+'เตรียมใช้ '+(attack?.name_th ?? 'การโจมตี'),
    detail:attack?.telegraphOneBossTurnBeforeUse
      ? 'ท่านี้ต้องประกาศล่วงหน้าหนึ่งตาผี ใช้ช่วงเตรียมตัววางแผนรับมือกับทีม'
      : 'ดูสถานะทีมก่อนลงมือ ตั้งรับเพื่อเพิ่มป้องกันในตาผี หรือเดินหน้าเป้าหมาย',
  };
}
