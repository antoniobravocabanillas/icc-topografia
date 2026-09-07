"use client";
import {useState} from "react";
import s from "./public-experience.module.css";
export function PublicInquiry({subject}:{subject:string}){
 const [name,setName]=useState("");const [message,setMessage]=useState("");const [draft,setDraft]=useState<string|null>(null);
 return <div className="tq-contact-surface"><form onSubmit={event=>{event.preventDefault();setDraft(`https://wa.me/51926912607?text=${encodeURIComponent(`Hola, soy ${name.trim()}. Consulta sobre ${subject}.\n\n${message.trim()}`)}`);}}><label>Tu nombre<input required maxLength={120} autoComplete="name" value={name} onChange={event=>{setDraft(null);setName(event.target.value);}}/></label><label>¿Qué necesitas resolver?<textarea required minLength={10} maxLength={2000} value={message} onChange={event=>{setDraft(null);setMessage(event.target.value);}}/></label><p>Consulta: <strong>{subject}</strong></p><p>Preparamos tu mensaje para el equipo Terraqo en el 926 912 607. Podrás revisarlo en WhatsApp antes de enviarlo.</p><button className={s.primary} type="submit">Preparar mi consulta →</button>{draft&&<div role="status"><p>Tu mensaje está preparado.</p><a className={s.primary} href={draft} target="_blank" rel="noopener noreferrer">Continuar por WhatsApp ↗</a></div>}</form></div>;
}
