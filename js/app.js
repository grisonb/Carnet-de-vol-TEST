// Démarrage de l'app : chargement des données, navigation entre les écrans, service worker.

import { $, $$, toast } from './ui/commun.js';
import { charger, surChangement } from './etat.js';
import { chargerTerrains } from './terrains.js';
import { initCarnet, rafraichirCarnet } from './ui/carnet.js';
import { initSaisie, ouvrirSaisie } from './ui/saisie.js';
import { initTotaux, rafraichirTotaux } from './ui/totaux.js';
import { initPlus, majPlus, verifierRappel, demanderStockagePersistant, appliquerTypesPerso } from './ui/plus.js';
import { initRegles } from './ui/regles.js';
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
}

// Service worker : fonctionnement hors ligne + mise à jour quand une nouvelle version est publiée
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js', { type: 'module', scope: './', updateViaCache: 'none' }).then(reg => {
    reg.addEventListener('updatefound', () => {
      const nouveau = reg.installing;
      nouveau && nouveau.addEventListener('statechange', () => {
        if (nouveau.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nouvelle version installée : elle sera active au prochain lancement.', 4000);
        }
      });
    });
  }).catch(() => {});
}

// Version toujours visible sur l'accueil (même si le chargement des vols échoue)
$('#h-version').textContent = 'v' + VERSION;
demarrer();
