import {
  CORPORATE_PARENT,
  DIGITAL_SIGNATURE,
  ENGINEERING_DIVISION,
  PRODUCT_BRAND,
  SOFTWARE_BRAND,
  SUPPORT_EMAIL,
} from './branding.js';

export const LEGAL_COMPANY = {
  companyName: CORPORATE_PARENT,
  legalName: SOFTWARE_BRAND,
  brandName: PRODUCT_BRAND,
  softwareBrand: SOFTWARE_BRAND,
  engineeringDivision: ENGINEERING_DIVISION,
  legalOwner: DIGITAL_SIGNATURE,
  country: 'Peru',
  countryCode: 'PE',
  jurisdiction: 'Republica del Peru, con referencia operativa y tribunales competentes en Tacna, Peru',
  domain: 'https://comunicate-tacna.web.app',
  alternateDomain: 'https://comunicate-tacna.firebaseapp.com',
  legalAddress: 'Galerias de Gamarra Int. 1B, Tacna, Peru',
  supportEmail: SUPPORT_EMAIL,
  privacyEmail: SUPPORT_EMAIL,
  formalContact: SUPPORT_EMAIL,
  dataProtectionAuthority: 'Autoridad Nacional de Proteccion de Datos Personales (ANPD)',
  privacyLaw: 'Ley N. 29733, Ley de Proteccion de Datos Personales',
  privacyRegulation: 'Decreto Supremo N. 016-2024-JUS, Reglamento de la Ley N. 29733',
  gdprScope: 'GDPR/EEE solo cuando resulte aplicable por ubicacion del titular, oferta de servicios o monitoreo dirigido a personas en el Espacio Economico Europeo',
  dataProcessors: [
    'Firebase/Google Cloud para autenticacion, base de datos, hosting alterno y administracion segura',
    'Netlify para hosting principal, funciones server-side y logs tecnicos',
    'Proveedor RENIEC/Codart para consulta de DNI cuando el operador usa esa funcion',
    'Google Gemini para OCR de imagenes de caja cuando el operador usa el escaner IA',
  ],
  retentionPolicy: 'Los datos operativos se conservan mientras exista relacion comercial, necesidad contable, soporte, auditoria, seguridad, defensa de reclamaciones u obligacion legal. Las evidencias de consentimiento se conservan con version, fecha y metadatos tecnicos asociados.',
};

export const LEGAL_DOCUMENT_VERSION = '2026.05.26';
export const LEGAL_EFFECTIVE_DATE = '2026-05-26';

export const REQUIRED_LEGAL_DOCUMENTS = [
  'terms-and-conditions',
  'privacy-policy',
  'terms-of-use',
  'cookies',
  'copyright',
  'community-guidelines',
];

const entity = LEGAL_COMPANY.companyName;
const legalEntity = LEGAL_COMPANY.legalName;
const brand = LEGAL_COMPANY.brandName;
const privacy = LEGAL_COMPANY.privacyEmail;
const support = LEGAL_COMPANY.supportEmail;
const address = LEGAL_COMPANY.legalAddress;
const domain = LEGAL_COMPANY.domain;
const jurisdiction = LEGAL_COMPANY.jurisdiction;
const processors = LEGAL_COMPANY.dataProcessors.join('; ');

