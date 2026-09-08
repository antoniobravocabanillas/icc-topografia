import {loadEnvConfig} from "@next/env";
loadEnvConfig(process.cwd());
async function main(){
  const {provisionSandboxPlans}=await import("../lib/terraqo/billing/plan-provisioning");
  console.log(JSON.stringify(await provisionSandboxPlans(),null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Sandbox provisioning failed");process.exitCode=1;});
