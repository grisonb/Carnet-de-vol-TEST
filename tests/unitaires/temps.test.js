import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireDuree, hm, hmPoints, lireHeure, dureeBloc, arriveeLendemain, ajouterJours } from '../../js/temps.js';
import { versLocal, versUTC, heuresLocales, decalage } from '../../js/fuseaux.js';

test('lecture des durées h:mm', () => {
  assert.equal(lireDuree('1:30'), 90);
  assert.equal(lireDuree('1h30'), 90);
  assert.equal(lireDuree('5701:30'), 342090);
  assert.equal(lireDuree(''), null);
  assert.ok(Number.isNaN(lireDuree('1:75')));
});

test('affichage des durées « 1h18 » et « 5 702h48 »', () => {
  assert.equal(hm(78), '1h18');
  assert.equal(hm(0), '0h00');
  assert.equal(hm(342168).replace(/\s/g, ' '), '5 702h48');
  assert.equal(hmPoints(90), '1:30');
});

test('heures saisies « 0942 » -> 09:42', () => {
  assert.equal(lireHeure('0942'), '09:42');
  assert.equal(lireHeure('9:42'), '09:42');
  assert.equal(lireHeure('2460'), null);
});

test('temps total = arrivée - départ, y compris par-dessus minuit', () => {
  assert.equal(dureeBloc('09:00', '10:18'), 78);
  assert.equal(dureeBloc('23:40', '01:10'), 90);
  assert.equal(arriveeLendemain('23:40', '01:10'), true);
  assert.equal(arriveeLendemain('09:00', '10:18'), false);
  assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
});

test('heures locales : La Réunion (UTC+4) et Paris été / hiver', () => {
  assert.equal(decalage(Date.UTC(2026, 10, 4, 5), 'Indian/Reunion'), 240);
  assert.equal(versLocal('2026-11-04', '05:00', 'Indian/Reunion').heure, '09:00');
  assert.equal(versLocal('2026-07-01', '12:00', 'Europe/Paris').heure, '14:00');
  assert.equal(versLocal('2026-01-15', '12:00', 'Europe/Paris').heure, '13:00');
  assert.deepEqual(versUTC('2026-11-04', '09:00', 'Indian/Reunion'), { date: '2026-11-04', heure: '05:00' });
  assert.deepEqual(versUTC('2026-07-01', '01:30', 'Europe/Paris'), { date: '2026-06-30', heure: '23:30' });
});

test('affichage LOC avec (J+1)', () => {
  const l = heuresLocales('2026-07-01', '21:40', '23:10', 'Europe/Paris', 'Europe/Paris');
  assert.equal(l.dep, '23:40'); assert.equal(l.arr, '01:10'); assert.equal(l.jPlus, 1);
});
