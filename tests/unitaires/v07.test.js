// v0.7 : ordre de la bande d'heures, Feux et Largages CdB Dash (vols INVENTÉS)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyserFlyLog } from '../../js/flylog.js';
import { calculerTotaux } from '../../js/totaux.js';
import { valeurBande, basculerChoix, deplacerChoix, BANDE_GENERAL } from '../../js/bande.js';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde } from '../../js/sauvegarde.js';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const r = analyserFlyLog(fauxFlyLog(VOLS_INVENTES));
const t = calculerTotaux(r.aCreer, new Map(r.avions.map(a => [a.id, a])));

test('flèches : monter, descendre, rien aux bornes', () => {
  const l = ['tempsCdB', 'tempsCopi', 'feux'];
  assert.deepEqual(deplacerChoix(l, 1, -1), ['tempsCopi', 'tempsCdB', 'feux']);
  assert.deepEqual(deplacerChoix(l, 1, 1), ['tempsCdB', 'feux', 'tempsCopi']);
  assert.deepEqual(deplacerChoix(l, 0, -1), l, '↑ sur la première ligne : rien');
  assert.deepEqual(deplacerChoix(l, 2, 1), l, '↓ sur la dernière ligne : rien');
  assert.deepEqual(l, ['tempsCdB', 'tempsCopi', 'feux'], 'la liste d\'origine n\'est pas modifiée');
});

test('une valeur nouvellement cochée s\'ajoute à la fin', () => {
  assert.deepEqual(basculerChoix(['tempsNuit', 'tempsCdB'], 'largCdbDash'), ['tempsNuit', 'tempsCdB', 'largCdbDash']);
});

test('Feux et Largages CdB Dash : nombres, mêmes calculs que l\'écran Totaux', () => {
  const libs = BANDE_GENERAL.map(g => g.lib);
  assert.ok(libs.includes('Feux') && libs.includes('Largages CdB Dash'));
  const somme = k => r.aCreer.reduce((s, v) => s + (k === 'feux' ? v.feux || 0 : (v.compteurs?.[k] || 0)), 0);
  assert.equal(valeurBande('feux', t).texte, String(t.feux));
  assert.equal(valeurBande('feux', t).texte, String(somme('feux')));
  assert.equal(valeurBande('largCdbDash', t).texte, String(somme('largCdbDash')));
  assert.ok(!/h/.test(valeurBande('largCdbDash', t).texte), 'affiché comme un nombre, pas en heures');
});

test('l\'ordre de la bande est compris dans la sauvegarde de secours', () => {
  const ordre = ['feux', 'type:DH8D', 'tempsCdB'];
  const s = creerSauvegarde({ vols: [], avions: [], personnes: [], reglages: [{ cle: 'bandeHeures', valeur: ordre }] });
  const lu = lireSauvegarde(texteSauvegarde(s));
  assert.deepEqual(lu.donnees.reglages.find(x => x.cle === 'bandeHeures').valeur, ordre);
});
