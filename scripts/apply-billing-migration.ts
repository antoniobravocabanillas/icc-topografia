import {loadEnvConfig} from "@next/env";
import {PrismaClient} from "@prisma/client";
import {readFileSync} from "node:fs";
loadEnvConfig(process.cwd());
const db=new PrismaClient();
async function main(){
  const tables=await db.$queryRaw<{name:string}[]>`SELECT tablename AS name FROM pg_tables WHERE schemaname='icc' AND (tablename LIKE 'TerraqoBilling%' OR tablename='TerraqoUsageBucket')`;
  if(tables.length){console.log(`Found ${tables.length} billing tables. No changes applied.`);return;}
  const sql=readFileSync("prisma/migrations/20260907190000_terraqo_billing/migration.sql","utf8");
  // Execute only this additive, reviewed migration; never apply unrelated pending migrations.
  await db.$transaction(async tx=>{for(const statement of sql.split(";").map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);},{timeout:30000});
  console.log("Applied six new platform billing tables, indexes, foreign keys and checks. No existing records modified.");
}
main().catch(()=>{console.error("Billing migration failed; transaction rolled back.");process.exitCode=1;}).finally(()=>db.$disconnect());
