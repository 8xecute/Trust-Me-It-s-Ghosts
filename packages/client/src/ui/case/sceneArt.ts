import type {CaseSite} from '@baan/shared';
import {sceneArtFile} from './sceneArtCatalog';

const images=import.meta.glob<string>('../../assets/case-001/scenes/*.jpg',{eager:true,query:'?url',import:'default'});
export function sceneArt(site:CaseSite,scene?:string):string {
  return images['../../assets/case-001/scenes/'+sceneArtFile(site,scene)];
}
