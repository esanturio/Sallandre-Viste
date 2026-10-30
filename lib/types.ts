export type Operation = {
  id: string;
  immeuble: string | null;
  adresse: string | null;
  objet: string;
  consignes: string | null;
  archived: boolean;
  concierge_token?: string;
  tenant_token?: string;
  tech_token?: string;
};

export type Batiment = { id: string; nom: string; ordre: number };

export type Visite = 'vu' | 'absent' | null;

export type Lot = {
  id: string;
  batiment_id: string;
  etage: number;
  numero: string;
  reserve: boolean;
  visite?: Visite;
  visite_note?: string | null;
  visite_at?: string | null;
};

export type Creneau = { id: string; jour: string; debut: string; fin: string; capacite: number; pris: number; batiment_id?: string | null };

export type Coupure = { id: string; batiment_id: string | null; jour: string; debut: string; fin: string };

export type Statut = 'locataire' | 'proprietaire' | 'autre';

export type Reservation = {
  id: string;
  creneau_id: string;
  lot_id: string;
  nom: string;
  telephone: string;
  email: string | null;
  statut: Statut;
  commentaire: string | null;
  created_by: 'locataire' | 'concierge' | 'admin';
  created_at: string;
};

export type OpData = {
  operation: Operation;
  batiments: Batiment[];
  lots: Lot[];
  creneaux: Creneau[];
  reservations: Reservation[];
  coupures?: Coupure[];
  tenant_token?: string; // fourni au gardien pour l'affiche QR
  role?: 'admin' | 'concierge' | 'tech';
};

export type OpSummary = {
  id: string;
  immeuble: string | null;
  adresse: string | null;
  objet: string;
  archived: boolean;
  created_at: string;
  nb_lots: number;
  nb_vus: number;
  nb_reservations: number;
  nb_creneaux: number;
  premier_jour: string | null;
  dernier_jour: string | null;
};

export type Recap = {
  reservation_id: string;
  jour: string;
  debut: string;
  fin: string;
  batiment: string;
  batiment_id?: string;
  etage: number;
  numero: string;
  nom: string;
};

export type BookingInput = {
  creneau: string;
  lot: string | null;
  batiment: string | null;
  etage: number | null;
  numero: string | null;
  nom: string;
  tel: string;
  email: string;
  statut: Statut;
  comm: string;
};

export type Numerotation = 'etage' | 'continue' | 'lettre';
