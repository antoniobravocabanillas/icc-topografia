import {loadEnvConfig} from "@next/env";
import {PrismaClient} from "@prisma/client";
import {readFileSync} from "node:fs";
loadEnvConfig(process.cwd());const db=new PrismaClient();
async function main(){
 const rows=await db.$queryRaw<{name:string}[]>`SELECT tablename AS name FROM pg_tables WHERE schemaname='icc' AND tablename LIKE 'TerraqoComplaint%'`;
 if(rows.length===3){console.log("Complaints tables already present; no change.");return;}
 if(rows.length)throw new Error("Partial schema: manual review required");
 const sql=readFileSync("prisma/migrations/20260909120000_terraqo_complaints/migration.sql","utf8");
 await db.$transaction(async tx=>{for(const statement of sql.split(";").map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);},{timeout:30000});
 console.log("Applied three new complaints tables. No existing records changed.");
}
main().catch(()=>{console.error("Migration failed; transaction rolled back.");process.exitCode=1;}).finally(()=>db.$disconnect());
