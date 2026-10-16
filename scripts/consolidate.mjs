#!/usr/bin/env node
// Compare plusieurs sources de radars et n'adopte comme réels que ceux vus par au moins deux sources indépendantes.
//
//   node scripts/consolidate.mjs [--radius 60] [--min-sources 2] [--out .]
//        [--osm osm.json] [--gouv gouv.csv] [--mapatlas fr.geojson]     (fichiers locaux, sinon téléchargement)
//
// Sources (toutes libres) :
//   osm       OpenStreetMap via Overpass (ODbL)
//   gouv      « Liste des radars fixes en France », ministère de l'Intérieur, data.gouv.fr (Licence Ouverte 2.0)
//   mapatlas  MapAtlas European Camera Index, signalements de conducteurs (CC BY 4.0, attribution à MapAtlas)
// Sortie : radars.csv (confirmés) et candidats.csv (une seule source, ignorés par l'appli).

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const SOURCES = ["gouv", "osm", "mapatlas", "lufop"]; // ordre de priorité pour la position et la limite
// Sources republiées telles que livrées dans leur propre dossier (sources/<nom>/), sans fichier normalisé dans sources/.
const RAW_REPUBLISHED = new Set(["lufop"]);

const URLS = {
  overpass: ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"],
  gouv: "https://www.data.gouv.fr/api/1/datasets/r/17f7cfd9-a5fe-4b6a-9f5d-3625feaa396e",
  mapatlas: "https://mapatlas.eu/data/camera-index/FR.geojson",
};
const OVERPASS_QUERY =
  '[out:json][timeout:300];area["ISO3166-1"="FR"][admin_level=2]->.a;' +
  '(node["highway"="speed_camera"](area.a);node["enforcement"="traffic_signals"](area.a););out body;';

// --- Lecture des sources : chacune donne { src, id, lat, lon, type, limit } ------------------------------------

const speed = (v) => {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return n >= 5 && n <= 200 ? n : null;
};
const valid = (r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180 && (r.lat !== 0 || r.lon !== 0);
const coord = (s) => (s === "" ? NaN : Number(s)); // Number("") vaut 0 : une case vide ne doit pas devenir une position

/** Liste officielle : `Numéro de radar;Type;Date;VMA;Latitude;Longitude`, ISO-8859-1, coordonnées « +45.361 ». */
export function parseGouv(text) {
  const out = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const f = line.split(";").map((s) => s.trim());
    if (f.length < 6) continue;
    // ETFR : feu rouge ; ETVM (tronçon) et ETPN (passage à niveau) ne sont pas des radars fixes ; le reste est fixe.
    const kind = f[1].toUpperCase();
    if (kind === "ETVM" || kind === "ETPN" || !kind) continue;
    const r = { src: "gouv", id: f[0], lat: coord(f[4]), lon: coord(f[5]), type: kind === "ETFR" ? "feu_rouge" : "fixe", limit: speed(f[3]) };
    if (valid(r)) out.push(r);
  }
  return out;
}

/** OpenStreetMap (réponse Overpass JSON) : radars fixes et feux rouges. */
export function parseOsm(json) {
  const out = [];
  for (const e of json.elements ?? []) {
    if (e.type !== "node") continue;
    const t = e.tags ?? {};
    const type = t.highway === "speed_camera" ? "fixe" : t.enforcement === "traffic_signals" || t.enforcement === "red_light" ? "feu_rouge" : null;
    if (!type) continue;
    const r = { src: "osm", id: String(e.id), lat: e.lat, lon: e.lon, type, limit: speed(t.maxspeed ?? t["enforcement:maxspeed"]) };
    if (valid(r)) out.push(r);
  }
  return out;
}

