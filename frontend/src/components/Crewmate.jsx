import { useId } from 'react';
import { colorFor } from '../../../shared/constants.js';

export default function Crewmate({ color = 'coral', className = '', style, ghost = false, label, patch = false }) {
  const uid = useId().replace(/:/g, '');
  const palette = colorFor(color);
  return <svg viewBox="0 0 180 220" className={`crewmate ${className}`} style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <defs>
      <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0.8" y2="1"><stop stopColor={palette.hex}/><stop offset="1" stopColor={palette.dark}/></linearGradient>
      <linearGradient id={`${uid}-visor`} x1=".2" y1="0" x2=".6" y2="1"><stop stopColor="#d9f6ff"/><stop offset=".48" stopColor="#9ecbda"/><stop offset="1" stopColor="#577d98"/></linearGradient>
    </defs>
    {!ghost && <ellipse cx="91" cy="207" rx="54" ry="8" fill="#000" opacity=".18"/>}
    <g opacity={ghost ? '.55' : '1'} stroke="#101725" strokeWidth="8" strokeLinejoin="round">
      <path d="M47 88H34c-12 0-17 10-17 24v39c0 13 6 18 20 18h14z" fill={palette.dark}/>
      <path d="M52 107c0-52 10-78 48-78 39 0 54 27 54 68v72c0 15-7 25-22 25h-17v-27h-11v27H77c-17 0-25-10-25-28z" fill={`url(#${uid}-body)`}/>
      <path d="M57 144c20 23 56 24 92 4v20c0 15-5 21-18 21h-11v-26h-20v26H77c-14 0-20-8-20-23z" fill={palette.dark} stroke="none" opacity=".75"/>
      <path d="M65 76c5-20 15-30 37-31" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".15"/>
      <path d="M92 67c18-5 41-5 54 0 12 4 16 12 15 25-1 15-9 23-25 25l-39 2c-17 0-25-7-26-23-1-15 5-25 21-29z" fill={`url(#${uid}-visor)`}/>
      <path d="M91 78c16-5 35-5 48-2" fill="none" stroke="#effcff" strokeWidth="9" strokeLinecap="round" opacity=".9"/>
      {patch && <g stroke="none" transform="translate(118 141) rotate(-8)"><rect x="-12" y="-6" width="26" height="19" rx="4" fill="#d9edba"/><path d="m1-3 3 5 6 1-5 4 1 5-5-3-5 3 1-5-5-4 6-1z" fill="#4b5940"/></g>}
    </g>
  </svg>;
}
