'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StaffCtx } from './StaffPage';
import { rpc } from '@/lib/api';
import AddressInput from './AddressInput';
import PosterCard from './PosterCard';
import { LinkBox } from './ui';

export default function AccessPanel({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act } = ctx;
  const op = data.operation;
  const router = useRouter();
  const [origin, setOrigin] = useState('');
  const [f, setF] = useState({ immeuble: op.immeuble ?? '', adresse: op.adresse ?? '', objet: op.objet, consignes: op.consignes ?? '', contact: op.contact ?? '' });

  useEffect(() => setOrigin(window.location.origin), []);
  const conciergeUrl = origin ? `${origin}/c/${op.concierge_token}` : '';
  const techUrl = origin ? `${origin}/t/${op.tech_token}` : '';

  const regen = (kind: 'concierge' | 'locataire' | 'tech') =>
    confirm(kind === 'locataire'
      ? 'Créer un nouveau lien pour les occupants ? L’ancien lien et l’ancien QR code ne fonctionneront plus (les affiches devront être réimprimées).'
      : `Créer un nouveau lien ${kind === 'tech' ? 'technicien' : 'gardien'} ? L’ancien lien ne fonctionnera plus.`) &&
    act(() => rpc('admin_regen_token', { p_token: token, p_op: opId, p_kind: kind }), 'Nouveau lien créé');

  return (
    <>
      <PosterCard data={data} tenantToken={op.tenant_token ?? ''} onRegen={() => regen('locataire')} />

      <div className="card">
        <h2>Lien pour le gardien</h2>
        <p className="hint">Le gardien voit le planning, les coordonnées, les logements en attente, et peut inscrire ou déplacer des occupants et imprimer l’affiche. Il ne peut pas modifier les créneaux.<br /><b>Pas de gardien ?</b> N’envoyez ce lien à personne : vous avez toutes ces fonctions ici.</p>
        <LinkBox url={conciergeUrl} />
        <div className="spacer" />
        <button className="linkbtn small" onClick={() => regen('concierge')}>Créer un nouveau lien (désactive l’ancien)</button>
      </div>

      <div className="card">
        <h2>Lien pour le technicien</h2>
        <p className="hint">Sur son téléphone : le planning du jour, les coordonnées et les consignes, et pour chaque logement un bouton « Visité » ou « Absent » avec une note. Vous et le gardien voyez l’avancement en direct.</p>
        <LinkBox url={techUrl} />
        <div className="spacer" />
        <button className="linkbtn small" onClick={() => regen('tech')}>Créer un nouveau lien (désactive l’ancien)</button>
      </div>

      <div className="card">
        <h2>Informations de l’opération</h2>
        <div className="row">
          <div className="field"><label>Nom de la résidence <span className="opt">(facultatif)</span></label><input type="text" value={f.immeuble} onChange={(e) => setF({ ...f, immeuble: e.target.value })} /></div>
          <div className="field"><label>Objet de la visite</label><input type="text" value={f.objet} onChange={(e) => setF({ ...f, objet: e.target.value })} /></div>
        </div>
        <div className="field"><label>Adresse de l’immeuble</label><AddressInput value={f.adresse} onChange={(v) => setF({ ...f, adresse: v })} /></div>
        <div className="field">
          <label>Contact pour les occupants <span className="opt">(facultatif — affiché sur la page, la confirmation et l’affiche)</span></label>
          <input type="text" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} maxLength={200}
            placeholder="ex. Gardien : M. Martin – 06 12 34 56 78  ou  Sallandre : 01 23 45 67 89" />
        </div>
        <div className="field">
          <label>Consignes pour les occupants <span className="opt">(affichées sur la page de réservation)</span></label>
          <textarea value={f.consignes} onChange={(e) => setF({ ...f, consignes: e.target.value })} placeholder="ex. Merci de dégager l’accès sous l’évier et à la salle de bains." />
        </div>
        <button className="btn" onClick={() => act(async () => {
          await rpc('admin_save_operation', {
            p_token: token, p_op: opId, p_immeuble: f.immeuble, p_adresse: f.adresse, p_objet: f.objet, p_consignes: f.consignes, p_archived: op.archived, p_batiments: null,
          });
          await rpc('admin_set_contact', { p_token: token, p_op: opId, p_contact: f.contact });
        }, 'Enregistré')}>Enregistrer</button>
      </div>

      <div className="card">
        <h2>Fin de campagne et données personnelles</h2>
        <p className="hint">
          <b>Archiver</b> désactive le lien occupants et conserve tout.<br />
          <b>Effacer les données personnelles</b> supprime les noms, téléphones, e-mails, informations laissées par les occupants et notes du technicien, et garde seulement les statistiques (logements visités, rendez-vous).<br />
          <b>Supprimer définitivement</b> efface l’opération et toutes ses données : rendez-vous, coordonnées, logements, créneaux, coupures, notes. Les liens gardien, technicien et occupants cessent de fonctionner.
        </p>
        <div className="btns">
          <button className="btn ghost" onClick={() => act(() => rpc('admin_save_operation', {
            p_token: token, p_op: opId, p_immeuble: op.immeuble, p_adresse: op.adresse, p_objet: op.objet, p_consignes: op.consignes, p_archived: !op.archived, p_batiments: null,
          }), op.archived ? 'Opération réactivée' : 'Opération archivée')}>{op.archived ? 'Réactiver' : 'Archiver'}</button>
          <button className="btn ghost" disabled={data.reservations.length === 0} onClick={() =>
            confirm('Effacer définitivement les noms, téléphones, e-mails, commentaires et notes de visite de cette opération ? Cette action est irréversible.') &&
            act(() => rpc('admin_purge_personal', { p_token: token, p_op: opId }), 'Données personnelles effacées')}>
            Effacer les données personnelles
          </button>
          <button className="btn danger" onClick={async () => {
            const v = prompt(`Toutes les données de cette opération (rendez-vous, coordonnées, logements, notes) seront effacées définitivement.\n\nPour confirmer, tapez SUPPRIMER :`);
            if (v?.trim().toUpperCase() !== 'SUPPRIMER') return;
            if (await act(() => rpc('admin_delete_operation', { p_token: token, p_op: opId }))) router.push(`/admin/${token}`);
          }}>Supprimer définitivement</button>
        </div>
      </div>
    </>
  );
}