/** MapAtlas : classes `spot` (fixe) et `signal` (feu rouge) ; `corridor` (tronçon) et `adaptive` sont ignorées. */
export function parseMapAtlas(json) {
  const out = [];
  for (const f of json.features ?? []) {
    const type = { spot: "fixe", signal: "feu_rouge" }[f.properties?.class];
    if (!type || f.geometry?.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates;
    const r = { src: "mapatlas", id: String(f.properties.ref), lat, lon, type, limit: speed(f.properties.limitKph) };
    if (valid(r)) out.push(r);
  }
  return out;
}

/**
 * Lufop (POI Warner) : un fichier par catégorie, lignes `lon, lat, "nom"`. Le type et la limite sont dans le nom du fichier
 * (`FRFixeFR90.csv`, `FRFeuRougeFR.csv`) ; chantiers, tronçons, passages à niveau, poids lourds, covoiturage, tunnels et zones
 * temporaires sont ignorés. [files] : [{ name, text }].
 */
export function parseLufop(files) {
  const out = [];
  for (const { name, text } of files) {
    const m = /^[A-Z]{2}(Fixe|FeuRouge)[A-Z]{2}(\d+)?\.csv$/i.exec(name);
    if (!m) continue;
    const type = m[1].toLowerCase() === "feurouge" ? "feu_rouge" : "fixe";
    text.split(/\r?\n/).forEach((line, i) => {
      const f = line.split(",");
      if (f.length < 2) return;
      const r = { src: "lufop", id: `${name}:${i + 1}`, lon: coord(f[0].trim()), lat: coord(f[1].trim()), type, limit: type === "fixe" ? speed(m[2]) : null };
      if (valid(r)) out.push(r);
    });
  }
  return out;
}

// --- Comparaison -----------------------------------------------------------------------------------------------

const R = 6371008.8;
/** Coordonnée en dix-millièmes de degré, « n » devant si négative : sert d'identifiant stable sans signe « - ». */
const scaled = (v) => (v < 0 ? "n" : "") + Math.abs(Math.round(v * 1e4));
export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Regroupe les points de même type à moins de [radiusM] mètres (liaison transitive) ; un groupe confirmé compte au moins
 * [minSources] sources différentes. Deux points d'une même source ne se confirment pas entre eux.
 */
export function consolidate(points, { radiusM = 60, minSources = 2, voteOnly = new Set() } = {}) {
  const cell = Math.max(radiusM, 1) / 111_000; // degrés de latitude ; la longitude est élargie plus bas
  const key = (lat, lon, dLat, dLon) => `${Math.floor(lat / cell) + dLat}:${Math.floor((lon * Math.cos((lat * Math.PI) / 180)) / cell) + dLon}`;
  const grid = new Map();
  points.forEach((p, i) => {
    const k = key(p.lat, p.lon, 0, 0);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const parent = points.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  points.forEach((p, i) => {
    for (let dLat = -1; dLat <= 1; dLat++)
      for (let dLon = -1; dLon <= 1; dLon++)
        for (const j of grid.get(key(p.lat, p.lon, dLat, dLon)) ?? []) {
          if (j <= i) continue;
          const q = points[j];
          if (p.type === q.type && p.src !== q.src && distanceM(p, q) <= radiusM) parent[find(j)] = find(i);
        }
  });
  const groups = new Map();
  points.forEach((p, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  });
  const confirmed = [];
  const candidates = [];
  let voteOnlyAlone = 0;
  for (const members of groups.values()) {
    const sources = SOURCES.filter((s) => members.some((m) => m.src === s));
    const publishable = members.filter((m) => !voteOnly.has(m.src)); // [voteOnly] : sources qui confirment sans rien publier
    if (publishable.length === 0) {
      voteOnlyAlone++; // vu par la seule source « vote » : rien à publier
      continue;
    }
    const best = (pick) => SOURCES.flatMap((s) => publishable.filter((m) => m.src === s)).find((m) => pick(m) != null);
    const pos = best(() => 0);
    const limit = best((m) => m.limit)?.limit ?? null;
    const gouv = publishable.find((m) => m.src === "gouv");
    const row = {
      id: gouv ? `fr-g${gouv.id}` : `fr-${scaled(pos.lat)}_${scaled(pos.lon)}`,
      lat: pos.lat,
      lon: pos.lon,
      type: pos.type,
      limit,
      sources,
    };
    (sources.length >= minSources ? confirmed : candidates).push(row);
  }
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { confirmed: confirmed.sort(byId), candidates: candidates.sort(byId), voteOnlyAlone };
}

export const toCsv = (rows, withSources) =>
  ["id,lat,lon,type,maxspeed,direction" + (withSources ? ",sources" : "")]
    .concat(
      rows.map(
        (r) => `${r.id},${r.lat.toFixed(5)},${r.lon.toFixed(5)},${r.type},${r.limit ?? ""},` + (withSources ? `,${r.sources.join("+")}` : ""),
      ),
    )
    .join("\n") + "\n";

// --- Programme -------------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : def);
  const radiusM = Number(opt("radius", 60));
  const minSources = Number(opt("min-sources", 2));
  const outDir = opt("out", ".");

  const get = async (file, url, init) => {
    if (file) return readFile(file);
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  // Serveurs Overpass publics souvent saturés : on les essaie à tour de rôle, plusieurs tours.
  const overpass = async () => {
    let last;
    for (let round = 0; round < 3; round++)
      for (const url of URLS.overpass) {
        try {
          return await get(null, url, {
            method: "POST",
            body: new URLSearchParams({ data: OVERPASS_QUERY }),
            headers: { "User-Agent": "RadarData/1.0 (consolidation mensuelle)" },
          });
        } catch (e) {
          last = e;
          console.error(`Overpass : ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, 5000 * (round + 1)));
      }
    throw last;
  };
  const osmBuf = opt("osm") ? await readFile(opt("osm")) : await overpass();
  const gouvBuf = await get(opt("gouv"), URLS.gouv);
  const mapBuf = await get(opt("mapatlas"), URLS.mapatlas);

  // Lufop : fichiers CSV « POI Warner » téléchargés à la main, versionnés dans sources/lufop (ou --lufop <dossier>).
  const lufopDir = opt("lufop", join(outDir, "sources", "lufop"));
  const lufopFiles = await readdir(lufopDir).then(
    (names) => Promise.all(names.filter((n) => n.endsWith(".csv")).map(async (name) => ({ name, text: await readFile(join(lufopDir, name), "utf8") }))),
    () => [],
  );
  const points = [
    ...parseGouv(new TextDecoder("latin1").decode(gouvBuf)),
    ...parseOsm(JSON.parse(osmBuf.toString("utf8"))),
    ...parseMapAtlas(JSON.parse(mapBuf.toString("utf8"))),
    ...parseLufop(lufopFiles),
  ];
  const count = (s) => points.filter((p) => p.src === s).length;
  // Chaque source est aussi republiée telle quelle, dans son dossier, sous sa propre licence (voir LICENSES.md).
  await mkdir(join(outDir, "sources"), { recursive: true });
  for (const s of SOURCES.filter((s) => !RAW_REPUBLISHED.has(s))) {
    const rows = points.filter((p) => p.src === s).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    await writeFile(join(outDir, "sources", `${s}.csv`), toCsv(rows.map((r) => ({ ...r, sources: [s] })), false));
  }
  const { confirmed, candidates } = consolidate(points, { radiusM, minSources });
  await writeFile(join(outDir, "radars.csv"), HEADER + toCsv(confirmed, false));
  await writeFile(join(outDir, "candidats.csv"), toCsv(candidates, true));
  console.log(`sources : gouv=${count("gouv")} osm=${count("osm")} mapatlas=${count("mapatlas")} lufop=${count("lufop")}`);
  console.log(`rayon ${radiusM} m, ${minSources} sources minimum : ${confirmed.length} confirmés, ${candidates.length} candidats`);
}

const HEADER =
  "# Radars confirmés par au moins deux sources indépendantes (voir README.md). Fichier produit par scripts/consolidate.mjs.\n" +
  "# Sources : OpenStreetMap (ODbL), data.gouv.fr « Liste des radars fixes en France » (Licence Ouverte 2.0), MapAtlas (CC BY 4.0, https://mapatlas.eu).\n";

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
