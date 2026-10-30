/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';

export default function Header({ kicker, title, right }: { kicker?: string; title?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <img className="logo" src="/logo-sallandre.png" alt="Sallandre" />
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
