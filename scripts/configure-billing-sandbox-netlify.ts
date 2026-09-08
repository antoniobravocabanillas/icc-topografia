import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
loadEnvConfig(process.cwd());
const require=createRequire(import.meta.url);
if(process.env.CULQI_MODE!=="test"||!process.env.CULQI_PUBLIC_KEY?.startsWith("pk_test_")||!process.env.CULQI_SECRET_KEY?.startsWith("sk_test_"))throw new Error("Sandbox configuration required");
const variables:Record<string,string>={CULQI_MODE:"test",CULQI_PUBLIC_KEY:process.env.CULQI_PUBLIC_KEY,CULQI_SECRET_KEY:process.env.CULQI_SECRET_KEY,BILLING_LIVE_ENABLED:"false",BILLING_RECONCILE_SECRET:process.env.BILLING_RECONCILE_SECRET||randomBytes(32).toString("hex")};
const cli=process.env.NETLIFY_CLI_PATH||require.resolve("netlify-cli/bin/run.js");
for(const [key,value] of Object.entries(variables)){
  try{
    execFileSync(process.execPath,[cli,"env:set",key,value,"--context","production","--scope","functions","--site","2d38524a-44f9-4473-8a1f-9270e03bc2bf",...(key.includes("SECRET")?["--secret"]:[])],{stdio:"pipe",timeout:60000});
    console.log(`${key}: configured (value withheld)`);
  }catch{console.error(`${key}: configuration failed. No further variables changed.`);process.exit(1);}
}
