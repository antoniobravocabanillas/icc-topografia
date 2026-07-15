"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Video } from "lucide-react";

type JitsiApi = {
  addListener: (event: string, listener: () => void) => void;
  dispose: () => void;
};

type JitsiConstructor = new (
  domain: string,
  options: {
    roomName: string;
    parentNode: HTMLElement;
    userInfo: { displayName: string; email: string };
    lang: string;
    configOverwrite: Record<string, unknown>;
    interfaceConfigOverwrite: Record<string, unknown>;
  }
) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

type MeetingRoomProps = {
  meetingId: string;
  roomName: string;
  domain: string;
  scriptUrl: string;
  displayName: string;
  email: string;
  returnPath: string;
};

export function MeetingRoom({ meetingId, roomName, domain, scriptUrl, displayName, email, returnPath }: MeetingRoomProps) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [scriptReady, setScriptReady] = useState(Boolean(typeof window !== "undefined" && window.JitsiMeetExternalAPI));
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!scriptReady || !frameRef.current || !window.JitsiMeetExternalAPI || apiRef.current) return;

    try {
      const api = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        parentNode: frameRef.current,
        userInfo: { displayName, email },
        lang: "es",
        configOverwrite: {
          prejoinPageEnabled: true,
          startWithAudioMuted: true,
          startWithVideoMuted: false,
          disableDeepLinking: true,
          subject: "Terraqo Meet"
        },
        interfaceConfigOverwrite: {
          APP_NAME: "Terraqo Meet",
          NATIVE_APP_NAME: "Terraqo Meet",
          PROVIDER_NAME: "Terraqo"
        }
      });
      apiRef.current = api;
      setStatus("ready");

      const setPresence = (joined: boolean) => {
        void fetch(`/api/terraqo/meetings/${meetingId}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joined }),
          keepalive: true
        });
      };
      api.addListener("videoConferenceJoined", () => setPresence(true));
      api.addListener("videoConferenceLeft", () => setPresence(false));
      api.addListener("readyToClose", () => router.push(returnPath));
    } catch {
      setStatus("error");
    }

    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [displayName, domain, email, meetingId, returnPath, roomName, router, scriptReady]);

  return (
    <div className="relative min-h-[520px] flex-1 overflow-hidden bg-[#061c1f] md:min-h-0">
      <Script src={scriptUrl} strategy="afterInteractive" onLoad={() => setScriptReady(true)} onError={() => setStatus("error")} />
      {status === "loading" ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[#061c1f] text-white">
          <div className="text-center">
            <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#58ddd4]" />
            <p className="mt-4 font-semibold">Preparando Terraqo Meet</p>
            <p className="mt-1 text-sm text-white/60">Conectando la sala privada...</p>
          </div>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[#061c1f] p-8 text-center text-white">
          <div>
            <Video className="mx-auto h-9 w-9 text-[#58ddd4]" />
            <p className="mt-4 font-semibold">No pudimos cargar la videollamada</p>
            <p className="mt-2 max-w-md text-sm text-white/60">Revisa la conexion o la configuracion del proveedor de Terraqo Meet e intenta nuevamente.</p>
          </div>
        </div>
      ) : null}
      <div ref={frameRef} className="h-full min-h-[520px] w-full md:min-h-0 [&>iframe]:h-full [&>iframe]:min-h-[520px] [&>iframe]:w-full md:[&>iframe]:min-h-0" />
    </div>
  );
}
