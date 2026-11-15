import type {CaseSite,NarrativeView} from '@baan/shared';

export const siteArtwork:Record<CaseSite,string>={
  A:'roadside-sala.jpg',B:'headman-house.jpg',C:'missing-villager-house.jpg',D:'grove-path.jpg',E:'abandoned-house.jpg',
};

/** Visual assignments only. Reading this catalog never unlocks a story condition. */
export const sceneArtwork:Record<string,{site:CaseSite|null;image:string|null}>={
  A1:{site:'A',image:'roadside-sala.jpg'},A2:{site:'A',image:'van-radio.jpg'},A3:{site:'A',image:'roadside-sala.jpg'},
  B1:{site:'B',image:'headman-office.jpg'},B2:{site:'B',image:'headman-office.jpg'},B3:{site:'B',image:'headman-office.jpg'},
  B4:{site:'B',image:'headman-records.jpg'},B5:{site:'B',image:'headman-house.jpg'},
  C1:{site:'C',image:'dol-interior.jpg'},C2:{site:'C',image:'dol-interior.jpg'},
  C3:{site:'C',image:'dol-damp-room.jpg'},C4:{site:'C',image:'dol-damp-room.jpg'},C5:{site:'C',image:'boonmee-porch.jpg'},
  D1:{site:'D',image:'grove-path.jpg'},D2:{site:'D',image:'banana-grove.jpg'},D3:{site:'D',image:'banana-grove.jpg'},
  D4:{site:'D',image:'banana-grove.jpg'},D5:{site:'D',image:'grove-tracks.jpg'},
  E1:{site:'E',image:'abandoned-house.jpg'},E2:{site:'E',image:'underhouse-room.jpg'},E3:{site:'E',image:'underhouse-room.jpg'},
  E4:{site:'E',image:'ritual-room.jpg'},E5:{site:'E',image:'ritual-room.jpg'},E6:{site:'E',image:'ritual-room.jpg'},
  // H1 is analysis at the team's current location, not a trip to a different room.
  H1:{site:null,image:null},
  F1:{site:'E',image:'ritual-room.jpg'},F2:{site:'E',image:'ritual-room.jpg'},F3:{site:'E',image:'ritual-room.jpg'},
  F4:{site:'E',image:'ritual-memory.jpg'},F5:{site:'E',image:'ritual-released.jpg'},F6:{site:'E',image:'ritual-backlash.jpg'},
};

export function sceneArtFile(site:CaseSite,scene?:string):string {
  const art=scene ? sceneArtwork[scene] : undefined;
  return art?.site===site && art.image ? art.image : siteArtwork[site];
}

/** Only scene openings delivered to this player may select a detailed backdrop. */
export function publishedScene(site:CaseSite,narrative?:NarrativeView):string|undefined {
  const history=narrative?.history ?? [];
  for(let i=history.length-1;i>=0;i--){
    const beat=history[i];
    if(beat.site!==site || !beat.eventId.startsWith('guided-cue:'))continue;
    const id=beat.eventId.slice('guided-cue:'.length),art=sceneArtwork[id];
    if(art?.site===site && art.image)return id;
  }
}
