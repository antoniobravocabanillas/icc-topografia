import {
  BufferSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink,
  EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat, Output, WEBM, WebMOutputFormat,
  type EncodedPacket,
} from "mediabunny";
import { WORKLOG_CLIP_LIMIT, isWorklogClip } from "../terraqo/worklog-clip-types";
import { WorklogMediaSecurityError } from "./worklog-media-security";

function invalid(): never {
  throw new WorklogMediaSecurityError("El clip está dañado o su contenedor, pistas o códecs no son compatibles.");
}

// Only encoded media tracks are copied. User tags, attachments, external references
// and trailing input bytes are never served from the private blob store.
export async function sanitizeWorklogClip(source: ArrayBuffer, claimedType: string, fileName: string) {
  if (!source.byteLength || source.byteLength > WORKLOG_CLIP_LIMIT || !isWorklogClip(claimedType)) invalid();
  const input = new Input({ formats: [MP4, WEBM], source: new BufferSource(source) });
  try {
    const format = await input.getFormat();
    const webm = format === WEBM;
    const tracks = await input.getTracks();
    const video = tracks.filter(track => track.isVideoTrack());
    const audio = tracks.filter(track => track.isAudioTrack());
    const extension = webm ? "webm" : "mp4";
    const contentType = `${video.length ? "video" : "audio"}/${extension}`;
    if (claimedType !== contentType || !tracks.length || tracks.length !== audio.length + video.length ||
        audio.length > 1 || video.length > 1) invalid();
    const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat(),
      target: new BufferTarget() });
    const writers: Array<() => Promise<void>> = [];
    let payloadBytes = 0;
    let packets = 0;
    let width: number | undefined;
    let height: number | undefined;
    for (const track of tracks) {
      let add: (packet: EncodedPacket, first: boolean) => Promise<void>;
      let close: () => void;
      if (track.isAudioTrack()) {
        const codec = await track.getCodec();
        const config = await track.getDecoderConfig();
        if (!codec || codec !== (webm ? "opus" : "aac") || !config ||
            config.numberOfChannels > 8 || config.sampleRate > 192000) invalid();
        const writer = new EncodedAudioPacketSource(codec);
        output.addAudioTrack(writer);
        add = (packet, first) => writer.add(packet, first ? { decoderConfig: config } : undefined);
        close = () => writer.close();
      } else if (track.isVideoTrack()) {
        const codec = await track.getCodec();
        const config = await track.getDecoderConfig();
        width = await track.getCodedWidth();
        height = await track.getCodedHeight();
        if (!codec || !(webm ? ["vp8", "vp9"] : ["avc"]).includes(codec) || !config ||
            width < 1 || height < 1 || Math.max(width, height) > 4096 || width * height > 4096 * 2160) invalid();
        const writer = new EncodedVideoPacketSource(codec);
        output.addVideoTrack(writer, { rotation: await track.getRotation() });
        add = (packet, first) => writer.add(packet, first ? { decoderConfig: config } : undefined);
        close = () => writer.close();
      } else invalid();
      writers.push(async () => {
        let first = true;
        for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { verifyKeyPackets: true })) {
          payloadBytes += packet.data.byteLength;
          if (!packet.data.byteLength || payloadBytes > source.byteLength || ++packets > 30000 ||
              !Number.isFinite(packet.timestamp + packet.duration) || packet.timestamp + packet.duration > 600 ||
              (first && track.isVideoTrack() && packet.type !== "key")) invalid();
          await add(packet, first);
          first = false;
        }
        if (first) invalid();
        close();
      });
    }
    await output.start();
    // Independent track writers must run together for interleaved muxer backpressure.
    await Promise.all(writers.map(write => write()));
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer?.byteLength || buffer.byteLength > WORKLOG_CLIP_LIMIT) invalid();
    const stem = fileName.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 72);
    return { bytes: Buffer.from(buffer), contentType, fileName: `${stem || "evidencia"}.${extension}`,
      sourceFormat: extension, width, height };
  } catch {
    invalid();
  } finally {
    input.dispose();
  }
}
