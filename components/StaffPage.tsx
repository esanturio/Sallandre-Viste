'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Header, { Footer } from './Header';
import BookingForm from './BookingForm';
import RecapCard from './RecapCard';
import PlanningPanel from './PlanningPanel';
import LotsPanel from './LotsPanel';
import SlotsPanel from './SlotsPanel';
import AccessPanel from './AccessPanel';
import { Modal, Toast } from './ui';
import { errMsg, rpc } from '@/lib/api';
import { isFuture } from '@/lib/format';
import type { BookingInput, OpData, Recap } from '@/lib/types';

export type StaffCtx = {
  token: string;
  opId: string;
  isAdmin: boolean;
  data: OpData;
  reload: () => Promise<void>;
  act: (fn: () => Promise<unknown>, okMsg?: string) => Promise<boolean>;
  openBooking: (opts?: { creneau?: string; lot?: string }) => void;
};

type Tab = 'planning' | 'lots' | 'creneaux' | 'acces';

export default function StaffPage({ token, opId, role }: { token: string; opId?: string; role: 'admin' | 'concierge' }) {
  const [data, setData] = useState<OpData | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('planning');
  const [toast, setToast] = useState('');
  const [booking, setBooking] = useState<{ creneau?: string; lot?: string } | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    try {
      const d = await rpc<OpData>('staff_operation', { p_token: token, p_op: opId ?? null });
      setData(d);
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [token, opId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const notify = (m: string) => {
    setToast(m);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 3000);
  };

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      await load();
      if (okMsg) notify(okMsg);
      return true;
    } catch (e) {
      alert(errMsg(e));
      await load();
      return false;
    }
  };

  if (!data) {
    return (
      <>
        <Header kicker={role === 'admin' ? 'Administration' : 'Espace gardien'} />
        <div className="wrap">
          {err ? <div className="card" style={{ marginTop: 24 }}><div className="notice err" style={{ margin: 0 }}>{err}</div></div> : <div className="loading">Chargement…</div>}
        </div>
      </>
    );
  }

  const isAdmin = data.role === 'admin';
  const op = data.operation;
  const ctx: StaffCtx = { token, opId: op.id, isAdmin, data, reload: load, act, openBooking: (o) => { setRecap(null); setBooking(o ?? {}); } };

  const nbLots = data.lots.length;
  const nbResa = data.reservations.length;
  const enAttente = data.lots.filter((l) => !l.reserve).length;
  const libres = data.creneaux.filter((c) => isFuture(c)).reduce((s, c) => s + Math.max(0, c.capacite - c.pris), 0);

  const book = (b: BookingInput) =>
    rpc<Recap>('staff_book', {
      p_token: token, p_op: op.id, p_creneau: b.creneau, p_lot: b.lot, p_batiment: b.batiment, p_etage: b.etage, p_numero: b.numero,
      p_nom: b.nom, p_tel: b.tel, p_email: b.email, p_statut: b.statut, p_comm: b.comm,
    });

  return (
    <>
      <Header
        kicker={isAdmin ? 'Administration' : 'Espace gardien'}
        title={op.immeuble}
        right={
          <>
            {isAdmin && <Link className="btn ghost sm" href={`/admin/${token}`}>← Toutes les opérations</Link>}
            <button className="btn sm" onClick={() => ctx.openBooking()}>+ Inscrire un occupant</button>
          </>
        }
      />
      <main>
        <div className="wrap">
          <div className="flex" style={{ marginBottom: 14 }}>
            <span className="badge">{op.objet}</span>
            {op.adresse && <span className="muted small">{op.adresse}</span>}
            {op.archived && <span className="badge grey">Archivée</span>}
          </div>

          <div className="stats">
            <div className="stat"><div className="v">{nbResa}</div><div className="l">rendez-vous pris</div></div>
            <div className="stat"><div className="v">{enAttente}</div><div className="l">logement{enAttente > 1 ? 's' : ''} en attente{nbLots === 0 ? ' (liste vide)' : ''}</div></div>
            <div className="stat"><div className="v">{libres}</div><div className="l">place{libres > 1 ? 's' : ''} libre{libres > 1 ? 's' : ''} à venir</div></div>
            <div className="stat">
              <div className="v">{nbLots ? Math.round((100 * data.lots.filter((l) => l.reserve).length) / nbLots) : 0}%</div>
              <div className="l">des lots connus inscrits</div>
              <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${nbLots ? (100 * data.lots.filter((l) => l.reserve).length) / nbLots : 0}%` }} /></div>
            </div>
          </div>

          <div className="tabs no-print">
            <button className={tab === 'planning' ? 'on' : ''} onClick={() => setTab('planning')}>Planning<span className="cnt">{nbResa}</span></button>
            <button className={tab === 'lots' ? 'on' : ''} onClick={() => setTab('lots')}>Suivi des logements<span className="cnt">{enAttente}</span></button>
            {isAdmin && <button className={tab === 'creneaux' ? 'on' : ''} onClick={() => setTab('creneaux')}>Dates et créneaux</button>}
            {isAdmin && <button className={tab === 'acces' ? 'on' : ''} onClick={() => setTab('acces')}>Liens et réglages</button>}
          </div>

          {tab === 'planning' && <PlanningPanel ctx={ctx} />}
          {tab === 'lots' && <LotsPanel ctx={ctx} />}
          {tab === 'creneaux' && isAdmin && <SlotsPanel ctx={ctx} />}
          {tab === 'acces' && isAdmin && <AccessPanel ctx={ctx} />}
        </div>
      </main>
      <Footer />

      {booking && (
        <Modal title={recap ? 'C’est noté' : 'Inscrire un occupant'} onClose={() => setBooking(null)} wide>
          {recap ? (
            <>
              <RecapCard r={recap} showBat={data.batiments.length > 1} staff />
              <div className="btns" style={{ justifyContent: 'center' }}>
                <button className="btn ghost" onClick={() => { setRecap(null); setBooking({}); }}>Inscrire quelqu’un d’autre</button>
                <button className="btn" onClick={() => setBooking(null)}>Fermer</button>
              </div>
            </>
          ) : (
            <BookingForm
              key={`${booking.creneau ?? ''}-${booking.lot ?? ''}`}
              data={data}
              staff
              initialCreneau={booking.creneau}
              initialLot={booking.lot}
              submitLabel="Enregistrer le rendez-vous"
              onSubmit={book}
              onBooked={(r) => { setRecap(r); load(); }}
              onConflict={load}
            />
          )}
        </Modal>
      )}
      <Toast msg={toast} />
    </>
  );
}
