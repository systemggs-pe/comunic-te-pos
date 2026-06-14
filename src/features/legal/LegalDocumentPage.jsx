import React, {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, CalendarDays, CheckCircle2, Moon, Scale, Sun} from 'lucide-react';
import {LEGAL_COMPANY, LEGAL_DOCUMENTS, getLegalDocument} from '../../config/legal.js';
import {setLegalSeo} from '../../utils/seo.js';

export function LegalDocumentPage({slug, onBack}) {
  const [dark, setDark] = useState(false);
  const doc = getLegalDocument(slug) || getLegalDocument('privacy-policy');
  const canonicalPath = `/${doc.slug}`;
  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: doc.title,
    description: doc.description,
    dateModified: doc.updatedAt,
    publisher: {
      '@type': 'Organization',
      name: LEGAL_COMPANY.companyName,
      email: LEGAL_COMPANY.supportEmail,
      url: LEGAL_COMPANY.domain,
      address: {
        '@type': 'PostalAddress',
        streetAddress: LEGAL_COMPANY.legalAddress,
        addressCountry: LEGAL_COMPANY.countryCode,
      },
    },
  }), [doc]);

  useEffect(() => {
    setLegalSeo({
      title: `${doc.title} | ${LEGAL_COMPANY.brandName}`,
      description: doc.description,
      canonicalPath,
      canonicalOrigin: LEGAL_COMPANY.domain,
      structuredData: jsonLd,
    });
  }, [canonicalPath, doc, jsonLd]);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-[oklch(0.982_0.006_250)] text-[oklch(0.24_0.028_255)] transition-colors dark:bg-[oklch(0.18_0.024_255)] dark:text-[oklch(0.96_0.006_250)]">
        <header className="sticky top-0 z-30 border-b border-[oklch(0.9_0.018_250)] bg-[oklch(0.992_0.004_250_/_0.94)] backdrop-blur dark:border-[oklch(0.32_0.028_255)] dark:bg-[oklch(0.2_0.024_255_/_0.92)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={onBack || (() => { window.location.href = '/'; })}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[oklch(0.88_0.018_250)] bg-[oklch(0.998_0.003_250)] px-3 text-sm font-bold text-[oklch(0.32_0.028_255)] shadow-sm transition-colors hover:bg-[oklch(0.965_0.012_250)] focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-[oklch(0.36_0.03_255)] dark:bg-[oklch(0.24_0.026_255)] dark:text-[oklch(0.92_0.006_250)] dark:hover:bg-[oklch(0.28_0.028_255)]"
            >
              <ArrowLeft size={16} /> Volver
            </button>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Documentos legales">
              {LEGAL_DOCUMENTS.map(item => (
                <a
                  key={item.slug}
                  href={`/${item.slug}`}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${item.slug === doc.slug ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' : 'text-[oklch(0.52_0.024_255)] hover:bg-[oklch(0.965_0.012_250)] dark:text-[oklch(0.78_0.012_250)] dark:hover:bg-[oklch(0.27_0.028_255)]'}`}
                >
                  {item.shortTitle}
                </a>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => setDark(value => !value)}
              aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[oklch(0.88_0.018_250)] bg-[oklch(0.998_0.003_250)] text-[oklch(0.42_0.026_255)] shadow-sm transition-colors hover:bg-[oklch(0.965_0.012_250)] focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-[oklch(0.36_0.03_255)] dark:bg-[oklch(0.24_0.026_255)] dark:text-[oklch(0.9_0.006_250)]"
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr] lg:py-10">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-[oklch(0.9_0.018_250)] bg-[oklch(0.998_0.003_250)] p-4 shadow-sm dark:border-[oklch(0.34_0.03_255)] dark:bg-[oklch(0.22_0.026_255)]">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[oklch(0.58_0.024_255)] dark:text-[oklch(0.72_0.014_250)]">Indice</p>
              <div className="mt-3 space-y-1">
                {doc.sections.map(([heading]) => (
                  <a
                    key={heading}
                    href={`#${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    className="block rounded-lg px-3 py-2 text-sm font-semibold text-[oklch(0.42_0.026_255)] transition-colors hover:bg-[oklch(0.96_0.012_250)] hover:text-blue-700 dark:text-[oklch(0.82_0.01_250)] dark:hover:bg-[oklch(0.27_0.028_255)] dark:hover:text-blue-200"
                  >
                    {heading}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <article className="overflow-hidden rounded-2xl border border-[oklch(0.9_0.018_250)] bg-[oklch(0.998_0.003_250)] shadow-[0_20px_70px_oklch(0.32_0.035_255_/_0.12)] dark:border-[oklch(0.34_0.03_255)] dark:bg-[oklch(0.22_0.026_255)]">
            <div className="border-b border-[oklch(0.91_0.016_250)] px-5 py-6 sm:px-8 dark:border-[oklch(0.34_0.03_255)]">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[oklch(0.54_0.024_255)] dark:text-[oklch(0.76_0.014_250)]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                  <Scale size={14} /> Version {doc.version}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.9_0.018_250)] bg-[oklch(0.985_0.006_250)] px-3 py-1 dark:border-[oklch(0.36_0.03_255)] dark:bg-[oklch(0.27_0.028_255)]">
                  <CalendarDays size={14} /> Actualizado {doc.updatedAt}
                </span>
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">{doc.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[oklch(0.48_0.024_255)] dark:text-[oklch(0.8_0.012_250)]">{doc.description}</p>
            </div>

            <div className="divide-y divide-[oklch(0.92_0.014_250)] px-5 sm:px-8 dark:divide-[oklch(0.34_0.03_255)]">
              {doc.sections.map(([heading, body]) => {
                const id = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                return (
                  <section key={heading} id={id} className="scroll-mt-24 py-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 size={18} className="mt-1 shrink-0 text-blue-700 dark:text-blue-300" />
                      <div>
                        <h2 className="text-lg font-black">{heading}</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-[oklch(0.42_0.026_255)] dark:text-[oklch(0.82_0.012_250)]">{body}</p>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="border-t border-[oklch(0.91_0.016_250)] bg-[oklch(0.985_0.006_250)] px-5 py-5 text-xs leading-6 text-[oklch(0.52_0.024_255)] sm:px-8 dark:border-[oklch(0.34_0.03_255)] dark:bg-[oklch(0.19_0.024_255)] dark:text-[oklch(0.76_0.014_250)]">
              Documento legal vigente de {LEGAL_COMPANY.brandName}. Para solicitudes formales, privacidad, seguridad o propiedad intelectual, escribe a {LEGAL_COMPANY.formalContact}.
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}
