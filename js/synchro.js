// Synchro du carnet par le NAS (v0.23, R50 étape 3) : logique sans interface, testée sous Node.
// Sens unique pour l'instant : le TÉLÉPHONE (appareil de référence) envoie ses modifications, le PC (consultation) les
// reçoit et ne modifie rien.
// Sur le NAS (carnet.php v5), le carnet est rangé élément par élément (« vols/<id> », « avions/<id> »…), chacun avec un
// numéro de version (rev) donné par le NAS. Le téléphone garde, pour chaque élément envoyé, son numéro et l'empreinte de
// son contenu (la « carte ») : à chaque synchro, il n'envoie que ce qui a changé depuis, et les suppressions (élément
// de la carte qui n'est plus dans le carnet). Le PC retient le dernier numéro reçu et demande la suite.

export const MAGASINS = ['vols', 'avions', 'personnes', 'reglages'];
// Réglages qui appartiennent au carnet (envoyés) ; les autres sont propres à chaque appareil (mot de passe, adresse du
// NAS, bouton « LF », état des copies…) et ne voyagent jamais.
export const REGLAGES_PARTAGES = ['etiquettes', 'missionsAjoutees', 'missionsMasquees', 'terrainsPerso', 'regles', 'compteurs',
  'bandeHeures', 'titulaire', 'typesPerso', 'reference'];
export const PAR_ENVOI = 500;      // modifications par envoi (≈ 500 Ko)
export const PAR_PAGE = 1000;      // éléments par page reçue
export const ELEMENT_MAX = 60000;  // le NAS refuse un élément de plus de 64 Ko (une photo laissée dans une fiche…)
export const PERIODE_CONSULTATION = 120000; // le PC regarde s'il y a du nouveau toutes les 2 min (app ouverte)

// Empreinte rapide d'un texte (cyrb53, 53 bits) : sert seulement à savoir si un élément a changé
export function empreinteTexte(t) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const cleElement = (magasin, id) => `${magasin}/${id}`;

// Les éléments du carnet à synchroniser. contenu : { vols, avions, personnes, reglages: [{ cle, valeur }] }.
// Les photos d'avion restent sur l'appareil (elles voyageront à part, plus tard) ; leur crédit voyage avec la fiche.
export function elementsDuCarnet(contenu) {
  const l = [];
  for (const v of contenu.vols || []) if (v && v.id) l.push({ magasin: 'vols', id: v.id, donnees: v });
  for (const a of contenu.avions || []) {
    if (!a || !a.id) continue;
    const { photo, ...sansPhoto } = a;
    l.push({ magasin: 'avions', id: a.id, donnees: sansPhoto });
  }
  for (const p of contenu.personnes || []) if (p && p.id) l.push({ magasin: 'personnes', id: p.id, donnees: p });
  for (const r of contenu.reglages || []) {
    if (r && REGLAGES_PARTAGES.includes(r.cle) && r.valeur !== undefined) l.push({ magasin: 'reglages', id: r.cle, donnees: { cle: r.cle, valeur: r.valeur } });
  }
  return l;
}

// Ce qu'il faut envoyer : nouveaux éléments, éléments changés, suppressions.
// carte : { "vols/<id>": [rev, empreinte] } (ce que le NAS a reçu de cet appareil).
// Renvoie { modifications, empreintes (clé -> empreinte envoyée, null pour une suppression), tropGros: [clés] }.
export function preparerEnvoi(elements, carte = {}) {
  const modifications = [], empreintes = {}, tropGros = [], presents = new Set();
  for (const e of elements) {
    const cle = cleElement(e.magasin, e.id), texte = JSON.stringify(e.donnees);
    presents.add(cle);
    if (texte.length > ELEMENT_MAX) { tropGros.push(cle); continue; }
    const h = empreinteTexte(texte), connu = carte[cle];
    if (connu && connu[1] === h) continue; // inchangé depuis le dernier envoi
    modifications.push({ magasin: e.magasin, id: e.id, base: connu ? connu[0] : 0, donnees: e.donnees });
    empreintes[cle] = h;
  }
  for (const [cle, connu] of Object.entries(carte)) {
    if (presents.has(cle)) continue;
    const i = cle.indexOf('/');
    modifications.push({ magasin: cle.slice(0, i), id: cle.slice(i + 1), base: connu[0], supprime: true });
    empreintes[cle] = null;
  }
  return { modifications, empreintes, tropGros };
}

