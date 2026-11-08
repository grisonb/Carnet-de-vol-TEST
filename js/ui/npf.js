// Vols envoyés par NPF-Q400 TEST (v0.15, R33) : à l'ouverture de l'app (et au retour du réseau), si la copie NAS est
// configurée, l'app demande discrètement au NAS les vols en attente (carnet.php version 3, action vols-liste).
// Bandeau « N vols à importer depuis NPF-Q400 › » en haut du Carnet, liste, brouillon dans la saisie,
// « Ignorer ce vol » (confirmation), mise à jour d'un vol déjà enregistré. Jamais d'enregistrement automatique,
// jamais de message d'erreur intrusif (NAS éteint, pas de réseau, ancien carnet.php : rien ne s'affiche).

import { $, esc, toast, ouvrirOutil, fermerOutil } from './commun.js';
import { etat, avionDe, enConsultation } from '../etat.js';
import { terrain } from '../terrains.js';
import { requete, configNas, nasRefuse, noterRefus } from './nas.js';
import { volNpfValide, resumeNpf, volDejaEnregistre, dejaAJour, brouillonNpf, differencesNpf } from '../npf.js';

let attente = [];            // vols NPF en attente (valides, pas encore enregistrés à jour dans le carnet)
let enCours = false;
let ouvrirBrouillon = () => {};
const avions = () => [...etat.avions.values()];

export const volsNpfEnAttente = () => attente;

function majBandeau() {
  const b = $('#npf-bandeau');
  if (!b) return;
  const n = attente.length;
  b.hidden = !n;
  b.textContent = n ? `${n} vol${n > 1 ? 's' : ''} à importer depuis NPF-Q400 ›` : '';
}

// Demande discrète des vols en attente sur le NAS
export async function verifierVolsNpf() {
  // v0.22 : mot de passe refusé -> on n'insiste pas (chaque essai raté compte sur le NAS)
  // v0.23 : les vols NPF s'enregistrent sur le téléphone (pas sur l'appareil qui consulte)
  if (!configNas().configuree || enCours || nasRefuse() || enConsultation()) return;
  enCours = true;
  try {
    const r = await requete('vols-liste', { delai: 20000 });
    if (r.statut === 'refuse') { await noterRefus(); return; }
    if (r.statut !== 'ok') return;
    let j = null;
    try { j = await r.reponse.json(); } catch { return; }
    const restants = [];
    for (const n of (j && Array.isArray(j.vols) ? j.vols : []).filter(volNpfValide)) {
      const v = volDejaEnregistre(etat.vols, n.id);
      // Déjà enregistré dans le carnet (et pas ré-exporté depuis) : on le retire du NAS sans rien demander
      if (dejaAJour(v, n)) retirerDuNas(n.id); else restants.push(n);
    }
    attente = restants;
    majBandeau();
  } finally { enCours = false; }
}

async function retirerDuNas(id) {
  const r = await requete('vol-retirer', { extra: '&id=' + encodeURIComponent(id), delai: 20000 });
  return r.statut === 'ok';
}

// Après « Enregistrer » dans la saisie : le vol quitte la liste et le NAS (s'il n'y a pas de réseau, il sera retiré
// à la prochaine vérification, puisqu'il est alors déjà enregistré dans le carnet)
export function volNpfEnregistre(id) {
  attente = attente.filter(n => n.id !== id);
  majBandeau();
  retirerDuNas(id);
}

// « Ignorer ce vol » : confirmation, puis retrait du NAS sans rien enregistrer
export function ignorerVolNpf(n, apres = () => {}) {
  const r = resumeNpf(n, avions());
  const o = ouvrirOutil('Ignorer ce vol ?', `
    <div class="sec resume"><h3>Ignorer ce vol envoyé par NPF-Q400 ?</h3>
      <p><b>${esc(r.date)}</b> · ${esc(r.avion)}</p><p>${esc(r.trajet)} · ${esc(r.bloc)}</p></div>
    <p class="hint">Il est retiré du NAS et n'entre pas dans le carnet. Ton carnet ne change pas.</p>
    <button type="button" class="bigbtn" id="ni-ok" style="background:var(--feu)">Oui, ignorer ce vol</button>
    <button type="button" class="bigbtn second annuler" id="ni-no">Annuler</button>
    <p class="prog" id="ni-res" role="status"></p>`);
  o.querySelector('#ni-no').addEventListener('click', () => { fermerOutil(); apres(false); });
  o.querySelector('#ni-ok').addEventListener('click', async () => {
    o.querySelector('#ni-ok').disabled = true;
    if (!(await retirerDuNas(n.id))) {
      o.querySelector('#ni-res').textContent = 'Pas de réseau ou NAS injoignable : réessaie plus tard.';
      o.querySelector('#ni-ok').disabled = false;
      return;
    }
    attente = attente.filter(x => x.id !== n.id);
    majBandeau();
    fermerOutil();
    toast('Vol ignoré');
    apres(true);
  });
}

