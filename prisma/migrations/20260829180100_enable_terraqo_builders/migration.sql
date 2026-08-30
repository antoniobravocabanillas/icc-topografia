INSERT INTO "icc"."TerraqoWorkspaceModule" ("id", "workspaceId", "code", "active", "enabledAt", "createdAt", "updatedAt")
SELECT concat('builders_', substr(md5(random()::text || clock_timestamp()::text), 1, 16)), w."id", 'BUILDERS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "icc"."TerraqoWorkspace" w
ON CONFLICT ("workspaceId", "code") DO UPDATE SET
  "active" = true,
  "enabledAt" = CURRENT_TIMESTAMP,
  "disabledAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;
