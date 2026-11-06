export interface CaseNotebookView { objective:string; confirmed:{id:string;text:string;source:string}[]; suspected:{id:string;text:string;source:string}[]; unknown:{id:string;text:string;source:string}[]; }
export interface DmEventPreview {id:string;label:string;text:string;status:'ready'|'blocked'|'fired';reasons:string[];}
