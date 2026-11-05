// Traces ADS-B (archives adsb.lol, servies par le VPS) : logique sans interface, testée sous Node.
// La trace sert UNIQUEMENT à afficher le vol sur une carte : elle ne modifie, ne propose et ne compare
// jamais les heures ni les terrains du carnet.

export const DEBUT_ARCHIVES = '2023-03-10';     // première archive adsb.lol
export const MARGE_MS = 10 * 60000;              // 10 min avant le bloc départ / après le bloc arrivée
export const MAX_POINTS = 800;                   // au-delà, on allège la trace (affichage seulement)
export const SOURCE = 'Données © adsb.lol, ODbL';

export const TEXTES = {
  demain: 'La trace sera disponible demain matin, si l\'avion a été capté.',
  sansCode: 'Pas de code ADS-B dans la fiche de cet avion.',
  absente: 'Pas de trace pour ce vol (avion non capté).',
  reunion: 'La Réunion n\'est pas couverte par adsb.lol.',
  avant2023: 'Pas d\'archive ADS-B avant mars 2023.',
  sansMotDePasse: 'Saisis le mot de passe des cartes dans Plus.',
  attente: 'La trace de ce jour n\'est pas encore récupérée (rattrapage en cours sur le serveur).',
  horsLigne: 'La carte s\'affichera quand le téléphone aura du réseau.',
  simulateur: 'Pas de carte pour un vol au simulateur.',
};

const JOUR_MS = 864e5;
const jourDe = ms => new Date(ms).toISOString().slice(0, 10);

// Début et fin du vol en ms UTC (heures bloc), ou null si les heures manquent
export function instantsVol(vol) {
  if (!vol || !vol.date || !vol.hDep || !vol.hArr) return null;
  const debut = Date.parse(`${vol.date}T${vol.hDep}:00Z`);
  let fin = Date.parse(`${vol.date}T${vol.hArr}:00Z`);
  if (fin <= debut) fin += JOUR_MS; // arrivée le lendemain (UTC)
  return { debut, fin };
}

// Jours UTC des archives à lire (un vol qui passe minuit UTC en demande deux)
export function joursTrace(vol) {
  const i = instantsVol(vol);
  if (!i) return vol && vol.date ? [vol.date] : [];
  const jours = [];
  for (let t = Date.parse(jourDe(i.debut - MARGE_MS) + 'T00:00:00Z'); t <= i.fin + MARGE_MS; t += JOUR_MS) jours.push(jourDe(t));
  return jours;
}

export const estReunion = vol => [vol.dep, vol.arr, ...(vol.escales || []).map(e => e.code)]
  .some(c => /^FM/i.test(c || ''));

// Ce qui détermine la trace : si cela change (date, heures, avion, code), la trace est recalculée
export const signatureTrace = (vol, hex) => [hex || '', vol.avionId || '', vol.date || '', vol.hDep || '', vol.hArr || ''].join('|');

// Fichiers du serveur ({ jour, points: [[s depuis minuit UTC, lat, lon, alt]] }) -> points du vol
// [[instant ms UTC, lat, lon, alt]] entre les heures bloc (avec marge), allégés si besoin
export function decouper(fichiers, vol) {
  const i = instantsVol(vol);
  let pts = [];
  for (const f of fichiers) {
    const minuit = Date.parse(f.jour + 'T00:00:00Z');
    for (const p of f.points || []) pts.push([minuit + p[0] * 1000, p[1], p[2], p[3]]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  if (i) pts = pts.filter(p => p[0] >= i.debut - MARGE_MS && p[0] <= i.fin + MARGE_MS);
  return alleger(pts);
}

export function alleger(pts, max = MAX_POINTS) {
  if (pts.length <= max) return pts;
  const pas = pts.length / (max - 1), out = [];
  for (let k = 0; k < max - 1; k++) out.push(pts[Math.floor(k * pas)]);
  out.push(pts[pts.length - 1]);
  return out;
}

// Code ADS-B d'un avion : celui de sa fiche, sinon celui de la liste du serveur
export function codeAvion(avion, index) {
  if (!avion || avion.sim) return '';
  const h = String(avion.hexAdsb || '').trim().toLowerCase();
  if (/^[0-9a-f]{6}$/.test(h)) return h;
  const s = index && index.avions && index.avions[avion.immat];
  return s ? String(s).toLowerCase() : '';
}

// État de la carte d'un vol : { code, texte }. code 'ok' = trace à afficher, 'aTelecharger' = à demander au serveur.
// stockee : { sig, etat: 'ok'|'absente', points } ou null ; index : index.json du serveur ou null.
export function etatCarte({ vol, avion, motDePasse, index, stockee, aujourdhui }) {
  const r = code => ({ code, texte: TEXTES[code] || '' });
  if (!vol || !vol.id || !vol.date) return r('demain');
  if (avion && avion.sim) return r('simulateur');
  if (vol.date < DEBUT_ARCHIVES) return r('avant2023');
  const hex = codeAvion(avion, index);
  const sig = signatureTrace(vol, hex);
  if (stockee && stockee.sig === sig && stockee.etat === 'ok' && stockee.points?.length) return r('ok');
  if (!motDePasse) return r('sansMotDePasse');
  if (!hex) return r('sansCode');
  const jours = joursTrace(vol);
  const dernier = jours[jours.length - 1];
  if (!dernier || dernier >= aujourdhui) return r('demain');
  if (stockee && stockee.sig === sig && stockee.etat === 'absente') return r(estReunion(vol) ? 'reunion' : 'absente');
  if (!index) return r('horsLigne');
  if (index.derniereArchive && dernier > index.derniereArchive) return r('demain');
  const avecTrace = (index.traces && index.traces[hex]) || [];
  if (jours.some(j => avecTrace.includes(j))) return r('aTelecharger');
  // Le serveur dit-il quels jours il a déjà lus ? (sinon : on considère lus les jours <= dernière archive)
  if (Array.isArray(index.joursTraites) && jours.some(j => !index.joursTraites.includes(j))) return r('attente');
  return r(estReunion(vol) ? 'reunion' : 'absente');
}

// Les 30 derniers jours (hors aujourd'hui) : vols dont la trace vaut la peine d'être cherchée en arrière-plan
export function volsRecents(vols, aujourdhui, jours = 30) {
  const debut = jourDe(Date.parse(aujourdhui + 'T00:00:00Z') - jours * JOUR_MS);
  return vols.filter(v => v.date >= debut && v.date < aujourdhui);
}
