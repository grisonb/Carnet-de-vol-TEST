// v0.27 (R63) : approches par terrain intermédiaire. Le vol garde le TOTAL (arrivée + terrains intermédiaires) dans
// `approches` : PDF et CSV comptent le total ; un ancien vol (sans approches sur ses terrains intermédiaires) ne change
// pas ; une ancienne sauvegarde se relit. Vols INVENTÉS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valeursVol, totauxPDF } from '../../js/pdf.js';
import { texteTableur, creerSauvegarde, texteSauvegarde, lireSauvegarde, COLONNES_TABLEUR } from '../../js/sauvegarde.js';
import { volVide } from '../../js/modele.js';
import { elementsDuCarnet, preparerEnvoi } from '../../js/synchro.js';

const avion = { id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', equipage: 'MP', moteurs: 'ME', moteur: 'T' };
const vol = (id, approches, escales = []) => ({ ...volVide(), id, date: '2026-11-10', dep: 'LFMN', arr: 'LFMD', hDep: '10:00', hArr: '11:00',
  avionId: 'a1', tempsTotal: 60, approches, escales, creeLe: 'x', modifieLe: 'x' });
const nouveau = vol('v-r63', 4, [{ code: 'LFTH', attJour: 1, attNuit: 0, approches: 2 }, { code: 'LFTW', attJour: 1, attNuit: 0, approches: 1 }]); // arrivée 1
const ancien = vol('v-ancien', 3, [{ code: 'LFTH', attJour: 1, attNuit: 0 }]); // sauvegarde d'avant la v0.27

test('PDF : le total du vol (arrivée + terrains intermédiaires)', () => {
  assert.equal(valeursVol(nouveau, avion).approches, 4);
  assert.equal(valeursVol(ancien, avion).approches, 3, 'ancien vol inchangé');
  assert.equal(totauxPDF([nouveau, ancien], new Map([['a1', avion]])).approches, 7);
});

test('CSV : colonne Approches = total', () => {
  const i = COLONNES_TABLEUR.findIndex(c => c[0] === 'Approches');
  const lignes = texteTableur([nouveau], new Map([['a1', avion]])).trim().split(/\r?\n/);
  assert.equal(lignes[1].split(';')[i], '4');
});

test('sauvegarde : approches des terrains intermédiaires gardées ; ancienne sauvegarde relue', () => {
  const s = creerSauvegarde({ vols: [nouveau, ancien], avions: [avion], personnes: [], suppressions: [], reglages: [] });
  const r = lireSauvegarde(texteSauvegarde(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.donnees.vols[0].escales.map(e => e.approches), [2, 1]);
  assert.equal(r.donnees.vols[0].approches, 4);
  assert.equal(r.donnees.vols[1].escales[0].approches, undefined, 'ancien vol : pas de champ, rien d\'inventé');
  assert.equal(r.donnees.vols[1].approches, 3);
});

test('synchro : le vol part avec les approches de ses terrains intermédiaires', () => {
  const p = preparerEnvoi(elementsDuCarnet({ vols: [nouveau], avions: [], personnes: [], reglages: [] }), {});
  assert.deepEqual(p.modifications[0].donnees.escales.map(e => e.approches), [2, 1]);
});
