// v0.11 : carte de vol du Carnet (R32) — nom de l'avion ou immatriculation à sa place. Avions INVENTÉS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identiteAvion } from '../../js/modele.js';

test('R32 : avion avec un nom -> nom (couleur Avion) puis immatriculation', () => {
  assert.deepEqual(identiteAvion({ immat: 'F-XZZA', nom: 'ZX1' }), { nom: 'ZX1', immat: 'F-XZZA' });
});
test('R32 : avion sans nom -> l\'immatriculation prend la place du nom', () => {
  assert.deepEqual(identiteAvion({ immat: 'F-XZZB', nom: '' }), { nom: 'F-XZZB', immat: '' });
  assert.deepEqual(identiteAvion({ immat: 'F-XZZB' }), { nom: 'F-XZZB', immat: '' });
  assert.deepEqual(identiteAvion({ immat: 'F-XZZC', nom: 'f-xzzc' }), { nom: 'F-XZZC', immat: '' }, 'nom identique à l\'immatriculation : pas de doublon');
});
test('R32 : vol sans avion connu -> rien', () => {
  assert.deepEqual(identiteAvion(null), { nom: '', immat: '' });
});
