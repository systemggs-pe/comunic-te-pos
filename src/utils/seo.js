function upsertMeta(selector, createAttrs, valueAttr, value) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttrs).forEach(([key, attrValue]) => element.setAttribute(key, attrValue));
    document.head.appendChild(element);
  }
  element.setAttribute(valueAttr, value);
}

function upsertLink(rel, href) {
  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

export function setLegalSeo({title, description, canonicalPath, canonicalOrigin, structuredData}) {
  if (typeof document === 'undefined') return;

  document.title = title;
  upsertMeta('meta[name="description"]', {name: 'description'}, 'content', description);
  upsertMeta('meta[property="og:title"]', {property: 'og:title'}, 'content', title);
  upsertMeta('meta[property="og:description"]', {property: 'og:description'}, 'content', description);
  upsertMeta('meta[name="robots"]', {name: 'robots'}, 'content', 'index,follow');

  const origin = String(canonicalOrigin || window.location.origin || '').replace(/\/$/, '');
  upsertLink('canonical', `${origin}${canonicalPath}`);

  const existing = document.getElementById('legal-structured-data');
  if (existing) existing.remove();
  if (structuredData) {
    const script = document.createElement('script');
    script.id = 'legal-structured-data';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);
  }
}
