"use client";
import { useEffect, useId, useRef, useState, type SVGProps } from "react";
import s from "./writing-mark.module.css";
export function TerraqoWritingMark({thinking=false,className="",...props}:SVGProps<SVGSVGElement>&{thinking?:boolean}) {
 const id=useId().replace(/:/g,"");
 const ref=useRef<SVGSVGElement>(null);
 const [visible,setVisible]=useState(false);
 useEffect(()=>{let inside=false;const sync=()=>setVisible(inside&&!document.hidden);const observer=new IntersectionObserver(([entry])=>{inside=entry.isIntersecting;sync();});if(ref.current)observer.observe(ref.current);document.addEventListener("visibilitychange",sync);return()=>{observer.disconnect();document.removeEventListener("visibilitychange",sync);};},[]);
 return <svg {...props} ref={ref} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false" data-thinking={thinking} data-visible={visible} className={`${s.orb} ${className}`}>
 <defs>
 <radialGradient id={id+"core"} cx=".32" cy=".22" r=".85"><stop stopColor="#153349"/><stop offset=".5" stopColor="#07141e"/><stop offset="1" stopColor="#02080e"/></radialGradient>
 <linearGradient id={id+"rim"} x1="8" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#d8edf5"/><stop offset=".32" stopColor="#4b83a3"/><stop offset=".62" stopColor="#163446"/><stop offset="1" stopColor="#56c5dc"/></linearGradient>
 <linearGradient id={id+"wave"}><stop stopColor="#247093" stopOpacity=".1"/><stop offset=".4" stopColor="#518be0"/><stop offset=".65" stopColor="#9eeaf3"/><stop offset="1" stopColor="#3bacbf" stopOpacity=".1"/></linearGradient>
 <clipPath id={id+"clip"}><circle cx="32" cy="32" r="28"/></clipPath>
 </defs>
 <circle cx="32" cy="32" r="30" fill={`url(#${id}core)`} stroke={`url(#${id}rim)`} strokeWidth="1.25"/>
 <g clipPath={`url(#${id}clip)`}>
 <path className={s.back} d="M3 32C18 32 20 16 30 19S44 33 61 32C45 33 42 47 32 45S18 33 3 32Z" fill="#4b8cb7" opacity=".55"/>
 <path className={s.front} d="M3 32C17 32 23 24 32 25S47 32 61 32C44 33 41 40 32 39S17 33 3 32Z" fill={`url(#${id}wave)`}/>
 <path d="M5 32C22 31 42 31 59 32" stroke="#c8f4ff" strokeOpacity=".8" strokeWidth=".8"/>
 </g>
 <path d="M10 23A24 24 0 0 1 32 8" stroke="#e5f8ff" strokeOpacity=".25" strokeLinecap="round"/>
 </svg>;
}
