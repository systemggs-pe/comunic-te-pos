import React from 'react';
import {BadgeCheck, Braces, Building2, Layers3} from 'lucide-react';
import {
  BRAND_HIERARCHY,
  CORPORATE_PARENT,
  ENGINEERING_DIVISION,
  PRODUCT_BRAND,
  SOFTWARE_BRAND,
  TECH_BADGES,
} from '../../config/branding.js';

const ICONS = [Building2, Layers3, Braces];

export function BrandWordmark({compact = false}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-black tracking-tight text-slate-950">{PRODUCT_BRAND}</span>
        {!compact && <span className="hidden text-xs font-bold uppercase tracking-[0.16em] text-slate-400 sm:inline">{SOFTWARE_BRAND}</span>}
      </div>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
        {CORPORATE_PARENT} ecosystem. Engineered by {ENGINEERING_DIVISION}.
      </p>
    </div>
  );
}

export function BrandEcosystemStrip({dense = false}) {
  return (
    <div className={`grid gap-2 ${dense ? 'sm:grid-cols-3' : 'md:grid-cols-3'}`}>
      {BRAND_HIERARCHY.map((item, index) => {
        const Icon = ICONS[index] || BadgeCheck;
        return (
          <div key={item.name} className="rounded-lg border border-[oklch(0.9_0.018_250)] bg-[oklch(0.995_0.004_250)] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[oklch(0.95_0.03_255)] text-blue-700">
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-900">{item.name}</p>
                <p className="truncate text-[11px] font-semibold text-slate-500">{item.role}</p>
              </div>
            </div>
            {!dense && <p className="mt-2 text-[11px] leading-5 text-slate-500">{item.description}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function TechnicalBadges() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TECH_BADGES.map(badge => (
        <span key={badge} className="inline-flex items-center rounded-full border border-[oklch(0.9_0.018_250)] bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
          {badge}
        </span>
      ))}
    </div>
  );
}
