import {loadEnvConfig} from "@next/env";
import {inspectCulqiConfiguration} from "../lib/terraqo/culqi-config";
loadEnvConfig(process.cwd());
const result=inspectCulqiConfiguration(process.env);
console.log(JSON.stringify(result,null,2));
console.log("Configuration inspection only: no payment request was made. Live billing remains unimplemented until account and sandbox verification.");
if(!result.configured)process.exitCode=1;
