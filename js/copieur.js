// Copie automatique du carnet sur le NAS (v0.10) : logique sans interface, testée sous Node.
// - Quelques secondes après la DERNIÈRE modification (les modifications rapprochées sont regroupées), une copie part.
// - Une seule copie « en attente » : la copie envoyée est toujours faite avec le carnet du moment.
// - Pas de réseau, NAS éteint ou erreur : nouvel essai plus tard (délais de plus en plus longs), à l'ouverture
//   de l'app et au retour du réseau. Mot de passe refusé : pas de nouvel essai tant qu'il n'est pas corrigé.

export const REGROUPEMENT_MS = 5000;
export const DELAIS_ESSAI = [30e3, 60e3, 120e3, 300e3, 600e3, 1800e3];

// envoyer() -> Promise<{ statut: 'ok'|'refuse'|'injoignable'|'trop-gros'|'abimee'|'stockage', ... }>
// pret(forcer) -> la copie est-elle configurée (et automatique, sauf si forcer) ?
// enLigne() -> le téléphone a-t-il du réseau ?  surEtat(evenement) : pour l'affichage et l'enregistrement
// regroupement : délai avant l'envoi après une modification (la copie NAS : 5 s ; la synchro, v0.26 : presque tout de suite)
export function creerCopieur({ envoyer, pret, enLigne = () => true, surEtat = () => {}, regroupement = REGROUPEMENT_MS, minuterie = { poser: (f, ms) => setTimeout(f, ms), enlever: id => clearTimeout(id) } }) {
  let enAttente = false, enCours = false, echecs = 0, refuse = false, horloge = null;

  const planifier = ms => { minuterie.enlever(horloge); horloge = minuterie.poser(() => { horloge = null; lancer(false); }, ms); };

  async function lancer(forcer) {
    if (enCours) return { statut: 'enCours' };
    if (!forcer && (!enAttente || refuse)) return { statut: 'rien' };
    if (!pret(forcer)) return { statut: 'pasConfiguree' };
    if (!enLigne()) { surEtat({ statut: 'horsLigne', enAttente }); return { statut: 'horsLigne' }; }
    minuterie.enlever(horloge); horloge = null;
    enCours = true;
    const avant = enAttente;
    enAttente = false; // une modification pendant l'envoi la remettra « en attente »
    let r;
    try { r = await envoyer(); } catch { r = { statut: 'injoignable' }; }
    enCours = false;
    if (r.statut === 'ok') {
      echecs = 0; refuse = false;
      surEtat({ ...r, enAttente });
      if (enAttente) planifier(regroupement);
    } else {
      enAttente = enAttente || avant || forcer;
      if (r.statut === 'refuse') refuse = true;
      else { planifier(DELAIS_ESSAI[Math.min(echecs, DELAIS_ESSAI.length - 1)]); echecs++; }
      surEtat({ ...r, enAttente });
    }
    return r;
  }

  return {
    // Le carnet vient de changer
    modification() {
      enAttente = true;
      surEtat({ statut: 'attente', enAttente });
      if (!enCours) planifier(regroupement);
    },
    // Ouverture de l'app, retour du réseau, nouveau mot de passe : on réessaie bientôt (s'il y a quelque chose à copier)
    reprendre(ms = 2000) {
      refuse = false; echecs = 0;
      if (enAttente && !enCours) planifier(ms);
    },
    // Bouton « Copier maintenant » (marche même si la copie automatique est arrêtée)
    maintenant: () => lancer(true),
    // Copie en attente gardée d'une session précédente
    restaurerAttente(v) { enAttente = !!v; },
    get enAttente() { return enAttente; },
    get enCours() { return enCours; },
  };
}

