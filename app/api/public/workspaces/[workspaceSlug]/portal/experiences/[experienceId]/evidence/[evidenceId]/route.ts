import { fail, handleApiError } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { downloadPortalExperienceEvidence, PortalExperienceEvidenceError } from "@/lib/server/portal-experience-evidence";
type Context={params:Promise<{workspaceSlug:string;experienceId:string;evidenceId:string}>};
export async function GET(request:Request,context:Context){
  try{
    const {workspaceSlug,experienceId,evidenceId}=await context.params;
    const token=await getWorkspacePortalToken(request,workspaceSlug);
    if(!token)return fail("La sesión no es válida.",401);
    if(![experienceId,evidenceId].every(id=>/^[a-zA-Z0-9_-]{1,100}$/.test(id)))return fail("Evidencia no disponible.",404);
    return await downloadPortalExperienceEvidence(token,experienceId,evidenceId);
  }catch(error){if(error instanceof PortalExperienceEvidenceError)return fail(error.message,error.status);return handleApiError(error);}
}
