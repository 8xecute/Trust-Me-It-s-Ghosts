import type {CaseState} from './case001.js';

export const landDocumentDisclosureId='land-documents:E4';
export function hasDisclosureEvidence(s:CaseState,id:string) {
 return id===landDocumentDisclosureId?s.v51?.LAND_EVIDENCE_COLLECTED===true:s.evidence.includes(id);
}
