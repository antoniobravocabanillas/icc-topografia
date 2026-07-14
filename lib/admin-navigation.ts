import type { Role } from "@prisma/client";

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
  { group: "Comercial", label: "Leads", href: "/admin/leads", icon: "activity", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Comercial", label: "Oportunidades", href: "/admin/oportunidades", icon: "briefcase", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Comercial", label: "Cotizaciones", href: "/admin/cotizaciones", icon: "receipt", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Comercial", label: "Clientes 360", href: "/admin/clientes", icon: "building", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"] },
  { group: "Comercial", label: "Ventas", href: "/admin/ventas", icon: "chart", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Operacion", label: "Proyectos", href: "/admin/proyectos", icon: "clipboard", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT"] },
  { group: "Operacion", label: "Tecnicos", href: "/admin/tecnicos", icon: "wrench", roles: ["ADMIN", "SUPER_ADMIN", "ENGINEER", "SURVEYOR", "ARCHITECT", "SUPPORT"] },
  { group: "Soporte", label: "Tickets", href: "/admin/tickets", icon: "ticket", roles: ["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Catalogo", label: "Productos", href: "/admin/productos", icon: "package", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN"] },
  { group: "Catalogo", label: "Pedidos", href: "/admin/pedidos", icon: "shopping", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Catalogo", label: "Contenidos", href: "/admin/contenidos", icon: "files", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN"] },
  { group: "Comunicacion", label: "Chat", href: "/admin/chat", icon: "messages", roles: ["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"] },
  { group: "Comunicacion", label: "Chat interno", href: "/admin/chat-interno", icon: "headphones", roles: allRoles },
  { group: "Comunicacion", label: "Chatbot", href: "/admin/chatbot", icon: "bot", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Gestion", label: "Reportes", href: "/admin/reportes", icon: "chart", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Gestion", label: "Notificaciones", href: "/admin/notificaciones", icon: "bell", roles: allRoles },
  { group: "Gestion", label: "Equipo", href: "/admin/equipo", icon: "users", roles: ["ADMIN", "SUPER_ADMIN"] },
  { group: "Terraqo", label: "Workspaces", href: "/admin/terraqo", icon: "workspace", roles: ["SUPER_ADMIN"] },
  { group: "Terraqo", label: "Red profesional", href: "/admin/terraqo/red", icon: "community", roles: ["ADMIN", "SUPER_ADMIN"] },
  { group: "Terraqo", label: "Comunidad", href: "/admin/terraqo/comunidad", icon: "store", roles: ["ADMIN", "SUPER_ADMIN"] }
];

export function getAdminNavigation(role: Role) {
  return adminNavigation.filter((item) => item.roles.includes(role));
}
