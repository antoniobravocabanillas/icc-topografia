"use client";
import { useState } from "react";
import { EndorsementReviewForm } from "@/components/terraqo/endorsement-review-form";
export default function Fixture() {
  const [version, setVersion] = useState(1);
  return <main className="mx-auto max-w-3xl p-5"><h1 className="text-2xl font-bold">Revisión de prueba</h1><button onClick={() => setVersion(value => value + 1)}>Actualizar versión de prueba</button><EndorsementReviewForm key={version} requestId="synthetic-review" version={version} fields={[{ field: "summary", label: "Descripción", value: "Descripción solicitada" }, { field: "outcome", label: "Resultado", value: "Resultado documentado" }]} /></main>;
}
