'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, type ReactNode } from 'react';

export function Header({ titre, droite }: { titre?: string; droite?: ReactNode }) {
  return (
    <header className="topbar no-print">
      <div className="wrap">
        <img className="logo" src="/logo-sallandre.png" alt="Sallandre" />
        <div className="title">{titre && <div className="t">{titre}</div>}</div>
        {droite}
      </div>
    </header>
  );
}

export function Footer() {
  return <div className="footer no-print">Sallandre × BatiBig</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-bg no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
