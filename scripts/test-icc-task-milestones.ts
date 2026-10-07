import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

type RecordDto = {id:string;updatedAt:string;fields:Record<string,string>};
let phase="fixture";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,
    companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const run=randomUUID(), email=`task-milestones-${run}@example.test`, password=randomBytes(24).toString("hex");
  const ids=[`000-task-parent-${run}`,`000-task-other-${run}`], milestoneId=`000-task-delivery-${run}`, otherId=`000-task-foreign-${run}`, retiredId=`000-task-retired-${run}`;
  const user=await prisma.user.create({data:{email,name:"Prueba hitos de tareas",role:"CUSTOMER",emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),
    terraqoMemberships:{create:{workspaceId:workspace.id,role:"ADMIN",active:true}}},select:{id:true}});
  let bearer:string|undefined;
  const request=(path:string,body?:unknown,key?:string)=>fetch(`https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/${path}`,{
    method:body?"POST":"GET",headers:{"content-type":"application/json",...(bearer?{authorization:`Bearer ${bearer}`}:{ }),...(key?{"Idempotency-Key":key}:{})},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000),redirect:"error"});
  const save=async(fields:Record<string,string>,key:string,record?:RecordDto,expected=200)=>{
    const response=await request("resources/tasks",{fields,...(record?{id:record.id,version:record.updatedAt}:{})},key);
    assert.equal(response.status,expected,`Task command: expected ${expected}`);
    return expected===200?(await response.json()).data.record as RecordDto:null;
  };
  try {
    for(const id of ids) await prisma.project.create({data:{id,slug:id,terraqoWorkspaceId:workspace.id,title:"Proyecto temporal de hitos",summary:"Validación",description:"",servicesApplied:[],isPublic:false}});
    for(const [id,projectId,deletedAt] of [[milestoneId,ids[0],null],[otherId,ids[1],null],[retiredId,ids[0],new Date()]] as const)
      await prisma.milestone.create({data:{id,projectId,title:"Entrega temporal",status:"PENDING",deletedAt}});
    phase="login"; const login=await request("login",{email,password}); assert.equal(login.status,200); bearer=(await login.json()).data.token; assert.ok(bearer);
    phase="scoped options";
    let response=await request(`resources/taskMilestones?projectId=${ids[0]}`); assert.equal(response.status,200);
    const options=(await response.json()).data.records as RecordDto[];
    assert.ok(options.some(item=>item.id===milestoneId)); assert.ok(!options.some(item=>[otherId,retiredId].includes(item.id)));
    response=await request("resources/taskMilestones"); assert.equal(response.status,422);
    response=await request(`resources/taskMilestones?projectId=missing-${run}`); assert.equal(response.status,404);
    phase="idempotent create";
    const fields={projectId:ids[0],title:"Tarea vinculada de prueba",description:"Validación temporal",status:"TODO",milestoneId};
    const key=randomBytes(16).toString("hex");
    const results=await Promise.all(Array.from({length:3},()=>save(fields,key)));
    const record=results[0]!; assert.ok(results.every(item=>item?.id===record.id)); assert.equal(record.fields.milestoneName,"Entrega temporal");
    assert.equal(record.fields.projectId,ids[0]); assert.equal(record.fields.milestoneId,milestoneId);
    assert.equal(await prisma.task.count({where:{projectId:ids[0]}}),1);
    assert.equal(await prisma.activityLog.count({where:{actorId:user.id,taskId:record.id,action:"CREATED"}}),1);
    await save({...fields,milestoneId:otherId},key,undefined,409);
    phase="invalid relationship";
    for(const invalid of [otherId,retiredId,`missing-${run}`]) await save({...fields,milestoneId:invalid},randomBytes(16).toString("hex"),undefined,422);
    const {projectId:_projectId,...edit}=fields; void _projectId;
    await save({...edit,milestoneId:otherId},randomBytes(16).toString("hex"),record,422);
    assert.equal((await prisma.task.findUniqueOrThrow({where:{id:record.id},select:{milestoneId:true}})).milestoneId,milestoneId);
    phase="clear and stale guard";
    const cleared=(await save({...edit,milestoneId:""},randomBytes(16).toString("hex"),record))!;
    assert.equal(cleared.fields.milestoneId,"");
    await save(edit,randomBytes(16).toString("hex"),record,409);
    const linked=(await save(edit,randomBytes(16).toString("hex"),cleared))!;
    phase="historical relationship";
    await prisma.milestone.update({where:{id:milestoneId},data:{deletedAt:new Date()}});
    const historical=(await save({...edit,title:"Tarea histórica revisada"},randomBytes(16).toString("hex"),linked))!;
    assert.equal(historical.fields.milestoneName,"Hito retirado"); assert.equal(historical.fields.milestoneId,milestoneId);
    phase="membership revocation";
    await prisma.terraqoWorkspaceMember.updateMany({where:{userId:user.id,workspaceId:workspace.id},data:{role:"VIEWER"}});
    response=await request(`resources/taskMilestones?projectId=${ids[0]}`); assert.ok([401,403].includes(response.status));
    console.log("PASS deployed task milestones: scoped choices, concurrent idempotency, wrong parent/retired rejection, clear/relink, stale guard, historical link and role revocation.");
  } finally {
    await prisma.activityLog.deleteMany({where:{actorId:user.id,terraqoWorkspaceId:workspace.id,projectId:{in:ids}}});
    await prisma.project.deleteMany({where:{id:{in:ids},terraqoWorkspaceId:workspace.id}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});
    console.log("CLEANUP: own temporary projects, milestones, task, audit, membership, user and session grants removed.");
  }
}
main().catch(error=>{console.error(`Task milestone phase: ${phase}`);console.error(error instanceof assert.AssertionError?error.message:"Private diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
