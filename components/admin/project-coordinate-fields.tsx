"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

type ProjectCoordinateFieldsProps = {
  latitude?: string;
  longitude?: string;
  radius?: string;
};

function parseCoordinate(value: string) {
  const cleaned = value.trim().replace(",", ".").replace(/\s+/g, " ");
  if (!cleaned) return "";

  const decimal = Number(cleaned.replace(/[NSEW]$/i, ""));
  if (Number.isFinite(decimal) && Math.abs(decimal) <= 180) return String(decimal);

  const match = cleaned.match(/^(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)?\D*(\d+(?:\.\d+)?)?\D*([NSEW])?$/i);
  if (!match) return "";

  const degrees = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const hemisphere = (match[4] || "").toUpperCase();
  if (![degrees, minutes, seconds].every(Number.isFinite)) return "";

  const sign = hemisphere === "S" || hemisphere === "W" ? -1 : 1;
  const decimalDegrees = sign * (degrees + minutes / 60 + seconds / 3600);
  return Number(decimalDegrees.toFixed(8)).toString();
}

export function ProjectCoordinateFields({ latitude, longitude, radius }: ProjectCoordinateFieldsProps) {
  const [lat, setLat] = useState(latitude || "");
  const [lng, setLng] = useState(longitude || "");
  const example = useMemo(() => `12° 7'19.62"S / 77° 2'18.58"W`, []);

  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-4 md:col-span-2 md:grid-cols-3">
      <div className="md:col-span-3">
        <p className="font-semibold">Ubicacion para control de asistencia</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pega las coordenadas como aparecen en Google Earth. Terraqo las convierte a decimal para validar entradas, salidas y distancia al punto de trabajo.
        </p>
      </div>
      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latitud Google Earth</span>
        <Input
          placeholder={`Ej. 12° 7'19.62"S`}
          defaultValue={latitude ? "" : undefined}
          onBlur={(event) => {
            const parsed = parseCoordinate(event.currentTarget.value);
            if (parsed) setLat(parsed);
          }}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Longitud Google Earth</span>
        <Input
          placeholder={`Ej. 77° 2'18.58"W`}
          defaultValue={longitude ? "" : undefined}
          onBlur={(event) => {
            const parsed = parseCoordinate(event.currentTarget.value);
            if (parsed) setLng(parsed);
          }}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Radio permitido</span>
        <Input name="geofenceRadiusMeters" type="number" min="25" max="5000" step="1" placeholder="Radio en metros" defaultValue={radius || "250"} />
      </label>
      <Input name="latitude" type="number" step="any" min="-90" max="90" placeholder="Latitud decimal" value={lat} onChange={(event) => setLat(event.target.value)} />
      <Input name="longitude" type="number" step="any" min="-180" max="180" placeholder="Longitud decimal" value={lng} onChange={(event) => setLng(event.target.value)} />
      <div className="rounded-md border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
        Formato aceptado: <span className="font-mono text-foreground">{example}</span>
      </div>
    </div>
  );
}
