export const demoScenarios = {
  worklog: {label:"Bitácora publicada",condition:"La evidencia está completa",action:"Solicitar revisión al responsable",log:"Solicitud de revisión registrada"},
  project: {label:"Tarea con fecha vencida",condition:"La tarea sigue pendiente",action:"Notificar al responsable del proyecto",log:"Recordatorio registrado en el proyecto"},
  profile: {label:"Perfil actualizado",condition:"El correo está verificado",action:"Invitar a completar la experiencia",log:"Invitación incluida en el seguimiento"},
} as const;
export type DemoScenario = keyof typeof demoScenarios;
export function simulateAutomation(scenario:DemoScenario, conditionMet:boolean) {
  const flow=demoScenarios[scenario];
  return [{title:"Evento recibido",detail:flow.label},{title:"Condición evaluada",detail:conditionMet?flow.condition:"La condición no se cumple. El flujo se detiene aquí."},...(conditionMet?[{title:"Acción simulada",detail:flow.action},{title:"Registro simulado",detail:flow.log}]:[])];
}
