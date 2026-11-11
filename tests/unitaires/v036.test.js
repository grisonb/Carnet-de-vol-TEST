// v0.36 (R88) : numéros de feu des vols de SIMULATION : ils se suivent d'une simulation à l'autre ; un vrai vol les ignore.
// Vols et feux INVENTÉS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plusGrandFeu } from '../../js/missions.js';
import { brouillonNpf } from '../../js/npf.js';

const vrai = (id, missions) => ({ id, missions, remarques: '' });
const sim = (id, missions) => ({ id, missions, remarques: '', simulation: true });
const npf = (id, simulation, communes) => ({ format: 'carnet-vol-npf', version: 2, id, date: '2026-11-10', blocDepart: '10:00', blocArrivee: '11:00',
  immat: 'F-XZZA', ...(simulation ? { simulation: true } : {}), feux: communes.map(c => ({ heure: '10:30', lat: 43.5, lon: 6.5, commune: c })) });
const lignes = b => b.lignes.map(l => l.t);

test('plusGrandFeu : vrai vol sans les simulations, simulation avec', () => {
  const vols = [vrai('a', ['FEU n°54 ESSAI']), sim('s1', ['FEU n°55 ESSAI']), sim('s2', ['FEU n°56 ESSAI', 'FEU n°57 ESSAI'])];
  assert.equal(plusGrandFeu(vols), 54);
  assert.equal(plusGrandFeu(vols, null, false), 54);
  assert.equal(plusGrandFeu(vols, null, true), 57);
  assert.equal(plusGrandFeu(vols, 's2', true), 55); // le vol qu'on modifie est toujours exclu
});

test('brouillon NPF : sim 1 -> 55 ; sim 2 -> 56, 57 ; vrai vol -> 55 ; sim 3 -> 58', () => {
  const carnet = [vrai('a', ['FEU n°54 VILLE-ESSAI-A'])];
  const b1 = brouillonNpf(npf('s1', true, ['ESSAI-B']), { vols: carnet });
  assert.deepEqual(lignes(b1), ['FEU n°55 ESSAI-B']);
  carnet.push(sim('s1', lignes(b1)));
  const b2 = brouillonNpf(npf('s2', true, ['ESSAI-C', 'ESSAI-D']), { vols: carnet });
  assert.deepEqual(lignes(b2), ['FEU n°56 ESSAI-C', 'FEU n°57 ESSAI-D']);
  carnet.push(sim('s2', lignes(b2)));
  const r = brouillonNpf(npf('r1', false, ['ESSAI-E']), { vols: carnet });
  assert.deepEqual(lignes(r), ['FEU n°55 ESSAI-E']);
  assert.equal(r.simulation, undefined); // vrai vol : pas de marque
  carnet.push(vrai('r1', lignes(r)));
  const b3 = brouillonNpf(npf('s3', true, ['ESSAI-F']), { vols: carnet });
  assert.deepEqual(lignes(b3), ['FEU n°58 ESSAI-F']);
  assert.equal(plusGrandFeu(carnet.concat(sim('s3', lignes(b3)))), 55); // prochain VRAI feu : n°56
});
