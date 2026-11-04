// Contrôle LOCAL de l'import FlyLog avec le vrai fichier (jamais commité).
// Usage : node outils/controle-import.mjs <export-flylog.csv> [reference.json]
// reference.json (privé) : { "valeurs": { "vols": 4070, "tempsTotal": "5701:30", ... } }
import { readFileSync } from 'node:fs';
import { analyserFlyLog } from '../js/flylog.js';
import { calculerTotaux } from '../js/totaux.js';
import { comparerReference } from '../js/controle.js';

const [fichier, reference] = process.argv.slice(2);
const contenu = readFileSync(fichier, 'utf8');
const r = analyserFlyLog(contenu);
if (!r.ok) { console.error(r.message); process.exit(1); }
console.log(`Lignes lues ${r.lues} · à créer ${r.aCreer.length} · doublons ${r.doublons.length} · erreurs ${r.erreurs.length}`);
console.log(`Avions ${r.avions.length} · personnes ${r.personnes.length} · étiquettes ${r.etiquettes.join(', ')} · types inconnus : ${r.typesInconnus.join(', ') || 'aucun'}`);
r.erreurs.slice(0, 10).forEach(e => console.log('  ' + e));
const avions = new Map(r.avions.map(a => [a.id, a]));
const t = calculerTotaux(r.aCreer, avions);
let ecarts = 0;
const valeurs = reference ? JSON.parse(readFileSync(reference, 'utf8')).valeurs : {};
for (const l of comparerReference(t, valeurs)) {
  if (l.ok === false) ecarts++;
  const etat = l.ok === null ? '     ' : l.ok ? 'OK   ' : 'ÉCART';
  console.log(`${etat} ${l.titre.padEnd(32)} app ${String(l.obtenu).padStart(9)}${l.attendu !== null ? `   FlyLog ${String(l.attendu).padStart(9)}` : ''}`);
}
const r2 = analyserFlyLog(contenu, { vols: r.aCreer, avions: r.avions, personnes: r.personnes });
console.log(`Second import du même fichier : à créer ${r2.aCreer.length}, doublons refusés ${r2.doublons.length}`);
if (reference) console.log(ecarts ? `${ecarts} écart(s).` : 'Tous les totaux de référence sont identiques.');
