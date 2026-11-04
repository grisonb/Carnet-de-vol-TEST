"""Génère ressources/terrains.json : code OACI -> [lat, lon, nom, pays ISO, fuseau IANA].

Sources publiques :
  - OurAirports (domaine public) : https://github.com/davidmegginson/ourairports-data (airports.csv)
  - mwgg/Airports (licence MIT) : https://github.com/mwgg/Airports (airports.json, fuseaux horaires)
Un terrain sans fuseau connu prend celui du terrain le plus proche (même pays) qui en a un.
Usage : python3 outils/generer-terrains.py airports.csv mwgg-airports.json [sortie]
"""
import csv, json, math, re, sys

TYPES = {'small_airport': 2, 'medium_airport': 1, 'large_airport': 0, 'seaplane_base': 3, 'closed': 4}
# Terrains absents des sources (coordonnées publiques)
AJOUTS = {'LFBV': [45.1508, 1.4692, 'Brive-La Roche (fermé)', 'FR', 'Europe/Paris']}

def principal(source_oa, source_tz, cible):
    tz = {}
    for code, a in json.load(open(source_tz, encoding='utf-8')).items():
        if a.get('tz') and re.fullmatch(r'[A-Z0-9]{4}', a.get('icao') or ''):
            tz[a['icao']] = a['tz']
    terrains, rangs = {}, {}
    with open(source_oa, encoding='utf-8', newline='') as f:
        for a in csv.DictReader(f):
            if a['type'] not in TYPES:
                continue
            code = a['icao_code'] or a['gps_code'] or a['ident']
            if not re.fullmatch(r'[A-Z]{4}', code):
                continue
            r = TYPES[a['type']]
            if code in rangs and rangs[code] <= r:
                continue
            rangs[code] = r
            nom = re.sub(r'\s+(Airport|Airfield|Aerodrome|Air Base)$', '', a['name'].strip(), flags=re.I)
            terrains[code] = [round(float(a['latitude_deg']), 4), round(float(a['longitude_deg']), 4),
                              nom, a['iso_country'], tz.get(code, '')]
    # Fuseau manquant : terrain le plus proche du même pays (grille de 2° pour aller vite)
    grille = {}
    for code, t in terrains.items():
        if t[4]:
            grille.setdefault((t[3], int(t[0] // 2), int(t[1] // 2)), []).append(t)
    manquants = 0
    for code, t in terrains.items():
        if t[4]:
            continue
        meilleur, dmin = None, 1e9
        for dl in range(-3, 4):
            for dg in range(-3, 4):
                for u in grille.get((t[3], int(t[0] // 2) + dl, int(t[1] // 2) + dg), []):
                    d = (u[0] - t[0]) ** 2 + ((u[1] - t[1]) * math.cos(math.radians(t[0]))) ** 2
                    if d < dmin:
                        meilleur, dmin = u, d
        if meilleur:
            t[4] = meilleur[4]
        else:
            manquants += 1
    for code, v in AJOUTS.items():
        terrains.setdefault(code, v)
    with open(cible, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(terrains.items())), f, ensure_ascii=False, separators=(',', ':'))
    print(len(terrains), 'terrains ;', manquants, 'sans fuseau ;', cible)

if __name__ == '__main__':
    principal(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'ressources/terrains.json')
