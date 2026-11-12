// v0.37 (R91) : « Feux » rangé parmi les compteurs du bloc Mission (réglage « compteurs »).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compteursRanges, COMPTEURS_DEFAUT } from '../../js/modele.js';

test('réglage d\'avant (sans « feux ») : « Feux » en premier, rien d\'autre ne change', () => {
  const l = compteursRanges(COMPTEURS_DEFAUT);
  assert.deepEqual(l[0], { cle: 'feux', on: true });
  assert.deepEqual(l.slice(1), COMPTEURS_DEFAUT);
});

test('« Feux » rangé ailleurs : place gardée, toujours allumé, une seule fois', () => {
  const conf = [{ cle: 'largCdbDash', on: true }, { cle: 'feux', on: false }, { cle: 'largInstrCdbDash', on: true }];
  const l = compteursRanges(conf);
  assert.deepEqual(l.map(c => c.cle), ['largCdbDash', 'feux', 'largInstrCdbDash']);
  assert.equal(l[1].on, true);
  assert.equal(l.filter(c => c.cle === 'feux').length, 1);
  assert.notEqual(l[0], conf[0]); // copie : le réglage n'est pas modifié sur place
});
