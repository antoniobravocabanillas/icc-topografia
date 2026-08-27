"use client";

import { useEffect, useId, useState } from "react";

type LocationOption = {
  value: string;
  label: string;
};

type LocationSelectProps = {
  countryName?: string;
  subdivisionName?: string;
  cityName?: string;
  defaultCountry?: string;
  defaultSubdivision?: string;
  defaultCity?: string;
  required?: boolean;
  className?: string;
};

async function loadOptions(url: string): Promise<LocationOption[]> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) return [];
  return payload?.data || [];
}

export function LocationSelect({
  countryName = "country",
  subdivisionName = "subdivision",
  cityName = "city",
  defaultCountry = "PE",
  defaultSubdivision = "",
  defaultCity = "",
  required = false,
  className = "",
}: LocationSelectProps) {
  const id = useId();
  const [countries, setCountries] = useState<LocationOption[]>([]);
  const [subdivisions, setSubdivisions] = useState<LocationOption[]>([]);
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [country, setCountry] = useState(defaultCountry);
  const [subdivision, setSubdivision] = useState(defaultSubdivision);
  const [city, setCity] = useState(defaultCity);
  const manualCity = city === "OTHER";

  useEffect(() => {
    loadOptions("/api/locations/countries").then(setCountries);
  }, []);

  useEffect(() => {
    setSubdivisions([]);
    setCities([]);
    if (!country) return;

    loadOptions(`/api/locations/subdivisions?country=${encodeURIComponent(country)}`).then((next) => {
      setSubdivisions(next);
      setSubdivision((current) => current && !next.some((option) => option.value === current) ? "" : current);
    });
  }, [country]);

  useEffect(() => {
    setCities([]);
    if (!country) return;

    const query = new URLSearchParams({ country });
    if (subdivision) query.set("subdivision", subdivision);
    loadOptions(`/api/locations/cities?${query.toString()}`).then((next) => {
      setCities(next);
      setCity((current) => current && !next.some((option) => option.value === current) ? "" : current);
    });
  }, [country, subdivision]);

  const selectClass =
    "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      <label className="grid gap-1.5">
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-primary">Pais</span>
        <select id={`${id}-country`} name={countryName} required={required} className={selectClass} value={country} onChange={(event) => {
          setCountry(event.target.value);
          setSubdivision("");
          setCity("");
        }}>
          <option value="">Selecciona pais</option>
          {countries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-primary">Departamento / estado</span>
        <select id={`${id}-subdivision`} name={subdivisionName} required={required && subdivisions.length > 0} disabled={!country || subdivisions.length === 0} className={selectClass} value={subdivision} onChange={(event) => {
          setSubdivision(event.target.value);
          setCity("");
        }}>
          <option value="">{subdivisions.length ? "Selecciona" : "No aplica"}</option>
          {subdivisions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-primary">Ciudad</span>
        <select id={`${id}-city`} required={required && cities.length > 0} disabled={!country} className={selectClass} value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="">{cities.length ? "Selecciona ciudad o distrito" : "Escribe la ubicación"}</option>
          {cities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value="OTHER">Otra ciudad o distrito</option>
        </select>
        {manualCity || (!cities.length && country) ? (
          <input name={cityName} required={required} placeholder="Escribe la ciudad o distrito" className={selectClass} />
        ) : (
          <input type="hidden" name={cityName} value={city} />
        )}
      </label>
    </div>
  );
}
