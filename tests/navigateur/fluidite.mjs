// Fluidité avec 4070 vols INVENTÉS et un processeur ralenti ×6 (émulation Pixel 7, Chromium).
// Mesure : ouverture de l'app, défilement de la liste, recherche, écran Totaux, ouverture d'un vol.
// Usage : node tests/navigateur/fluidite.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, RACINE } from './outils.mjs';
import { fauxFlyLog } from '../outils/faux-flylog.js';

const N = 4070;
const TERRAINS = ['LFMN', 'LFMD', 'LFKJ', 'LFKB', 'LFML', 'LFTW', 'LFBO', 'LFLL', 'FMEE', 'FMEP', 'LFPG', 'LFRS'];
const AVIONS = [['DH8D', 'FXZAA'], ['DH8D', 'FXZAB'], ['CL2T', 'FXZAC'], ['DR40', 'FXAAD'], ['C172', 'FXAAE'], ['BE58', 'FXAAF']];
const MISSIONS = ['ENT. TEST', 'GAAR', 'TRANSIT TEST', 'CONVOYAGE TEST', 'CIBLES TEST'];
let graine = 42;
const hasard = n => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % n; };
const lignes = [];
let feu = 0;
for (let i = 0; i < N; i++) {
  const j = new Date(Date.UTC(1996, 0, 1) + Math.floor(i * (30.8 * 365.25 / N)) * 864e5).toISOString().slice(0, 10);
  const [type, immat] = AVIONS[hasard(AVIONS.length)];
  const dep = TERRAINS[hasard(TERRAINS.length)], arr = TERRAINS[hasard(TERRAINS.length)];
  const d = 20 + hasard(160), h = 6 + hasard(12), m = hasard(60);
  const fin = (h * 60 + m + d) % 1440;
  const estFeu = hasard(20) === 0;
  lignes.push({ DATE: j, DEPARTURE_AIRPORT: dep, ARRIVAL_AIRPORT: arr, AIRCRAFT_TYPE: type, AIRCRAFT_REGISTRATION: immat,
    DURATION_BLOCK: `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`, LDGS_DAY: String(1 + hasard(3)),
    TIME_BLOCK_START: i < 3000 ? '00:00' : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    TIME_BLOCK_END: i < 3000 ? '' : `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`,
    DURATION_PIC: `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`, NAME_PIC: 'SELF', NAME_COPILOT: 'T' + String.fromCharCode(65 + hasard(26)) + 'Z',
    REMARKS: estFeu ? `FEU n°${++feu} COMMUNE-TEST ${hasard(99)}` : MISSIONS[hasard(MISSIONS.length)], FEU: estFeu ? '1' : '0',
    LARGAGES_CDB_DASH: estFeu ? String(1 + hasard(5)) : '0', TAGS: estFeu ? 'BOMBING' : '' });
}
const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const fichier = join(CAPT, 'flylog-4070-inventes.csv');
writeFileSync(fichier, fauxFlyLog(lignes));

const { chromium, devices } = playwright();
const srv = await serveur();
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const p = await ctx.newPage();
await p.goto(srv.url);
await p.waitForSelector('body[data-pret="1"]');
await p.click('.tabs button[data-v="plus"]');
await p.setInputFiles('#file-flylog', fichier);
await p.waitForSelector('#im-ok', { timeout: 60000 });
await p.click('#im-ok');
await p.waitForSelector('.ctab', { timeout: 60000 });

const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
const mesures = {};
const chrono = async (nom, f) => { const t = Date.now(); await f(); mesures[nom] = Date.now() - t; };

await chrono('ouverture de l\'app (rechargement complet)', async () => { await p.reload(); await p.waitForSelector('body[data-pret="1"]'); await p.waitForSelector('.flight'); });
mesures['cartes affichées au départ'] = await p.locator('.flight').count();
await chrono('défilement : 10 écrans vers le bas', async () => {
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 2000); await p.waitForTimeout(16); }
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
});
mesures['cartes affichées après défilement'] = await p.locator('.flight').count();
// image la plus longue pendant un défilement (saccades)
mesures['image la plus longue pendant le défilement (ms)'] = await p.evaluate(async () => {
  let max = 0, avant = performance.now();
  const fin = performance.now() + 1500;
  await new Promise(r => { const f = t => { max = Math.max(max, t - avant); avant = t; window.scrollBy(0, 120); if (t < fin) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  return Math.round(max);
});
await p.evaluate(() => window.scrollTo(0, 0));
await chrono('recherche « commune-test » (frappe + résultat)', async () => {
  await p.fill('#q', 'commune-test');
  await p.waitForFunction(() => [...document.querySelectorAll('.flight')].every(c => c.textContent.includes('COMMUNE-TEST')) && document.querySelectorAll('.flight').length > 0);
});
await chrono('recherche effacée (retour à la liste complète)', async () => { await p.fill('#q', ''); await p.waitForFunction(() => document.querySelectorAll('.flight').length >= 40 && !document.querySelector('.flight .fl-rem')?.textContent.includes('COMMUNE') || true); await p.waitForTimeout(200); });
await chrono('écran Totaux (tout le carnet)', async () => { await p.click('.tabs button[data-v="totaux"]'); await p.waitForSelector('#t-h .tline'); });
await chrono('Totaux : changer de période (12 mois)', async () => { await p.click('#per button[data-p="12m"]'); await p.waitForSelector('#t-h .tline'); });
await p.click('.tabs button[data-v="carnet"]');
await chrono('ouvrir un vol en modification', async () => { await p.click('.flight >> nth=0'); await p.waitForSelector('#v-saisie:not([hidden])'); });
await chrono('nouveau vol (formulaire pré-rempli)', async () => { await p.click('#cancel'); await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])'); });
await chrono('Tous mes avions', async () => { await p.click('#ac-all'); await p.waitForSelector('#fl-list .acitem'); });

console.log(`Fluidité avec ${N} vols inventés, processeur ralenti ×6 (Pixel 7 émulé) :`);
for (const [k, v] of Object.entries(mesures)) console.log(`  ${k.padEnd(52)} ${v}${/cartes/.test(k) ? '' : ' ms'}`);
await b.close();
srv.fermer();
