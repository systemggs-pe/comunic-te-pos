// Corporate brand architecture
export const CORPORATE_PARENT = 'GGS';
export const SOFTWARE_BRAND = 'GGS SYSTEMS';
export const ENGINEERING_DIVISION = 'GGS CODE';
export const PRODUCT_BRAND = 'COMUNIC@TE';
export const DIGITAL_SIGNATURE = ENGINEERING_DIVISION;
export const SYSTEM_VERSION = 'v6.1.1';
export const SPLASH_VERSION = 'v6.1.1';
export const SUPPORT_WHATSAPP_URL = 'https://wa.me/51929138755';
export const SUPPORT_PHONE = '+51929138755';
export const SUPPORT_EMAIL = 'systemggs.pe@gmail.com';

export const BRAND_HIERARCHY = [
  {
    name: CORPORATE_PARENT,
    role: 'Parent company',
    description: 'Corporate governance and product ecosystem.',
  },
  {
    name: SOFTWARE_BRAND,
    role: 'Software brand',
    description: 'Business operations SaaS and product experience.',
  },
  {
    name: ENGINEERING_DIVISION,
    role: 'Engineering division',
    description: 'Architecture, development, security and delivery.',
  },
];

export const TECH_BADGES = [
  'Secure access',
  'Audit-ready',
  'Firebase',
  'Netlify',
  'React',
];

export const BRAND_COPY = {
  ecosystemLine: `${SOFTWARE_BRAND} is a ${CORPORATE_PARENT} software ecosystem engineered by ${ENGINEERING_DIVISION}.`,
  productLine: `${PRODUCT_BRAND} operates under ${SOFTWARE_BRAND}, with engineering and delivery by ${ENGINEERING_DIVISION}.`,
  copyrightLine: `${PRODUCT_BRAND}, ${SOFTWARE_BRAND} and related software assets are part of the ${CORPORATE_PARENT} ecosystem.`,
};
