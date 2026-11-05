import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';
import { analyserFlyLog } from '../../js/flylog.js';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde, texteTableur, COLONNES_TABLEUR } from '../../js/sauvegarde.js';
import { lireCSV } from '../../js/csv.js';
import { paginer, totauxPDF, dessinerPDF, texteLatin } from '../../js/pdf.js';
import { VERSION } from '../../js/version.js';

const r = analyserFlyLog(fauxFlyLog(VOLS_INVENTES));
const avions = new Map(r.avions.map(a => [a.id, a]));
const chrono = [...r.aCreer].sort((a, b) => (a.date < b.date ? -1 : 1));

test('sauvegarde de secours : export puis réimport identique', () => {
  const contenu = { vols: r.aCreer, avions: r.avions.map((a, i) => (i ? a : { ...a, photo: 'data:image/jpeg;base64,AAAA' })),
    personnes: r.personnes, suppressions: [{ id: 'x', magasin: 'vols', supprimeLe: '2026-01-01' }],
    reglages: [{ cle: 'regles', valeur: [{ debut: 'ENT.', pastille: 'Entraînement' }] }] };
  const texte = texteSauvegarde(creerSauvegarde(contenu));
  const lu = lireSauvegarde(texte);
  assert.equal(lu.ok, true);
  assert.deepEqual(lu.donnees, contenu);
  assert.equal(lireSauvegarde('{"format":"autre"}').ok, false);
  assert.equal(lireSauvegarde('pas du json').ok, false);
});

test('tableur CSV : une ligne d\'en-tête, toutes les colonnes, chaque valeur sous son nom', () => {
  const t = texteTableur(chrono, avions);
  assert.equal(t.charCodeAt(0), 0xFEFF);
  const lignes = lireCSV(t);
  assert.equal(lignes.length, chrono.length + 1);
  assert.ok(lignes.every(l => l.length === COLONNES_TABLEUR.length));
  const i = h => lignes[0].indexOf(h);
  const feu = lignes.find(l => l[i('Feux (nouveaux)')] === '1');
  assert.equal(feu[i('Missions')], 'FEU n°7 VILLAGE-TEST (99) + GAAR');
  assert.equal(feu[i('Multipilote')], '2:00');
  assert.equal(feu[i('Immatriculation')], 'F-XZZA');
  assert.ok(lignes[0].includes('Largages CdB Dash'));
});

test('PDF : totaux de page, reports et cumuls', () => {
  const pages = paginer(chrono, avions, 3);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].report.total, 0);
  assert.equal(pages[1].report.total, pages[0].totalPage.total);
  assert.equal(pages[2].report.total, pages[0].totalPage.total + pages[1].totalPage.total);
  const tout = totauxPDF(chrono, avions);
  assert.deepEqual(pages[2].cumul, tout);
  assert.equal(tout.total, 435); assert.equal(tout.sim, 240); assert.equal(tout.se, 145); assert.equal(tout.mp, 220);
  // période : le report de la première page = vols antérieurs
  const avant = chrono.slice(0, 4), apres = chrono.slice(4);
  const p2 = paginer(apres, avions, 3, totauxPDF(avant, avions));
  assert.equal(p2[0].report.total, totauxPDF(avant, avions).total);
  assert.deepEqual(p2.at(-1).cumul, tout);
});

test('PDF : le document se crée (jsPDF embarqué)', async () => {
  const ctx = { console, atob, btoa, TextEncoder, TextDecoder, setTimeout, Uint8Array, ArrayBuffer };
  ctx.self = ctx; ctx.window = undefined;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../../vendor/jspdf.umd.min.js', import.meta.url), 'utf8'), ctx);
  const pages = paginer(chrono, avions, 18);
  const doc = await dessinerPDF(ctx.jspdf.jsPDF, pages, avions, { titulaire: 'PILOTE TEST' });
  const pdf = doc.output();
  assert.ok(pdf.startsWith('%PDF-'));
  assert.equal(doc.getNumberOfPages(), 1);
  assert.equal(texteLatin('A • B – C’'), "A · B - C'");
});

test('la version est écrite à un seul endroit et donne le nom du cache', () => {
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(VERSION, /^\d+\.\d+$/);
  assert.match(sw, /import \{ VERSION \} from '\.\/js\/version\.js'/);
  assert.doesNotMatch(sw, /VERSION\s*=\s*'/);
  assert.match(sw, /const CACHE = PREFIXE \+ 'v' \+ VERSION/);
});

test('le service worker ne touche qu\'au Carnet (portée et caches)', () => {
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
  assert.match(sw, /const PREFIXE = 'carnet-de-vol-'/);
  assert.match(sw, /k\.startsWith\(PREFIXE\)/);          // ne supprime que ses propres caches
  assert.doesNotMatch(sw, /caches\.match\(/);              // ne lit jamais les caches des autres apps
  assert.match(sw, /startsWith\(PORTEE\)/);               // ne répond qu'aux adresses du Carnet
  assert.match(app, /register\('sw\.js', \{ type: 'module', scope: '\.\/'/);
  const m = JSON.parse(readFileSync(new URL('../../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(m.id, '/Carnet-de-vol-TEST/');
  assert.equal(m.start_url, '/Carnet-de-vol-TEST/');
  assert.equal(m.scope, '/Carnet-de-vol-TEST/');
});

test('le service worker met en cache tous les fichiers de l\'app', async () => {
  const { readdirSync } = await import('node:fs');
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  const racine = new URL('../../', import.meta.url);
  for (const d of ['js', 'js/ui', 'polices', 'icones', 'css']) {
    for (const f of readdirSync(new URL(d + '/', racine))) {
      if (/\.(js|css|woff2|png)$/.test(f)) assert.ok(sw.includes(`'${d}/${f}'`), `${d}/${f} manque dans sw.js`);
    }
  }
});
