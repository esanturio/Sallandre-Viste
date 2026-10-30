'use client';

import { useEffect, useMemo, useState } from 'react';
import { errMsg, AppError } from '@/lib/api';
import { ETAGES_POSSIBLES, etageLabel, groupBy, heure, isFuture, jourCourt, jourLong, parisNow } from '@/lib/format';
import type { BookingInput, OpData, Recap, Statut } from '@/lib/types';
import CoupuresBanner, { coupuresPour } from './Coupures';

type Props = {
  data: OpData;
  staff?: boolean;
  initialCreneau?: string;
  initialLot?: string;
  submitLabel?: string;
  onSubmit: (b: BookingInput) => Promise<Recap>;
  onBooked: (r: Recap) => void;
  onConflict?: () => void;
};

/** Met en forme un numéro français : 0612345678 → 06 12 34 56 78 ; +33612345678 → +33 6 12 34 56 78 */
function formatTel(v: string): string {
  const t = v.replace(/[^\d+]/g, '');
  if (t.startsWith('+33')) {
    const d = t.slice(3).replace(/\D/g, '').slice(0, 9);
    return ('+33 ' + d.slice(0, 1) + ' ' + (d.slice(1).match(/.{1,2}/g) ?? []).join(' ')).trim();
  }
  if (t.startsWith('+')) return v.replace(/[^\d+ ]/g, '');
  const d = t.replace(/\D/g, '').slice(0, 10);
  return (d.match(/.{1,2}/g) ?? []).join(' ');
}

