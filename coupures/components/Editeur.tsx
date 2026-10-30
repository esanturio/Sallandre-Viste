'use client';

import { useEffect, useMemo, useState } from 'react';
import AddressInput from './AddressInput';
import Apercu from './Apercu';
import BailleurPicker, { BailleursManager } from './BailleurPicker';
import { Footer, Header, Modal } from './ui';
import { logoBailleur, type Logo } from '@/lib/api';
import { avisVide, aujourdhui, lienAvis, manques, messageGardien, nomFichier, plageTexte, titreImmeuble, type Avis, type Eau } from '@/lib/avis';

const BROUILLON = 'sallandre-coupure-brouillon';

type Gardien = { email: string; tel: string };

function lire(): { a: Avis; g: Gardien } | null {
  try {
    const s = localStorage.getItem(BROUILLON);
    if (!s) return null;
    const o = JSON.parse(s);
    return { a: { ...avisVide(), ...o.a, emis: aujourdhui() }, g: { email: '', tel: '', ...o.g } };
  } catch { return null; }
}

const telLien = (t: string) => t.replace(/[^\d+]/g, '');

export default function Editeur({ token }: { token: string }) {
  const [a, setA] = useState<Avis>(avisVide);
  const [g, setG] = useState<Gardien>({ email: '', tel: '' });
  const [pret, setPret] = useState(false);
  const [logo, setLogo] = useState<Logo | null>(null);
  const [gerer, setGerer] = useState(false);
  const [copie, setCopie] = useState(false);
  const [origin, setOrigin] = useState('');

  // Brouillon conservé dans ce navigateur (pratique si on ferme la page par erreur)
  useEffect(() => {
    const b = lire();
    if (b) { setA(b.a); setG(b.g); }
    setOrigin(window.location.origin);
    setPret(true);
  }, []);
  useEffect(() => {
    if (!pret) return;
    try { localStorage.setItem(BROUILLON, JSON.stringify({ a, g })); } catch { /* stockage indisponible */ }
  }, [a, g, pret]);

  useEffect(() => {
    let ok = true;
    if (!a.bailleur) { setLogo(null); return; }
    logoBailleur(a.bailleur).then((l) => ok && setLogo(l));
    return () => { ok = false; };
  }, [a.bailleur, gerer]);

  const set = <K extends keyof Avis>(k: K, v: Avis[K]) => setA((x) => ({ ...x, [k]: v }));
  const setPlage = (i: number, p: Partial<Avis['plages'][number]>) => setA((x) => ({ ...x, plages: x.plages.map((q, j) => (j === i ? { ...q, ...p } : q)) }));

  const manque = manques(a);
  const valide = manque.length === 0;
  const url = useMemo(() => (valide && origin ? lienAvis(origin, a) : ''), [valide, origin, a]);
  const message = url ? messageGardien(a, url) : '';
  const sujet = `Avis de coupure d’eau – ${titreImmeuble(a)}`;

  function imprimer() {
    const t = document.title;
    document.title = nomFichier(a); // nom proposé pour « Enregistrer en PDF »
    window.print();
    setTimeout(() => { document.title = t; }, 500);
  }

  async function partager() {
    try { await navigator.share({ title: sujet, text: message.replace(url, '').trim(), url }); } catch { /* annulé */ }
  }

  async function copier() {
    try { await navigator.clipboard.writeText(url); } catch { prompt('Copiez ce lien :', url); }
    setCopie(true); setTimeout(() => setCopie(false), 1500);
  }

  function nouveau() {
    if (!confirm('Commencer un nouvel avis ? Les dates et l’adresse seront vidées (la ville, le contact et le bailleur sont gardés).')) return;
    setA((x) => ({ ...avisVide(), ville: x.ville, contact: x.contact, bailleur: x.bailleur }));
  }

  return (
    <>
      <Header titre="Avis de coupure d’eau" droite={<button className="btn ghost sm" onClick={nouveau}>Nouvel avis</button>} />
      <main className="no-print-bg">
        <div className="wrap grid">
          <div className="col-form no-print">
            <div className="card">
              <h2>Immeuble</h2>
              <div className="field">
                <label htmlFor="adresse">Adresse</label>
                <AddressInput id="adresse" value={a.adresse} onChange={(v) => set('adresse', v)} />
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="res">Nom de la résidence <span className="opt">(facultatif)</span></label>
                  <input id="res" type="text" value={a.residence} maxLength={120} onChange={(e) => set('residence', e.target.value)} placeholder="ex. Résidence Les Tilleuls" />
                </div>
                <div className="field">
                  <label htmlFor="bat">Bâtiment / escalier <span className="opt">(facultatif)</span></label>
                  <input id="bat" type="text" value={a.batiment} maxLength={120} onChange={(e) => set('batiment', e.target.value)} placeholder="ex. Bâtiment B – escaliers 3 et 4" />
                </div>
              </div>
              <div className="field">
                <label>Bailleur <span className="opt">(facultatif — son logo s’affiche à côté du vôtre)</span></label>
                <BailleurPicker token={token} value={a.bailleur || null} onChange={(id) => set('bailleur', id ?? '')} />
                <button type="button" className="linkbtn small" style={{ marginTop: 6 }} onClick={() => setGerer(true)}>Gérer les bailleurs et logos</button>
              </div>
            </div>

            <div className="card">
              <h2>Coupure</h2>
              {a.plages.map((p, i) => (
                <div className="plage" key={i}>
                  <div className="field">
                    <label>Date</label>
                    <input type="date" value={p.jour} onChange={(e) => setPlage(i, { jour: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>De</label>
                    <input type="time" step={900} value={p.debut} onChange={(e) => setPlage(i, { debut: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>À</label>
                    <input type="time" step={900} value={p.fin} onChange={(e) => setPlage(i, { fin: e.target.value })} />
                  </div>
                  {a.plages.length > 1 && (
                    <button type="button" className="btn ghost sm suppr" aria-label="Retirer cette date"
                      onClick={() => setA((x) => ({ ...x, plages: x.plages.filter((_, j) => j !== i) }))}>✕</button>
                  )}
                  {plageTexte(p) && <div className="plage-txt">{plageTexte(p)}</div>}
                </div>
              ))}
              {a.plages.length < 10 && (
                <button type="button" className="btn ghost sm" onClick={() => setA((x) => {
                  const der = x.plages[x.plages.length - 1];
                  return { ...x, plages: [...x.plages, { jour: '', debut: der?.debut || '09:00', fin: der?.fin || '12:00' }] };
                })}>+ Ajouter une date</button>
              )}

              <div className="field" style={{ marginTop: 16 }}>
                <label>Eau coupée</label>
                <div className="seg">
                  {([['froide', 'Eau froide'], ['chaude', 'Eau chaude'], ['froide_chaude', 'Froide et chaude']] as [Eau, string][]).map(([v, l]) => (
                    <button key={v} type="button" className={a.eau === v ? 'on' : ''} onClick={() => set('eau', v)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="motif">Afin de procéder à des…</label>
                <input id="motif" type="text" value={a.motif} maxLength={200} onChange={(e) => set('motif', e.target.value)} />
              </div>
              <label className="check">
                <input type="checkbox" checked={a.sansUtilisation} onChange={(e) => set('sansUtilisation', e.target.checked)} />
                <span><b>Sans utilisation</b> : interdire l’usage des wc, douches, éviers… (travaux sur l’évacuation)</span>
              </label>
              {a.sansUtilisation && (
                <div className="field">
                  <textarea value={a.texteSansUtilisation} maxLength={1000} rows={4} onChange={(e) => set('texteSansUtilisation', e.target.value)} />
                </div>
              )}
            </div>

            <div className="card">
              <h2>En-tête et contact</h2>
              <div className="row">
                <div className="field">
                  <label htmlFor="ville">Fait à</label>
                  <input id="ville" type="text" value={a.ville} maxLength={80} onChange={(e) => set('ville', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="emis">Le</label>
                  <input id="emis" type="date" value={a.emis} onChange={(e) => set('emis', e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="contact">Contact pour les occupants <span className="opt">(facultatif)</span></label>
                <input id="contact" type="text" value={a.contact} maxLength={200} onChange={(e) => set('contact', e.target.value)} placeholder="ex. Sallandre : 01 23 45 67 89" />
              </div>
            </div>

            <div className="card actions">
              <h2>Diffuser l’avis</h2>
              {!valide && <div className="notice warn">Il manque {manque.join(', ')}.</div>}

              <div className="bloc">
                <div className="bloc-t">🖨 Imprimer et envoyer vous-même</div>
                <p className="hint">Ouvre l’impression au format A4. Pour l’envoyer par e-mail, choisissez « Enregistrer au format PDF » comme imprimante.</p>
                <button className="btn" disabled={!valide} onClick={imprimer}>Imprimer / enregistrer en PDF</button>
              </div>

              <div className="bloc">
                <div className="bloc-t">📤 Envoyer au gardien</div>
                <p className="hint">Le gardien reçoit un lien : il ouvre l’avis sur son téléphone ou son ordinateur et l’imprime pour l’afficher dans le hall.</p>
                <div className="row">
                  <div className="field">
                    <label htmlFor="gmail">E-mail du gardien <span className="opt">(facultatif)</span></label>
                    <input id="gmail" type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} placeholder="gardien@exemple.fr" />
                  </div>
                  <div className="field">
                    <label htmlFor="gtel">Portable du gardien <span className="opt">(facultatif)</span></label>
                    <input id="gtel" type="tel" inputMode="tel" value={g.tel} onChange={(e) => setG({ ...g, tel: e.target.value })} placeholder="06 12 34 56 78" />
                  </div>
                </div>
                <div className="btns">
                  <a className={`btn${valide ? '' : ' disabled'}`} aria-disabled={!valide}
                    href={valide ? `mailto:${encodeURIComponent(g.email.trim())}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(message)}` : undefined}>✉️ Par e-mail</a>
                  <a className={`btn ghost${valide ? '' : ' disabled'}`} aria-disabled={!valide}
                    href={valide ? `sms:${telLien(g.tel)}?&body=${encodeURIComponent(message)}` : undefined}>💬 Par SMS</a>
                  <a className={`btn ghost${valide ? '' : ' disabled'}`} aria-disabled={!valide} target="_blank" rel="noreferrer"
                    href={valide ? `https://wa.me/${telLien(g.tel).replace(/^0/, '33').replace(/^\+/, '')}?text=${encodeURIComponent(message)}` : undefined}>WhatsApp</a>
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button className="btn ghost" disabled={!valide} onClick={partager}>Partager…</button>
                  )}
                </div>
                {url && (
                  <div className="linkbox">
                    <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Lien de l’avis" />
                    <button className="btn ghost sm" type="button" onClick={copier}>{copie ? 'Copié ✓' : 'Copier'}</button>
                    <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer">Ouvrir</a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-apercu">
            <div className="apercu-sticky">
              <div className="lbl no-print">Aperçu</div>
              <Apercu a={a} logo={logo} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
      {gerer && (
        <Modal title="Bailleurs et logos" onClose={() => setGerer(false)}>
          <BailleursManager token={token} />
        </Modal>
      )}
    </>
  );
}
