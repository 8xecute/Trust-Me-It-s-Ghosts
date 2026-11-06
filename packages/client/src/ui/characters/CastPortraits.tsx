import { castProfiles, type Profession } from '@baan/shared';

const portraits=import.meta.glob<string>('../../assets/case-001/portraits/*.jpg',{eager:true,query:'?url',import:'default'});
const npcKeys: Record<string,string> = {
  ประเสริฐ:'prasert',วิชัย:'wichai',ยายบุญมี:'boonmee',ต้น:'ton',แม่แก้ว:'kaew',ดล:'dol',นิด:'nid',เพิ่ม:'phoem',
};
export const portraitUrl=(key:string)=>portraits['../../assets/case-001/portraits/'+key+'.jpg'];
export function visibleCast(actions:{id:string;speaker?:string}[]) {
  return actions.flatMap(action=>action.speaker ?? (action.id.startsWith('escort:') ? action.id.slice(7) : []));
}

export function CastPortraits({roles,speakers=[]}:{roles:Profession[];speakers?:string[]}) {
  const cast=[
    ...roles.map(role=>({key:role,name:castProfiles[role].name})),
    ...[...new Set(speakers)].filter(name=>Object.hasOwn(npcKeys,name)).map(name=>({key:npcKeys[name],name})),
  ];
  return <ul className="cast-strip" aria-label="ตัวละครในฉาก">
    {cast.map(({key,name})=><li key={key}><img src={portraitUrl(key)} alt="" loading="lazy"/><span>{name}</span></li>)}
  </ul>;
}
