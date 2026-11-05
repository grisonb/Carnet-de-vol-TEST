// « Ajouter ce terrain » : terrain absent de la table mondiale, enregistré dans les données du pilote
// (réglage « terrainsPerso », compris dans la sauvegarde de secours), jamais dans le code.

import { $, toast } from './commun.js';
import { enregistrerTerrainPerso } from '../etat.js';

let apres = () => {};

function fuseauxConnus() {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return []; }
}

export function ouvrirAjoutTerrain(code, ensuite) {
  apres = ensuite || (() => {});
  $('#ter-code').value = String(code || '').toUpperCase();
  for (const id of ['#ter-nom', '#ter-lat', '#ter-lon', '#ter-pays']) $(id).value = '';
  $('#ter-tz').value = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (!$('#ter-tzs').childElementCount) $('#ter-tzs').innerHTML = fuseauxConnus().map(z => `<option value="${z}">`).join('');
  $('#ter-err').textContent = '';
  $('#ter-modal').hidden = false;
  $('#ter-nom').focus();
}

// Lit un nombre « 45,123 » ou « 45.123 » ; vide = null
const nombre = v => { const t = String(v).trim().replace(',', '.'); return t === '' ? null : Number(t); };

export function lireTerrainSaisi({ code, nom, lat, lon, tz, pays }, fuseaux = fuseauxConnus()) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(c)) return { erreur: 'Le code OACI fait 4 caractères.' };
  if (!String(nom || '').trim()) return { erreur: 'Donne un nom au terrain.' };
  const la = nombre(lat), lo = nombre(lon);
  if ((la === null) !== (lo === null)) return { erreur: 'Donne la latitude ET la longitude (ou aucune des deux).' };
  if (la !== null && !(Math.abs(la) <= 90 && Math.abs(lo) <= 180)) return { erreur: 'Coordonnées impossibles (latitude ±90, longitude ±180).' };
  const z = String(tz || '').trim();
  if (z && fuseaux.length && !fuseaux.includes(z)) {
    try { new Intl.DateTimeFormat('fr', { timeZone: z }); } catch { return { erreur: 'Fuseau inconnu : choisis-le dans la liste (ex. Europe/Paris).' }; }
  }
  return { code: c, terrain: { nom: String(nom).trim(), lat: la, lon: lo, tz: z || 'UTC', pays: String(pays || '').trim().toUpperCase().slice(0, 2) } };
}

export function initTerrainPerso() {
  $('#ter-x').addEventListener('click', () => { $('#ter-modal').hidden = true; });
  $('#ter-code').addEventListener('input', () => { $('#ter-code').value = $('#ter-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  $('#ter-ok').addEventListener('click', async () => {
    const r = lireTerrainSaisi({ code: $('#ter-code').value, nom: $('#ter-nom').value, lat: $('#ter-lat').value,
      lon: $('#ter-lon').value, tz: $('#ter-tz').value, pays: $('#ter-pays').value });
    if (r.erreur) { $('#ter-err').textContent = r.erreur; return; }
    await enregistrerTerrainPerso(r.code, r.terrain);
    $('#ter-modal').hidden = true;
    toast(r.code + ' ajouté à tes terrains');
    apres();
  });
}
