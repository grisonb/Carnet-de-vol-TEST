// v0.21 (R34) : fiche avion › « Chercher une photo ». Vignettes Wikimedia Commons à choisir (photo gardée avec son
// crédit) + la photo Planespotters.net affichée en ligne avec son crédit et son lien (jamais gardée). Rien n'est rempli
// sans le choix du pilote ; la fiche n'est modifiée qu'à « Enregistrer ».

import { $, esc } from './commun.js';
import { urlCategorie, urlRechercheTitre, urlGrande, urlPlanespotters, lirePhotosCommons, fusionnerPhotos, lireGrande,
  lirePlanespotters, creditCommons, AGENT } from '../photos-web.js';

let photos = [];
let choisie = null;     // photo Commons regardée en grand
let rappel = null;      // (photo réduite, crédit) => void
let reduire = null;     // réduction de la photo (la même que pour une photo prise au téléphone)
let jeton = 0;          // une nouvelle recherche annule l'affichage de la précédente

const lireJson = async (url, entetes = {}) => {
  const r = await fetch(url, { headers: entetes, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const message = t => { $('#ph-etat').textContent = t; };
const lien = (url, texte) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(texte)}</a>` : esc(texte));
export const htmlCredit = c => (c ? `Photo : ${lien(c.page, c.auteur)} · ${lien(c.licenceUrl, c.licence)} · ${esc(c.source)}` : '');

function vueListe() {
  choisie = null;
  $('#ph-liste').hidden = false; $('#ph-choix').hidden = true;
}

export async function ouvrirRecherchePhoto({ immat, avion, choisir, reduirePhoto }) {
  rappel = choisir; reduire = reduirePhoto;
  const n = ++jeton;
  photos = [];
  $('#ph-t').textContent = `Photos de ${immat}`;
  $('#ph-l').innerHTML = ''; $('#ph-ps').innerHTML = '';
  vueListe();
  $('#ph-modal').hidden = false;
  if (!navigator.onLine) { message('Pas de réseau : la recherche de photos a besoin d\'Internet.'); return; }
  message('Recherche sur Wikimedia Commons…');
  // Planespotters en même temps (une seule demande) ; Commons : catégorie puis titres, l'une après l'autre
  const ps = lireJson(urlPlanespotters(immat)).then(lirePlanespotters, () => undefined);
  let cat = [], tit = [], erreur = false;
  try { cat = lirePhotosCommons(await lireJson(urlCategorie(immat), { 'Api-User-Agent': AGENT }), immat, { categorie: true, avion }); } catch { erreur = true; }
  if (n !== jeton) return;
  try { tit = lirePhotosCommons(await lireJson(urlRechercheTitre(immat), { 'Api-User-Agent': AGENT }), immat, { avion }); } catch { erreur = true; }
  if (n !== jeton) return;
  photos = fusionnerPhotos(cat, tit);
  $('#ph-l').innerHTML = photos.map((p, i) => `<button type="button" class="phv" data-ph="${i}">
      <img src="${esc(p.vignette)}" alt="Photo ${i + 1}" loading="lazy">${p.aVerifier ? '<span class="phw">À vérifier</span>' : ''}
      <span class="phc">${esc(p.auteur)} · ${esc(p.licence)}</span><span class="phtap">Toucher pour utiliser</span></button>`).join('')
    // v0.26 (R59) : aucune photo libre -> le dire clairement et proposer une photo à soi
    || `<div class="ph-aucune"><p><b>${erreur ? 'Wikimedia Commons ne répond pas.' : `Aucune photo libre de ${esc(immat)} sur Wikimedia Commons.`}</b> Tu peux mettre ta propre photo :</p>
      <label class="bigbtn vert ph-fichier">Prendre une photo<input type="file" accept="image/*" capture="environment" id="ph-cam"></label>
      <label class="bigbtn second ph-fichier">Choisir dans la galerie<input type="file" accept="image/*" id="ph-gal"></label></div>`;
  // (aucune photo : le message est dans l'encadré, avec « Prendre une photo » / « Choisir dans la galerie »)
  message(photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} libre${photos.length > 1 ? 's' : ''} sur Wikimedia Commons : touche celle que tu veux garder.` : '');
  for (const id of ['#ph-cam', '#ph-gal']) $(id)?.addEventListener('change', photoAMoi);
  const p = await ps;
  if (n !== jeton) return;
  $('#ph-ps').innerHTML = p
    ? `<h4>Planespotters.net</h4>
      <a class="ph-psimg" href="${esc(p.lien)}" target="_blank" rel="noopener"><img src="${esc(p.vignette)}" alt="Photo de ${esc(immat)} sur Planespotters.net"><span class="ph-seule">À voir seulement : ne peut pas être gardée</span></a>
      <p class="phcredit">Photo : <a href="${esc(p.lien)}" target="_blank" rel="noopener">${esc(p.photographe)}</a> · Planespotters.net</p>
      <p class="hint">Affichée seulement : les règles de Planespotters interdisent de la garder dans le carnet. Touche-la pour l'ouvrir sur leur site.</p>`
    : `<p class="hint">Planespotters.net : ${p === null ? `aucune photo de ${esc(immat)}.` : 'ne répond pas.'}</p>`;
}

// Photo prise au téléphone / choisie dans la galerie (pas de crédit) : réduite comme dans la fiche
async function photoAMoi(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const photo = await reduire(f);
    jeton++;
    $('#ph-modal').hidden = true;
    rappel(photo, null);
  } catch { message('Photo illisible : essaie une autre photo.'); }
}

function regarder(i) {
  choisie = photos[i];
  if (!choisie) return;
  $('#ph-grand').innerHTML = `<img src="${esc(choisie.vignette)}" alt="">`;
  $('#ph-credit').innerHTML = htmlCredit(creditCommons(choisie));
  $('#ph-avert').hidden = !choisie.aVerifier;
  $('#ph-liste').hidden = true; $('#ph-choix').hidden = false;
  $('#ph-ok').disabled = false;
  message('');
}

async function utiliser() {
  const p = choisie;
  if (!p) return;
  $('#ph-ok').disabled = true;
  message('Téléchargement de la photo…');
  try {
    const url = lireGrande(await lireJson(urlGrande(p.titre), { 'Api-User-Agent': AGENT })) || p.vignette;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const photo = await reduire(await r.blob());
    if (choisie !== p) return;
    $('#ph-modal').hidden = true;
    rappel(photo, creditCommons(p));
  } catch {
    message('Téléchargement impossible : vérifie le réseau et réessaie.');
    $('#ph-ok').disabled = false;
  }
}

export function initPhotoWeb() {
  $('#ph-l').addEventListener('click', e => { const b = e.target.closest('[data-ph]'); if (b) regarder(Number(b.dataset.ph)); });
  $('#ph-ok').addEventListener('click', utiliser);
  $('#ph-autres').addEventListener('click', () => { vueListe(); message(photos.length ? 'Touche la photo que tu veux garder.' : ''); });
  $('#ph-x').addEventListener('click', () => { jeton++; $('#ph-modal').hidden = true; });
}
