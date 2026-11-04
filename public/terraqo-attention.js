/* Terraqo public contact launcher. No account tokens, cookies or visitor data. */
(() => {
  "use strict";
  const script = document.currentScript;
  if (!script) return;
  const workspace = script.getAttribute("data-workspace") || "";
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(workspace)) return;
  const base = new URL(script.src).origin;
  if (!/^https:/.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) return;
  const key = "terraqo-contact-" + workspace;
  if (document.getElementById(key)) return;
  const host = document.createElement("div");
  host.id = key;
  document.body.append(host);
  fetch(base + "/api/chat/config?workspace=" + encodeURIComponent(workspace), { credentials: "omit", cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(({ config }) => {
      if (!config || !host.isConnected) { host.remove(); return; }
      const settings = config.installation || { position: "right", label: "Habla con nosotros", pages: [] };
      const root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{position:fixed;bottom:max(20px,env(safe-area-inset-bottom));z-index:2147483000;font:600 14px/1.4 system-ui,sans-serif}:host([hidden]){display:none}a{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;max-width:min(320px,calc(100vw - 40px));padding:12px 20px;border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.12);text-decoration:none;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #2275d1;outline-offset:4px}a:hover{filter:brightness(.95)}";
      root.append(style);
      host.style[settings.position === "left" ? "left" : "right"] = "20px";
      const link = document.createElement("a");
      link.href = base + "/atencion/" + encodeURIComponent(workspace);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = settings.label;
      link.setAttribute("aria-label", settings.label + " · " + config.displayName + " (abre otra pestaña)");
      const accent = /^#[0-9a-f]{6}$/i.test(config.accent) ? config.accent : "#006b63";
      const rgb = accent.slice(1).match(/.{2}/g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      link.style.background = accent;
      link.style.color = (luminance + .05) / .05 > 1.05 / (luminance + .05) ? "#000" : "#fff";
      root.append(link);
      const update = () => {
        const path = location.pathname;
        host.hidden = settings.pages.length > 0 && !settings.pages.some(prefix => prefix === "/" || path === prefix || path.startsWith(prefix.replace(/\/$/, "") + "/"));
      };
      update();
      // Also handle client-side routers without replacing the host site's history API.
      let timer;
      const start = () => {
        update();
        if (!timer && host.isConnected) timer = setInterval(() => {
          if (!host.isConnected) { clearInterval(timer); timer = undefined; } else update();
        }, 1000);
      };
      start();
      window.addEventListener("pageshow", start);
      window.addEventListener("pagehide", () => { clearInterval(timer); timer = undefined; });
    }).catch(() => host.remove());
})();
