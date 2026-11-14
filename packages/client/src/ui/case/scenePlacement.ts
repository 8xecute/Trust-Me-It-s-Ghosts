import type {CaseNpcPosition} from '@baan/shared';

export const sceneAspect = 1672 / 941;
const clamp = (value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Feet use image percentages. A constant image ratio keeps every client aligned. */
export function scenePlacement(position:CaseNpcPosition) {
  const scale=clamp(position.scale ?? 1,0.6,1.6);
  // The nearer the feet, the larger the figure. Reserve space for the entire cutout.
  const y=clamp(position.y,16*scale/(1-0.28*scale)+2,97);
  const height=(16+0.28*y)*scale;
  const width=height/1.5/sceneAspect;
  return {...position,x:clamp(position.x,width/2+1,99-width/2),y,height,width};
}

export function scenePoint(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number}) {
  return {x:clamp((clientX-rect.left)/rect.width*100,0,100),y:clamp((clientY-rect.top)/rect.height*100,0,100)};
}
