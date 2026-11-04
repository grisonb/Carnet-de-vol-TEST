// Table générique des types d'avion (codes OACI). Sert à remplir la fiche d'un avion
// et à ranger les heures dans les bonnes colonnes du carnet EASA.
//
// equipage : 'SP' monopilote | 'MP' multipilote
// moteurs  : 'SE' monomoteur | 'ME' multimoteur
// moteur   : 'P' piston | 'T' turbopropulseur | 'J' réacteur
// surface  : 'L' terrestre | 'A' amphibie | 'H' hydravion
// train    : 'tricycle' | 'classique'

const T = (code, constructeur, modele, equipage, moteurs, moteur, surface, classique = false) =>
  ({ code, constructeur, modele, equipage, moteurs, moteur, surface, train: classique ? 'classique' : 'tricycle' });

export const TYPES = [
  T('A320', 'AIRBUS', 'A320', 'MP', 'ME', 'J', 'L'),
  T('AS80', 'STARCK', 'AS-80 Holiday', 'SP', 'SE', 'P', 'L', true),
  T('AT72', 'ATR', 'ATR 72', 'MP', 'ME', 'T', 'L'),
  T('B190', 'BEECHCRAFT', '1900', 'MP', 'ME', 'T', 'L'),
  T('BE20', 'BEECHCRAFT', 'King Air 200', 'MP', 'ME', 'T', 'L'),
  T('BE58', 'BEECHCRAFT', 'Baron 58', 'SP', 'ME', 'P', 'L'),
  T('BE95', 'BEECHCRAFT', 'Travel Air 95', 'SP', 'ME', 'P', 'L'),
  T('C06T', 'CESSNA', '206 turbine', 'SP', 'SE', 'T', 'L'),
  T('C150', 'CESSNA', '150', 'SP', 'SE', 'P', 'L'),
  T('C152', 'CESSNA', '152', 'SP', 'SE', 'P', 'L'),
  T('C172', 'CESSNA', '172', 'SP', 'SE', 'P', 'L'),
  T('C182', 'CESSNA', '182 Skylane', 'SP', 'SE', 'P', 'L'),
  T('C206', 'CESSNA', '206 Stationair', 'SP', 'SE', 'P', 'L'),
  T('C77R', 'CESSNA', '177RG Cardinal', 'SP', 'SE', 'P', 'L'),
  T('CL2T', 'CANADAIR', 'CL-415', 'MP', 'ME', 'T', 'A'),
  T('CP10', 'MUDRY', 'CAP 10', 'SP', 'SE', 'P', 'L', true),
  T('D11', 'JODEL', 'D11', 'SP', 'SE', 'P', 'L', true),
  T('D140', 'JODEL', 'D140 Mousquetaire', 'SP', 'SE', 'P', 'L', true),
  T('DA40', 'DIAMOND', 'DA40', 'SP', 'SE', 'P', 'L'),
  T('DA42', 'DIAMOND', 'DA42 Twin Star', 'SP', 'ME', 'P', 'L'),
  T('DH8D', 'DE HAVILLAND CANADA', 'Dash 8 Q400', 'MP', 'ME', 'T', 'L'),
  T('DR10', 'ROBIN', 'DR100 / DR1050', 'SP', 'SE', 'P', 'L', true),
  T('DR30', 'ROBIN', 'DR300', 'SP', 'SE', 'P', 'L'),
  T('DR40', 'ROBIN', 'DR400', 'SP', 'SE', 'P', 'L'),
  T('HN70', 'NICOLLIER', 'HN 700 Ménestrel', 'SP', 'SE', 'P', 'L', true),
  T('LA4', 'LAKE', 'LA-4 Buccaneer', 'SP', 'SE', 'P', 'A'),
  T('LGEZ', 'RUTAN', 'Long-EZ', 'SP', 'SE', 'P', 'L'),
  T('LNC2', 'LANCAIR', '320 / 360', 'SP', 'SE', 'P', 'L'),
  T('M20T', 'MOONEY', 'M20 turbo', 'SP', 'SE', 'P', 'L'),
  T('P28A', 'PIPER', 'PA-28 Cherokee', 'SP', 'SE', 'P', 'L'),
  T('PA18', 'PIPER', 'PA-18 Super Cub', 'SP', 'SE', 'P', 'L', true),
  T('PA25', 'PIPER', 'PA-25 Pawnee', 'SP', 'SE', 'P', 'L', true),
  T('PC6T', 'PILATUS', 'PC-6 Turbo Porter', 'SP', 'SE', 'T', 'L', true),
  T('PTS2', 'PITTS', 'S-2', 'SP', 'SE', 'P', 'L', true),
  T('RALL', 'SOCATA', 'Rallye', 'SP', 'SE', 'P', 'L'),
  T('RC3', 'REPUBLIC', 'RC-3 Seabee', 'SP', 'SE', 'P', 'A', true),
  T('SIRA', 'TECNAM', 'P2002 Sierra', 'SP', 'SE', 'P', 'L'),
  T('ST75', 'BOEING', 'Stearman PT-17', 'SP', 'SE', 'P', 'L', true),
  T('SU29', 'SUKHOI', 'Su-29', 'SP', 'SE', 'P', 'L', true),
  T('SV4', 'STAMPE', 'SV-4', 'SP', 'SE', 'P', 'L', true),
  T('TB20', 'SOCATA', 'TB20 Trinidad', 'SP', 'SE', 'P', 'L'),
  T('TB21', 'SOCATA', 'TB21 Trinidad TC', 'SP', 'SE', 'P', 'L'),
  T('TB30', 'SOCATA', 'TB30 Epsilon', 'SP', 'SE', 'P', 'L'),
  T('TOBA', 'SOCATA', 'TB10 Tobago', 'SP', 'SE', 'P', 'L'),
];

export const MOTEUR = { P: 'Piston', T: 'Turbopropulseur', J: 'Réacteur' };
export const SURFACE = { L: 'Terrestre', A: 'Amphibie', H: 'Hydravion' };

export function indexTypes(types = TYPES) {
  return new Map(types.map(t => [t.code, t]));
}

// Avion pré-rempli à partir de son type OACI
export function caracteristiquesDuType(type) {
  if (!type) return {};
  return {
    typeOACI: type.code, constructeur: type.constructeur, modele: type.modele,
    equipage: type.equipage, moteurs: type.equipage === 'MP' ? 'ME' : type.moteurs,
    moteur: type.moteur, surface: type.surface, train: type.train,
  };
}
