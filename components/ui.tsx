'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 760 } : undefined} role="dialog" aria-modal="true">
        <div className="mh">
          <h2>{title}</h2>
          <button className="xbtn" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

export function LinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="linkbox">
      <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Lien" />
      <button className="btn ghost sm" type="button" disabled={!url} onClick={async () => {
        try { await navigator.clipboard.writeText(url); } catch { prompt('Copiez ce lien :', url); }
        setCopied(true); setTimeout(() => setCopied(false), 1500);
      }}>{copied ? 'Copié ✓' : 'Copier'}</button>
      <a className="btn ghost sm" href={url || undefined} target="_blank" rel="noreferrer">Ouvrir</a>
    </div>
  );
}
