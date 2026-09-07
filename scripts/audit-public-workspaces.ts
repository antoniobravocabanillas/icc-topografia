import {loadEnvConfig} from "@next/env";
loadEnvConfig(process.cwd());
async function main(){
 const {prisma}=await import("../lib/prisma");
 try{console.log(JSON.stringify(await prisma.terraqoWorkspace.findMany({where:{active:true,deletedAt:null},select:{slug:true,name:true,publicSlug:true}})));}finally{await prisma.$disconnect();}
}
main().catch(()=>{console.error("Workspace lookup unavailable");process.exitCode=1;});
