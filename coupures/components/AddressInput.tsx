'use client';

import { useEffect, useRef, useState } from 'react';

type Sugg = { label: string };

/**
 * Champ adresse avec suggestions (Base Adresse Nationale, via la Géoplateforme IGN).
 * Gratuit, sans clé, France uniquement. La saisie libre reste possible.
 */
export default function AddressInput({ value, onChange, id, autoFocus }: { value: string; onChange: (v: string) => void; id?: string; autoFocus?: boolean }) {
  const [sugg, setSugg] = useState<Sugg[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const typed = useRef(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 4) { setSugg([]); return; }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      try {
        const url = `https://data.geopf.fr/geocodage/search?index=address&autocomplete=1&limit=6&q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { signal: c.signal });
        const j = await r.json();
        const list: Sugg[] = (j.features ?? []).map((f: { properties: { label: string } }) => ({ label: f.properties.label }));
        setSugg(list);
        setOpen(list.length > 0);
        setHi(-1);
      } catch {
        /* hors ligne ou service indisponible : la saisie libre suffit */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  function pick(s: Sugg) {
    typed.current = false;
    onChange(s.label);
    setOpen(false);
    setSugg([]);
  }

  return (
    <div className="addr-wrap">
      <input
        id={id}
        type="text"
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Commencez à taper : 12 rue de Rivoli, Paris…"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onFocus={() => sugg.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !sugg.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(sugg.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(sugg[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul className="addr-list" role="listbox">
          {sugg.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
