'use client';

import { useCallback, useEffect, useState } from 'react';
import Header, { Footer } from './Header';
import BookingForm from './BookingForm';
import RecapCard from './RecapCard';
import { errMsg, rpc } from '@/lib/api';
import { mapsUrl, opSub, opTitle } from '@/lib/format';
import type { BookingInput, OpData, Recap } from '@/lib/types';

export default function TenantPage({ token }: { token: string }) {
  const [data, setData] = useState<OpData | null>(null);
  const [err, setErr] = useState('');
  const [recap, setRecap] = useState<Recap | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await rpc<OpData>('tenant_operation', { p_token: token }));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  // Rafraîchit les disponibilités régulièrement tant que la réservation n'est pas faite
  useEffect(() => {
    if (recap) return;
    const t = setInterval(load, 20000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load, recap]);

  const book = (b: BookingInput) =>
    rpc<Recap>('tenant_book', {
      p_token: token, p_creneau: b.creneau, p_lot: b.lot, p_batiment: b.batiment, p_etage: b.etage, p_numero: b.numero,
      p_nom: b.nom, p_tel: b.tel, p_email: b.email, p_statut: b.statut, p_comm: b.comm,
    });

  if (!data) {
    return (
      <>
        <Header />
        <div className="wrap narrow">
          {err ? <div className="card" style={{ marginTop: 24 }}><div className="notice err" style={{ margin: 0 }}>{err}</div></div> : <div className="loading">Chargement…</div>}
        </div>
      </>
    );
  }

  const op = data.operation;
  return (
    <>
      <Header />
      <section className="hero">
        <div className="wrap narrow">
          <span className="objet">{op.objet}</span>
          <h1>{opTitle(op)}</h1>
          {opSub(op) && <div className="sub">{opSub(op)}</div>}
          {op.adresse && <a className="maplink" href={mapsUrl(op.adresse)} target="_blank" rel="noreferrer">Voir sur Google Maps ↗</a>}
        </div>
      </section>
      <main>
        <div className="wrap narrow">
          {recap ? (
            <RecapCard r={recap} showBat={data.batiments.length > 1} immeuble={opTitle(op)} adresse={opSub(op)} />
          ) : (
            <>
              <div className="notice info">
                Choisissez le créneau qui vous convient pour la visite de votre logement. Aucun compte à créer : il suffit de remplir ce formulaire.
              </div>
              {op.consignes && <div className="notice warn consignes">{op.consignes}</div>}
              <BookingForm data={data} onSubmit={book} onBooked={(r) => { setRecap(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onConflict={load} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
