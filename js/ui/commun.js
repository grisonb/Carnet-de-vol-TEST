// Petits outils partagés par les écrans.

import { terrain } from '../terrains.js';
import { drapeau } from '../drapeaux.js';

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let minuterie = null;
export function toast(texte, duree = 1800) {
  const t = $('#toast');
  t.textContent = texte;
  t.hidden = false;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { t.hidden = true; }, duree);
}

// Code OACI avec son drapeau, toujours collés
export function codeAvecDrapeau(code) {
  const t = terrain(code);
  return `<span class="ap">${drapeau(t ? t.pays : '')}${esc(code)}</span>`;
}

// Groupe de boutons à choix unique
export function segs(sel, cb) {
  const g = $(sel);
  g.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    cb && cb(b, [...g.querySelectorAll('button')].indexOf(b));
  });
}
export function choisir(sel, i) {
  $$(`${sel} button`).forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
}
export function choisi(sel) {
  return $$(`${sel} button`).findIndex(b => b.getAttribute('aria-pressed') === 'true');
}

// Enregistre un fichier : partage Android (Drive, Fichiers…) si possible, sinon Téléchargements.
export async function proposerFichier(blob, nom, { partager = false } = {}) {
  const fichier = new File([blob], nom, { type: blob.type });
  if (partager && navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: nom }); return 'partage'; } catch (e) {
      if (e.name === 'AbortError') return 'annule';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'telechargement';
}

export function lireFichierTexte(input) {
  return new Promise((ok, ko) => {
    const f = input.files[0];
    if (!f) return ok(null);
    const r = new FileReader();
    r.onload = () => ok({ nom: f.name, texte: r.result });
    r.onerror = () => ko(r.error);
    r.readAsText(f, 'utf-8');
  });
}

// Plein écran générique
export function ouvrirOutil(titre, html) {
  $('#ou-t').textContent = titre;
  $('#ou-c').innerHTML = html;
  $('#outil').hidden = false;
  $('#outil').scrollTop = 0;
  return $('#ou-c');
}
export function fermerOutil() { $('#outil').hidden = true; $('#ou-c').innerHTML = ''; }

export const pause = () => new Promise(r => setTimeout(r, 0));