// Réponse du NAS à un envoi -> nouvelle carte. Les conflits (l'élément a changé sur le NAS sans passer par ce
// téléphone : réinstallation, autre appareil…) sont renvoyés à part : en sens unique, le téléphone fait foi et les
// renvoie avec le numéro du NAS (voir forcer).
export function majCarte(carte, empreintes, reponse) {
  const c = { ...carte };
  for (const a of [...(reponse.acceptees || []), ...(reponse.deja || [])]) {
    const cle = cleElement(a.magasin, a.id);
    if (!(cle in empreintes)) continue;
    if (empreintes[cle] === null) delete c[cle]; else c[cle] = [a.rev, empreintes[cle]];
  }
  return c;
}
export function forcer(modifications, conflits) {
  const rev = new Map(conflits.map(x => [cleElement(x.magasin, x.id), x.rev]));
  return modifications.filter(m => rev.has(cleElement(m.magasin, m.id))).map(m => ({ ...m, base: rev.get(cleElement(m.magasin, m.id)) }));
}

// Première activation d'un téléphone alors que le NAS a déjà le carnet : la carte est reconstruite à partir de ce qu'a le
// NAS (ce qui est identique n'est pas renvoyé ; ce que le téléphone n'a plus sera supprimé).
export function carteDepuisNas(elementsNas) {
  const c = {};
  for (const e of elementsNas) {
    if (e.supprime) continue;
    c[cleElement(e.magasin, e.id)] = [e.rev, empreinteTexte(JSON.stringify(e.donnees))];
  }
  return c;
}

// Éléments reçus du NAS -> écritures à faire sur l'appareil qui consulte
export function trierRecus(elements) {
  const mettre = { vols: [], avions: [], personnes: [], reglages: [] }, enlever = { vols: [], avions: [], personnes: [], reglages: [] };
  for (const e of elements) {
    if (!MAGASINS.includes(e.magasin)) continue;
    if (e.magasin === 'reglages' && !REGLAGES_PARTAGES.includes(e.id)) continue; // jamais un réglage propre à l'appareil
    if (e.supprime || !e.donnees) { enlever[e.magasin].push(e.id); continue; }
    if (e.magasin === 'reglages') mettre.reglages.push({ cle: e.id, valeur: e.donnees.valeur });
    else if (e.donnees.id === e.id) mettre[e.magasin].push(e.donnees);
  }
  return { mettre, enlever };
}

export function lots(liste, n) {
  const r = [];
  for (let i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n));
  return r;
}

// Sous-titre de Plus › Synchro du carnet
// role : 'reference' | 'consultation' | undefined ; e : { derniere, statut, attente, vols }
export function resumeSynchro(role, e = {}, maintenant = Date.now(), enLigne = true) {
  if (!role) return 'Arrêtée';
  const quand = e.derniere ? depuisCourt(e.derniere, maintenant) : '';
  if (e.statut === 'refuse') return 'Mot de passe refusé : à corriger';
  if (e.statut === 'nas-ancien') return 'Le NAS n\'a pas encore carnet.php version 5';
  if (role === 'reference') {
    if (e.attente) return !enLigne || e.statut === 'horsLigne' ? 'Envoi en attente (pas de réseau)'
      : e.statut === 'injoignable' ? 'Envoi en attente (NAS injoignable)' : 'Envoi dans quelques secondes';
    return e.derniere ? `Ce téléphone envoie le carnet · à jour ${quand}` : 'Ce téléphone envoie le carnet';
  }
  if (!enLigne || e.statut === 'horsLigne') return `Consultation · pas de réseau${quand ? ` · reçu ${quand}` : ''}`;
  if (e.statut === 'injoignable') return `Consultation · NAS injoignable${quand ? ` · reçu ${quand}` : ''}`;
  return e.derniere ? `Consultation · à jour ${quand}` : 'Consultation';
}
function depuisCourt(iso, maintenant) {
  const m = Math.floor((maintenant - Date.parse(iso)) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.floor(m / 60)} h`;
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `le ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}