export const LEGAL_DOCUMENTS = [
  {
    slug: 'privacy-policy',
    shortTitle: 'Privacidad',
    title: 'Politica de Privacidad',
    description: 'Como recopilamos, usamos, protegemos y conservamos datos personales dentro de la plataforma.',
    updatedAt: LEGAL_EFFECTIVE_DATE,
    version: LEGAL_DOCUMENT_VERSION,
    sections: [
      ['Responsable del tratamiento', `${legalEntity}, dentro del ecosistema ${entity} y operando el producto ${brand}, es el responsable del tratamiento para la informacion administrada en la plataforma. Domicilio operativo: ${address}. Dominio principal: ${domain}. Contacto formal y privacidad: ${privacy}.`],
      ['Marco legal aplicable', `Esta politica se basa en ${LEGAL_COMPANY.privacyLaw}, ${LEGAL_COMPANY.privacyRegulation} y criterios de la ${LEGAL_COMPANY.dataProtectionAuthority}. ${LEGAL_COMPANY.gdprScope}.`],
      ['Datos que tratamos', 'Podemos tratar identificadores de cuenta, correo electronico, DNI, RUC, CE o pasaporte, nombres, telefonos, direcciones, IMEI, numero de serie, datos de equipo, datos de venta, medio de pago, tickets, boletas, registros de autenticacion, direccion IP, user-agent, preferencias de cookies, marcas de tiempo, evidencias de consentimiento e imagenes/documentos que el operador cargue para OCR o soporte operativo.'],
      ['Finalidades y bases legales', 'Tratamos datos para prestar el servicio, autenticar usuarios, gestionar clientes, registrar equipos, generar comprobantes operativos, consultar DNI cuando se solicita, prevenir fraude, mantener seguridad, cumplir obligaciones legales, atender soporte, conservar evidencia y defender derechos. Las bases aplicables incluyen consentimiento, ejecucion de relacion contractual o precontractual, cumplimiento de obligaciones legales, seguridad del servicio y ejercicio o defensa de derechos. Cuando GDPR aplique, tambien podremos usar intereses legitimos ponderados, obligacion legal, ejecucion contractual o consentimiento segun corresponda.'],
      ['Encargados y subencargados', `Usamos proveedores tecnicos estrictamente necesarios para operar el servicio: ${processors}. Estos proveedores pueden actuar como encargados o subencargados segun el servicio utilizado y sus terminos de tratamiento de datos.`],
      ['Transferencias y ubicacion', `Los datos pueden alojarse o procesarse fuera de ${LEGAL_COMPANY.country} por proveedores cloud y APIs externas. Cuando exista transferencia internacional, aplicaremos medidas contractuales, tecnicas y organizativas razonables, minimizacion de datos, control de acceso y evaluacion del proveedor.`],
      ['Derechos ARCO y GDPR', `En Peru, los titulares pueden ejercer derechos ARCO: acceso, rectificacion, cancelacion y oposicion. Cuando GDPR aplique, tambien podran solicitar supresion, limitacion, portabilidad, oposicion, retiro de consentimiento y revision de decisiones automatizadas si existieran. Las solicitudes se atienden escribiendo a ${privacy} con identificacion razonable, pais, cuenta o documento asociado y descripcion concreta de la solicitud.`],
      ['Conservacion', LEGAL_COMPANY.retentionPolicy],
      ['Seguridad', 'Aplicamos controles de acceso, autenticacion, registros de auditoria, validacion del lado servidor y minimizacion de privilegios. Ningun sistema es absolutamente inmune, pero mantenemos controles proporcionales al riesgo.'],
      ['Contacto y reclamos', `Para ejercer derechos o solicitar informacion sobre privacidad, escribe a ${privacy}. Si la respuesta no resulta satisfactoria, el titular puede acudir a la autoridad competente de proteccion de datos personales conforme a la normativa aplicable.`],
    ],
  },
  {
    slug: 'terms-and-conditions',
    shortTitle: 'Terminos',
    title: 'Terminos y Condiciones',
    description: 'Condiciones generales que regulan el acceso y uso contractual de la plataforma.',
    updatedAt: LEGAL_EFFECTIVE_DATE,
    version: LEGAL_DOCUMENT_VERSION,
    sections: [
      ['Aceptacion', `Al acceder a ${brand} desde ${domain}, el usuario confirma que leyo, entendio y acepta estos terminos, la Politica de Privacidad, la Politica de Cookies y las reglas operativas aplicables.`],
      ['Uso autorizado', 'La plataforma es privada y solo puede ser utilizada por usuarios expresamente autorizados. El acceso no autorizado, la cesion de credenciales o la simulacion de identidad estan prohibidos.'],
      ['Cuenta y seguridad', 'Cada usuario es responsable de proteger su cuenta, mantener informacion actualizada, cerrar sesion en equipos compartidos y notificar incidentes de seguridad.'],
      ['Disponibilidad del servicio', 'Podemos modificar, suspender o retirar funciones para mantenimiento, seguridad, cumplimiento legal o mejora del producto. Procuraremos reducir impactos operativos razonables.'],
      ['Datos ingresados', 'El usuario debe verificar exactitud, legitimidad y autorizacion de los datos que registra. La plataforma no debe usarse para almacenar informacion falsa, ilegal o innecesaria.'],
      ['Limitacion de responsabilidad', 'En la medida permitida por ley, el servicio se ofrece con garantias limitadas y no cubre perdidas indirectas, lucro cesante o uso indebido de la informacion ingresada por usuarios.'],
      ['Cambios a los terminos', 'Podemos actualizar estos documentos. Cuando el cambio sea material, solicitaremos nueva aceptacion y registraremos version, fecha, cuenta y evidencia tecnica disponible.'],
      ['Jurisdiccion', `Estos terminos se interpretaran conforme a la legislacion de ${jurisdiction}, salvo normas imperativas aplicables al consumidor, usuario empresarial o titular de datos personales.`],
    ],
  },
  {
    slug: 'terms-of-use',
    shortTitle: 'Uso',
    title: 'Terminos de Uso',
    description: 'Reglas practicas de uso aceptable, seguridad, automatizacion y acceso al sistema.',
    updatedAt: LEGAL_EFFECTIVE_DATE,
    version: LEGAL_DOCUMENT_VERSION,
    sections: [
      ['Conducta permitida', 'El servicio debe usarse solo para fines internos, administrativos, comerciales legitimos y compatibles con las autorizaciones de la empresa.'],
      ['Prohibiciones', 'Se prohibe el scraping no autorizado, bots abusivos, evasion de limites, ingenieria inversa, fraude, spam, malware, robo de cuentas, manipulacion de logs y carga de contenido ilegal.'],
      ['Automatizacion', 'Toda integracion automatizada requiere autorizacion previa, uso de credenciales seguras, respeto de limites tecnicos y finalidad compatible con el servicio.'],
      ['Integridad del sistema', 'No se permite interferir con disponibilidad, seguridad, integridad de datos, controles de acceso, validaciones o mecanismos de auditoria.'],
      ['Uso comercial indebido', 'No se permite revender, sublicenciar, alquilar, copiar o explotar la plataforma como servicio propio sin autorizacion escrita del titular.'],
      ['Investigacion de abuso', 'Podemos revisar registros tecnicos, actividad de cuenta y evidencias razonables cuando exista sospecha de abuso, fraude, infraccion legal o riesgo de seguridad.'],
    ],
  },
  {
    slug: 'legal',
    shortTitle: 'Aviso legal',
    title: 'Aviso Legal',
    description: 'Informacion corporativa, responsabilidades, contacto y alcance juridico del servicio.',
    updatedAt: LEGAL_EFFECTIVE_DATE,
    version: LEGAL_DOCUMENT_VERSION,
    sections: [
      ['Identificacion', `${brand} forma parte del ecosistema ${LEGAL_COMPANY.softwareBrand}, operado por ${legalEntity} bajo ${entity}. La division ${LEGAL_COMPANY.engineeringDivision} lidera arquitectura, desarrollo y entrega tecnica. Dominio principal: ${domain}. Dominio alterno de hosting: ${LEGAL_COMPANY.alternateDomain}. Domicilio operativo: ${address}.`],
      ['Contacto legal', `Para comunicaciones legales, privacidad, seguridad o propiedad intelectual, contactar a ${support}. Las solicitudes deben incluir identificacion razonable, datos de contacto, descripcion del asunto y documentos de respaldo cuando correspondan.`],
      ['Naturaleza del servicio', 'La plataforma facilita procesos operativos, pero no sustituye asesoramiento legal, fiscal, contable, tecnico ni decisiones de cumplimiento propias de cada empresa usuaria.'],
      ['Informacion del sitio', 'Procuramos mantener informacion precisa y actualizada, aunque pueden existir errores, demoras o cambios. El uso continuado implica aceptacion de la version vigente.'],
      ['Ley aplicable', `Salvo disposicion imperativa en contrario, el marco de referencia sera ${jurisdiction}.`],
    ],
  },
  {
    slug: 'cookies',
    shortTitle: 'Cookies',
    title: 'Politica de Cookies',
    description: 'Uso de cookies esenciales, analiticas y de marketing, con consentimiento granular.',
    updatedAt: LEGAL_EFFECTIVE_DATE,
    version: LEGAL_DOCUMENT_VERSION,
    sections: [
      ['Que son las cookies', 'Las cookies y tecnologias similares permiten recordar preferencias, mantener seguridad, medir uso y mejorar la experiencia. Algunas son necesarias para que el servicio funcione.'],
      ['Cookies esenciales', 'Son necesarias para autenticacion, seguridad, preferencias de consentimiento y funcionamiento basico. No requieren consentimiento cuando son estrictamente necesarias para el servicio solicitado.'],
      ['Analiticas', 'Ayudan a entender rendimiento y uso agregado. Solo se activan cuando el usuario otorga consentimiento, salvo que una norma local permita otra base legal aplicable.'],
      ['Marketing', 'Pueden usarse para comunicaciones, medicion comercial o personalizacion. Permanecen desactivadas hasta que exista consentimiento explicito.'],
      ['Gestion de preferencias', 'El usuario puede aceptar todas, rechazar no esenciales o configurar categorias. Las preferencias se guardan localmente y pueden actualizarse desde el banner.'],
      ['Retiro de consentimiento', 'El consentimiento puede retirarse en cualquier momento cambiando preferencias. El retiro no afecta tratamientos previos legitimamente realizados.'],
      ['Datos y proveedores', `Las preferencias de cookies pueden registrarse junto con la version legal aceptada. Las cookies esenciales se vinculan a seguridad, sesion y consentimiento; las analiticas y marketing permanecen desactivadas hasta autorizacion del usuario.`],
    ],
  },
  {
    slug: 'copyright',
    shortTitle: 'Copyright',
    title: 'Copyright y Propiedad Intelectual',
    description: 'Titularidad del software, licencia limitada, marca, contenido y procesos de takedown.',
    updatedAt: LEGAL_EFFECTIVE_DATE,
    version: LEGAL_DOCUMENT_VERSION,
    sections: [
      ['Titularidad del software', `La interfaz, codigo, arquitectura, flujos, componentes, documentacion y elementos visuales de ${brand} pertenecen al ecosistema ${LEGAL_COMPANY.softwareBrand}, con ingenieria de ${LEGAL_COMPANY.engineeringDivision}, salvo librerias de terceros usadas bajo sus propias licencias.`],
      ['Licencia limitada', 'La empresa usuaria recibe una licencia limitada, revocable, no exclusiva e intransferible para operar la plataforma en sus procesos internos autorizados.'],
      ['Prohibicion de copia', 'No se permite copiar, clonar, revender, redistribuir, sublicenciar, publicar, descompilar, extraer codigo o crear obras derivadas no autorizadas.'],
      ['Marca', `Los nombres ${LEGAL_COMPANY.companyName}, ${LEGAL_COMPANY.softwareBrand}, ${LEGAL_COMPANY.engineeringDivision}, ${brand} y signos asociados no pueden usarse para confundir origen, afiliacion, respaldo o titularidad del servicio.`],
      ['Contenido de usuarios', 'El usuario conserva derechos sobre el contenido que ingresa, pero concede permisos necesarios para alojarlo, procesarlo, protegerlo, respaldarlo y mostrarlo dentro del servicio.'],
      ['DMCA y takedown', `Las reclamaciones de copyright deben enviarse a ${support} con identificacion de la obra, ubicacion del material, datos del reclamante, declaracion de buena fe y firma fisica o electronica.`],
      ['Infracciones', 'Las infracciones de propiedad intelectual pueden generar eliminacion de contenido, restriccion de cuenta, suspension, terminacion y acciones legales.' ],
    ],
  },
  {
    slug: 'community-guidelines',
    shortTitle: 'Comunidad',
    title: 'Reglas de la Comunidad, Anti Abuso y Sanciones',
    description: 'Reglas de comportamiento, abuso, suspensiones, apelaciones y proteccion de la plataforma.',
    updatedAt: LEGAL_EFFECTIVE_DATE,
    version: LEGAL_DOCUMENT_VERSION,
    sections: [
      ['Principio general', 'La plataforma debe usarse con legalidad, buena fe, exactitud, respeto por terceros y cuidado sobre datos personales, credenciales y activos empresariales.'],
      ['Abuso prohibido', 'No se permite spam, fraude, phishing, bots abusivos, scraping, contenido ilegal, robo de cuentas, carga de malware, evasion de controles, violaciones de copyright o uso comercial indebido.'],
      ['Medidas proporcionales', 'Segun gravedad, historial y riesgo, podremos aplicar advertencias, restricciones de funciones, eliminacion de contenido, suspension temporal, bloqueo preventivo o baneo permanente.'],
      ['Suspensiones temporales', 'Pueden aplicarse para investigar incidentes, contener riesgo, proteger datos, prevenir fraude o corregir incumplimientos. La duracion dependera del riesgo y cooperacion del usuario.'],
      ['Baneos permanentes', 'Pueden aplicarse ante fraude grave, robo de cuentas, abuso reiterado, contenido ilegal, dano deliberado, evasion de sanciones o infraccion material de propiedad intelectual.'],
      ['Apelaciones', `El usuario puede apelar escribiendo a ${support} con cuenta afectada, decision impugnada, evidencia y explicacion. Revisaremos la solicitud con criterios razonables y documentaremos la respuesta.`],
      ['Cooperacion legal', 'Podemos preservar y entregar informacion cuando sea requerido por ley, orden valida, autoridad competente o necesidad razonable de proteger derechos, seguridad o integridad del servicio.'],
    ],
  },
];

export const LEGAL_DOCUMENT_MAP = Object.fromEntries(LEGAL_DOCUMENTS.map(doc => [doc.slug, doc]));

export function getLegalDocument(slug) {
  return LEGAL_DOCUMENT_MAP[slug] || null;
}

export function getRequiredLegalSnapshot() {
  return REQUIRED_LEGAL_DOCUMENTS.map(slug => {
    const doc = getLegalDocument(slug);
    return {
      slug,
      title: doc?.title || slug,
      version: doc?.version || LEGAL_DOCUMENT_VERSION,
      updatedAt: doc?.updatedAt || LEGAL_EFFECTIVE_DATE,
    };
  });
}
