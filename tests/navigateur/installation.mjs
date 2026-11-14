// Installation de l'app (Chromium, émulation Pixel 7) : manifeste valide et installable, identité
// (id) de l'app distincte de celles des autres apps du même site (NPF-Q400-TEST, NPF-Q400),
// service worker limité au dossier du Carnet, caches des autres apps intacts.
// Usage : node tests/navigateur/installation.mjs
import { serveur, playwright, verifier, AUTRES_APPS } from './outils.mjs';
import { VERSION } from '../../js/version.js';

const { chromium, devices } = playwright();
const srv = await serveur();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

// Identité calculée par Chrome (id) + portée + erreurs d'installabilité, lues par le protocole DevTools
async function identite(url) {
  await p.goto(url);
  const cdp = await ctx.newCDPSession(p);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // « manifest » = manifeste tel que Chrome l'a compris : id calculé, start_url et scope absolus
  const { errors, url: urlManifeste, manifest } = await cdp.send('Page.getAppManifest');
  await cdp.detach();
  return { appId: manifest && manifest.id, scope: manifest && manifest.scope, installabilityErrors, errors, urlManifeste };
}

try {
  console.log('Autres apps du même site (imitées avec leurs id / start_url / scope publiés)');
  const ids = {};
  for (const dossier of Object.keys(AUTRES_APPS)) {
    const r = await identite(srv.origine + dossier);
    ids[dossier] = r.appId;
    console.log(`  ${dossier} -> id ${r.appId}   portée ${r.scope}`);
    // une autre app met quelque chose dans un cache à elle (même origine que le Carnet)
    await p.evaluate(async d => { const c = await caches.open('autre-app' + d.replace(/\//g, '-')); await c.put(d + 'temoin', new Response('ok')); }, dossier);
  }

  console.log('Carnet de vol');
  // 1er chargement : installe le service worker ; 2e : la page est contrôlée par lui
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(() => navigator.serviceWorker.ready);
  const carnet = await identite(srv.url);
  console.log(`  ${new URL(srv.url).pathname} -> id ${carnet.appId}   portée ${carnet.scope}`);
  verifier(carnet.scope === srv.url, 'portée de l\'app limitée à /Carnet-de-vol/');

  verifier(carnet.errors.length === 0, 'manifeste lu sans erreur : ' + JSON.stringify(carnet.errors));
  verifier(carnet.installabilityErrors.length === 0,
    'installable (aucune erreur d\'installabilité) ' + JSON.stringify(carnet.installabilityErrors));
  verifier(carnet.appId === srv.url, `id du Carnet = ${srv.url}`);
  for (const [dossier, id] of Object.entries(ids)) {
    verifier(id && id !== carnet.appId, `id différent de celui de ${dossier} (${id})`);
  }
  // Pour information seulement (ces apps ne sont pas modifiées ici) : leur id « ./index.html?prod=1 »
  // se calcule à partir de la RACINE du site, donc les deux ont le même id.
  if (new Set(Object.values(ids)).size < Object.keys(ids).length) {
    console.log('  ℹ info : NPF-Q400-TEST et NPF-Q400 ont le même id entre elles (' + Object.values(ids)[0] + ')');
  }

  const m = await p.evaluate(async u => (await fetch(u)).json(), carnet.urlManifeste);
  verifier(m.id === '/Carnet-de-vol/' && m.start_url === './' && m.scope === './',
    'manifeste : id /Carnet-de-vol/, start_url et scope relatifs (./ : l\'adresse de l\'app)');
  verifier(m.short_name === 'Carnet' && m.name === 'Carnet de vol' && !/TEST/i.test(JSON.stringify(m)), `nom « ${m.name} », nom court « ${m.short_name} », aucun « TEST »`);
  verifier(m.icons.length === 2 && m.icons.every(i => !i.purpose) && m.icons.map(i => i.sizes).join() === '192x192,512x512', 'icônes 192 et 512, sans version « maskable »');

  const sw = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { scope: r.scope, controle: !!navigator.serviceWorker.controller, caches: await caches.keys() };
  });
  verifier(sw.scope === srv.url, `portée du service worker = ${sw.scope}`);
  verifier(sw.controle, 'la page du Carnet est servie par son service worker (hors ligne possible)');
  verifier(sw.caches.includes('carnet-app-v' + VERSION), `cache « carnet-app-v${VERSION} » créé (nouvelle adresse : cache à part)`);
  verifier(Object.keys(AUTRES_APPS).every(d => sw.caches.includes('autre-app' + d.replace(/\//g, '-'))),
    'les caches des autres apps sont intacts');

  // Les pages des autres apps ne sont pas contrôlées par le service worker du Carnet
  for (const dossier of Object.keys(AUTRES_APPS)) {
    await p.goto(srv.origine + dossier);
    const r = await p.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { controle: !!navigator.serviceWorker.controller, scope: reg ? reg.scope : null };
    });
    verifier(!r.controle && r.scope === null, `${dossier} n'est pas touchée par le service worker du Carnet`);
  }
  verifier(erreurs.length === 0, 'aucune erreur JavaScript ' + erreurs.join(' | '));
  console.log('\nInstallation : tout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
