// Écran Totaux : TOTAL HdV, 3/7/30 jours, rubriques, catégories, mission, étiquettes, types.

import { $, esc, segs } from './commun.js';
import { etat } from '../etat.js';
import { hm, aujourdhui, dateFr } from '../temps.js';
import { RUBRIQUES, calculerTotaux, filtrerPeriode, heuresDerniersJours, totalHdV, bornesPeriode } from '../totaux.js';

let periode = { genre: 'tout' };
const nombre = n => n.toLocaleString('fr-FR');
const ligne = (t, v) => `<div class="tline"><span>${esc(t)}</span><b>${v}</b></div>`;

export function rafraichirTotaux() {
  const auj = aujourdhui();
  $('#t-total').textContent = hm(totalHdV(etat.vols));
  $('#t-quick').innerHTML = [3, 7, 30].map(n =>
    `<div><span class="lbl">${n} jours</span><b>${hm(heuresDerniersJours(etat.vols, n, auj))}</b></div>`).join('');
  const annees = [...new Set(etat.vols.map(v => v.date.slice(0, 4)))].sort().reverse();
  if (!annees.length) annees.push(auj.slice(0, 4));
  const sel = $('#per-a');
  if (sel.options.length !== annees.length) sel.innerHTML = annees.map(a => `<option>${a}</option>`).join('');
  if (periode.genre === 'annee' && !periode.annee) periode.annee = sel.value;
  if (periode.genre === 'dates') { periode.du = $('#per-du').value; periode.au = $('#per-au').value; }

  const vols = filtrerPeriode(etat.vols, periode, auj);
  const b = bornesPeriode(periode, auj);
  $('#per-txt').textContent = periode.genre === 'tout' ? `Tout le carnet · ${nombre(vols.length)} vols`
    : `${b.du ? 'Du ' + dateFr(b.du) : 'Depuis le début'} ${b.au ? 'au ' + dateFr(b.au) : "jusqu'à aujourd'hui"} · ${nombre(vols.length)} vols`;
  const t = calculerTotaux(vols, etat.avions);
  const val = r => (r.genre === 'duree' ? hm(t[r.cle]) : nombre(t[r.cle]));
  const groupe = g => RUBRIQUES.filter(r => r.groupe === g).map(r => ligne(r.titre, val(r))).join('');
  $('#t-h').innerHTML = groupe('heures');
  $('#t-c').innerHTML = RUBRIQUES.filter(r => r.groupe === 'categories' && t[r.cle]).map(r => ligne(r.titre, val(r))).join('') || '<p class="hint">Aucune heure sur la période.</p>';
  $('#t-m').innerHTML = groupe('metier');
  const et = Object.entries(t.parEtiquette).sort((x, y) => y[1] - x[1]);
  $('#t-e').innerHTML = et.map(([k, m]) => ligne(k, hm(m))).join('') || '<p class="hint">Aucune étiquette sur la période.</p>';
  const ty = Object.entries(t.parType).sort((x, y) => y[1] - x[1]);
  $('#t-t').innerHTML = ty.map(([k, m]) => ligne(k, hm(m))).join('') || '<p class="hint">Aucun vol sur la période.</p>';
  const pa = Object.entries(t.parAvion).sort((x, y) => y[1].minutes - x[1].minutes);
  $('#t-a').innerHTML = pa.map(([id, s]) => {
    const a = etat.avions.get(id);
    return ligne(`${a ? a.immat : '?'}${a && (a.nom || a.indicatif) ? ' · ' + (a.nom || a.indicatif) : ''}`, `${hm(s.minutes)} <small>${nombre(s.vols)} vol${s.vols > 1 ? 's' : ''}</small>`);
  }).join('') || '<p class="hint">Aucun vol sur la période.</p>';
}

export function initTotaux() {
  segs('#per', b => {
    const p = b.dataset.p;
    periode = p === 'annee' ? { genre: 'annee', annee: $('#per-a').value } : p === 'dates' ? { genre: 'dates' } : { genre: p };
    $('#per-annee').hidden = p !== 'annee';
    $('#per-dates').hidden = p !== 'dates';
    if (p === 'dates' && !$('#per-du').value) {
      $('#per-du').value = `${aujourdhui().slice(0, 4)}-01-01`; $('#per-au').value = aujourdhui();
    }
    rafraichirTotaux();
  });
  $('#per-a').addEventListener('change', () => { periode = { genre: 'annee', annee: $('#per-a').value }; rafraichirTotaux(); });
  for (const s of ['#per-du', '#per-au']) $(s).addEventListener('change', rafraichirTotaux);
}
