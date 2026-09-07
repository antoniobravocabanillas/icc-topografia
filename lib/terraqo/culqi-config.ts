import {z} from "zod";

// This module is configuration only. It never creates a charge or enables a plan.
// Live activation also requires verified account capabilities and sandbox acceptance.
const culqiSchema=z.object({
  CULQI_MODE:z.enum(["test","live"]).default("test"),
  CULQI_PUBLIC_KEY:z.string().regex(/^pk_(test|live)_[A-Za-z0-9]+$/),
  CULQI_SECRET_KEY:z.string().regex(/^sk_(test|live)_[A-Za-z0-9]+$/),
  CULQI_PROFESSIONAL_PLAN_ID:z.string().regex(/^pln_(test|live)_[A-Za-z0-9]+$/),
  CULQI_WORKSPACE_PLAN_ID:z.string().regex(/^pln_(test|live)_[A-Za-z0-9]+$/),
}).superRefine((config,context)=>{
  for(const field of ["CULQI_PUBLIC_KEY","CULQI_SECRET_KEY","CULQI_PROFESSIONAL_PLAN_ID","CULQI_WORKSPACE_PLAN_ID"] as const){
    if(!config[field].includes(`_${config.CULQI_MODE}_`))context.addIssue({code:"custom",path:[field],message:"Environment mismatch"});
  }
});
export function inspectCulqiConfiguration(env:Record<string,string|undefined>){
 const result=culqiSchema.safeParse(env);
 if(!result.success)return {configured:false as const,mode:env.CULQI_MODE||"test",issues:[...new Set(result.error.issues.map(issue=>String(issue.path[0])))]};
 return {configured:true as const,mode:result.data.CULQI_MODE,issues:[]};
}
