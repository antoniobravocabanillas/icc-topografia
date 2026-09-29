export type TerraqoAlertChannel = "message" | "notification";
export type TerraqoSoundPreset = "pulse" | "crystal" | "soft";

export type TerraqoAlertPreferences = {
  enabled: boolean;
  messageSound: TerraqoSoundPreset;
  notificationSound: TerraqoSoundPreset;
  volume: number;
};

export const TERRAQO_ALERT_PREFERENCES_KEY = "terraqo:alert-preferences:v1";
export const TERRAQO_ALERT_PREFERENCES_EVENT = "terraqo:alert-preferences";

export const defaultTerraqoAlertPreferences: TerraqoAlertPreferences = {
  enabled: false,
  messageSound: "pulse",
  notificationSound: "crystal",
  volume: 0.65,
};

type TerraqoAudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  __terraqoAudioContext?: AudioContext;
  __terraqoAudioUnlockInstalled?: boolean;
};

function browserWindow() {
  return typeof window === "undefined" ? null : (window as TerraqoAudioWindow);
}

export function getTerraqoAlertPreferences(): TerraqoAlertPreferences {
  const target = browserWindow();
  if (!target) return defaultTerraqoAlertPreferences;
  try {
    const stored = JSON.parse(
      target.localStorage.getItem(TERRAQO_ALERT_PREFERENCES_KEY) || "{}",
    ) as Partial<TerraqoAlertPreferences>;
    return {
      enabled: stored.enabled === true,
      messageSound: isPreset(stored.messageSound)
        ? stored.messageSound
        : defaultTerraqoAlertPreferences.messageSound,
      notificationSound: isPreset(stored.notificationSound)
        ? stored.notificationSound
        : defaultTerraqoAlertPreferences.notificationSound,
      volume: Math.min(1, Math.max(0.1, Number(stored.volume) || 0.65)),
    };
  } catch {
    return defaultTerraqoAlertPreferences;
  }
}

export function saveTerraqoAlertPreferences(
  preferences: TerraqoAlertPreferences,
) {
  const target = browserWindow();
  if (!target) return;
  target.localStorage.setItem(
    TERRAQO_ALERT_PREFERENCES_KEY,
    JSON.stringify(preferences),
  );
  target.dispatchEvent(
    new CustomEvent(TERRAQO_ALERT_PREFERENCES_EVENT, {
      detail: preferences,
    }),
  );
}

export function installTerraqoAudioUnlock() {
  const target = browserWindow();
  if (!target || target.__terraqoAudioUnlockInstalled) return;
  target.__terraqoAudioUnlockInstalled = true;
  const unlock = () => {
    void getAudioContext()?.resume();
    target.removeEventListener("pointerdown", unlock);
    target.removeEventListener("keydown", unlock);
  };
  target.addEventListener("pointerdown", unlock, { once: true });
  target.addEventListener("keydown", unlock, { once: true });
}

export async function playTerraqoAlert(
  channel: TerraqoAlertChannel,
  options?: { force?: boolean },
) {
  const preferences = getTerraqoAlertPreferences();
  if (!preferences.enabled && !options?.force) return false;
  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") await context.resume();
  } catch {
    return false;
  }
  if (context.state !== "running") return false;

  const preset =
    channel === "message"
      ? preferences.messageSound
      : preferences.notificationSound;
  const notes = soundNotes[preset];
  const startedAt = context.currentTime + 0.015;
  notes.forEach((note, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startedAt + note.delay;
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, preferences.volume * note.gain),
      noteStart + 0.018,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + note.duration + 0.025 + index * 0.001);
  });
  return true;
}

function getAudioContext() {
  const target = browserWindow();
  if (!target) return null;
  const AudioContextClass = target.AudioContext || target.webkitAudioContext;
  if (!AudioContextClass) return null;
  target.__terraqoAudioContext =
    target.__terraqoAudioContext || new AudioContextClass();
  return target.__terraqoAudioContext;
}

function isPreset(value: unknown): value is TerraqoSoundPreset {
  return value === "pulse" || value === "crystal" || value === "soft";
}

const soundNotes: Record<
  TerraqoSoundPreset,
  Array<{
    frequency: number;
    delay: number;
    duration: number;
    gain: number;
    wave: OscillatorType;
  }>
> = {
  pulse: [
    { frequency: 520, delay: 0, duration: 0.16, gain: 0.16, wave: "sine" },
    { frequency: 720, delay: 0.11, duration: 0.22, gain: 0.2, wave: "sine" },
  ],
  crystal: [
    { frequency: 784, delay: 0, duration: 0.22, gain: 0.14, wave: "sine" },
    { frequency: 1175, delay: 0.08, duration: 0.3, gain: 0.13, wave: "sine" },
  ],
  soft: [
    { frequency: 620, delay: 0, duration: 0.3, gain: 0.11, wave: "triangle" },
  ],
};
