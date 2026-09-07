"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "./public-experience.module.css";

export function Reveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Content remains readable without JavaScript; only offscreen content is staged.
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    element.dataset.pending = "true";
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { delete element.dataset.pending; observer.disconnect(); }
    }, { threshold: 0.08 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className={styles.reveal}>{children}</div>;
}

export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: "-15% 0px -55% 0px" });
    items.forEach(({ id }) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [items]);
  return <nav className={styles.sectionNav} aria-label="En esta página">{items.map(({ id, label }) => <button key={id} type="button" aria-current={active === id ? "location" : undefined} onClick={() => {
    const section = document.getElementById(id);
    section?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    section?.focus({ preventScroll: true });
  }}>{label}</button>)}</nav>;
}

export function ExperienceShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <div className={styles.experience}><header className={styles.intro}><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p>{intro}</p></header>{children}</div>;
}

export function ExperienceCta({ title, description, href, label }: { title: string; description: string; href: string; label: string }) {
  return <Reveal><section className={styles.closing}><div><h2>{title}</h2><p>{description}</p></div><Link className={styles.primary} href={href}>{label}<span aria-hidden>↗</span></Link></section></Reveal>;
}
