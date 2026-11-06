// v0.10 : types d'avion affichés (R30) et copie automatique sur le NAS (R31). Données et NAS INVENTÉS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, indexTypes, typesAffiches } from '../../js/types-avion.js';
import { creerCopieur, REGROUPEMENT_MS, DELAIS_ESSAI, urlApi, depuis, resumeNas, copieNasAJour, compresser, decompresser,
  empreinteSha256, taillePropre } from '../../js/copieur.js';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde, texteTableur, REGLAGES_PRIVES } from '../../js/sauvegarde.js';

// ---------- R30 ----------
test('R30 : les 4 types « exemples » de la v0.1 ne sont plus dans la table', () => {
  const codes = TYPES.map(t => t.code);
  for (const c of ['A320', 'AT72', 'C150', 'DA42']) assert.ok(!codes.includes(c), c);
  assert.ok(codes.includes('DH8D') && codes.includes('DR40'));
});

test('R30 : seulement les types de mes avions + ceux ajoutés à la main (+ SIM)', () => {
  const connus = indexTypes([...TYPES, { code: 'ZZ99', constructeur: 'ESSAI', modele: 'Ajouté', equipage: 'SP', moteurs: 'SE', moteur: 'P', surface: 'L', train: 'tricycle' }]);
  const avions = [{ typeOACI: 'DR40' }, { typeOACI: 'DR40' }, { typeOACI: 'DH8D' }, { typeOACI: 'XX11' }, { sim: true, typeOACI: '' }, { sim: true, typeOACI: 'SIM' }];
  const { liste, sim } = typesAffiches(avions, [{ code: 'ZZ99' }, { code: 'DR40' }], connus);
  assert.deepEqual(liste.map(t => t.code), ['DH8D', 'DR40', 'XX11', 'ZZ99']);
  assert.equal(sim, true);
  assert.equal(liste.find(t => t.code === 'XX11').inconnu, true, 'type inconnu montré (à compléter)');
  assert.equal(liste.find(t => t.code === 'ZZ99').modele, 'Ajouté', 'type ajouté à la main gardé');
  assert.ok(!liste.some(t => t.code === 'A320' || t.code === 'C172'), 'type non utilisé caché');
  assert.deepEqual(typesAffiches([], [], connus), { liste: [], sim: false });
});

// ---------- R31 : copie automatique ----------
// Fausse horloge : les minuteries avancent à la demande
function fausseHorloge() {
  let t = 0, n = 0; const m = new Map();
  return {
    poser: (f, ms) => { m.set(++n, { f, a: t + ms }); return n; },
    enlever: id => m.delete(id),
    async avancer(ms) {
      const fin = t + ms;
      for (;;) {
        const pro = [...m.entries()].filter(([, x]) => x.a <= fin).sort((a, b) => a[1].a - b[1].a)[0];
        if (!pro) break;
        m.delete(pro[0]); t = pro[1].a; pro[1].f();
        for (let i = 0; i < 20; i++) await Promise.resolve();
      }
      t = fin;
      for (let i = 0; i < 20; i++) await Promise.resolve();
    },
    get attente() { return [...m.values()].map(x => x.a - t); },
  };
}
function banc({ reponses = [], configuree = true, auto = true } = {}) {
  const h = fausseHorloge(), envois = [], etats = [];
  const c = { enLigne: true, configuree, auto, lent: null };
  const copieur = creerCopieur({
    envoyer: async () => { envois.push(h); if (c.lent) await c.lent; return reponses.shift() || { statut: 'ok', taille: 10, vols: 1 }; },
    pret: forcer => c.configuree && (forcer || c.auto), enLigne: () => c.enLigne,
    surEtat: e => etats.push(e), minuterie: h,
  });
  return { h, envois, etats, c, copieur };
}

test('R31 : modifications rapprochées regroupées en UNE copie, quelques secondes après la dernière', async () => {
  const { h, envois, copieur, etats } = banc();
  copieur.modification(); await h.avancer(2000);
  copieur.modification(); await h.avancer(2000);
  copieur.modification();
  await h.avancer(REGROUPEMENT_MS - 100);
  assert.equal(envois.length, 0, 'rien avant 5 s de calme');
  await h.avancer(200);
  assert.equal(envois.length, 1, 'une seule copie');
  assert.equal(copieur.enAttente, false);
  assert.equal(etats.at(-1).statut, 'ok');
  await h.avancer(3600e3);
  assert.equal(envois.length, 1, 'pas de copie inutile ensuite');
});

