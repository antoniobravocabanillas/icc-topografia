import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { listPortalResource, PortalResourceError } from "../lib/server/portal-resources";
import { lockTaskMilestone, taskFieldsSchema, taskMutation } from "../lib/server/portal-task-fields";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { billing: prisma.terraqoBillingAccount.findUnique, module: prisma.terraqoWorkspaceModule.findUnique,
    project: prisma.project.findFirst, milestones: prisma.milestone.findMany };
  let enabled = true, visible = true, active = true, locks = 0;
  const token: WorkspacePortalToken = {sub:"actor",workspaceId:"workspace",workspaceSlug:"fixture",role:"ADMIN",iat:1,exp:2};
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({active:enabled})) as unknown as typeof original.module;
  prisma.project.findFirst = (async (args: {where: unknown}) => {
    assert.deepEqual(args.where,{id:"project",terraqoWorkspaceId:"workspace",deletedAt:null}); return visible ? {id:"project"} : null;
  }) as unknown as typeof original.project;
  prisma.milestone.findMany = (async (args: {where: unknown;take: number;cursor?:unknown;skip?:number}) => {
    assert.deepEqual(args.where,{projectId:"project",deletedAt:null,project:{terraqoWorkspaceId:"workspace",deletedAt:null}});
    assert.equal(args.take,31); assert.deepEqual(args.cursor,{id:"cursor"}); assert.equal(args.skip,1);
    return Array.from({length:31},(_,i)=>({id:`milestone-${i}`,title:"Entrega",status:"PENDING",updatedAt:new Date(0)}));
  }) as unknown as typeof original.milestones;
  const tx = {$queryRaw: async (sql: TemplateStringsArray, id: string, project: string, workspace: string) => {
    assert.equal(id,"milestone"); assert.equal(project,"project"); assert.equal(workspace,"workspace");
    assert.ok(sql.join("").includes('m."deletedAt" IS NULL')); assert.ok(sql.join("").includes("FOR SHARE OF m"));
    locks++; return active ? [{id}] : [];
  }} as unknown as Prisma.TransactionClient;
  const rejected = (status: number) => (error: unknown) => error instanceof PortalResourceError && error.status===status;
  try {
    const page = await listPortalResource(token,"taskMilestones","cursor","project");
    assert.equal(page.records.length,30); assert.equal(page.nextCursor,"milestone-29"); assert.equal(page.canCreate,false);
    assert.ok(page.records.every(row=>row.fields.projectId==="project" && !row.editable));
    visible=false; await assert.rejects(listPortalResource(token,"taskMilestones","cursor","project"),rejected(404)); visible=true;
    for(const id of [undefined,"","project?tenant=other","a".repeat(101)])
      await assert.rejects(listPortalResource(token,"taskMilestones","cursor",id),rejected(422));
    for(const role of ["CLIENT","PROFESSIONAL","MEMBER","VIEWER"] as const)
      await assert.rejects(listPortalResource({...token,role},"taskMilestones","cursor","project"),rejected(403));
    enabled=false; await assert.rejects(listPortalResource(token,"taskMilestones","cursor","project"),rejected(403));
    assert.equal(await lockTaskMilestone(tx,"workspace","project","milestone"),true);
    active=false; assert.equal(await lockTaskMilestone(tx,"workspace","project","milestone"),false); assert.equal(locks,2);
    assert.equal(taskMutation(taskFieldsSchema.parse({title:"Entrega",status:"TODO",milestoneId:""})).milestoneId,null);
    assert.ok(!("milestoneId" in taskMutation(taskFieldsSchema.parse({title:"Entrega",status:"TODO"}))));
    assert.throws(()=>taskFieldsSchema.parse({title:"Entrega",status:"TODO",milestoneId:"' OR TRUE"}));
    console.log("PASS milestone options: project/tenant scope, pagination, retired exclusion, role/module rejection, bound relationship locks, explicit clear and legacy omission.");
  } finally {
    prisma.terraqoBillingAccount.findUnique=original.billing; prisma.terraqoWorkspaceModule.findUnique=original.module;
    prisma.project.findFirst=original.project; prisma.milestone.findMany=original.milestones; await prisma.$disconnect();
  }
}
main().catch(()=>{console.error("Task milestone unit validation failed.");process.exitCode=1;});
