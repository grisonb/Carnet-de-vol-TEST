// Petits outils partagés par les écrans.

import { terrain } from '../terrains.js';
import { drapeau } from '../drapeaux.js';

// Signes « + » et « − » dessinés (parfaitement centrés dans les boutons ronds)
export const PLUS = '<svg class="ip" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.75 4h2.5v16h-2.5zM4 10.75h16v2.5H4z"/></svg>';
export const MOINS = '<svg class="ip" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.75h16v2.5H4z"/></svg>';
// Croix des boutons « fermer / enlever » : dessinée (rond rouge, croix blanche en gras, voir .xbtn et .x)
export const CROIX = '<svg class="ix" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
export const CRAYON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>';

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let minuterie = null;
// Message avec un bouton (ex. « Annuler ») pendant quelques secondes
export function toastAction(texte, libelle, action, duree = 4000) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(texte)} — </span><button type="button" class="tbtn">${esc(libelle)}</button>`;
  t.querySelector('.tbtn').addEventListener('click', () => { clearTimeout(minuterie); t.hidden = true; action(); }, { once: true });
  t.hidden = false;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { t.hidden = true; }, duree);
}

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
