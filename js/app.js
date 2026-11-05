// Démarrage de l'app : chargement des données, navigation entre les écrans, service worker.

import { $, $$, toast } from './ui/commun.js';
import { charger, surChangement } from './etat.js';
import { chargerTerrains } from './terrains.js';
import { initCarnet, rafraichirCarnet } from './ui/carnet.js';
import { initSaisie, ouvrirSaisie, saisieModifiee, abandonnerSaisie } from './ui/saisie.js';
import { initRetour, majRetour } from './ui/retour.js';
import { initTotaux, rafraichirTotaux } from './ui/totaux.js';
import { initPlus, majPlus, verifierRappel, demanderStockagePersistant, appliquerTypesPerso } from './ui/plus.js';
import { initRegles } from './ui/regles.js';
import { initTerrainPerso } from './ui/terrain-perso.js';
import { initCarte, lancerArrierePlan } from './ui/carte.js';
import { invaliderStats } from './ui/avions.js';
import { VERSION } from './version.js';

let vue = 'carnet';
let aRafraichir = new Set(['carnet', 'totaux', 'plus']);

function montrer(v) {
  vue = v;
  for (const k of ['carnet', 'saisie', 'totaux', 'plus']) $('#v-' + k).hidden = k !== v;
  $$('.tabs button').forEach(b => (b.dataset.v === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('#fab').hidden = v !== 'carnet';
  if (aRafraichir.has(v)) {
    aRafraichir.delete(v);
    if (v === 'carnet') rafraichirCarnet();
    if (v === 'totaux') rafraichirTotaux();
    if (v === 'plus') majPlus();
  }
  window.scrollTo(0, 0);
  majRetour();
}

function ouvrirVol(vol) {
  ouvrirSaisie(vol);
  montrer('saisie');
}

async function demarrer() {
  initCarnet(ouvrirVol);
  initSaisie({ fermer: () => montrer('carnet') });
  initTotaux();
  initPlus();
  initRegles();
  initTerrainPerso();
  initCarte();
  initRetour({ vue: () => vue, montrer, saisieModifiee, abandonnerSaisie });
  // Appui long : pas de menu « copier / partager » hors des champs de saisie (R28)
  document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, select, [contenteditable]')) e.preventDefault(); });
  $$('.tabs button').forEach(b => b.addEventListener('click', () => montrer(b.dataset.v)));
  $('#fab').addEventListener('click', () => ouvrirVol(null));

  try {
    await Promise.all([charger(), chargerTerrains()]);
  } catch (e) {
    $('#list').innerHTML = `<p class="hint">Impossible d'ouvrir le carnet : ${e.message}</p>`;
    return;
  }
  appliquerTypesPerso();
  surChangement(() => {
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
