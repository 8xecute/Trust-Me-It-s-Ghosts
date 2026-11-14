import type {Profession} from './character.js';
export const turnSkills:Record<Profession,{name:string;detail:string;target:'enemy'|'ally';focus:number}>={
 paranormal_investigator:{name:'วิเคราะห์จุดอ่อน',detail:'สมาธิ 1 · เปิดช่องให้เพื่อนโจมตี +2 ครั้งเดียวถึงรอบหน้า โดยไม่ทอย',target:'enemy',focus:1},
 ritual_specialist:{name:'ยันต์คุ้มภัย',detail:'สมาธิ 1 · ลดความเสียหายครั้งแรกต่อเป้าหมาย 1 หน่วย ในตาผีรอบนี้',target:'ally',focus:1},
 medium:{name:'สะกดเสียงกรีดร้อง',detail:'สมาธิ 1 · SPI DC12 · ห้ามผีเป้าหมายใช้ท่าโจมตีทางจิตในตาผีรอบนี้',target:'enemy',focus:1},
 containment_specialist:{name:'ยืนคุ้มกันเพื่อน',detail:'สมาธิ 1 · รับการโจมตี HP ครั้งถัดไปแทนเพื่อน และตั้งรับ +2 ให้ตัวเองในตาผีรอบนี้',target:'ally',focus:1},
 occult_engineer:{name:'ช่วยตั้งหลัก',detail:'สมาธิ 1 · ปลดพันธนาการ หรือช่วยหายเสียหลัก/หวาดกลัว หรือฟื้นสติ 1 หากไม่มีสถานะดังกล่าว · ฟื้นสติใช้สิทธิ์เดียวกับดึงสติเพื่อน',target:'ally',focus:1},
 field_medic:{name:'ลากเพื่อนพ้นอันตราย',detail:'สมาธิ 1 · ปลดพันธนาการ/เสียหลักให้เพื่อนและตั้งรับ +2 ในตาผีรอบนี้ ไม่ฟื้น HP',target:'ally',focus:1},
};
