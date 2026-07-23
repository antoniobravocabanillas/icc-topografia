import type { Role, TerraqoModuleCode } from "@prisma/client";

export type AdminNavIcon =
  | "activity"
  | "bell"
  | "bot"
  | "briefcase"
  | "building"
  | "chart"
  | "clipboard"
  | "community"
  | "files"
  | "headphones"
  | "home"
  | "messages"
  | "package"
  | "receipt"
  | "shopping"
  | "store"
  | "ticket"
  | "users"
  | "workspace"
  | "wrench";

export type AdminNavItem = {
  group: string;
  label: string;
  href: string;
  icon: AdminNavIcon;
  roles: Role[];
  module?: TerraqoModuleCode;
};

const allRoles: Role[] = [
  "TECHNICIAN",
  "SALES",
  "EDITOR",
  "ADMIN",
  "SUPER_ADMIN",
  "COMMERCIAL_ADMIN",
  "SURVEYOR",
  "ENGINEER",
  "ARCHITECT",
  "SUPPORT"
];

export const allowedAdminRoles = new Set<Role>(allRoles);

export const adminNavigation: AdminNavItem[] = [
  { group: "Workspace", label: "Inicio", href: "/admin", icon: "home", roles: allRoles },
  { group: "Comercial", label: "Leads", href: "/admin/leads", icon: "activity", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "CRM" },
  { group: "Comercial", label: "Oportunidades", href: "/admin/oportunidades", icon: "briefcase", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "CRM" },
  { group: "Comercial", label: "Cotizaciones", href: "/admin/cotizaciones", icon: "receipt", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "CRM" },
  { group: "Comercial", label: "Clientes 360", href: "/admin/clientes", icon: "building", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"], module: "CRM" },
  { group: "Comercial", label: "Ventas", href: "/admin/ventas", icon: "chart", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "CRM" },
  { group: "Operacion", label: "Proyectos", href: "/admin/proyectos", icon: "clipboard", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT"], module: "PROJECTS" },
  { group: "Operacion", label: "Tecnicos", href: "/admin/tecnicos", icon: "wrench", roles: ["ADMIN", "SUPER_ADMIN", "ENGINEER", "SURVEYOR", "ARCHITECT", "SUPPORT"], module: "PROFESSIONAL_NETWORK" },
  { group: "Soporte", label: "Tickets", href: "/admin/tickets", icon: "ticket", roles: ["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "CUSTOMER_CHAT" },
  { group: "Catalogo", label: "Productos", href: "/admin/productos", icon: "package", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN"], module: "TECHNICAL_STORE" },
  { group: "Catalogo", label: "Pedidos", href: "/admin/pedidos", icon: "shopping", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "TECHNICAL_STORE" },
  { group: "Catalogo", label: "Contenidos", href: "/admin/contenidos", icon: "files", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN"], module: "PUBLIC_WEBSITE" },
  { group: "Comunicacion", label: "Chat", href: "/admin/chat", icon: "messages", roles: ["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"], module: "CUSTOMER_CHAT" },
  { group: "Comunicacion", label: "Chat interno", href: "/admin/chat-interno", icon: "headphones", roles: allRoles },
  { group: "Comunicacion", label: "Chatbot", href: "/admin/chatbot", icon: "bot", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "CUSTOMER_CHAT" },
  { group: "Gestion", label: "Reportes", href: "/admin/reportes", icon: "chart", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"], module: "ANALYTICS" },
  { group: "Gestion", label: "Notificaciones", href: "/admin/notificaciones", icon: "bell", roles: allRoles },
  { group: "Gestion", label: "Equipo", href: "/admin/equipo", icon: "users", roles: ["ADMIN", "SUPER_ADMIN"] },
  { group: "Talento", label: "Profesionales", href: "/admin/terraqo/red", icon: "community", roles: ["ADMIN", "SUPER_ADMIN"], module: "PROFESSIONAL_NETWORK" },
  { group: "Talento", label: "Formulario publico", href: "/admin/terraqo/red/formulario", icon: "clipboard", roles: ["ADMIN", "SUPER_ADMIN"], module: "PROFESSIONAL_NETWORK" },
  { group: "Talento", label: "Mensajes profesionales", href: "/admin/terraqo/mensajes", icon: "messages", roles: ["ADMIN", "SUPER_ADMIN"], module: "PROFESSIONAL_MESSAGING" },
  { group: "Talento", label: "Comunidad", href: "/admin/terraqo/comunidad", icon: "store", roles: ["ADMIN", "SUPER_ADMIN"], module: "FORUMS" },
  { group: "Plataforma", label: "Control Terraqo", href: "/admin/terraqo", icon: "workspace", roles: ["SUPER_ADMIN"] },
  { group: "Plataforma", label: "Usuarios y accesos", href: "/admin/terraqo/usuarios", icon: "users", roles: ["SUPER_ADMIN"] },
  { group: "Plataforma", label: "Recorridos", href: "/admin/terraqo/recorridos", icon: "activity", roles: ["SUPER_ADMIN"] }
];

export function getAdminNavigation(role: Role, enabledModules: TerraqoModuleCode[] = []) {
  const enabled = new Set(enabledModules);
  const items = adminNavigation.filter((item) => item.roles.includes(role) && (!item.module || enabled.has(item.module)));
  if (role !== "SUPER_ADMIN") return items;
  return [...items].sort((left, right) => {
    if (left.group === "Plataforma" && right.group !== "Plataforma") return -1;
    if (right.group === "Plataforma" && left.group !== "Plataforma") return 1;
    return 0;
  });
}
