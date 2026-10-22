import { validatePlatformStagingEnvironment } from "./lib/platform-staging-environment";

try {
  const target = validatePlatformStagingEnvironment(process.env);
  const resource = target.resourceName ? `; resource=${target.resourceName}` : "";
  const projectRef = target.supabaseProjectRef ? `; projectRef=${target.supabaseProjectRef}` : "";
  console.log(
    `Platform staging preflight: OK (provider=${target.databaseProvider}; app=${target.applicationHost}; db=${target.databaseHost}/${target.databaseName}; remote=${target.remoteDatabase}${resource}${projectRef}).`,
  );
  console.log("No se abrio ninguna conexion ni se imprimieron credenciales.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
