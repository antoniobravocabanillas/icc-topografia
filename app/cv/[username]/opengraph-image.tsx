/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicCvSeoProfile, publicCvSeoFacts } from "@/lib/terraqo/public-cv-seo";
import { absoluteUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const alt = "Terraqo CV Vivo: trayectoria profesional verificable";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

type OpenGraphImageProps = {
  params: Promise<{ username: string }>;
};

async function imageDataUrl(src?: string | null, baseUrl = absoluteUrl("/")) {
  if (!src) return null;
  try {
    const url = new URL(src, baseUrl);
    const response = await fetch(url, { signal: AbortSignal.timeout(2400) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type");
    if (!type?.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TQ";
}

export default async function OpenGraphImage({ params }: OpenGraphImageProps) {
  const { username } = await params;
  const requestHeaders = await headers();
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host");
  const origin = host ? `${forwardedProtocol || (host.includes("localhost") ? "http" : "https")}://${host}` : absoluteUrl("/");
  const profile = await getPublicCvSeoProfile(username);
  if (!profile || !profile.liveCvEnabled) notFound();

  const facts = publicCvSeoFacts(profile, username);
  const [avatar, embeddedLogo] = await Promise.all([
    imageDataUrl(profile.user.image, origin),
    imageDataUrl("/brand/terraqo-3/withoutbackground/LH Compact bg dark.svg", origin)
  ]);
  const logo = embeddedLogo || new URL("/brand/terraqo-3/withoutbackground/LH Compact bg dark.svg", origin).toString();
  const firstName = facts.name.split(/\s+/)[0] || facts.name;
  const metrics = [
    { value: facts.duration, label: "experiencia acumulada" },
    { value: facts.verifiedExperiences ? String(facts.verifiedExperiences) : "En vivo", label: facts.verifiedExperiences === 1 ? "experiencia validada" : "experiencias validadas" },
    { value: `${facts.trustScore}%`, label: "nivel de confianza" }
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#07111f",
          color: "#f3f3f3",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(circle at 75% 36%, rgba(37,192,213,0.16), transparent 34%), linear-gradient(122deg, #0e1a26 0%, #07111f 66%, #0a1730 100%)" }} />
        <div style={{ position: "absolute", width: 460, height: 460, border: "1px solid rgba(72,138,201,0.18)", borderRadius: 460, right: -90, top: -120, display: "flex" }} />
        <div style={{ position: "absolute", width: 310, height: 310, border: "1px solid rgba(37,192,213,0.16)", borderRadius: 310, right: -15, top: -40, display: "flex" }} />
        <div style={{ position: "absolute", width: 10, height: 10, borderRadius: 10, background: "#25c0d5", boxShadow: "0 0 24px #25c0d5", right: 160, top: 128, display: "flex" }} />
        <div style={{ position: "absolute", width: 8, height: 8, borderRadius: 8, background: "#4374ba", boxShadow: "0 0 18px #4374ba", right: 328, top: 233, display: "flex" }} />

        <div style={{ position: "relative", width: "100%", height: "100%", padding: "42px 54px 36px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <img src={logo} alt="Terraqo" width="210" height="48" style={{ objectFit: "contain", objectPosition: "left center" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#25c0d5", fontSize: 16, fontWeight: 700, letterSpacing: 2.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: "#25c0d5", boxShadow: "0 0 16px #25c0d5" }} />
              CV VIVO · PERFIL PÚBLICO
            </div>
          </div>

          <div style={{ display: "flex", flex: 1, alignItems: "center", paddingTop: 24 }}>
            <div style={{ width: 204, height: 204, flex: "0 0 204px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 204, padding: 7, background: "linear-gradient(145deg, #4374ba, #25c0d5)", boxShadow: "0 20px 56px rgba(0,0,0,0.42)" }}>
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 190, background: "#f3f3f3", color: "#4374ba", fontSize: 62, fontWeight: 800 }}>
                {avatar ? <img src={avatar} alt="" width="190" height="190" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(facts.name)}
              </div>
              <span style={{ position: "absolute", right: 12, bottom: 22, width: 28, height: 28, border: "5px solid #07111f", borderRadius: 28, background: "#25c0d5", boxShadow: "0 0 18px rgba(37,192,213,0.8)" }} />
            </div>

            <div style={{ minWidth: 0, paddingLeft: 38, display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", color: "#7cc8ff", fontSize: 18, fontWeight: 700, letterSpacing: 1.2 }}>{facts.status.toUpperCase()}</div>
              <div style={{ marginTop: 10, display: "flex", fontSize: 50, lineHeight: 1.02, fontWeight: 800, letterSpacing: -1.8 }}>{facts.name}</div>
              <div style={{ marginTop: 12, display: "flex", fontSize: 28, lineHeight: 1.15, fontWeight: 700, color: "#488ac9" }}>{facts.headline}</div>
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 13, color: "rgba(243,243,243,0.70)", fontSize: 18 }}>
                {facts.location ? <span>{facts.location}</span> : null}
                <span style={{ width: 6, height: 6, borderRadius: 6, background: "#25c0d5" }} />
                <span>@{username}</span>
              </div>
              {facts.skills.length ? (
                <div style={{ marginTop: 20, display: "flex", gap: 9 }}>
                  {facts.skills.slice(0, 4).map((skill) => (
                    <span key={skill} style={{ display: "flex", padding: "7px 12px", border: "1px solid rgba(72,138,201,0.28)", borderRadius: 999, background: "rgba(72,138,201,0.10)", color: "#b6d4ff", fontSize: 14, fontWeight: 700 }}>{skill}</span>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ width: 294, flex: "0 0 294px", marginLeft: 28, padding: "26px 28px", display: "flex", flexDirection: "column", border: "1px solid rgba(72,138,201,0.28)", borderRadius: 22, background: "rgba(7,17,31,0.68)" }}>
              <div style={{ display: "flex", color: "#25c0d5", fontSize: 14, fontWeight: 800, letterSpacing: 2 }}>EL TRABAJO HABLA POR TI</div>
              <div style={{ marginTop: 15, display: "flex", flexDirection: "column", fontSize: 31, lineHeight: 1.08, fontWeight: 800, letterSpacing: -0.7 }}>
                <span>El trabajo de</span>
                <span style={{ color: "#7cc8ff" }}>{firstName},</span>
                <span>demostrado.</span>
              </div>
              <div style={{ marginTop: 20, display: "flex", color: "rgba(243,243,243,0.58)", fontSize: 16, lineHeight: 1.42 }}>Trayectoria, experiencia y contexto profesional en un perfil que evoluciona.</div>
            </div>
          </div>

          <div style={{ height: 104, display: "flex", alignItems: "stretch", border: "1px solid rgba(72,138,201,0.25)", borderRadius: 18, overflow: "hidden", background: "rgba(14,26,38,0.76)" }}>
            {metrics.map((metric, index) => (
              <div key={metric.label} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px", borderRight: index < metrics.length - 1 ? "1px solid rgba(72,138,201,0.20)" : "none" }}>
                <strong style={{ display: "flex", fontSize: metric.value.length > 12 ? 22 : 31, lineHeight: 1.05, color: index === 2 ? "#25c0d5" : "#f3f3f3" }}>{metric.value}</strong>
                <span style={{ marginTop: 8, display: "flex", color: "rgba(243,243,243,0.52)", fontSize: 14 }}>{metric.label}</span>
              </div>
            ))}
            <div style={{ width: 240, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "linear-gradient(115deg, rgba(67,116,186,0.22), rgba(37,192,213,0.12))", color: "#f3f3f3", fontSize: 17, fontWeight: 800 }}>
              ABRIR CV VIVO <span style={{ color: "#25c0d5", fontSize: 26 }}>→</span>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
