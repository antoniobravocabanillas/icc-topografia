export const professionalCategories = [
  "Topografia y geodesia",
  "Ingenieria y construccion",
  "Arquitectura y diseno",
  "BIM, CAD y modelado digital",
  "GIS, cartografia y datos territoriales",
  "Drones, fotogrametria y teledeteccion",
  "Mineria, energia e industria",
  "Seguridad, calidad y medio ambiente",
  "Tecnologia, datos y software",
  "Operaciones y logistica",
  "Administracion, finanzas y legal",
  "Comercial, compras y atencion al cliente",
  "Comunicacion, marketing y contenidos",
  "Tecnicos, operadores y oficios especializados",
  "Practicas y primeros empleos",
  "Otra especialidad profesional"
] as const;

export type ProfessionalCategory = (typeof professionalCategories)[number];

export type ProfessionalTaxonomy = {
  category: ProfessionalCategory;
  equipment: string[];
  software: string[];
};

const taxonomyOptions: Record<ProfessionalCategory, Omit<ProfessionalTaxonomy, "category">> = {
  "Topografia y geodesia": {
    equipment: ["Estacion total", "GNSS RTK", "Nivel digital", "Nivel automatico", "Escaner laser 3D", "Drone RTK o PPK", "Ecosonda", "Distanciometro laser"],
    software: ["AutoCAD Civil 3D", "AutoCAD", "Leica Infinity", "Trimble Business Center", "Topcon Tools", "Magnet Office", "QGIS", "ArcGIS Pro", "Pix4Dmapper", "Agisoft Metashape"]
  },
  "Ingenieria y construccion": {
    equipment: ["Nivel automatico", "Estacion total", "Esclerometro", "Detector de servicios", "Medidor laser", "Equipos de laboratorio de suelos", "Equipos de seguridad en obra"],
    software: ["AutoCAD", "Civil 3D", "Revit", "Navisworks", "Microsoft Project", "Primavera P6", "S10", "ETABS", "SAP2000", "CYPE"]
  },
  "Arquitectura y diseno": {
    equipment: ["Medidor laser", "Escaner 3D", "Camara profesional", "Tableta grafica", "Visor de realidad virtual"],
    software: ["AutoCAD", "Revit", "SketchUp", "Archicad", "Rhino", "3ds Max", "Lumion", "Enscape", "V-Ray", "Adobe Creative Cloud"]
  },
  "BIM, CAD y modelado digital": {
    equipment: ["Escaner laser 3D", "Estacion total", "Visor de realidad virtual", "Workstation grafica", "Tableta grafica"],
    software: ["Revit", "Navisworks", "Civil 3D", "AutoCAD", "BIM 360", "Autodesk Construction Cloud", "Tekla Structures", "Synchro 4D", "Recap Pro", "Dynamo"]
  },
  "GIS, cartografia y datos territoriales": {
    equipment: ["GNSS de precision", "GPS de mano", "Drone RTK o PPK", "Tableta de campo", "Estacion total", "Servidor geoespacial"],
    software: ["ArcGIS Pro", "ArcGIS Online", "QGIS", "Google Earth Engine", "PostGIS", "GeoServer", "FME", "Global Mapper", "ENVI", "AutoCAD Map 3D"]
  },
  "Drones, fotogrametria y teledeteccion": {
    equipment: ["Drone multirrotor", "Drone ala fija", "Drone RTK o PPK", "Sensor LiDAR UAV", "Camara multiespectral", "Camara termica", "GNSS base", "Baterias y estacion de carga"],
    software: ["Pix4Dmapper", "Pix4Dsurvey", "Agisoft Metashape", "DJI Terra", "UgCS", "Global Mapper", "CloudCompare", "RealityCapture", "ArcGIS Pro", "QGIS"]
  },
  "Mineria, energia e industria": {
    equipment: ["GNSS RTK", "Estacion total robotica", "Escaner laser 3D", "Drone industrial", "Camara termica", "Detector de gases", "Equipos de monitoreo geotecnico"],
    software: ["Datamine", "Surpac", "Vulcan", "MinePlan", "Leapfrog Geo", "AutoCAD Civil 3D", "CloudCompare", "ArcGIS Pro", "Power BI", "SAP"]
  },
  "Seguridad, calidad y medio ambiente": {
    equipment: ["Detector de gases", "Sonometro", "Luxometro", "Medidor de particulas", "Camara termica", "Equipos de muestreo ambiental", "Equipos de proteccion personal"],
    software: ["Power BI", "Excel", "iAuditor", "SafetyCulture", "SAP EHS", "ArcGIS Pro", "QGIS", "Microsoft Project", "Minitab"]
  },
  "Tecnologia, datos y software": {
    equipment: ["Servidores", "Workstation", "Dispositivos de red", "Equipos IoT", "Tableta de pruebas", "Kit de electronica"],
    software: ["Visual Studio Code", "GitHub", "Docker", "PostgreSQL", "Power BI", "Python", "JavaScript o TypeScript", "Figma", "AWS", "Microsoft Azure", "Google Cloud"]
  },
  "Operaciones y logistica": {
    equipment: ["Radio de comunicacion", "GPS vehicular", "Lector de codigo de barras", "Terminal movil", "Equipos de almacen", "Vehiculo operativo"],
    software: ["SAP", "Odoo", "Microsoft Dynamics", "Excel", "Power BI", "Trello", "Asana", "Microsoft Project", "Sistemas WMS", "Sistemas TMS"]
  },
  "Administracion, finanzas y legal": {
    equipment: ["Equipo de oficina", "Escaner documental", "Firma digital", "Terminal de pagos"],
    software: ["Excel", "Power BI", "SAP", "Odoo", "CONCAR", "SISCONT", "Microsoft 365", "Google Workspace", "Notion", "Sistemas SUNAT"]
  },
  "Comercial, compras y atencion al cliente": {
    equipment: ["Telefono corporativo", "Radio de comunicacion", "Terminal movil", "Equipo de videoconferencia"],
    software: ["HubSpot", "Salesforce", "Zoho CRM", "Odoo", "WhatsApp Business", "Power BI", "Excel", "Microsoft 365", "Google Workspace", "LinkedIn Sales Navigator"]
  },
  "Comunicacion, marketing y contenidos": {
    equipment: ["Camara fotografica", "Camara de video", "Drone audiovisual", "Microfono", "Iluminacion", "Estabilizador", "Tableta grafica"],
    software: ["Adobe Photoshop", "Adobe Illustrator", "Adobe Premiere Pro", "Adobe After Effects", "Figma", "Canva", "DaVinci Resolve", "WordPress", "Google Analytics", "Meta Business Suite"]
  },
  "Tecnicos, operadores y oficios especializados": {
    equipment: ["Herramientas manuales", "Herramientas electricas", "Equipos de soldadura", "Equipos de medicion", "Maquinaria pesada", "Equipos de izaje", "Equipos de proteccion personal"],
    software: ["AutoCAD", "Excel", "Aplicaciones de mantenimiento", "Sistemas CMMS", "SAP PM", "Aplicaciones de reporte en campo"]
  },
  "Practicas y primeros empleos": {
    equipment: ["Equipo de oficina", "Instrumentos de campo basicos", "Tableta de campo", "Camara", "Herramientas de laboratorio"],
    software: ["Microsoft 365", "Google Workspace", "Excel", "AutoCAD", "QGIS", "Power BI", "Canva", "Visual Studio Code", "Notion"]
  },
  "Otra especialidad profesional": {
    equipment: ["Equipo de oficina", "Instrumentos de medicion", "Herramientas de campo", "Equipos audiovisuales", "Maquinaria especializada", "Equipos de laboratorio"],
    software: ["Microsoft 365", "Google Workspace", "Excel", "Power BI", "AutoCAD", "QGIS", "Adobe Creative Cloud", "Software ERP", "Software CRM"]
  }
};

export const professionalTaxonomies: ProfessionalTaxonomy[] = professionalCategories.map((category) => ({
  category,
  ...taxonomyOptions[category]
}));

export function getProfessionalTaxonomy(category: ProfessionalCategory) {
  return professionalTaxonomies.find((taxonomy) => taxonomy.category === category);
}

export const professionalTermsVersion = "terraqo-professional-network-2026-07";
