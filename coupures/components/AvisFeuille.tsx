/* eslint-disable @next/next/no-img-element */
import { EAU_LABEL, dateSimple, plageTexte, plagesValides, titreImmeuble, type Avis } from '@/lib/avis';
import type { Logo } from '@/lib/api';

/** La feuille A4 de l'avis, fidèle au modèle Word de Sallandre */
export default function AvisFeuille({ a, logo }: { a: Avis; logo?: Logo | null }) {
  const plages = plagesValides(a);
  const titre = titreImmeuble(a);
  return (
    <div className="sheet">
      <div className={`sh-head${logo?.logo ? ' duo' : ''}`}>
        <img className="sh-logo" src="/logo-sallandre-helios.png" alt="Sallandre – Helios 360" />
        {logo?.logo && (
          <>
            <span className="sh-x" aria-hidden="true">×</span>
            <img className="sh-partner" src={logo.logo} alt={logo.nom} />
          </>
        )}
      </div>

      <p className="sh-lieu">{a.ville || 'Bagneux'}, {a.emis ? `le ${dateSimple(a.emis)}` : ''}</p>

      <div className="sh-immeuble">
        <b>IMMEUBLE – {titre || '…'}</b>
        {a.residence.trim() && a.adresse.trim() && <div>{a.adresse}</div>}
        {a.batiment.trim() && <div>{a.batiment}</div>}
      </div>

      <div className="sh-titre">AVIS<br />DE COUPURE D’EAU</div>

      <p>Mesdames, Messieurs,</p>

      <p className="sh-gap">
        Nous vous informons que nous sommes dans l’obligation de couper l’eau ({EAU_LABEL[a.eau]}), afin de procéder à des {a.motif.trim() || 'travaux de plomberie'}{' '}
        {plages.length > 1 ? <>aux <b>dates</b> suivantes :</> : <>en <b>date</b> du :</>}
      </p>

      <div className="sh-dates">
        {plages.length ? plages.map((p, i) => <div key={i}>{plageTexte(p)}</div>) : <div className="sh-vide">… / … / …   de … à …</div>}
      </div>

      <p>Les robinets ne doivent pas être manœuvrés durant la coupure et vous devez veiller à les laisser fermés en quittant votre logement.</p>

      {a.sansUtilisation && a.texteSansUtilisation.trim() && <p className="sh-fort">{a.texteSansUtilisation}</p>}

      <p className="sh-gap">
        Nous vous prions, Mesdames, Messieurs, de nous excuser pour la gêne engendrée par cette coupure et nous vous assurons de mettre tout en œuvre pour qu’elle soit la plus courte possible.
      </p>

      {a.contact.trim() && <p className="sh-contact">Pour toute question : {a.contact}</p>}

      <img className="sh-foot" src="/pied-de-page.jpg" alt="Agréé Professionnel du Gaz – Batiref – Qualibat RGE – S.A.S. au capital de 300 000 €" />
    </div>
  );
}
