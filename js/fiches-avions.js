// R49 (v0.16) : importer des fiches avions depuis un petit fichier texte / CSV, une ligne par avion :
//   immatriculation, nom, indicatif radio, modèle      (séparateur « , » ou « ; », ligne de titres facultative)
// Ne remplit que Nom, Indicatif radio et Modèle des avions TROUVÉS par immatriculation (le type OACI ne change pas) ;
// une case vide ne change rien ; ne crée aucun avion ; ne touche à aucun vol. Avion introuvable : signalé, ignoré.
// Le fichier du pilote (vraies immatriculations) n'est JAMAIS dans le dépôt.

import { cleImmat } from './npf.js';

export const CHAMPS_FICHE = [['nom', 'Nom'], ['indicatif', 'Indicatif radio'], ['modele', 'Modèle']];

// Découpe une ligne (guillemets « " » acceptés autour d'une valeur)
function cellules(ligne, sep) {
  const out = [];
  let c = '', dans = false;
  for (let i = 0; i < ligne.length; i++) {
    const x = ligne[i];
    if (x === '"') { if (dans && ligne[i + 1] === '"') { c += '"'; i++; } else dans = !dans; }
    else if (x === sep && !dans) { out.push(c.trim()); c = ''; }
    else c += x;
  }
  out.push(c.trim());
  return out;
}

// { fiches: [{ ligne, immat, nom, indicatif, modele }], erreurs: [texte] }
export function lireFichesAvions(texte) {
  const lignes = String(texte || '').replace(/^﻿/, '').split(/\r?\n/);
  const fiches = [], erreurs = [];
  lignes.forEach((brute, i) => {
    const l = brute.trim();
    if (!l || l.startsWith('#')) return;
    const sep = l.includes(';') ? ';' : l.includes('\t') ? '\t' : ',';
    const c = cellules(l, sep);
    if (i === 0 && /immat/i.test(c[0])) return; // ligne de titres
    const immat = (c[0] || '').toUpperCase();
    if (cleImmat(immat).length < 3) { erreurs.push(`Ligne ${i + 1} ignorée : immatriculation manquante`); return; }
    fiches.push({ ligne: i + 1, immat, nom: c[1] || '', indicatif: c[2] || '', modele: c[3] || '' });
  });
  return { fiches, erreurs };
}

// Ce qui va changer : { modifs: [{ avion, changements: [{ champ, libelle, avant, apres }] }], introuvables: [immat],
// identiques: [immat] }. Les simulateurs ne sont jamais touchés.
export function changementsFiches(fiches, avions) {
  const modifs = [], introuvables = [], identiques = [];
  for (const f of fiches) {
    const a = avions.find(x => x && !x.sim && cleImmat(x.immat) === cleImmat(f.immat));
    if (!a) { introuvables.push(f.immat); continue; }
    const changements = [];
    for (const [champ, libelle] of CHAMPS_FICHE) {
      const apres = f[champ];
      if (apres && apres !== (a[champ] || '')) changements.push({ champ, libelle, avant: a[champ] || '', apres });
    }
    if (changements.length) modifs.push({ avion: a, changements }); else identiques.push(a.immat);
  }
  return { modifs, introuvables, identiques };
}

// Avions modifiés à enregistrer (copies : seuls Nom, Indicatif radio et Modèle changent)
export function appliquerFiches(modifs) {
  return modifs.map(({ avion, changements }) => {
    const a = { ...avion };
    for (const c of changements) a[c.champ] = c.apres;
    return a;
  });
}