// Adresse tapée (dossier ou fichier) -> adresse du script ; seulement https (ou http local pour les tests)
export function urlApi(adresse) {
  let a = String(adresse || '').trim();
  if (!a) return '';
  if (!/^https?:\/\//i.test(a)) a = 'https://' + a;
  let u;
  try { u = new URL(a); } catch { return ''; }
  const local = ['127.0.0.1', 'localhost'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) return '';
  if (!/\.php$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\/?$/, '/') + 'carnet.php';
  u.search = ''; u.hash = '';
  return u.toString();
}

// « à l'instant », « il y a 2 min », « il y a 3 h », « le 05/11 à 14h32 »
export function depuis(iso, maintenant = Date.now()) {
  if (!iso) return '';
  const t = Date.parse(iso), m = Math.floor((maintenant - t) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 24 * 60) return `il y a ${Math.floor(m / 60)} h`;
  const d = new Date(t), p = n => String(n).padStart(2, '0');
  return `le ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}

// Sous-titre de « Copie sur le NAS » dans Plus
// conf : { configuree, auto } ; e : état enregistré { derniereCopie, enAttente, statut }
export function resumeNas(conf, e = {}, maintenant = Date.now(), enLigne = true) {
  if (!conf.configuree) return 'Pas configurée';
  if (e.statut === 'refuse') return 'Mot de passe refusé : à corriger';
  const derniere = e.derniereCopie ? `Dernière copie : ${depuis(e.derniereCopie, maintenant)}` : 'Aucune copie pour l\'instant';
  if (!conf.auto) return `Copie automatique arrêtée · ${derniere}`;
  if (e.enAttente) {
    if (!enLigne || e.statut === 'horsLigne') return 'En attente (pas de réseau)';
    if (e.statut === 'injoignable') return 'En attente (NAS injoignable)';
    if (e.statut === 'bloque') return 'En attente (trop d\'essais de mot de passe sur le NAS)';
    if (e.statut === 'trop-gros') return 'En attente (copie trop grosse pour le NAS)';
    if (e.statut === 'stockage' || e.statut === 'abimee') return 'En attente (erreur sur le NAS)';
    return 'En attente (copie dans quelques secondes)';
  }
  return derniere;
}

// Encart de Plus : la copie NAS « marche » si elle a réussi et que rien n'attend depuis plus d'un jour
export function copieNasAJour(conf, e = {}, maintenant = Date.now()) {
  if (!conf.configuree || !conf.auto || !e.derniereCopie || e.statut === 'refuse') return false;
  return !e.enAttente || maintenant - Date.parse(e.derniereCopie) < 864e5;
}

// Compression gzip (la copie envoyée au NAS) et empreinte SHA-256 (le NAS vérifie qu'elle est arrivée entière)
export async function compresser(texte) {
  const flux = new Blob([texte]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}
export async function decompresser(octets) {
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(flux).text();
}
export async function empreinteSha256(octets) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', octets));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const taillePropre = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);

// v0.22 (R51) : nouveau mot de passe du NAS. Il voyage dans un en-tête HTTP : lettres SANS accent, chiffres et signes,
// sans espace (une lettre accentuée n'y arriverait pas sous la même forme). Renvoie '' s'il convient, sinon l'explication.
export const MDP_MIN = 12;
export function problemeNouveauMotDePasse(nouveau, confirmation, actuel) {
  const n = String(nouveau || '');
  if (!n) return 'Tape le nouveau mot de passe.';
  if (!/^[\x21-\x7e]+$/.test(n)) return 'Lettres sans accent, chiffres et signes seulement (pas d\'espace, pas d\'accent).';
  if (n.length < MDP_MIN) return `Au moins ${MDP_MIN} caractères (${n.length} pour l'instant).`;
  if (n.length > 200) return 'Trop long (200 caractères au plus).';
  if (n !== String(confirmation || '')) return 'Les deux mots de passe tapés ne sont pas identiques.';
  if (n === String(actuel || '')) return 'C\'est déjà le mot de passe actuel.';
  return '';
}

// « Trop d'essais » : attente donnée par le NAS (secondes) -> « 1 min », « 14 min », « 1 h 05 »
export function texteAttente(secondes) {
  const m = Math.max(1, Math.ceil((Number(secondes) || 0) / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
