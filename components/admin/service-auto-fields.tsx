"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function ServiceAutoFields({
  title = "",
  slug = "",
  headline = "",
  summary = "",
  seoTitle = "",
  metaDescription = ""
}: {
  title?: string;
  slug?: string;
  headline?: string | null;
  summary?: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
}) {
  const [titleValue, setTitleValue] = useState(title);
  const [slugValue, setSlugValue] = useState(slug || slugify(title));
  const [headlineValue, setHeadlineValue] = useState(headline || "");
  const [summaryValue, setSummaryValue] = useState(summary);
  const [seoTitleValue, setSeoTitleValue] = useState(seoTitle || title);
  const [metaValue, setMetaValue] = useState(metaDescription || summary);
  const [edited, setEdited] = useState({
    slug: Boolean(slug),
    seoTitle: Boolean(seoTitle),
    metaDescription: Boolean(metaDescription)
  });
  const generatedSlug = useMemo(() => slugify(titleValue), [titleValue]);

  function updateTitle(event: ChangeEvent<HTMLInputElement>) {
    const nextTitle = event.target.value;
    setTitleValue(nextTitle);
    if (!edited.slug) setSlugValue(slugify(nextTitle));
    if (!edited.seoTitle) setSeoTitleValue(nextTitle);
  }

  function updateSummary(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextSummary = event.target.value;
    setSummaryValue(nextSummary);
    if (!edited.metaDescription) setMetaValue(nextSummary.slice(0, 155));
  }

  return (
    <>
      <Input name="title" placeholder="Titulo del servicio" value={titleValue} onChange={updateTitle} />
      <Input name="slug" placeholder={generatedSlug || "slug-del-servicio"} value={slugValue} onChange={(event) => { setEdited((current) => ({ ...current, slug: true })); setSlugValue(event.target.value); }} />
      <Input name="headline" placeholder="Promesa o enfoque comercial del servicio" value={headlineValue} onChange={(event) => setHeadlineValue(event.target.value)} />
      <Textarea name="summary" placeholder="Resumen visible en cards y hero" value={summaryValue} onChange={updateSummary} />
      <Input name="seoTitle" placeholder="SEO title autogenerado" value={seoTitleValue} onChange={(event) => { setEdited((current) => ({ ...current, seoTitle: true })); setSeoTitleValue(event.target.value); }} />
      <Textarea name="metaDescription" placeholder="Meta description autogenerada" value={metaValue} onChange={(event) => { setEdited((current) => ({ ...current, metaDescription: true })); setMetaValue(event.target.value); }} />
    </>
  );
}
