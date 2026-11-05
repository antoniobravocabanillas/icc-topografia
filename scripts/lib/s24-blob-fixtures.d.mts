export function s24BlobRun(value: unknown): string;
export type S24Blob = { key: string; bytes: Buffer; sha256: string };
export function s24BlobFixtures(runId: string, mediaVersion?: 1 | 2): [S24Blob, S24Blob][];
