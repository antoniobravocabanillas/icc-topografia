import { LocateFixed, MapPinned, Navigation, ShieldCheck } from "lucide-react";

type RoutePoint = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: Date | string;
};

type ProjectedPoint = RoutePoint & { x: number; y: number };

const WIDTH = 1_000;
const HEIGHT = 430;
const PADDING = 54;

function radians(value: number) {
  return value * Math.PI / 180;
}

function distanceMeters(left: RoutePoint, right: RoutePoint) {
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitude1 = radians(left.latitude);
  const latitude2 = radians(right.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDistance(value: number) {
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)} km` : `${Math.round(value)} m`;
}

function prepareRoute(points: RoutePoint[]) {
  const ordered = [...points].sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime());
  return ordered.filter((point, index, all) => {
    if (!index) return true;
    const previous = all[index - 1];
    const elapsedSeconds = Math.max(1, (new Date(point.capturedAt).getTime() - new Date(previous.capturedAt).getTime()) / 1_000);
    return distanceMeters(previous, point) / elapsedSeconds < 55;
  });
}

function project(points: RoutePoint[]): ProjectedPoint[] {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  let minimumLatitude = Math.min(...latitudes);
  let maximumLatitude = Math.max(...latitudes);
  let minimumLongitude = Math.min(...longitudes);
  let maximumLongitude = Math.max(...longitudes);
  if (maximumLatitude - minimumLatitude < 0.00015) {
    minimumLatitude -= 0.000075;
    maximumLatitude += 0.000075;
  }
  if (maximumLongitude - minimumLongitude < 0.00015) {
    minimumLongitude -= 0.000075;
    maximumLongitude += 0.000075;
  }
  const latitudeRange = maximumLatitude - minimumLatitude;
  const longitudeRange = maximumLongitude - minimumLongitude;
  return points.map((point) => ({
    ...point,
    x: PADDING + ((point.longitude - minimumLongitude) / longitudeRange) * (WIDTH - PADDING * 2),
    y: PADDING + (1 - (point.latitude - minimumLatitude) / latitudeRange) * (HEIGHT - PADDING * 2),
  }));
}

function clusters(points: ProjectedPoint[]) {
  const cells = new Map<string, { x: number; y: number; count: number }>();
  points.forEach((point) => {
    const column = Math.round(point.x / 44);
    const row = Math.round(point.y / 44);
    const key = `${column}:${row}`;
    const current = cells.get(key) || { x: 0, y: 0, count: 0 };
    current.x += point.x;
    current.y += point.y;
    current.count += 1;
    cells.set(key, current);
  });
  return [...cells.values()].map((cell) => ({
    x: cell.x / cell.count,
    y: cell.y / cell.count,
    count: cell.count,
  }));
}

export function AttendanceRouteMap({
  entry,
  exit,
  samples,
}: {
  entry: RoutePoint;
  exit?: RoutePoint | null;
  samples: RoutePoint[];
}) {
  const route = prepareRoute([entry, ...samples, ...(exit ? [exit] : [])]);
  const projected = project(route);
  const heat = clusters(projected.slice(1, exit ? -1 : undefined));
  const totalDistance = route.slice(1).reduce((total, point, index) => total + distanceMeters(route[index], point), 0);
  const averageAccuracy = route.reduce((total, point) => total + point.accuracyMeters, 0) / route.length;
  const start = projected[0];
  const end = exit ? projected[projected.length - 1] : null;
  const routePath = projected.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <section className="overflow-hidden rounded-2xl border border-[#cfdae4] bg-[#071f2d] text-white shadow-[0_18px_55px_rgba(7,31,45,0.12)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#67d9cd]">Trazabilidad privada</p>
          <h2 className="mt-1 font-display text-xl font-bold">Mapa de calor y recorrido</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">Muestras capturadas durante la jornada. Visible solo para el profesional y la empresa vinculada, sin compartir coordenadas con proveedores externos de mapas.</p>
        </div>
        <span className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-[#67d9cd]/30 bg-[#67d9cd]/10 px-3 text-xs font-bold text-[#8ce8df]"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Acceso restringido</span>
      </div>

      <figure className="relative bg-[radial-gradient(circle_at_15%_10%,rgba(44,184,194,0.16),transparent_32%),linear-gradient(145deg,#092636,#061923)] p-3 sm:p-5">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="route-map-title route-map-description" className="block h-auto w-full rounded-xl border border-white/10 bg-[#092331]">
          <title id="route-map-title">Mapa relativo del recorrido de la jornada</title>
          <desc id="route-map-description">Ruta compuesta por {route.length} puntos, desde la entrada hasta {exit ? "la salida" : "la última posición sincronizada"}.</desc>
          <defs>
            <pattern id="attendance-grid" width="52" height="52" patternUnits="userSpaceOnUse"><path d="M 52 0 L 0 0 0 52" fill="none" stroke="rgba(164,216,226,0.10)" strokeWidth="1" /></pattern>
            <filter id="attendance-heat"><feGaussianBlur stdDeviation="17" /></filter>
            <linearGradient id="attendance-route" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#66e0cf" /><stop offset="0.62" stopColor="#35aee8" /><stop offset="1" stopColor="#f4b84a" /></linearGradient>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="url(#attendance-grid)" />
          <path d="M80 345 C210 270 260 305 390 220 S610 120 740 180 S865 210 930 90" fill="none" stroke="rgba(134,195,207,0.08)" strokeWidth="22" />
          <path d="M45 112 C180 155 300 70 440 118 S700 245 955 170" fill="none" stroke="rgba(134,195,207,0.07)" strokeWidth="13" />
          {heat.map((cell, index) => <circle key={`${cell.x}-${cell.y}-${index}`} cx={cell.x} cy={cell.y} r={Math.min(62, 24 + cell.count * 4)} fill={cell.count > 4 ? "#f0a43a" : "#24c7b3"} opacity={Math.min(0.65, 0.28 + cell.count * 0.06)} filter="url(#attendance-heat)" />)}
          {projected.length > 1 ? <polyline points={routePath} fill="none" stroke="rgba(2,12,18,0.7)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {projected.length > 1 ? <polyline points={routePath} fill="none" stroke="url(#attendance-route)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {projected.map((point, index) => index > 0 && index < projected.length - (exit ? 1 : 0) ? <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="4" fill="#d6fffa" opacity="0.9" /> : null)}
          <circle cx={start.x} cy={start.y} r="13" fill="#0da785" stroke="#d6fffa" strokeWidth="5" />
          {end ? <circle cx={end.x} cy={end.y} r="13" fill="#2b82d9" stroke="#e8f5ff" strokeWidth="5" /> : null}
          <text x="30" y="36" fill="rgba(255,255,255,0.56)" fontSize="18" fontWeight="700">N</text>
          <path d="M35 48 L35 76 M25 58 L35 48 L45 58" stroke="rgba(255,255,255,0.56)" strokeWidth="3" fill="none" />
        </svg>
        {!samples.length ? <div className="absolute inset-x-6 bottom-6 rounded-xl border border-white/15 bg-[#071925]/90 px-4 py-3 text-sm text-white/75 backdrop-blur"><strong className="text-white">Captura iniciada.</strong> El recorrido aparecerá al sincronizar las primeras muestras; en una jornada en curso puedes recargar para actualizar el detalle.</div> : null}
      </figure>

      <dl className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
        <div className="border-b border-r border-white/10 p-4 sm:border-b-0"><dt className="flex items-center gap-2 text-xs text-white/55"><Navigation className="h-4 w-4 text-[#67d9cd]" />Distancia estimada</dt><dd className="mt-1.5 font-display text-xl font-bold">{formatDistance(totalDistance)}</dd></div>
        <div className="border-b border-white/10 p-4 sm:border-b-0 sm:border-r"><dt className="flex items-center gap-2 text-xs text-white/55"><LocateFixed className="h-4 w-4 text-[#67d9cd]" />Puntos de ruta</dt><dd className="mt-1.5 font-display text-xl font-bold">{route.length}</dd></div>
        <div className="border-r border-white/10 p-4"><dt className="flex items-center gap-2 text-xs text-white/55"><MapPinned className="h-4 w-4 text-[#67d9cd]" />Precisión media</dt><dd className="mt-1.5 font-display text-xl font-bold">{Math.round(averageAccuracy)} m</dd></div>
        <div className="p-4"><dt className="text-xs text-white/55">Estado</dt><dd className="mt-1.5 font-display text-xl font-bold">{exit ? "Finalizada" : "En curso"}</dd></div>
      </dl>
    </section>
  );
}