test('R31 : modification PENDANT un envoi -> une seule copie de plus, ensuite', async () => {
  const { h, envois, copieur, c } = banc();
  let finir; c.lent = new Promise(r => { finir = r; });
  copieur.modification(); await h.avancer(REGROUPEMENT_MS);
  assert.equal(envois.length, 1); assert.equal(copieur.enCours, true);
  copieur.modification(); copieur.modification(); copieur.modification();
  c.lent = null; finir(); await h.avancer(10);
  assert.equal(copieur.enAttente, true, 'la dernière version reste en attente');
  await h.avancer(REGROUPEMENT_MS);
  assert.equal(envois.length, 2, 'une seule copie de plus pour les 3 modifications');
});

test('R31 : hors ligne -> la copie attend, puis part au retour du réseau', async () => {
  const { h, envois, copieur, c, etats } = banc();
  c.enLigne = false;
  copieur.modification(); await h.avancer(60e3);
  assert.equal(envois.length, 0);
  assert.equal(etats.at(-1).statut, 'horsLigne'); assert.equal(copieur.enAttente, true);
  c.enLigne = true; copieur.reprendre(1500); await h.avancer(1500);
  assert.equal(envois.length, 1); assert.equal(copieur.enAttente, false);
});

test('R31 : NAS injoignable -> nouveaux essais espacés, sans fin, puis succès', async () => {
  const { h, envois, copieur, etats } = banc({ reponses: [{ statut: 'injoignable' }, { statut: 'injoignable' }, { statut: 'injoignable' }] });
  copieur.modification(); await h.avancer(REGROUPEMENT_MS);
  assert.equal(envois.length, 1); assert.equal(etats.at(-1).statut, 'injoignable'); assert.equal(etats.at(-1).enAttente, true);
  assert.deepEqual(h.attente, [DELAIS_ESSAI[0]]);
  await h.avancer(DELAIS_ESSAI[0]); assert.equal(envois.length, 2);
  assert.deepEqual(h.attente, [DELAIS_ESSAI[1]], 'délai suivant plus long');
  await h.avancer(DELAIS_ESSAI[1]); await h.avancer(DELAIS_ESSAI[2]);
  assert.equal(envois.length, 4); assert.equal(etats.at(-1).statut, 'ok'); assert.equal(copieur.enAttente, false);
  // NAS éteint toute la nuit : le délai plafonne à 30 min
  const b = banc({ reponses: Array(20).fill({ statut: 'injoignable' }) });
  b.copieur.modification(); await b.h.avancer(REGROUPEMENT_MS);
  for (let i = 0; i < 12; i++) await b.h.avancer(Math.max(...b.h.attente));
  assert.deepEqual(b.h.attente, [1800e3]);
});

test('R31 : mot de passe refusé -> pas de nouvel essai tant qu\'il n\'est pas corrigé', async () => {
  const { h, envois, copieur, etats } = banc({ reponses: [{ statut: 'refuse' }] });
  copieur.modification(); await h.avancer(REGROUPEMENT_MS);
  assert.equal(etats.at(-1).statut, 'refuse');
  await h.avancer(3600e3);
  assert.equal(envois.length, 1, 'aucun essai automatique avec un mauvais mot de passe');
  copieur.reprendre(1000); await h.avancer(1000);
  assert.equal(envois.length, 2, 'nouveau mot de passe : la copie repart');
});

test('R31 : pas configurée ou copie automatique arrêtée -> rien ne part ; « Copier maintenant » marche', async () => {
  const a = banc({ configuree: false });
  a.copieur.modification(); await a.h.avancer(60e3);
  assert.equal(a.envois.length, 0);
  assert.equal((await a.copieur.maintenant()).statut, 'pasConfiguree');
  const b = banc({ auto: false });
  b.copieur.modification(); await b.h.avancer(60e3);
  assert.equal(b.envois.length, 0, 'copie automatique arrêtée');
  assert.equal((await b.copieur.maintenant()).statut, 'ok', 'Copier maintenant : copie faite');
  assert.equal(b.envois.length, 1);
});

