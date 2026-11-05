// Fenêtre « Pastilles des missions » : si une mission commence par X, pastille Y.

import { $, esc, CROIX } from './commun.js';
import { reglage, enregistrerReglage } from '../etat.js';
import { remettreSuggestion } from '../missions.js';

// « Suggestions masquées » : un bouton pour remettre chacune
function rendreMasquees() {
  const M = reglage('missionsMasquees');
  $('#rm-masq').innerHTML = M.map(t =>
    `<div class="mline"><div class="masq">${esc(t)}</div><button type="button" class="ghost" data-remettre="${esc(t)}">Remettre</button></div>`).join('')
    || '<p class="hint">Aucune suggestion masquée.</p>';
}

function rendre() {
  const R = reglage('regles');
  $('#rm-list').innerHTML = R.map((r, i) =>
    `<div class="mline"><div style="flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface2)">« <b>${esc(r.debut)}</b> » → <span class="chip">${esc(r.pastille)}</span></div><button type="button" class="x" data-rx="${i}" aria-label="Supprimer la règle">${CROIX}</button></div>`).join('')
    || '<p class="hint">Aucune règle.</p>';
}
const verifier = () => { $('#rm-add').disabled = !($('#rm-p').value.trim() && $('#rm-l').value.trim()); };

export function ouvrirRegles() {
  rendre(); rendreMasquees();
  $('#rm-p').value = ''; $('#rm-l').value = ''; delete $('#rm-l').dataset.t;
  verifier();
  $('#rules-modal').hidden = false;
}

export function initRegles() {
  $('#rm-p').addEventListener('input', () => { if (!$('#rm-l').dataset.t) $('#rm-l').value = $('#rm-p').value.trim().toUpperCase(); verifier(); });
  $('#rm-l').addEventListener('input', () => { $('#rm-l').dataset.t = '1'; verifier(); });
  $('#rm-add').addEventListener('click', async () => {
    await enregistrerReglage('regles', [...reglage('regles'), { debut: $('#rm-p').value.trim().toUpperCase(), pastille: $('#rm-l').value.trim() }]);
    $('#rm-p').value = ''; $('#rm-l').value = ''; delete $('#rm-l').dataset.t; verifier(); rendre();
  });
  $('#rm-list').addEventListener('click', async e => {
    const x = e.target.closest('[data-rx]');
    if (!x) return;
    const R = [...reglage('regles')]; R.splice(Number(x.dataset.rx), 1);
    await enregistrerReglage('regles', R); rendre();
  });
  $('#rm-masq').addEventListener('click', async e => {
    const b = e.target.closest('[data-remettre]');
    if (!b) return;
    await enregistrerReglage('missionsMasquees', remettreSuggestion(reglage('missionsMasquees'), b.dataset.remettre));
    rendreMasquees();
  });
  $('#rm-x').addEventListener('click', () => { $('#rules-modal').hidden = true; });
}
