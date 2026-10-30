'use client';

import { useEffect, useRef, useState } from 'react';
import AvisFeuille from './AvisFeuille';
import type { Avis } from '@/lib/avis';
import type { Logo } from '@/lib/api';

const LARGEUR_A4 = 794; // 210 mm à 96 dpi
const HAUTEUR_A4 = 1123;

/** Aperçu de la feuille A4 réduit à la largeur disponible, plus la copie pleine taille utilisée à l'impression */
export default function Apercu({ a, logo, max = 1 }: { a: Avis; logo?: Logo | null; max?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.5);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const maj = () => setK(Math.min(max, el.clientWidth / LARGEUR_A4));
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);

  return (
    <>
      <div ref={box} className="apercu no-print">
        <div className="apercu-in" style={{ width: LARGEUR_A4 * k, height: HAUTEUR_A4 * k }}>
          <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: LARGEUR_A4 }}>
            <AvisFeuille a={a} logo={logo} />
          </div>
        </div>
      </div>
      <div className="print-only">
        <AvisFeuille a={a} logo={logo} />
      </div>
    </>
  );
}
