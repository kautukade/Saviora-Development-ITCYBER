import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export function Page({ title, eyebrow, actions, children }: { title: string; eyebrow?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="sv-page">
      <div className="sv-page-head">
        <div>
          {eyebrow && <div className="sv-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
        </div>
        {actions && <div className="sv-head-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`sv-card ${className}`}>{children}</section>;
}

export function CardTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return <div className="sv-card-title"><h2>{title}</h2>{aside}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral'|'blue'|'green'|'amber'|'red'|'purple' }) {
  return <span className={`sv-badge sv-${tone}`}>{children}</span>;
}

export function ButtonLink({ href, children, secondary = false, danger = false, className='' }: { href: string; children: ReactNode; secondary?: boolean; danger?: boolean; className?: string }) {
  return <Link href={href} className={`sv-btn ${secondary ? 'sv-btn-secondary' : ''} ${danger ? 'sv-btn-danger' : ''} ${className}`}>{children}</Link>;
}

export function Stat({ label, value, hint, tone='blue' }: { label: string; value: string|number; hint?: string; tone?: 'blue'|'green'|'amber'|'red'|'purple' }) {
  return <div className={`sv-stat sv-stat-${tone}`}><div className="sv-stat-label">{label}</div><div className="sv-stat-value">{value}</div>{hint && <div className="sv-stat-hint">{hint}</div>}</div>;
}

export function SectionLink({ href, title, description }: { href: string; title: string; description?: string }) {
  return <Link href={href} className="sv-section-link"><div><strong>{title}</strong>{description && <p>{description}</p>}</div><ChevronRight size={18}/></Link>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="sv-empty"><strong>{title}</strong><p>{description}</p></div>;
}
