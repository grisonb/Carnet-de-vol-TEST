// v0.17 : `arriveePosition` du format « vol NPF » version 2 (arrivée sans code OACI). Vols INVENTÉS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionArrivee, brouillonNpf, volNpfValide } from '../../js/npf.js';

const v2 = (change = {}) => ({ format: 'carnet-vol-npf', version: 2, id: 'npf-ap', exporteLe: '2026-11-07T10:00:00Z', date: '2025-12-21',
  blocDepart: '13:00', blocArrivee: '17:00', nomAvion: 'M73', depart: 'FMEE', ...change });

test('arriveePosition : lue si elle est bien formée, sinon ignorée', () => {
  assert.deepEqual(positionArrivee(v2({ arriveePosition: { lat: -21.3, lon: 55.6 } })), { lat: -21.3, lon: 55.6 });
  assert.deepEqual(positionArrivee(v2({ arriveePosition: { lat: 44, lon: -180 } })), { lat: 44, lon: -180 });
  for (const p of [undefined, null, { lat: 95, lon: 4 }, { lat: 44, lon: 181 }, { lat: 44 }, { lat: '44', lon: 4 }, [44, 4], '44,4', {}]) {
    assert.equal(positionArrivee(v2({ arriveePosition: p })), null, JSON.stringify(p));
  }
  assert.equal(volNpfValide(v2({ arriveePosition: { lat: -21.3, lon: 55.6 } })), true, 'le vol reste valide (arrivée facultative)');
});

test('brouillon : arrivée sans code avec position ; avec code ; sans code ni position', () => {
  const b = brouillonNpf(v2({ arriveePosition: { lat: -21.3, lon: 55.6 } }));
  assert.equal(b.arr, ''); assert.deepEqual(b.arriveePosition, { lat: -21.3, lon: 55.6 });
  const c = brouillonNpf(v2({ arrivee: 'FMEP' }));
  assert.equal(c.arr, 'FMEP'); assert.equal(c.arriveePosition, null);
  const d = brouillonNpf(v2());
  assert.equal(d.arr, ''); assert.equal(d.arriveePosition, null);
});

// ---------- R52 : avions d'un même type classés par immatriculation (avions INVENTÉS) ----------
import { classerParTypeEtImmat } from '../../js/modele.js';

test('avions classés par immatriculation dans chaque type ; ordre des types inchangé', () => {
  // ordre reçu (ex. dernier vol d'abord) : types mélangés, modèles différents d'un même type
  const recus = [
    { id: 1, immat: 'F-XZZH', typeOACI: 'DH8D', modele: 'Modele essai MRE' },
    { id: 2, immat: 'F-XAAB', typeOACI: 'DR40', modele: 'DR400' },
    { id: 3, immat: 'F-XZZC', typeOACI: 'DH8D', modele: 'Modele essai MR' },
    { id: 4, immat: 'SIM-2', sim: true },
    { id: 5, immat: 'F-XZZD', typeOACI: 'DH8D', modele: 'Modele essai MR' },
    { id: 6, immat: 'F-XAAA', typeOACI: 'DR40', modele: 'DR400' },
    { id: 7, immat: 'SIM-1', sim: true },
    { id: 8, immat: 'f-xzza', typeOACI: 'DH8D', modele: 'Modele essai MRE' },
  ];
  assert.deepEqual(classerParTypeEtImmat(recus).map(a => a.immat),
    ['f-xzza', 'F-XZZC', 'F-XZZD', 'F-XZZH', 'F-XAAA', 'F-XAAB', 'SIM-1', 'SIM-2']);
  assert.equal(recus[0].immat, 'F-XZZH', 'la liste reçue n\'est pas modifiée');
  assert.deepEqual(classerParTypeEtImmat([{ immat: 'N45AB', typeOACI: 'C172' }, { immat: 'N123AB', typeOACI: 'C172' }]).map(a => a.immat),
    ['N45AB', 'N123AB'], 'chiffres classés dans l\'ordre numérique');
});
