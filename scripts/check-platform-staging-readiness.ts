import { validatePlatformStagingEnvironment } from "./lib/platform-staging-environment";

try {
  const target = validatePlatformStagingEnvironment(process.env);
  console.log(
    `Platform staging preflight: OK (app=${target.applicationHost}; db=${target.databaseHost}/${target.databaseName}; remote=${target.remoteDatabase}).`,
  );
  console.log("No se abrio ninguna conexion ni se imprimieron credenciales.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
