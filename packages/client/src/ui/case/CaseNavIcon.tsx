type Icon = 'play'|'story'|'journal'|'character'|'report'|'room'|'questions'|'dice';
const paths:Record<Icon,string>={
 play:'M4 6h16v12H4z M8 14l3-3 3 2 3-4',
 story:'M5 5h14v10H9l-4 4z M8 9h8 M8 12h5',
 journal:'M6 4h12v16H6z M9 4v16 M12 8h3 M12 12h3',
 character:'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M5 19c0-6 14-6 14 0',
 report:'M6 4h9l3 3v13H6z M14 4v4h4 M9 12h6 M9 16h6',
 room:'M5 4h14v16H5z M9 20v-9h6v9 M9 8h6',
 questions:'M5 5h14v10H9l-4 4z M10 9a2 2 0 1 1 3 2l-1 1 M12 14h.01',
 dice:'M5 5h14v14H5z M9 9h.01 M15 9h.01 M12 12h.01 M9 15h.01 M15 15h.01',
};
export function CaseNavIcon({name}:{name:Icon}) {
 return <svg className="case-nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}