// Bandeau touché : liste des vols en attente
export function ecranVolsNpf() {
  if (!attente.length) { fermerOutil(); return; }
  const lignes = attente.map(n => {
    const r = resumeNpf(n, avions()), deja = volDejaEnregistre(etat.vols, n.id);
    return `<div class="npf-ligne"><button type="button" class="pitem npfv" data-npf="${esc(n.id)}">
        <b>${esc(r.date)} · ${esc(r.avion)}</b><span>${esc(r.trajet)}</span><span class="num">${esc(r.bloc)}</span>
        ${r.feux ? `<span class="npf-feux">${r.feux} feu${r.feux > 1 ? 'x' : ''}</span>` : ''}
        ${deja ? '<span class="npf-maj">Déjà dans le carnet : mise à jour</span>' : ''}
        ${r.avionConnu ? '' : `<span class="npf-inc">${r.avionsMemeNom ? 'Plusieurs avions de ce nom : à choisir' : 'Avion à choisir ou à ajouter'}</span>`}</button>
      <button type="button" class="linkbtn npf-ign" data-ign="${esc(n.id)}">Ignorer</button></div>`;
  }).join('');
  const o = ouvrirOutil('Vols NPF-Q400', `<p class="hint" style="font-size:15px">Vols envoyés depuis NPF-Q400 (iPad). Touche un vol pour l'ouvrir en brouillon : rien n'entre dans le carnet tant que tu n'as pas appuyé sur Enregistrer.</p>
    <div class="flist" id="npf-l">${lignes}</div>`);
  o.querySelector('#npf-l').addEventListener('click', e => {
    const ign = e.target.closest('[data-ign]');
    if (ign) { const n = attente.find(x => x.id === ign.dataset.ign); if (n) ignorerVolNpf(n, () => ecranVolsNpf()); return; }
    const b = e.target.closest('[data-npf]');
    if (b) choisir(attente.find(x => x.id === b.dataset.npf));
  });
}

function choisir(n) {
  // Un toucher = une seule ouverture : seulement depuis la liste encore affichée (jamais une 2e fois après sa fermeture)
  if (!n || !document.getElementById('npf-l') || $('#outil').hidden) return;
  const deja = volDejaEnregistre(etat.vols, n.id);
  if (!deja) { fermerOutil(); ouvrirBrouillon(n, null); return; }
  // Même vol déjà enregistré : mettre à jour plutôt que créer un second vol
  const b = brouillonNpf(n, { avions: avions(), vols: etat.vols.filter(v => v.id !== deja.id), personnes: etat.personnes, terrain });
  const d = differencesNpf(deja, b, avionDe(deja));
  const o = ouvrirOutil('Vol déjà dans le carnet', `
    <div class="sec resume"><h3>Ce vol est déjà dans ton carnet</h3>
      <p>NPF-Q400 l'a envoyé de nouveau. Tu peux mettre à jour le vol enregistré (aucun second vol n'est créé).</p></div>
    ${d.length ? `<div class="sec"><h3>Ce qui change</h3><div class="npf-diff">${d.map(x => `<div><span>${esc(x.champ)}</span><s>${esc(x.avant)}</s><b>${esc(x.apres)}</b></div>`).join('')}</div></div>`
      : '<p class="hint">Rien ne change par rapport au vol enregistré.</p>'}
    <button type="button" class="bigbtn" id="nu-ok">Mettre à jour ce vol</button>
    <button type="button" class="bigbtn second" id="nu-ign">Ignorer ce vol</button>`);
  o.querySelector('#nu-ok').addEventListener('click', () => { fermerOutil(); ouvrirBrouillon(n, deja); });
  o.querySelector('#nu-ign').addEventListener('click', () => ignorerVolNpf(n, fait => { if (!fait) choisir(n); else ecranVolsNpf(); }));
}

export function initNpf({ ouvrir }) {
  ouvrirBrouillon = ouvrir;
  $('#npf-bandeau').addEventListener('click', ecranVolsNpf);
  addEventListener('online', () => setTimeout(verifierVolsNpf, 1500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(verifierVolsNpf, 2000); });
  // Adresse ou mot de passe du NAS enregistrés : on regarde tout de suite
  document.addEventListener('nas-etat', () => { if (!attente.length) verifierVolsNpf(); });
}
