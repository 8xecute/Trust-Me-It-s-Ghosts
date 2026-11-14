type Question = {id:string;kind:string;speaker:string};

// Editorial reading priorities only; these never grant information or change send guards.
export const importantQuestions:Readonly<Record<string,string>>={
 A1_Q001:'ชื่อและลำดับคนหาย',A1_Q002:'จุดเริ่มค้นหา',A2_Q001:'ข้อความที่ทุกคนได้ยิน',A3_Q001:'จุดหมายถัดไป',
 B1_Q001:'แฟ้มและเส้นทางตามคนหาย',B1_Q003:'ความหมายของหมุดบนแผนที่',B3_Q002:'คำให้การสำคัญ ใช้เมื่อผ่านเงื่อนไข',
 C2_Q001:'ข้อมูลในสมุด เมื่อเปิดอ่านจริง',C2_Q008:'เส้นทางไปผู้ดูแลศาล',C5_Q004:'คำเตือนเรื่องด้ายดำ',
 D2_Q001:'ชื่อคนหายบนป้าย',D3_Q004:'คำเตือนก่อนจัดการด้าย',D5_Q001:'รอยทางไปเรือน',
 E3_Q005:'เบาะแสชั้นบน',E4_Q001:'แกนพิธี เมื่อเปิดตรวจจริง',E4_Q003:'แนวทางหยุดพิธี',E4_Q008:'วิธีปลดตามผลตรวจจริง',
 E5_Q001:'เหตุจูงใจ ใช้ตามหลักฐานที่พบ',H1_Q004:'ขอบเขตข้อสรุปจากเอกสาร',
 F3_Q003:'การเข้าถึงแกนพิธี',F5_Q005:'ความต้องการหลังเป็นอิสระ',F6_Q002:'คำเตือนเมื่อเกิดแรงสะท้อน',
};

export function groupQuestions<T extends Question>(questions:readonly T[]) {
 const groups=new Map<string,{id:string;title:string;kind:'npc'|'dm'|'action';items:T[]}>();
 for(const q of questions) {
  const kind=q.kind==='npc'?'npc':q.kind==='action'?'action':'dm';
  const id=kind==='npc'?'npc:'+q.speaker:kind;
  if(!groups.has(id))groups.set(id,{id,kind,title:kind==='npc'?'NPC พูด · '+q.speaker:kind==='dm'?'DM บรรยาย / อ่านเอกสาร':'เฉพาะ DM · ห้ามอ่านให้ผู้เล่น',items:[]});
  groups.get(id)!.items.push(q);
 }
 const order={npc:0,dm:1,action:2};
 return [...groups.values()].sort((a,b)=>order[a.kind]-order[b.kind]).map(group=>({...group,
  items:group.items.slice().sort((a,b)=>Number(!!importantQuestions[b.id])-Number(!!importantQuestions[a.id]))}));
}
