import type { CaseSite } from '@baan/shared';
import entrance from '../../assets/case-001/scenes/roadside-sala.jpg';
import headmanHouse from '../../assets/case-001/scenes/headman-house.jpg';
import missingVillagerHouse from '../../assets/case-001/scenes/missing-villager-house.jpg';
import grove from '../../assets/case-001/scenes/banana-grove.jpg';
import abandonedHouse from '../../assets/case-001/scenes/abandoned-house.jpg';

const illustrations: Record<CaseSite,string> = {
  A:entrance, B:headmanHouse, C:missingVillagerHouse, D:grove, E:abandonedHouse,
};

export function CaseScene({site,location,intro}:{site:CaseSite;location:string;intro?:string}) {
  return <figure className="case-illustration">
    <img src={illustrations[site]} alt={location} />
    {intro && <figcaption>{intro}</figcaption>}
  </figure>;
}
