// v0.9 : recherche de vols par date (R29) et encart « sauvegarde » de Plus (R26). Données inventées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireDate, filtreDate } from '../../js/recherche.js';
import { etatSauvegarde } from '../../js/sauvegarde.js';

test('R29 : une date précise, dans tous les formats courants (jour / mois / année)', () => {
  const formats = ['06/05/25', '06/05/2025', '6/5/25', '6/5/2025', '06.05.2025', '06-05-25', '06 05 2025',
    '060525', '06052025', '2025-05-06', ' 06/05/2025 ', '6.5.25', '06  05  25'];
  for (const f of formats) assert.deepEqual(lireDate(f), { genre: 'jour', date: '2025-05-06' }, f);
});

test('R29 : année sur 2 chiffres = 20xx, ou 19xx au-delà de 50', () => {
  assert.equal(lireDate('01/02/50').date, '2050-02-01');
  assert.equal(lireDate('01/02/51').date, '1951-02-01');
  assert.equal(lireDate('01/02/99').date, '1999-02-01');
  assert.equal(lireDate('010200').date, '2000-02-01');
  assert.equal(lireDate('31/12/89').date, '1989-12-31');
});

test('R29 : mois entier, jour de toutes les années, année entière', () => {
  assert.deepEqual(lireDate('05/2025'), { genre: 'mois', mois: '2025-05' });
  assert.deepEqual(lireDate('5/2025'), { genre: 'mois', mois: '2025-05' });
  assert.deepEqual(lireDate('05.2025'), { genre: 'mois', mois: '2025-05' });
  assert.deepEqual(lireDate('06/05'), { genre: 'jourMois', jourMois: '05-06' });
  assert.deepEqual(lireDate('6-5'), { genre: 'jourMois', jourMois: '05-06' });
  assert.deepEqual(lireDate('29/02'), { genre: 'jourMois', jourMois: '02-29' });
  assert.deepEqual(lireDate('2025'), { genre: 'annee', annee: '2025' });
});

test('R29 : ce qui n\'est pas une date reste une recherche texte', () => {
  for (const t of ['', 'LFMN', 'F-XZZA', 'ENT. AVION', 'feu 12', '32/01/2025', '30/02/2025', '29/02/2025',
    '06/13/2025', '13/2025', '0605', '1234', '123', '12345', '1234567', '060599x', '06/05/2025/1', 'SR5', '00/05/25'])
    assert.equal(lireDate(t), null, JSON.stringify(t));
  assert.equal(lireDate('29/02/2024').date, '2024-02-29'); // année bissextile
});

test('R29 : filtre sur la date des vols', () => {
  const dates = ['2025-05-06', '2025-05-07', '2024-05-06', '2025-06-06', '2023-01-01'];
  const garde = t => dates.filter(filtreDate(lireDate(t)));
  assert.deepEqual(garde('06/05/25'), ['2025-05-06']);
  assert.deepEqual(garde('05/2025'), ['2025-05-06', '2025-05-07']);
  assert.deepEqual(garde('06/05'), ['2025-05-06', '2024-05-06']);
  assert.deepEqual(garde('2025'), ['2025-05-06', '2025-05-07', '2025-06-06']);
  assert.equal(filtreDate(lireDate('LFMN')), null);
});

test('R26 : encart sauvegarde (jamais / récente / plus de 7 jours)', () => {
  const maintenant = Date.parse('2026-11-05T12:00:00Z');
  const jamais = etatSauvegarde(null, maintenant);
  assert.equal(jamais.ok, false);
  assert.equal(jamais.titre, 'Aucune sauvegarde');
  assert.equal(jamais.texte, 'Tes vols ne sont que sur ce téléphone.');
  const recente = etatSauvegarde('2026-11-03T10:00:00Z', maintenant);
  assert.equal(recente.ok, true);
  assert.match(recente.titre, /^Sauvegardé le 03\/11$/);
  assert.equal(etatSauvegarde('2026-10-29T12:00:00Z', maintenant).ok, true);   // 7 jours pile : encore à jour
  const vieille = etatSauvegarde('2026-10-20T10:00:00Z', maintenant);
  assert.equal(vieille.ok, false);
  assert.equal(vieille.titre, 'Pas de sauvegarde depuis 16 jours');
});
