'use client';

import { useEffect, useState } from 'react';
import Apercu from './Apercu';
import { Footer, Header } from './ui';
import { logoBailleur, type Logo } from '@/lib/api';
import { decoderAvis, nomFichier, plageTexte, plagesValides, titreImmeuble, type Avis } from '@/lib/avis';

/** Page ouverte par le gardien : l'avis prêt à imprimer */
export default function VueGardien() {
  const [a, setA] = useState<Avis | null | undefined>(undefined);
  const [logo, setLogo] = useState<Logo | null>(null);

  useEffect(() => {
    const lire = () => setA(decoderAvis(window.location.hash.replace(/^#/, '')));
    lire();
    window.addEventListener('hashchange', lire);
    return () => window.removeEventListener('hashchange', lire);
  }, []);
  useEffect(() => {
    if (a?.bailleur) logoBailleur(a.bailleur).then(setLogo);
  }, [a?.bailleur]);

  if (a === undefined) return <div className="loading">Chargement…</div>;
  if (a === null) {
    return (
      <>
        <Header titre="Avis de coupure d’eau" />
        <div className="wrap narrow"><div className="card" style={{ marginTop: 24 }}>
          <div className="notice err" style={{ margin: 0 }}>Ce lien est incomplet. Demandez à Sallandre de vous le renvoyer.</div>
        </div></div>
      </>
    );
  }

  function imprimer() {
    const t = document.title;
    document.title = nomFichier(a!);
    window.print();
    setTimeout(() => { document.title = t; }, 500);
  }

  return (
    <>
      <Header titre="Avis de coupure d’eau" />
      <main>
        <div className="wrap narrow">
          <div className="card no-print gardien">
            <h1>{titreImmeuble(a)}</h1>
            {a.batiment && <div className="muted">{a.batiment}</div>}
            <ul className="dates">{plagesValides(a).map((p, i) => <li key={i}>💧 {plageTexte(p)}</li>)}</ul>
            <p className="hint">Merci d’imprimer cet avis et de l’afficher dans le hall de l’immeuble.</p>
            <button className="btn big" onClick={imprimer}>🖨 Imprimer l’avis (A4)</button>
          </div>
          <Apercu a={a} logo={logo} max={1} />
        </div>
      </main>
      <Footer />
    </>
  );
}
