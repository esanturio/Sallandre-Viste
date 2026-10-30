/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';

export default function Header({ kicker, title, right, partenaire }: { kicker?: string; title?: string; right?: ReactNode; partenaire?: { nom: string; logo: string | null } | null }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <div className="logos">
          <img className="logo" src="/logo-sallandre.png" alt="Sallandre" />
          {partenaire?.logo && (
            <>
              <span className="x" aria-hidden="true">×</span>
              <img className="logo partner" src={partenaire.logo} alt={partenaire.nom} />
            </>
          )}
        </div>
        <div className="title">
          {kicker && <div className="k">{kicker}</div>}
          {title && <div className="t">{title}</div>}
        </div>
        {right && <div className="btns">{right}</div>}
      </div>
    </header>
  );
}

export function Footer() {
  return <div className="footer">Sallandre × BatiBig</div>;
}
