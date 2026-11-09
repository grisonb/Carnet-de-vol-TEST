// v0.26 : R60 majuscules par défaut, R61 message du bouton « Rafraîchir », R62 envoi dès l'enregistrement.
// Aucun appel réseau ; aucune donnée réelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { texteRafraichir } from '../../js/synchro.js';
import { creerCopieur } from '../../js/copieur.js';

const sources = ['index.html', ...readdirSync(new URL('../../js/ui/', import.meta.url)).map(f => 'js/ui/' + f)]
  .map(f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8')).join('\n');
const reglageDe = id => { const m = sources.match(new RegExp(`<(?:input|textarea)\\b[^>]*\\bid="${id}"[^>]*>`)); return m && (m[0].match(/autocapitalize="([^"]+)"/) || [])[1]; };

test('R60 : chaque champ s\'ouvre avec les bonnes majuscules', () => {
  const attendu = {
    characters: ['f-dep', 'f-arr', 'vm-icao', 'te-code', 'ter-code', 'ter-pays', 'a1-reg', 'fi-reg', 'fi-oaci', 'fi-nm', 'fi-ind', 'fi-hex', 'pm-tri', 'pm2-v',
      'rm-p', 'rm-l', 'f-copi', 'm-q', 'ac-q', 'fl-q', 'te-cons'],
    words: ['pm-nom', 'pm-pre', 'ter-nom', 'ti-v', 'xp-tit'],
    sentences: ['f-rem', 'fi-rem', 'fi-mod', 'te-mod'],
  };
  for (const [valeur, ids] of Object.entries(attendu)) for (const id of ids) assert.equal(reglageDe(id), valeur, id);
  assert.match(sources, /<input data-mi="\$\{i\}"[^>]*autocapitalize="characters"/, 'lignes de mission');
  assert.equal(reglageDe('nas-adr'), undefined, 'adresse du NAS : pas de majuscules (type url)');
});

test('R61 : message court après « Rafraîchir »', () => {
  assert.equal(texteRafraichir({ statut: 'ok' }, {}), 'À jour');
  assert.equal(texteRafraichir({ statut: 'ok' }, { conflits: 2 }), 'À jour · 2 à choisir');
  assert.equal(texteRafraichir({ statut: 'horsLigne' }, { attente: 2 }), 'Pas de réseau, 2 en attente');
  assert.equal(texteRafraichir({ statut: 'horsLigne' }, {}), 'Pas de réseau');
  assert.equal(texteRafraichir({ statut: 'injoignable' }, { attente: 1 }), 'NAS injoignable, 1 en attente');
  assert.equal(texteRafraichir({ statut: 'refuse' }), 'Mot de passe refusé : à corriger dans Plus › Copie sur le NAS');
  assert.equal(texteRafraichir({ statut: 'pasConfiguree' }), 'Synchro pas activée : Plus › Synchro du carnet');
});

test('R62 : la synchro part presque tout de suite après un enregistrement (la copie NAS garde ses 5 s)', () => {
  const poses = [];
  const minuterie = { poser: (f, ms) => { poses.push(ms); return poses.length; }, enlever: () => {} };
  creerCopieur({ envoyer: async () => ({ statut: 'ok' }), pret: () => true, regroupement: 300, minuterie }).modification();
  creerCopieur({ envoyer: async () => ({ statut: 'ok' }), pret: () => true, minuterie }).modification();
  assert.deepEqual(poses, [300, 5000]);
});