export default function BookingForm({ data, staff, initialCreneau, initialLot, submitLabel, onSubmit, onBooked, onConflict }: Props) {
  const { batiments, lots, creneaux } = data;
  const singleBat = batiments.length === 1;
  const init = initialLot ? lots.find((l) => l.id === initialLot) : undefined;

  const slot0 = initialCreneau ? creneaux.find((c) => c.id === initialCreneau) : undefined;
  const [batId, setBatId] = useState<string>(init?.batiment_id ?? slot0?.batiment_id ?? (singleBat ? batiments[0]?.id ?? '' : ''));
  const [etageSel, setEtageSel] = useState<string>(init ? String(init.etage) : '');
  const [etageLibre, setEtageLibre] = useState<string>('');
  const [lotSel, setLotSel] = useState<string>(init?.id ?? '');
  const [numeroLibre, setNumeroLibre] = useState('');

  const initSlot = initialCreneau ? creneaux.find((c) => c.id === initialCreneau) : undefined;
  const [jour, setJour] = useState<string>(initSlot?.jour ?? '');
  const [creneau, setCreneau] = useState<string>(initSlot?.id ?? '');

  const [nom, setNom] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [comm, setComm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const effBat = singleBat ? batiments[0]?.id : batId;
  const lotsInBat = useMemo(() => lots.filter((l) => l.batiment_id === effBat), [lots, effBat]);
  const knownEtages = useMemo(() => Array.from(new Set(lotsInBat.map((l) => l.etage))).sort((a, b) => a - b), [lotsInBat]);
  const noKnownLots = lotsInBat.length === 0;
  const freeEtage = noKnownLots || etageSel === 'autre';
  const effEtage = freeEtage ? etageLibre : etageSel;
  const lotsOnFloor = useMemo(
    () =>
      freeEtage
        ? []
        : lotsInBat.filter((l) => String(l.etage) === etageSel).sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true })),
    [lotsInBat, etageSel, freeEtage],
  );
  const freeNumero = freeEtage || lotSel === 'autre';

  // Créneaux à venir, regroupés par jour
  const now = parisNow();
  // Un créneau lié à un bâtiment (coupure d'eau) n'est proposé qu'aux logements de ce bâtiment
  const compatible = (c: { batiment_id?: string | null }) => !c.batiment_id || (!!effBat && c.batiment_id === effBat);
  const futurs = useMemo(
    () => creneaux.filter((c) => (isFuture(c, now) || c.id === initialCreneau) && compatible(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creneaux, now, initialCreneau, effBat],
  );
  const masquesAutresBat = !effBat && creneaux.some((c) => c.batiment_id && isFuture(c, now));
  const coupuresBat = effBat ? coupuresPour(data.coupures, effBat) : [];
  const parJour = useMemo(() => groupBy(futurs, (c) => c.jour), [futurs]);
  const jours = Array.from(parJour.keys()).sort();
  const slotsDuJour = jour ? parJour.get(jour) ?? [] : [];

  // Si le créneau choisi disparaît (pris par quelqu'un), on le désélectionne
  useEffect(() => {
    if (!creneau) return;
    const c = creneaux.find((x) => x.id === creneau);
    if (!c || c.pris >= c.capacite || (c.batiment_id && c.batiment_id !== effBat)) setCreneau('');
  }, [creneaux, creneau, effBat]);
  useEffect(() => {
    if (jour && !parJour.has(jour)) setJour('');
  }, [jour, parJour]);
  useEffect(() => {
    if (lotSel && lotSel !== 'autre') {
      const l = lots.find((x) => x.id === lotSel);
      if (!l || (l.reserve && l.id !== initialLot)) setLotSel('');
    }
  }, [lots, lotSel, initialLot]);

  const lotChoisi = lotSel && lotSel !== 'autre' ? lots.find((l) => l.id === lotSel) : undefined;
  const logementOk = !!effBat && (lotChoisi ? true : effEtage !== '' && numeroLibre.trim() !== '');
  const telOk = tel.replace(/\D/g, '').length >= 8;
  const canSubmit = logementOk && !!creneau && nom.trim() !== '' && telOk && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!canSubmit) {
      setErr(
        !logementOk ? 'Merci de préciser votre logement.' :
        !creneau ? 'Merci de choisir un créneau.' :
        nom.trim() === '' ? 'Merci d’indiquer votre nom.' :
        'Merci d’indiquer un numéro de téléphone valide.',
      );
      return;
    }
    setBusy(true);
    try {
      const r = await onSubmit({
        creneau,
        lot: lotChoisi ? lotChoisi.id : null,
        batiment: lotChoisi ? null : effBat!,
        etage: lotChoisi ? null : parseInt(effEtage, 10),
        numero: lotChoisi ? null : numeroLibre.trim(),
        nom: nom.trim(),
        tel: tel.trim(),
        email: email.trim(),
        statut: 'autre' as Statut,
        comm: comm.trim(),
      });
      onBooked(r);
    } catch (ex) {
      setErr(errMsg(ex));
      if (ex instanceof AppError && ['CRENEAU_COMPLET', 'CRENEAU_PASSE', 'CRENEAU_INTROUVABLE', 'LOT_DEJA_RESERVE'].includes(ex.code)) {
        if (ex.code !== 'LOT_DEJA_RESERVE') setCreneau('');
        onConflict?.();
      }
    } finally {
      setBusy(false);
    }
  }

  const n = (i: number) => <span className="step">{i}</span>;

  return (
    <form onSubmit={submit} noValidate>
      {/* 1. Logement */}
      <div className="card">
        <div className="step-title">{n(1)}<h2>{staff ? 'Logement' : 'Votre logement'}</h2></div>

        {!singleBat && (
          <div className="field">
            <label>Bâtiment</label>
            <div className="seg">
              {batiments.map((b) => (
                <button type="button" key={b.id} className={batId === b.id ? 'on' : ''}
                  onClick={() => { setBatId(b.id); setEtageSel(''); setLotSel(''); setEtageLibre(''); setNumeroLibre(''); }}>
                  {b.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {effBat && (
          <>
            {!noKnownLots && (
              <div className="field">
                <label htmlFor="etage">Étage</label>
                <select id="etage" value={etageSel} onChange={(e) => { setEtageSel(e.target.value); setLotSel(''); setNumeroLibre(''); }}>
                  <option value="">— Choisir l’étage —</option>
                  {knownEtages.map((e) => <option key={e} value={String(e)}>{etageLabel(e)}</option>)}
                  <option value="autre">Autre étage…</option>
                </select>
              </div>
            )}

            {freeEtage && (
              <div className="field">
                <label htmlFor="etageLibre">Étage</label>
                <select id="etageLibre" value={etageLibre} onChange={(e) => setEtageLibre(e.target.value)}>
                  <option value="">— Choisir l’étage —</option>
                  {ETAGES_POSSIBLES.map((e) => <option key={e} value={String(e)}>{etageLabel(e)}</option>)}
                </select>
              </div>
            )}

            {!freeEtage && etageSel !== '' && (
              <div className="field">
                <label htmlFor="lot">Logement / lot</label>
                <select id="lot" value={lotSel} onChange={(e) => setLotSel(e.target.value)}>
                  <option value="">— Choisir le logement —</option>
                  {lotsOnFloor.map((l) => (
                    <option key={l.id} value={l.id} disabled={l.reserve && l.id !== initialLot}>
                      Lot {l.numero}{l.reserve && l.id !== initialLot ? ' — déjà inscrit' : ''}
                    </option>
                  ))}
                  <option value="autre">Mon logement n’est pas dans la liste</option>
                </select>
              </div>
            )}

            {freeNumero && (freeEtage ? etageLibre !== '' : true) && (
              <div className="field">
                <label htmlFor="numero">Numéro de logement / lot <span className="opt">(ex. 12, A, porte gauche)</span></label>
                <input id="numero" type="text" value={numeroLibre} onChange={(e) => setNumeroLibre(e.target.value)} maxLength={40} autoComplete="off" />
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. Créneau */}
      <div className="card">
        <div className="step-title">{n(2)}<h2>Date et créneau</h2></div>
        {coupuresBat.length > 0 && <CoupuresBanner coupures={coupuresBat} batiments={batiments} titre={staff ? 'Coupures d’eau pour ce bâtiment' : 'Coupures d’eau pour votre bâtiment'} />}
        {masquesAutresBat && <div className="notice info">Choisissez d’abord {staff ? 'le' : 'votre'} bâtiment pour voir tous les créneaux disponibles.</div>}
        {jours.length === 0 ? (
          <div className="notice warn">Aucun créneau n’est disponible pour le moment.</div>
        ) : (
          <>
            <p className="hint">Les créneaux déjà pris n’apparaissent plus comme disponibles.</p>
            <div className="days">
              {jours.map((j) => {
                const libres = (parJour.get(j) ?? []).filter((c) => c.pris < c.capacite).length;
                return (
                  <button type="button" key={j} className={`day ${jour === j ? 'on' : ''}`} disabled={libres === 0}
                    onClick={() => { setJour(j); setCreneau(''); }}>
                    <div className="d">{jourCourt(j)}</div>
                    <div className="n">{libres === 0 ? 'Complet' : `${libres} créneau${libres > 1 ? 'x' : ''} libre${libres > 1 ? 's' : ''}`}</div>
                  </button>
                );
              })}
            </div>
            {jour && (
              <>
                <div className="spacer" />
                <div className="lbl">{jourLong(jour)}</div>
                <div className="slots">
                  {slotsDuJour.map((c) => {
                    const restant = c.capacite - c.pris;
                    return (
                      <button type="button" key={c.id} className={`slot ${creneau === c.id ? 'on' : ''}`} disabled={restant <= 0}
                        onClick={() => setCreneau(c.id)}>
                        {heure(c.debut)} – {heure(c.fin)}
                        <small>{restant <= 0 ? 'Complet' : staff && c.capacite > 1 ? `${restant} place${restant > 1 ? 's' : ''}` : 'Disponible'}</small>
                        {c.batiment_id && <span className="eau">💧 pendant la coupure</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 3. Coordonnées */}
      <div className="card">
        <div className="step-title">{n(3)}<h2>{staff ? 'Coordonnées de l’occupant' : 'Vos coordonnées'}</h2></div>
        <div className="field">
          <label htmlFor="nom">Nom et prénom</label>
          <input id="nom" name={staff ? undefined : 'name'} type="text" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete={staff ? 'off' : 'name'} autoCapitalize="words" maxLength={120} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="tel">Téléphone</label>
            <input id="tel" name={staff ? undefined : 'tel'} type="tel" value={tel} onChange={(e) => setTel(formatTel(e.target.value))} autoComplete={staff ? 'off' : 'tel'} inputMode="tel" placeholder="06 12 34 56 78" maxLength={20} />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail <span className="opt">(facultatif)</span></label>
            <input id="email" name={staff ? undefined : 'email'} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={staff ? 'off' : 'email'} inputMode="email" autoCapitalize="none" maxLength={160} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="comm">Informations utiles <span className="opt">(facultatif : code, digicode, animal, personne présente…)</span></label>
          <textarea id="comm" value={comm} onChange={(e) => setComm(e.target.value)} maxLength={600} />
        </div>

        {err && <div className="notice err">{err}</div>}
        <button className="btn big" type="submit" disabled={busy}>
          {busy ? 'Enregistrement…' : submitLabel ?? 'Confirmer mon rendez-vous'}
        </button>
      </div>
    </form>
  );
}
