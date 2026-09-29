"use client";

import { useEffect, useState } from "react";
import { BellRing, MessageSquareText, Volume2, VolumeX } from "lucide-react";
import {
  defaultTerraqoAlertPreferences,
  getTerraqoAlertPreferences,
  installTerraqoAudioUnlock,
  playTerraqoAlert,
  saveTerraqoAlertPreferences,
  type TerraqoAlertPreferences,
  type TerraqoSoundPreset,
} from "@/lib/terraqo/alert-sounds";

const soundOptions: Array<{ value: TerraqoSoundPreset; label: string }> = [
  { value: "pulse", label: "Pulso Terraqo" },
  { value: "crystal", label: "Cristal" },
  { value: "soft", label: "Suave" },
];

export function AlertPreferencesPanel() {
  const [preferences, setPreferences] = useState<TerraqoAlertPreferences>(
    defaultTerraqoAlertPreferences,
  );

  useEffect(() => {
    setPreferences(getTerraqoAlertPreferences());
    installTerraqoAudioUnlock();
  }, []);

  function update(next: Partial<TerraqoAlertPreferences>) {
    const value = { ...preferences, ...next };
    setPreferences(value);
    saveTerraqoAlertPreferences(value);
  }

  async function preview(channel: "message" | "notification") {
    if (!preferences.enabled) update({ enabled: true });
    await playTerraqoAlert(channel, { force: true });
  }

  return (
    <section className="w-[min(360px,calc(100vw-24px))]" aria-labelledby="sound-preferences-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="sound-preferences-heading" className="font-display text-base font-bold text-[#0e1a26]">
            Sonidos de Terraqo
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#526579]">
            Elige cómo quieres enterarte sin interrumpir tu trabajo.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={preferences.enabled}
          onClick={() => update({ enabled: !preferences.enabled })}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6f68] focus-visible:ring-offset-2 ${preferences.enabled ? "bg-[#0b6f68]" : "bg-slate-300"}`}
          aria-label={preferences.enabled ? "Desactivar sonidos" : "Activar sonidos"}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${preferences.enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <div className={`mt-4 space-y-4 ${preferences.enabled ? "" : "opacity-55"}`} aria-disabled={!preferences.enabled}>
        <SoundChoice
          id="message-sound"
          icon={MessageSquareText}
          label="Mensajes"
          value={preferences.messageSound}
          disabled={!preferences.enabled}
          onChange={(messageSound) => update({ messageSound })}
          onPreview={() => preview("message")}
        />
        <SoundChoice
          id="notification-sound"
          icon={BellRing}
          label="Notificaciones"
          value={preferences.notificationSound}
          disabled={!preferences.enabled}
          onChange={(notificationSound) => update({ notificationSound })}
          onPreview={() => preview("notification")}
        />
        <label htmlFor="alert-volume" className="block">
          <span className="flex items-center justify-between gap-3 text-xs font-bold text-[#26394d]">
            <span className="inline-flex items-center gap-2">
              {preferences.enabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
              Volumen
            </span>
            <span>{Math.round(preferences.volume * 100)}%</span>
          </span>
          <input
            id="alert-volume"
            type="range"
            min="10"
            max="100"
            step="5"
            disabled={!preferences.enabled}
            value={Math.round(preferences.volume * 100)}
            onChange={(event) => update({ volume: Number(event.target.value) / 100 })}
            className="mt-2 h-2 w-full cursor-pointer accent-[#0b6f68] disabled:cursor-not-allowed"
          />
        </label>
      </div>
      <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] leading-4 text-[#607083]">
        El navegador necesita una primera interacción para habilitar audio. La preferencia queda guardada en este dispositivo.
      </p>
    </section>
  );
}

function SoundChoice({
  id,
  icon: Icon,
  label,
  value,
  disabled,
  onChange,
  onPreview,
}: {
  id: string;
  icon: typeof BellRing;
  label: string;
  value: TerraqoSoundPreset;
  disabled: boolean;
  onChange: (value: TerraqoSoundPreset) => void;
  onPreview: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_44px] items-end gap-2">
      <label htmlFor={id} className="min-w-0">
        <span className="mb-1.5 flex items-center gap-2 text-xs font-bold text-[#26394d]">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </span>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as TerraqoSoundPreset)}
          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0e1a26] outline-none focus:border-[#0b6f68] focus:ring-2 focus:ring-[#0b6f68]/15 disabled:cursor-not-allowed"
        >
          {soundOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={onPreview}
        className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 text-[#315f9f] transition-colors hover:bg-[#eef4fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315f9f] disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={`Probar sonido de ${label.toLowerCase()}`}
        title="Probar sonido"
      >
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
