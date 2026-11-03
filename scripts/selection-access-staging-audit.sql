-- Read-only catalog audit. Run only against confirmed Terraqo Platform Staging.
SELECT jsonb_build_object(
  'newTablePresent', to_regclass('icc."TerraqoSelectionAccessRequest"') IS NOT NULL,
  'migrationApplied', EXISTS (SELECT 1 FROM icc._prisma_migrations WHERE migration_name='20261102000100_selection_access_requests' AND finished_at IS NOT NULL AND rolled_back_at IS NULL),
  'roles', (SELECT jsonb_agg(jsonb_build_object(
    'name', rolname, 'superuser', rolsuper, 'bypassRls', rolbypassrls,
    'schemaUsage', has_schema_privilege(oid,'icc','USAGE'),
    'schemaCreate', has_schema_privilege(oid,'icc','CREATE'),
    'tablePrivileges', CASE WHEN to_regclass('icc."TerraqoSelectionAccessRequest"') IS NULL THEN NULL ELSE
      (SELECT jsonb_agg(p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
       WHERE has_table_privilege(oid,to_regclass('icc."TerraqoSelectionAccessRequest"'),p)) END
  )) FROM pg_roles WHERE rolname IN ('terraqo_staging_runtime','terraqo_staging_migrator','anon','authenticated','service_role')),
  'defaultTableGrants', (SELECT jsonb_agg(jsonb_build_object(
    'owner', pg_get_userbyid(d.defaclrole),
    'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'privilege', a.privilege_type
  )) FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
     WHERE d.defaclobjtype='r' AND (n.nspname='icc' OR d.defaclnamespace=0))
) AS audit;
