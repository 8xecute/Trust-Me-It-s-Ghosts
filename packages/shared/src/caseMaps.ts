import type { GhostGrid } from './ghost.js';

export type CaseSite = 'A'|'B'|'C'|'D'|'E';
const walls=Array.from({length:10},(_,x)=>({x,y:0}));
const layouts = {
  A:{house:{x:3,y:2,width:4,depth:3},obstacles:[{x:1,y:4},{x:2,y:7},{x:8,y:5},{x:7,y:8}]},
  B:{house:{x:4,y:1,width:4,depth:4},obstacles:[{x:1,y:4},{x:8,y:6}]},
  C:{house:{x:2,y:2,width:3,depth:3},obstacles:[{x:1,y:6},{x:7,y:3},{x:7,y:6}]},
  D:{house:{x:2,y:2,width:2,depth:2},obstacles:[{x:5,y:3},{x:6,y:4},{x:7,y:5},{x:8,y:6}]},
  E:{house:{x:2,y:1,width:5,depth:4},obstacles:[{x:2,y:6},{x:7,y:6},{x:8,y:3}]},
} satisfies Record<CaseSite,{house:{x:number;y:number;width:number;depth:number};obstacles:{x:number;y:number}[]}>;

export function caseLayout(site:CaseSite) {
  return {width:10,height:10,walls,...layouts[site]};
}

export function caseGrid(site:CaseSite):GhostGrid {
  const {width,height,walls,obstacles,house}=caseLayout(site);
  return {width,height,blocked:[...walls,...obstacles,
    ...Array.from({length:house.width*house.depth},(_,i)=>({x:house.x+i%house.width,y:house.y+Math.floor(i/house.width)})),
  ]};
}
