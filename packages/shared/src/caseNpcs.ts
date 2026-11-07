export const caseNpcs = [
 {id:'prasert',name:'ประเสริฐ'}, {id:'wichai',name:'วิชัย'}, {id:'boonmee',name:'ยายบุญมี'},
 {id:'ton',name:'ต้น'}, {id:'kaew',name:'แม่แก้ว'}, {id:'dol',name:'ดล'},
 {id:'nid',name:'นิด'}, {id:'phoem',name:'เพิ่ม'},
 {id:'kaewFinal',name:'นางตานี · บอสเฟส 2'}, {id:'drowned',name:'ผีเงาจมน้ำ'},
 {id:'ritual_specialist',name:'หมอพิธี'}, {id:'paranormal_investigator',name:'นักสืบ'},
 {id:'containment_specialist',name:'บอดี้การ์ด'}, {id:'medium',name:'ร่างทรง'},
 {id:'occult_engineer',name:'คนขับรถ'}, {id:'field_medic',name:'นักศึกษาฝึกงาน'},
] as const;
export type CaseNpcId = typeof caseNpcs[number]['id'];
export type CaseNpcPlacement = {id:CaseNpcId;x:number;y:number};
