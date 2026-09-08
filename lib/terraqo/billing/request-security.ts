import "server-only";
import { prisma } from "@/lib/prisma";
import { BillingError } from "./provider";

export async function boundedJson(request:Request,maxBytes=12000):Promise<unknown>{
  const length=Number(request.headers.get("content-length")||0);
  if(length>maxBytes)throw new BillingError("REQUEST_TOO_LARGE",413);
  const reader=request.body?.getReader();if(!reader)throw new BillingError("INVALID_JSON",400);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new BillingError("REQUEST_TOO_LARGE",413);}chunks.push(value);}}finally{reader.releaseLock();}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(body));}catch{throw new BillingError("INVALID_JSON",400);}
}

export async function billingRateLimit(userId:string){
  const key={ownerKey:`user:${userId}`,period:`hour:${new Date().toISOString().slice(0,13)}`,metric:"billing-request"};
  await prisma.$transaction(async tx=>{
    await tx.terraqoUsageBucket.createMany({data:[key],skipDuplicates:true});
    const claimed=await tx.terraqoUsageBucket.updateMany({where:{...key,used:{lt:60}},data:{used:{increment:1}}});
    if(!claimed.count)throw new BillingError("RATE_LIMITED",429);
  },{maxWait:15000,timeout:10000});
}
