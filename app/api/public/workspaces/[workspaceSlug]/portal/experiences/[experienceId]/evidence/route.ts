import { fail, handleApiError, ok } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { listPortalExperienceEvidence, uploadPortalExperienceEvidence, PortalExperienceEvidenceError } from "@/lib/server/portal-experience-evidence";
import { ExperiencePayloadError } from "@/lib/server/native-experience-evidence-payload";
import { BillingError } from "@/lib/terraqo/billing/provider";
type Context={params:Promise<{workspaceSlug:string;experienceId:string}>};
async function handle(request:Request,context:Context,write:boolean){
  try{
    const {workspaceSlug,experienceId}=await context.params;
    const token=await getWorkspacePortalToken(request,workspaceSlug);
    if(!token)return fail("La sesión no es válida.",401);
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(experienceId))return fail("Experiencia no disponible.",404);
    const operationKey=new URL(request.url).searchParams.get("operationKey")??undefined;
    if(operationKey && !/^[a-f0-9]{32}$/.test(operationKey))return fail("Operación no válida.",422);
    const result=write?await uploadPortalExperienceEvidence(request,token,experienceId):await listPortalExperienceEvidence(token,experienceId,operationKey);
    return ok(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){if(error instanceof PortalExperienceEvidenceError || error instanceof ExperiencePayloadError )return fail(error.message,error.status);if(error instanceof BillingError)return handleApiError(error);return fail("No pudimos confirmar el resultado. Consulta la experiencia antes de repetir la operación.",500);}
}
export function GET(request:Request,context:Context){return handle(request,context,false);}
export function POST(request:Request,context:Context){return handle(request,context,true);}
