// Flèche (ou geste) retour d'Android : revenir d'un niveau au lieu de quitter l'app.
// Une entrée d'historique (pushState) par niveau ouvert : onglet Totaux / Plus ou fiche d'un vol, puis chaque
// fenêtre ou feuille ouverte par-dessus. Une fenêtre fermée par son bouton (×, Annuler…) retire son entrée
// (history.go) : pas d'entrée « fantôme » qui obligerait à appuyer deux fois sur retour.
// Les fenêtres sont suivies par leur attribut « hidden » : rien à changer dans le code qui les ouvre.
// v0.18 (R55) : un history.go() de l'app peut se terminer TARD (téléphone lent, démarrage) ; son popstate était alors
// pris pour un appui sur retour et fermait la fenêtre du dessus (la liste des vols NPF se fermait toute seule).
// Chaque entrée porte son niveau ({ carnet: n }) : un popstate qui arrive au niveau visé par l'app (cible) est le sien,
// même en retard ; un retour de l'utilisateur arrive, lui, sous le niveau courant.

import { $ } from './commun.js';

// Fenêtre -> bouton qui la ferme (même effet que la flèche retour)
const COUCHES = {
  fleet: '#fl-x', fiche: '#fi-x', add1: '#a1-x', 'p-modal': '#pm-x', 'tg-modal': '#pm2-x',
  'rules-modal': '#rm-x', 'via-modal': '#vm-cancel', 'ter-modal': '#ter-x', 'hs-modal': '#hs-x',
  'ml-modal': '#mlm-x', 'fd-modal': '#fd-no', 'carte-plein': '#cp-x', outil: '#ou-x', 'ab-modal': '#ab-no', 'ph-modal': '#ph-x', 'feu-modal': '#feu-non', 'fn-modal': '#fn-non', 'rc-modal': '#rc-non',
};

let opts = null;
let ouvertes = [];   // fenêtres visibles, dans l'ordre d'ouverture (la dernière est au-dessus)
let poussees = 0;    // entrées ajoutées à l'historique
let enAttente = false; // un history.go() est en cours (son popstate ne compte pas comme un « retour »)
let cible = null;      // niveau d'historique où ce history.go() doit arriver
let minuterie = null;
// history.go() sans effet (rare) : on ne reste pas bloqué en attente ; s'il arrive quand même plus tard, son
// niveau (cible) le fait reconnaître
function reculer(n) {
  enAttente = true;
  cible = poussees;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { if (enAttente) { enAttente = false; majRetour(); } }, 3000);
  history.go(-n);
}
const niveauActuel = () => (history.state && Number.isInteger(history.state.carnet) ? history.state.carnet : 0);

function recompter() {
  ouvertes = ouvertes.filter(id => !document.getElementById(id).hidden);
  for (const id of Object.keys(COUCHES)) {
    const e = document.getElementById(id);
    if (e && !e.hidden && !ouvertes.includes(id)) ouvertes.push(id);
  }
}
const niveaux = () => (opts.vue() !== 'carnet' ? 1 : 0) + ouvertes.length;

// Remet l'historique au nombre de niveaux ouverts (appelé après chaque changement)
export function majRetour() {
  if (!opts || enAttente) return;
  recompter();
  const voulu = niveaux();
  while (poussees < voulu) { poussees++; history.pushState({ carnet: poussees }, ''); }
  if (poussees > voulu) {
    const n = poussees - voulu;
    poussees = voulu;
    reculer(n);
  }
}

// Un appui sur retour : ferme ce qui est au-dessus
function retour() {
  recompter();
  const haut = ouvertes[ouvertes.length - 1];
  if (haut) {
    const b = $(COUCHES[haut]);
    if (b) b.click(); else document.getElementById(haut).hidden = true;
    return;
  }
  const v = opts.vue();
  if (v === 'saisie') {
    if (opts.saisieModifiee()) $('#ab-modal').hidden = false;
    else opts.abandonnerSaisie();
    return;
  }
  if (v !== 'carnet') opts.montrer('carnet');
}

export function initRetour(o) {
  opts = o;
  $('#ab-no').addEventListener('click', () => { $('#ab-modal').hidden = true; });
  $('#ab-yes').addEventListener('click', () => { $('#ab-modal').hidden = true; opts.abandonnerSaisie(); });
  const obs = new MutationObserver(majRetour);
  for (const id of Object.keys(COUCHES)) {
    const e = document.getElementById(id);
    if (e) obs.observe(e, { attributes: true, attributeFilter: ['hidden'] });
  }
  addEventListener('popstate', () => {
    const niveau = niveauActuel();
    // Fin d'un history.go() de l'app (même arrivé en retard) : ce n'est pas un « retour », rien ne se ferme
    if (enAttente || niveau === cible) {
      enAttente = false; cible = null; clearTimeout(minuterie);
      poussees = niveau;
      majRetour();
      return;
    }
    poussees = Math.min(Math.max(0, poussees - 1), niveau);
    retour();
    majRetour();
  });
  // App rechargée avec des entrées d'une session précédente : on revient à la première
  const n = history.state && history.state.carnet;
  if (n > 0) reculer(n);
}

// Pour les tests
export const _retour = () => ({ poussees, ouvertes: [...ouvertes] });
