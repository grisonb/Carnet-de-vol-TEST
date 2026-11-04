// Structure des données. Chaque élément (vol, avion, personne) a un identifiant unique et une
// date de modification : c'est ce qui permettra la copie sur le NAS en v0.2.

export const COMPTEURS = [
  { cle: 'largCdbDash', nom: 'Largages CdB Dash', court: 'lrg' },
  { cle: 'largInstrCdbDash', nom: 'Largages instruction CdB Dash', court: 'lrg instr.' },
  { cle: 'largCopiDash', nom: 'Largages copi Dash', court: 'lrg copi' },
  { cle: 'largCopiCL', nom: 'Largages copi CL', court: 'lrg copi CL' },
  { cle: 'ecopages', nom: 'Écopages', court: 'écop.' },
  { cle: 'amerrCL', nom: 'Amerrissages CL', court: 'amerr. CL' },
  { cle: 'amerrSEP', nom: 'Amerrissages SEP', court: 'amerr. SEP' },
  { cle: 'largPara', nom: 'Largages para', court: 'lrg para' },
];

// Réglage par défaut des compteurs de la saisie (ordre + affiché ou non), comme la maquette
export const COMPTEURS_DEFAUT = COMPTEURS.map(c => ({ cle: c.cle, on: c.cle === 'largCdbDash' || c.cle === 'largInstrCdbDash' }));

export const FONCTIONS = {
  cdb: { bouton: 'CdB', autre: 'Copi', puce: 'CDB', puceAutre: 'Copi', champ: 'nomCopi', temps: 'tempsCdB',
    libelle: 'Commandant de bord', aide: 'Carnet EASA : temps en colonne CdB, nom du CdB = SELF.', ajout: 'un copi' },
  copi: { bouton: 'Copi.', autre: 'CdB', puce: 'Copi.', puceAutre: 'CdB', champ: 'nomCdB', temps: 'tempsCopi',
    libelle: 'Copilote', aide: 'Carnet EASA : temps en colonne Copilote, nom du CdB = la personne ci-dessus.', ajout: 'un CdB' },
  dc: { bouton: 'DC', autre: 'Instructeur', puce: 'DC', puceAutre: 'Instr.', champ: 'nomInstructeur', temps: 'tempsDC',
    libelle: 'Double commande', aide: "Carnet EASA : temps en colonne Double commande, nom du CdB = l'instructeur.", ajout: 'un instructeur' },
  inst: { bouton: 'Inst.', autre: 'Élève', puce: 'Inst.', puceAutre: 'Élève', champ: 'nomEleve', temps: 'tempsInst',
    libelle: 'Instructeur', aide: 'Carnet EASA : temps en colonne Instructeur, nom du CdB = SELF.', ajout: 'un élève' },
};

export const TEMPS_FONCTION = ['tempsCdB', 'tempsCopi', 'tempsDC', 'tempsInst'];

export function nouvelId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

export function horodater(objet, maintenant = new Date().toISOString()) {
  if (!objet.id) objet.id = nouvelId();
  if (!objet.creeLe) objet.creeLe = maintenant;
  objet.modifieLe = maintenant;
  return objet;
}

export function volVide() {
  return {
    id: null, creeLe: null, modifieLe: null, source: 'saisie', ordre: 0,
    date: null, dep: '', arr: '', escales: [], hDep: null, hArr: null, mode: 'loc',
    avionId: null, indicatif: '', etiquettes: [],
    fonction: 'cdb', nomCdB: 'SELF', nomCopi: '', nomEleve: '', nomInstructeur: '', nomExaminateur: '',
    tempsTotal: 0, tempsSE: null, tempsME: null, tempsMP: null,
    tempsCdB: 0, tempsCopi: 0, tempsDC: 0, tempsInst: 0, tempsPICUS: 0, tempsExam: 0,
    tempsNuit: 0, tempsIFR: 0, tempsXC: 0, regleIFR: false, approches: 0, approcheType: '',
    attJour: 0, attNuit: 0, decJour: 0, decNuit: 0,
    simTemps: 0, simType: '',
    missions: [], feux: 0, compteurs: Object.fromEntries(COMPTEURS.map(c => [c.cle, 0])),
    remarques: '', notePerso: '', route: '',
  };
}

