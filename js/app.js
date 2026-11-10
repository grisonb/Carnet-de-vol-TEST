// Démarrage de l'app : chargement des données, navigation entre les écrans, service worker.

import { $, $$, toast } from './ui/commun.js';
import { charger, surChangement } from './etat.js';
import { chargerTerrains } from './terrains.js';
import { initCarnet, rafraichirCarnet, memoriserPlace, restaurerPlace, oublierPlace, allerAuDernierVol } from './ui/carnet.js';
import { initSaisie, ouvrirSaisie, saisieModifiee, abandonnerSaisie } from './ui/saisie.js';
import { initRetour, majRetour } from './ui/retour.js';
import { initTotaux, rafraichirTotaux } from './ui/totaux.js';
import { initPlus, majPlus, verifierRappel, demanderStockagePersistant, appliquerTypesPerso } from './ui/plus.js';
import { initRegles } from './ui/regles.js';
import { initTerrainPerso } from './ui/terrain-perso.js';
import { initCarte, lancerArrierePlan } from './ui/carte.js';
import { initNas, carnetModifie } from './ui/nas.js';
import { initNpf, verifierVolsNpf } from './ui/npf.js';
import { initSynchro, synchroModifiee, majBandeaux } from './ui/synchro.js';
import { invaliderStats } from './ui/avions.js';
import { VERSION } from './version.js';

let vue = 'carnet';
let aRafraichir = new Set(['carnet', 'totaux', 'plus']);

function montrer(v) {
  if (vue === 'carnet' && v !== 'carnet') memoriserPlace(); // la liste garde sa place (v0.13)
  vue = v;
  for (const k of ['carnet', 'saisie', 'totaux', 'plus']) $('#v-' + k).hidden = k !== v;
  $$('.tabs button[data-v]').forEach(b => (b.dataset.v === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (v !== 'carnet') $('#top-btn').hidden = true;
  if (aRafraichir.has(v)) {
    aRafraichir.delete(v);
    if (v === 'carnet') rafraichirCarnet({ retour: true });
    if (v === 'totaux') rafraichirTotaux();
    if (v === 'plus') majPlus();
  }
  if (v === 'carnet') restaurerPlace(); else window.scrollTo(0, 0);
  majRetour();
}

function ouvrirVol(vol) {
  ouvrirSaisie(vol);
  montrer('saisie');
}

async function demarrer() {
  // La place dans la liste est gérée par l'app (v0.13) : le navigateur ne doit pas remettre son propre défilement
  // quand la flèche retour revient dans l'historique (sinon retour en haut de la liste).
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  initCarnet(ouvrirVol);
  initSaisie({ fermer: () => montrer('carnet') });
  initTotaux();
  initPlus();
  initRegles();
  initTerrainPerso();
  initCarte();
  // « Abandonner la saisie ? » : après « Abandonner », le « + » ouvre ensuite le nouveau vol (v0.28)
  let apresAbandon = null;
  initRetour({ vue: () => vue, montrer, saisieModifiee, abandonnerSaisie: () => {
    abandonnerSaisie();
    const f = apresAbandon; apresAbandon = null;
    if (f) f();
  } });
  $('#ab-no').addEventListener('click', () => { apresAbandon = null; });
  // Vols envoyés par NPF-Q400 : brouillon dans la saisie (vol = vol déjà enregistré avec le même id, ou null)
  initNpf({ ouvrir: (n, vol) => { memoriserPlace(); ouvrirSaisie(vol, { npf: n }); montrer('saisie'); } });
  // Appui long : pas de menu « copier / partager » hors des champs de saisie (R28)
  document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, select, [contenteditable]')) e.preventDefault(); });
  // Onglet Carnet touché alors qu'on y est déjà : retour au dernier vol (en haut)
  $$('.tabs button[data-v]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.v === 'carnet' && vue === 'carnet') return allerAuDernierVol();
    montrer(b.dataset.v);
  }));
  // v0.28 (R67) : « + » de la barre du bas, depuis Carnet, Totaux ou Plus ; saisie en cours modifiée : on demande d'abord
  $('#fab').addEventListener('click', () => {
    const nouveau = () => { if (vue === 'carnet') memoriserPlace(); oublierPlace(); ouvrirVol(null); }; // nouveau vol : retour en haut
    if (vue === 'saisie' && saisieModifiee()) { apresAbandon = nouveau; $('#ab-modal').hidden = false; return; }
    nouveau();
  });

  try {
    await Promise.all([charger(), chargerTerrains()]);
  } catch (e) {
    $('#list').innerHTML = `<p class="hint">Impossible d'ouvrir le carnet : ${e.message}</p>`;
    return;
  }
  appliquerTypesPerso();
  surChangement(() => {
    carnetModifie(); // copie automatique sur le NAS, quelques secondes plus tard
    synchroModifiee(); // v0.23 / v0.24 : ce qui a changé part sur le NAS (et ce qui a changé ailleurs arrive)
    majBandeaux();     // v0.24 : conflits, doublons possibles
    invaliderStats();
    aRafraichir = new Set(['carnet', 'totaux', 'plus']);
    aRafraichir.delete(vue);
    if (vue === 'carnet') rafraichirCarnet();
    if (vue === 'totaux') rafraichirTotaux();
    if (vue === 'plus') majPlus();
    verifierRappel();
  });
  montrer('carnet');
  verifierRappel();
  demanderStockagePersistant().then(() => { if (vue === 'plus') majPlus(); });
  initNas();
  initSynchro();
  setTimeout(verifierVolsNpf, 1200); // vols envoyés par NPF-Q400, discrètement
  document.body.dataset.pret = '1';
  setTimeout(lancerArrierePlan, 1500); // traces des 30 derniers jours, discrètement
}

// Service worker : fonctionnement hors ligne + mise à jour quand une nouvelle version est publiée.
// Enregistré en script classique (comme en v0.1) avec la portée du Carnet seulement.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const avaitUnServiceWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })
    .then(reg => reg.update()).catch(() => {});
  // Une nouvelle version vient de prendre la main : on recharge pour l'afficher, sauf pendant une saisie
  // (on ne perd jamais un vol en cours) ; dans ce cas elle s'affichera au prochain lancement.
  let recharge = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitUnServiceWorker || recharge) return;
    const saisieOuverte = !$('#v-saisie').hidden || !!document.querySelector('.modal:not([hidden])');
    if (saisieOuverte) { toast('Nouvelle version installée : elle s\'affichera au prochain lancement.', 4000); return; }
    recharge = true;
    location.reload();
  });
}

// Version toujours visible sur l'accueil (même si le chargement des vols échoue)
$('#h-version').textContent = 'v' + VERSION;
demarrer();
