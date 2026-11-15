export const WORKLOG_CLIP_LIMIT = 3 * 1024 * 1024;
export const WORKLOG_CLIP_TYPES = ["audio/webm", "audio/mp4", "video/webm", "video/mp4"] as const;
export function isWorklogClip(type: string) {
  return WORKLOG_CLIP_TYPES.some(allowed => allowed === type);
}
