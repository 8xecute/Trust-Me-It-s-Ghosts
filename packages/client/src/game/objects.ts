export type ObjectState = 'closed' | 'open' | 'locked' | 'static';
export type Action = 'inspect' | 'open' | 'close' | 'collect';
export interface WorldObject { id: string; name: string; x: number; y: number; state: ObjectState; evidenceId?: string; collected?: boolean }
export function actionsFor(o: WorldObject): Action[] {
  return ['inspect', ...(o.state === 'closed' ? ['open' as const] : []), ...(o.state === 'open' ? ['close' as const] : []), ...(o.evidenceId && !o.collected ? ['collect' as const] : [])];
}
export function transition(o: WorldObject, action: Action): WorldObject {
  if (!actionsFor(o).includes(action)) return o;
  if (action === 'open') return {...o,state:'open'};
  if (action === 'close') return {...o,state:'closed'};
  if (action === 'collect') return {...o,collected:true};
  return o;
}
export const initialObjects: WorldObject[] = [
 {id:'box',name:'กล่อง',x:2,y:5,state:'closed'},
 {id:'locked-box',name:'กล่องที่ล็อก',x:7,y:6,state:'locked'},
 {id:'clue',name:'วัตถุหลักฐาน',x:5,y:8,state:'static',evidenceId:'evidence-1'},
];
