// Synchro du carnet par le NAS (v0.23, R50 étape 3) : logique sans interface, testée sous Node.
// v0.23 : sens unique (le TÉLÉPHONE envoie, le PC consulte). v0.24 : DEUX SENS : le téléphone (« reference ») et le PC
// (« modification ») envoient ET reçoivent ; un élément changé des deux côtés n'est jamais écrasé : c'est un CONFLIT,
// montré au pilote qui choisit. La consultation (PC qui ne modifie rien) reste possible.
// Sur le NAS (carnet.php v5), le carnet est rangé élément par élément (« vols/<id> », « avions/<id> »…), chacun avec un
// numéro de version (rev) donné par le NAS. Le téléphone garde, pour chaque élément envoyé, son numéro et l'empreinte de
// son contenu (la « carte ») : à chaque synchro, il n'envoie que ce qui a changé depuis, et les suppressions (élément
// de la carte qui n'est plus dans le carnet). Le PC retient le dernier numéro reçu et demande la suite.

export const MAGASINS = ['vols', 'avions', 'personnes', 'reglages'];
// Réglages qui appartiennent au carnet (envoyés) ; les autres sont propres à chaque appareil (mot de passe, adresse du
// NAS, bouton « LF », état des copies…) et ne voyagent jamais.
export const REGLAGES_PARTAGES = ['etiquettes', 'missionsAjoutees', 'missionsMasquees', 'terrainsPerso', 'regles', 'compteurs',
  'bandeHeures', 'titulaire', 'typesPerso', 'reference',
  'doublonsVus']; // v0.24 : paires « Garder les deux » (même choix sur les deux appareils)
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
// carte : { "vols/<id>": [rev, empreinte] } : la dernière version connue en commun avec le NAS (empreinte null : élément
// supprimé, gardé comme trace pour qu'un « Annuler » après la synchro ne crée pas de faux conflit).
// exclure : clés en conflit (rien n'est envoyé tant que le pilote n'a pas choisi).
// Renvoie { modifications, empreintes (clé -> empreinte envoyée, null pour une suppression), tropGros: [clés] }.
export function preparerEnvoi(elements, carte = {}, exclure = new Set()) {
  const modifications = [], empreintes = {}, tropGros = [], presents = new Set();
  for (const e of elements) {
    const cle = cleElement(e.magasin, e.id), texte = JSON.stringify(e.donnees);
    presents.add(cle);
    if (exclure.has(cle)) continue;
    if (texte.length > ELEMENT_MAX) { tropGros.push(cle); continue; }
    const h = empreinteTexte(texte), connu = carte[cle];
    if (connu && connu[1] === h) continue; // inchangé depuis le dernier envoi
    modifications.push({ magasin: e.magasin, id: e.id, base: connu ? connu[0] : 0, donnees: e.donnees });
    empreintes[cle] = h;
  }
  for (const [cle, connu] of Object.entries(carte)) {
    if (presents.has(cle) || connu[1] === null || exclure.has(cle)) continue; // absent ici et déjà supprimé au NAS : rien
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
    c[cle] = [a.rev, empreintes[cle]]; // suppression : trace [rev, null]
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
  for (const e of elementsNas) c[cleElement(e.magasin, e.id)] = [e.rev, e.supprime ? null : empreinteTexte(JSON.stringify(e.donnees))];
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

// Sous-titre de Plus › Synchro du carnet (et bandeau du Carnet)
// role : 'reference' (téléphone) | 'modification' (PC) | 'consultation' | undefined
// e : { derniere, statut, attente (nombre de modifications à envoyer), conflits (nombre), aConfirmer (suppressions) }
export function resumeSynchro(role, e = {}, maintenant = Date.now(), enLigne = true) {
  if (!role) return 'Arrêtée';
  const quand = e.derniere ? depuisCourt(e.derniere, maintenant) : '';
  if (e.statut === 'refuse') return 'Mot de passe refusé : à corriger';
  if (e.statut === 'nas-ancien') return 'Le NAS n\'a pas encore carnet.php version 5';
  if (role === 'consultation') {
    if (!enLigne || e.statut === 'horsLigne') return `Consultation · pas de réseau${quand ? ` · reçu ${quand}` : ''}`;
    if (e.statut === 'injoignable') return `Consultation · NAS injoignable${quand ? ` · reçu ${quand}` : ''}`;
    return e.derniere ? `Consultation · à jour ${quand}` : 'Consultation';
  }
  const n = typeof e.attente === 'number' ? e.attente : 0, enAttente = n ? `${n} en attente d'envoi` : 'Envoi en attente';
  const conflits = e.conflits ? ` · ${e.conflits} à choisir` : '';
  if (e.aConfirmer) return `${e.aConfirmer} suppressions à confirmer${conflits}`;
  if (n || e.attente === true) {
    if (!enLigne || e.statut === 'horsLigne') return `${enAttente} (pas de réseau)${conflits}`;
    if (e.statut === 'injoignable') return `${enAttente} (NAS injoignable)${conflits}`;
    return `${enAttente}${conflits}`;
  }
  return (e.derniere ? `Synchronisé ${quand}` : 'Synchro activée') + conflits;
}
function depuisCourt(iso, maintenant) {
  const m = Math.floor((maintenant - Date.parse(iso)) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.floor(m / 60)} h`;
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `le ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}

// ---------- v0.24 : deux sens ----------
// Réglages que l'on peut FUSIONNER sans demander : listes (réunion) et terrains perso (réunion par code).
export const REGLAGES_FUSIONNABLES = ['etiquettes', 'missionsAjoutees', 'missionsMasquees', 'terrainsPerso', 'doublonsVus'];
export function fusionReglage(cle, local, distant) {
  if (!REGLAGES_FUSIONNABLES.includes(cle)) return null;
  if (cle === 'terrainsPerso') return { ...(distant || {}), ...(local || {}) };
  const l = Array.isArray(local) ? local : [], d = Array.isArray(distant) ? distant : [];
  return [...l, ...d.filter(x => !l.some(y => JSON.stringify(y) === JSON.stringify(x)))];
}

// Éléments reçus du NAS sur un appareil qui MODIFIE aussi.
// locaux : Map clé -> { donnees, h } (le carnet de l'appareil) ; carte : versions communes ; ouvert : clé de l'élément
// ouvert dans la saisie (jamais changé sous les yeux du pilote : conflit s'il diffère).
// Renvoie { appliquer: [{ magasin, id, donnees | null }], conflits: [...], carte, fusions: n }.
// Règle : un élément reçu remplace celui de l'appareil SEULEMENT si celui-ci n'a pas changé depuis la dernière version
// commune ; sinon, même contenu -> rien ; réglage fusionnable -> fusion ; autrement -> CONFLIT (rien n'est écrasé).
export function analyserRecus(recus, locaux, carte, ouvert = null) {
  const c = { ...carte }, appliquer = [], conflits = [];
  let fusions = 0;
  for (const e of recus) {
    if (!MAGASINS.includes(e.magasin) || (e.magasin === 'reglages' && !REGLAGES_PARTAGES.includes(e.id))) continue;
    const cle = cleElement(e.magasin, e.id), b = c[cle];
    if (b && e.rev <= b[0]) continue; // déjà connu (dont ses propres envois qui reviennent)
    const hE = e.supprime || !e.donnees ? null : empreinteTexte(JSON.stringify(e.donnees));
    const l = locaux.get(cle), hL = l ? l.h : null, hBase = b ? b[1] : null;
    const modifieIci = hL !== hBase;
    if (hL === hE) { c[cle] = [e.rev, hE]; continue; } // déjà pareil ici
    if (!modifieIci && cle !== ouvert) {
      appliquer.push({ magasin: e.magasin, id: e.id, donnees: hE === null ? null : e.donnees });
      c[cle] = [e.rev, hE];
      continue;
    }
    if (e.magasin === 'reglages' && hE !== null && l) {
      const v = fusionReglage(e.id, l.donnees.valeur, e.donnees.valeur);
      if (v !== null) { appliquer.push({ magasin: 'reglages', id: e.id, donnees: { cle: e.id, valeur: v } }); c[cle] = [e.rev, hE]; fusions++; continue; }
    }
    conflits.push({ magasin: e.magasin, id: e.id, cle, rev: e.rev, distant: hE === null ? null : e.donnees, appareil: e.appareil || '', le: e.le || '' });
  }
  return { appliquer, conflits, carte: c, fusions };
}

export const compterSuppressions = modifications => modifications.filter(m => m.supprime).length;
export const SUPPRESSIONS_A_CONFIRMER = 20;

// Nom d'un appareil d'après son identifiant (« tel-… » / « pc-… »)
export const nomAppareil = id => (String(id).startsWith('pc-') ? 'PC' : String(id).startsWith('tel-') ? 'téléphone'
  : String(id).startsWith('ipad-') ? 'iPad' : 'autre appareil');
// v0.25 : « de l'iPad », « du PC »… ; « Cet iPad », « Ce PC »… (textes et boutons)
export const duNom = n => ({ iPad: 'de l\'iPad', PC: 'du PC', 'téléphone': 'du téléphone' }[n] || 'de l\'autre appareil');
export const ceNom = n => ({ iPad: 'Cet iPad', PC: 'Ce PC', 'téléphone': 'Ce téléphone' }[n] || 'Cet appareil');
export const ceNomMin = n => ceNom(n).replace(/^C/, 'c');
export const leNom = n => ({ iPad: 'l\'iPad', PC: 'le PC', 'téléphone': 'le téléphone' }[n] || 'l\'autre appareil');
// iPad : iPadOS se présente souvent comme un Mac (Safari « version ordinateur »), mais avec un écran tactile
export const estIPad = (ua, pointsTactiles = 0) => /iPad/.test(ua) || (/Macintosh/.test(ua) && pointsTactiles > 1);

// Champs d'un élément à comparer, avec leur nom lisible (le reste : nom technique)
const LIBELLES = {
  date: 'Date', hDep: 'Bloc départ (UTC)', hArr: 'Bloc arrivée (UTC)', dep: 'Départ', arr: 'Arrivée', escales: 'Escales', avionId: 'Avion',
  tempsTotal: 'Temps total', tempsNuit: 'Nuit', tempsIFR: 'IFR', fonction: 'Fonction', nomCdB: 'CdB', nomCopi: 'Copilote', remarques: 'Remarques',
  missions: 'Missions', feux: 'Feux', attJour: 'Att. jour', attNuit: 'Att. nuit', approches: 'Approches', etiquettes: 'Étiquettes', compteurs: 'Compteurs',
  immat: 'Immatriculation', typeOACI: 'Type OACI', modele: 'Modèle', nom: 'Nom', indicatif: 'Indicatif', tri: 'Trigramme', prenom: 'Prénom', valeur: 'Valeur',
};
const IGNORES = new Set(['modifieLe', 'creeLe', 'ordre', 'id']);
const texteValeur = (k, v, avions) => {
  if (v === undefined || v === null || v === '') return '—';
  if (k === 'avionId') { const a = avions && avions.get(v); return a ? a.immat : String(v); }
  if (['tempsTotal', 'tempsNuit', 'tempsIFR'].includes(k) && typeof v === 'number') return `${Math.floor(v / 60)}h${String(v % 60).padStart(2, '0')}`;
  if (k === 'escales' && Array.isArray(v)) return v.map(x => x.code || x.nom || '?').join(', ') || '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  return String(v);
};
export function differences(local, distant, avions = null) {
  const cles = [...new Set([...Object.keys(local || {}), ...Object.keys(distant || {})])].filter(k => !IGNORES.has(k));
  const d = [];
  for (const k of cles) {
    const a = local ? local[k] : undefined, b = distant ? distant[k] : undefined;
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    d.push({ champ: LIBELLES[k] || k, ici: texteValeur(k, a, avions), autre: texteValeur(k, b, avions) });
  }
  return d;
}

// Doublons possibles : même vol (date, terrains, avion, heure, durée) ou même vol NPF-Q400 saisi deux fois, parmi les
// vols créés depuis le passage aux deux sens (les doublons anciens du carnet ne sont pas signalés). vus : paires gardées.
export function doublons(vols, cleDe, depuis, vus = []) {
  const groupes = new Map(), paires = [], dejaVus = new Set(vus);
  const recent = v => (v.creeLe || '') >= (depuis || '9999');
  for (const v of vols) {
    if (v.simulation === true) continue; // v0.35 (R85) : un vol de simulation n'est jamais un doublon
    for (const k of [cleDe(v), v.npfId ? 'npf|' + v.npfId : null]) {
      if (!k) continue;
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k).push(v);
    }
  }
  const faites = new Set();
  for (const l of groupes.values()) {
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const a = l[i], b = l[j], cle = [a.id, b.id].sort().join('|');
      if (faites.has(cle) || dejaVus.has(cle) || !(recent(a) || recent(b))) continue;
      faites.add(cle); paires.push({ cle, a, b });
    }
  }
  return paires;
}

// v0.26 (R61) : court message après « Rafraîchir ». r : résultat de la synchro ; e : { attente, conflits }
export function texteRafraichir(r, e = {}) {
  const n = typeof e.attente === 'number' ? e.attente : 0, att = n ? `, ${n} en attente` : '';
  if (r.statut === 'ok') return e.conflits ? `À jour · ${e.conflits} à choisir` : 'À jour';
  return ({ horsLigne: `Pas de réseau${att}`, injoignable: `NAS injoignable${att}`, refuse: 'Mot de passe refusé : à corriger dans Plus › Copie sur le NAS',
    'nas-ancien': 'Le NAS n\'a pas encore carnet.php version 5', bloque: `Trop d'essais de mot de passe${att}`,
    pasConfiguree: 'Synchro pas activée : Plus › Synchro du carnet' })[r.statut] || `Synchro impossible${att}`;
}
