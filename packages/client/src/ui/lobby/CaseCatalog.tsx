import './CaseCatalog.css';

type CasePreview = {
 id:string;
 title:string;
 description:string;
 status:'available'|'coming-soon';
};

const cases:readonly CasePreview[] = [
 {id:'CASE001',title:'เสียงร้องจากสวนกล้วย',description:'รวมทีมสืบเรื่องคนหาย และตามเสียงปริศนาเข้าสู่สวนกล้วย',status:'available'},
 {id:'CASE002',title:'งานวัดคืนที่ 8',description:'แฟ้มคดีใหม่ รอเปิดให้ทีมผู้สืบสวนติดตาม',status:'coming-soon'},
 {id:'CASE003',title:'เรื่องราวยังไม่จบ',description:'อีกคดีที่รอการเปิดเผย ติดตามรายละเอียดในวันหน้า',status:'coming-soon'},
];

export function CaseCatalog() {
 return <section className="case-catalog" aria-labelledby="case-catalog-title">
  <header className="case-catalog-heading">
   <div><p className="eyebrow">แฟ้มคดีของบริษัท</p><h2 id="case-catalog-title">หนึ่งทีม หลายเรื่องราวที่รอคำตอบ</h2></div>
   <p>เริ่มสืบ CASE001 ได้แล้ววันนี้<br/>บทต่อไปจะมาเร็ว ๆ นี้</p>
  </header>
  <ul className="case-catalog-list">
   {cases.map(entry=><li key={entry.id} className={`case-catalog-card ${entry.status}`}>
    <div className="case-catalog-meta"><span className="eyebrow">{entry.id}</span><span className={`state-badge${entry.status==='available'?' success':''}`}>{entry.status==='available'?'พร้อมเล่น':'เร็ว ๆ นี้'}</span></div>
    <h3>{entry.title}</h3><p>{entry.description}</p>
    <small>{entry.status==='available'?'สร้างห้องใหม่ด้านบนเพื่อเริ่มคดี':'ยังไม่เปิดให้เล่น'}</small>
   </li>)}
  </ul>
 </section>;
}
