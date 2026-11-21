import { validatePrivateProfessionalFile } from "./professional-file-validation";
import { validatePrivateProfessionalOfficeFile } from "./professional-office-file-validation";

/** Format validation only. Files remain private and are never executed. */
export async function validateProfessionalCvFile(file: File) {
  if (file.size < 1 || file.size > 10485760) return "El CV debe contener datos y pesar como máximo 10 MB.";
  if (file.type === "application/pdf") return validatePrivateProfessionalFile(file);
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return validatePrivateProfessionalOfficeFile(file);
  return "Usa un CV en PDF o DOCX. Si tienes un archivo DOC, guárdalo como PDF o DOCX.";
}
