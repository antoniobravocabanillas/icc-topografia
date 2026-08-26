export const companyIndustries = [
  "Agroindustria y alimentos", "Arquitectura y diseño", "Comercio y distribución",
  "Construcción e infraestructura", "Consultoría y servicios profesionales", "Educación",
  "Energía y utilities", "Industria y manufactura", "Logística y transporte", "Minería",
  "Real estate e inmobiliaria", "Salud", "Servicios públicos", "Tecnología y telecomunicaciones",
  "Turismo y hospitalidad", "Otro rubro"
] as const;

const leadershipAndManagement = [
  "CEO / Director ejecutivo", "Gerente general", "Director de operaciones", "Gerente de operaciones",
  "COO / Chief Operating Officer", "Director de proyectos", "Gerente de proyectos", "Project manager",
  "Jefe de proyecto", "PMO / Oficina de proyectos", "Gerente de administración", "Administrador",
  "Gerente de recursos humanos", "Jefe de recursos humanos", "Business manager", "Consultor de gestión"
];

const financeAndLegal = [
  "CFO / Director financiero", "Gerente de finanzas", "Jefe de finanzas", "Analista financiero",
  "Especialista en finanzas", "Contador", "Contador público", "Auditor", "Auditor interno",
  "Tesorero", "Analista de tesorería", "Analista contable", "Asistente contable", "Controller financiero",
  "Especialista en costos y presupuestos", "Analista de créditos y cobranzas", "Economista",
  "Administrador bancario", "Especialista tributario", "Abogado", "Asesor legal", "Gerente legal",
  "Especialista en compliance", "Oficial de cumplimiento", "Notario", "Procurador"
];

const commercialAndCommunication = [
  "Director comercial", "Gerente comercial", "Jefe de ventas", "Ejecutivo de ventas", "Asesor comercial",
  "Representante de ventas", "Key account manager", "Business development manager", "Analista comercial",
  "Gerente de compras", "Jefe de compras", "Comprador", "Especialista en contrataciones",
  "Gerente de marketing", "Jefe de marketing", "Profesional de marketing", "Especialista en marketing digital",
  "Brand manager", "Community manager", "Comunicador", "Periodista", "Relacionista público",
  "Publicista", "Creador de contenidos", "Diseñador gráfico", "Diseñador UX/UI", "Fotógrafo", "Productor audiovisual"
];

const technologyAndData = [
  "CTO / Director de tecnología", "Gerente de tecnología", "Jefe de sistemas", "Ingeniero de sistemas",
  "Ingeniero de software", "Desarrollador de software", "Desarrollador web", "Desarrollador móvil",
  "Arquitecto de software", "DevOps engineer", "Cloud engineer", "Administrador de redes",
  "Administrador de base de datos", "Especialista en ciberseguridad", "Soporte técnico TI",
  "Product manager", "Product owner", "Scrum master", "QA / Analista de calidad de software",
  "Analista funcional", "Analista de negocio", "Analista de datos", "Data scientist", "Data engineer",
  "Especialista en inteligencia artificial", "Especialista BI / Business Intelligence"
];

const engineeringAndBuiltEnvironment = [
  "Arquitecto", "Urbanista", "Ingeniero civil", "Ingeniero estructural", "Ingeniero geotécnico",
  "Ingeniero hidráulico", "Ingeniero sanitario", "Ingeniero ambiental", "Ingeniero industrial",
  "Ingeniero mecánico", "Ingeniero electricista", "Ingeniero electrónico", "Ingeniero mecatrónico",
  "Ingeniero químico", "Ingeniero de materiales", "Ingeniero de telecomunicaciones", "Ingeniero agrícola",
  "Ingeniero agrónomo", "Ingeniero forestal", "Ingeniero geógrafo", "Ingeniero geólogo", "Geólogo",
  "Ingeniero de minas", "Ingeniero metalurgista", "Ingeniero de petróleo", "Ingeniero de energía",
  "Ingeniero de seguridad", "Ingeniero de calidad", "Residente de obra", "Supervisor de obra",
  "Jefe de obra", "Inspector de obra", "Metrador", "Especialista en costos y presupuestos de obra",
  "Especialista BIM", "BIM manager", "Modelador BIM", "Dibujante CAD", "Topógrafo", "Geodesta",
  "Especialista GIS", "Cartógrafo", "Fotogrametrista", "Piloto de drones", "Especialista LiDAR"
];

const operationsAndSustainability = [
  "Gerente de logística", "Jefe de logística", "Analista logístico", "Coordinador logístico",
  "Gerente de cadena de suministro", "Supply chain manager", "Jefe de almacén", "Supervisor de almacén",
  "Especialista en comercio exterior", "Agente de aduanas", "Planificador de producción",
  "Gerente de mantenimiento", "Jefe de mantenimiento", "Planificador de mantenimiento",
  "Supervisor de operaciones", "Coordinador de operaciones", "Especialista HSE / SSOMA",
  "Prevencionista de riesgos", "Supervisor de seguridad", "Especialista ambiental",
  "Especialista ESG / Sostenibilidad", "Gestor de calidad", "Auditor de calidad", "Técnico de campo"
];

const peopleHealthEducationAndSocial = [
  "Psicólogo organizacional", "Psicólogo", "Trabajador social", "Sociólogo", "Antropólogo",
  "Reclutador", "Especialista en selección", "Especialista en capacitación", "Analista de recursos humanos",
  "Médico", "Médico ocupacional", "Enfermero", "Enfermero ocupacional", "Odontólogo", "Nutricionista",
  "Químico farmacéutico", "Tecnólogo médico", "Fisioterapeuta", "Terapeuta ocupacional",
  "Docente", "Profesor", "Catedrático", "Investigador", "Coordinador académico", "Director académico",
  "Especialista en educación", "Historiador", "Politólogo", "Gestor público", "Administrador público"
];

const technicalTradesAndServices = [
  "Técnico electricista", "Técnico electrónico", "Técnico mecánico", "Técnico mecatrónico",
  "Técnico de mantenimiento", "Técnico de laboratorio", "Técnico en construcción", "Técnico topógrafo",
  "Técnico de telecomunicaciones", "Técnico de redes", "Técnico de seguridad", "Operador de maquinaria",
  "Operador de planta", "Operador minero", "Conductor profesional", "Soldador", "Mecánico",
  "Electricista", "Gasfitero", "Carpintero", "Albañil", "Maestro de obra", "Instalador",
  "Chef", "Administrador hotelero", "Guía de turismo", "Traductor", "Intérprete", "Asistente administrativo",
  "Secretario ejecutivo", "Recepcionista", "Servicio al cliente", "Emprendedor / Empresario",
  "Estudiante / Practicante", "Profesional independiente", "Otro perfil profesional"
];

export const professionalRoles = [
  ...leadershipAndManagement, ...financeAndLegal, ...commercialAndCommunication,
  ...technologyAndData, ...engineeringAndBuiltEnvironment, ...operationsAndSustainability,
  ...peopleHealthEducationAndSocial, ...technicalTradesAndServices
] as const;