test('R31 : adresse du NAS (https seulement), textes de Plus', () => {
  assert.equal(urlApi('https://nas.exemple.invalid/carnet-api/'), 'https://nas.exemple.invalid/carnet-api/carnet.php');
  assert.equal(urlApi('nas.exemple.invalid/carnet-api'), 'https://nas.exemple.invalid/carnet-api/carnet.php');
  assert.equal(urlApi('https://nas.exemple.invalid/carnet-api/carnet.php?x=1'), 'https://nas.exemple.invalid/carnet-api/carnet.php');
  assert.equal(urlApi('http://nas.exemple.invalid/carnet-api/'), '', 'http refusé (sauf essai local)');
  assert.equal(urlApi('http://127.0.0.1:8123/nas/'), 'http://127.0.0.1:8123/nas/carnet.php');
  assert.equal(urlApi(''), '');
  const t = Date.parse('2026-11-06T10:00:00Z');
  assert.equal(depuis('2026-11-06T09:58:00Z', t), 'il y a 2 min');
  assert.equal(depuis('2026-11-06T09:59:40Z', t), 'à l\'instant');
  assert.equal(depuis('2026-11-06T07:00:00Z', t), 'il y a 3 h');
  const conf = { configuree: true, auto: true };
  assert.equal(resumeNas({ configuree: false, auto: true }, {}, t), 'Pas configurée');
  assert.equal(resumeNas(conf, { derniereCopie: '2026-11-06T09:58:00Z' }, t), 'Dernière copie : il y a 2 min');
  assert.equal(resumeNas(conf, { enAttente: true, statut: 'injoignable', derniereCopie: '2026-11-05T09:00:00Z' }, t), 'En attente (NAS injoignable)');
  assert.equal(resumeNas(conf, { enAttente: true, statut: 'attente' }, t, false), 'En attente (pas de réseau)');
  assert.equal(resumeNas(conf, { enAttente: true, statut: 'refuse' }, t), 'Mot de passe refusé : à corriger');
  assert.match(resumeNas({ configuree: true, auto: false }, { derniereCopie: '2026-11-06T09:58:00Z' }, t), /^Copie automatique arrêtée/);
  // Encart de Plus
  assert.equal(copieNasAJour(conf, { derniereCopie: '2026-11-06T09:58:00Z' }, t), true);
  assert.equal(copieNasAJour(conf, { derniereCopie: '2026-11-06T09:00:00Z', enAttente: true, statut: 'injoignable' }, t), true, 'NAS éteint la nuit : encore vert');
  assert.equal(copieNasAJour(conf, { derniereCopie: '2026-11-04T09:00:00Z', enAttente: true, statut: 'injoignable' }, t), false, 'plus d\'un jour sans copie : plus vert');
  assert.equal(copieNasAJour(conf, {}, t), false);
  assert.equal(copieNasAJour({ configuree: false, auto: true }, { derniereCopie: '2026-11-06T09:58:00Z' }, t), false);
  assert.equal(taillePropre(1_234_567), '1,2 Mo'); assert.equal(taillePropre(48_200), '48 Ko');
});

test('R31 : copie compressée identique à la sauvegarde de secours, sans les mots de passe', async () => {
  const reglages = [{ cle: 'titulaire', valeur: 'ESSAI' }, { cle: 'cartesMotDePasse', valeur: 'secret-cartes' },
    { cle: 'nasAdresse', valeur: 'https://nas.exemple.invalid/' }, { cle: 'nasMotDePasse', valeur: 'secret-nas' },
    { cle: 'nasAuto', valeur: true }, { cle: 'nasEtat', valeur: { derniereCopie: '2026-11-06T09:00:00Z' } }];
  const contenu = { vols: [{ id: 'v1', date: '2025-05-06', dep: 'LFMN', arr: 'LFMD', avionId: 'a1', tempsTotal: 60 }],
    avions: [{ id: 'a1', immat: 'F-XZZA', photo: 'data:image/jpeg;base64,AAAA' }], personnes: [{ id: 'p1', tri: 'ZZZ' }], suppressions: [], reglages };
  const texte = texteSauvegarde(creerSauvegarde(contenu, '2026-11-06T10:00:00Z'));
  for (const s of ['secret-cartes', 'secret-nas', 'nas.exemple.invalid', 'nasEtat', 'nasAuto']) assert.ok(!texte.includes(s), s);
  assert.ok(texte.includes('ESSAI') && texte.includes('data:image/jpeg'), 'réglages ordinaires et photos gardés');
  for (const k of ['nasAdresse', 'nasMotDePasse', 'nasAuto', 'nasEtat', 'cartesMotDePasse']) assert.ok(REGLAGES_PRIVES.includes(k));
  const octets = await compresser(texte);
  assert.ok(octets.length < texte.length);
  assert.equal(await decompresser(octets), texte, 'décompression à l\'identique');
  assert.match(await empreinteSha256(octets), /^[0-9a-f]{64}$/);
  const lu = lireSauvegarde(await decompresser(octets));
  assert.equal(lu.ok, true); assert.equal(lu.donnees.vols[0].id, 'v1');
  const csv = texteTableur(contenu.vols, new Map([['a1', contenu.avions[0]]]));
  for (const s of ['secret-cartes', 'secret-nas', 'nas.exemple.invalid']) assert.ok(!csv.includes(s), 'CSV sans ' + s);
});
