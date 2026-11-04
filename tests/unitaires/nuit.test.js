import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutesDeNuit, estNuit, hauteurSoleil } from '../../js/nuit.js';

const NICE = { lat: 43.66, lon: 7.22 }, AJACCIO = { lat: 41.92, lon: 8.80 };

test('vol de jour : 0 minute de nuit', () => {
  assert.equal(minutesDeNuit(Date.UTC(2026, 5, 21, 10, 0), 60, [NICE, AJACCIO]), 0);
});

test('vol de nuit : tout le vol est de nuit', () => {
  assert.equal(minutesDeNuit(Date.UTC(2026, 0, 15, 22, 0), 60, [NICE, AJACCIO]), 60);
});

test('vol à cheval sur la fin du crépuscule civil', () => {
  // À Nice le 21 juin, le soleil passe sous -6° vers 19h55 UTC
  let fin = 0;
  for (let m = 0; m < 1440; m++) if (!estNuit(Date.UTC(2026, 5, 21, 0, m - 1), NICE.lat, NICE.lon) && estNuit(Date.UTC(2026, 5, 21, 0, m), NICE.lat, NICE.lon) && m > 600) fin = m;
  assert.ok(fin > 19 * 60 + 45 && fin < 20 * 60 + 5, `crépuscule à ${fin} min`);
  const n = minutesDeNuit(Date.UTC(2026, 5, 21, 19, 30), 60, [NICE, NICE]);
  assert.ok(n >= 30 && n <= 40, `nuit = ${n}`);
});

test('nuit = soleil à plus de 6° sous l\'horizon', () => {
  assert.ok(hauteurSoleil(Date.UTC(2026, 5, 21, 11, 30), NICE.lat, NICE.lon) > 60);
  assert.equal(estNuit(Date.UTC(2026, 0, 15, 23, 0), NICE.lat, NICE.lon), true);
});

test('classement du dernier atterrissage jour / nuit', () => {
  assert.equal(estNuit(Date.UTC(2026, 5, 21, 12, 0), AJACCIO.lat, AJACCIO.lon), false);
  assert.equal(estNuit(Date.UTC(2026, 11, 21, 18, 0), AJACCIO.lat, AJACCIO.lon), true);
});