export function avionVide() {
  return {
    id: null, creeLe: null, modifieLe: null, immat: '', sim: false, typeOACI: '', constructeur: '',
    modele: '', indicatif: '', nom: '', etiquettes: [], remarques: '', photo: null,
    equipage: null, moteurs: null, moteur: null, surface: 'L', train: 'tricycle', fstd: null,
  };
}

export function personneVide() {
  return { id: null, creeLe: null, modifieLe: null, prenom: '', nom: '', tri: '' };
}

export const nomPersonne = p => p.tri || [p.prenom, p.nom].filter(Boolean).join(' ');

// "FABCD" -> "F-ABCD" ; "HAXYZ" -> "HA-XYZ" ; "N123AB" et "SIM-01" inchangés
const PREFIXES_2 = ['HA', 'HB', 'OE', 'OK', 'OM', 'OO', 'OY', 'OH', 'SE', 'SP', 'SX', 'LN', 'LX', 'LY', 'LZ',
  'EC', 'EI', 'ES', 'CS', 'YR', 'YL', 'S5', '9A', '9H', 'TC', 'UR', 'ZS', 'VH', 'ZK', 'PH', 'TF', 'ER', 'EW'];
export function formaterImmat(texte) {
  const r = String(texte || '').trim().toUpperCase();
  if (r.includes('-') || r.startsWith('N')) return r;
  const s = r.replace(/[^A-Z0-9]/g, '');
  if (/^[FDGIMB][A-Z]{4}$/.test(s)) return s[0] + '-' + s.slice(1);
  if (s.length === 5 && PREFIXES_2.includes(s.slice(0, 2))) return s.slice(0, 2) + '-' + s.slice(2);
  return s;
}

// Colonnes « avion » du carnet EASA pour un vol : une valeur saisie l'emporte, sinon
// on déduit de la fiche avion (multipilote -> Multi-pilote ; monopilote -> SE ou ME).
export function colonnesAvion(vol, avion) {
  if (!avion || avion.sim) return { se: 0, me: 0, mp: 0 };
  const total = vol.tempsTotal || 0;
  const mp = vol.tempsMP ?? (avion.equipage === 'MP' ? total : 0);
  const reste = Math.max(0, total - mp);
  const sp = avion.equipage === 'SP';
  return {
    se: vol.tempsSE ?? (sp && avion.moteurs !== 'ME' ? reste : 0),
    me: vol.tempsME ?? (sp && avion.moteurs === 'ME' ? reste : 0),
    mp,
  };
}

export function texteColonneAvion(avion) {
  if (!avion) return '';
  if (avion.sim) return 'Carnet EASA : colonne FSTD (simulateur)';
  if (avion.equipage === 'MP') return 'Carnet EASA : colonne Multi-pilote';
  if (avion.equipage === 'SP') return 'Carnet EASA : colonne Mono-pilote ' + (avion.moteurs === 'ME' ? 'ME' : 'SE');
  return 'Carnet EASA : fiche à compléter (monopilote ou multipilote)';
}

// Clé anti-doublon : date + départ + arrivée + immatriculation + heure + durée
export function cleDoublon(vol, immat) {
  return [vol.date, vol.dep || '', vol.arr || '', formaterImmat(immat), vol.hDep || '',
    vol.tempsTotal || vol.simTemps || 0].join('|');
}

// Du plus récent au plus ancien : date, heure de départ, puis ordre d'enregistrement
export function comparerRecentDabord(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ha = a.hDep || '', hb = b.hDep || '';
  if (ha !== hb) return ha < hb ? 1 : -1;
  return (b.ordre || 0) - (a.ordre || 0);
}
