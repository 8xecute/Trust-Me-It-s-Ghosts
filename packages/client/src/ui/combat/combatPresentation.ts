type Cell={x:number;y:number};
export const cellKey=({x,y}:Cell)=>`${x},${y}`;
/** Screen placement only. Logical cells remain unchanged in multiplayer messages. */
export const combatPoint=(cell:Cell,height:number)=>({left:(cell.x-cell.y+height)*32,top:(cell.x+cell.y)*16+60});
/** Advisory movement preview; the server validates and commits every request. */
export function movementPreview(grid:{width:number;height:number;blocked:readonly Cell[]},start:Cell,occupied:Cell[],flooded:Cell[],budget=4) {
 const blocked=new Set([...grid.blocked,...occupied].map(cellKey));
 const water=new Set(flooded.map(cellKey));
 const costs=new Map([[cellKey(start),0]]),queue=[start];
 for(let i=0;i<queue.length;i++) {
  const cell=queue[i],cost=costs.get(cellKey(cell))!;
  for(const delta of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]) {
   const next={x:cell.x+delta.x,y:cell.y+delta.y},key=cellKey(next),nextCost=cost+1+Number(water.has(key));
   if(next.x<0||next.y<0||next.x>=grid.width||next.y>=grid.height||blocked.has(key)||nextCost>budget||nextCost>=(costs.get(key)??Infinity))continue;
   costs.set(key,nextCost);queue.push(next);
  }
 }
 costs.delete(cellKey(start));
 return costs;
}
