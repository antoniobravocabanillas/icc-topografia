import {loadEnvConfig} from "@next/env";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import {readFileSync} from "node:fs";
loadEnvConfig(process.cwd());const db=new PrismaClient();
async function main(){
 if(process.env.CULQI_MODE!=="test")throw new Error("Sandbox only");
 const source=process.argv[2];if(!source)throw new Error("Private credential file required");
 const data=JSON.parse(readFileSync(source,"utf8")) as {email:string;password:string};
 if(data.email!=="culqi.revision@vrilla.solutions"||data.password.length<24)throw new Error("Invalid review fixture");
 if(await db.user.findUnique({where:{email:data.email}}))throw new Error("Review user already exists; no credentials overwritten");
 await db.user.create({data:{name:"Revisión Culqi · Terraqo",email:data.email,passwordHash:await bcrypt.hash(data.password,12),role:"CUSTOMER",emailVerified:new Date(),terraqoProfessionalProfile:{create:{planTier:"FREE",liveCvEnabled:false,friendDiscoveryEnabled:false}}}});
 console.log("Created private, non-administrative review account. No payment or company membership created.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
