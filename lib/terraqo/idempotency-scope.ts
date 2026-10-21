type WorkspaceReplay = {
  workspaceId: string;
  operationFingerprint: string;
};

type WorkspaceResourceReplay = WorkspaceReplay & {
  resourceId: string;
};

export function isWorkspaceReplay(
  replay: WorkspaceReplay,
  expected: WorkspaceReplay,
) {
  return replay.workspaceId === expected.workspaceId
    && replay.operationFingerprint === expected.operationFingerprint;
}

export function isWorkspaceResourceReplay(
  replay: WorkspaceResourceReplay,
  expected: WorkspaceResourceReplay,
) {
  return isWorkspaceReplay(replay, expected)
    && replay.resourceId === expected.resourceId;
}
