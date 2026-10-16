import test from "node:test";
import assert from "node:assert/strict";
import { consolidate, parseGouv, parseMapAtlas, parseOsm, toCsv } from "./consolidate.mjs";

const p = (src, id, lat, lon, type = "fixe", limit = null) => ({ src, id, lat, lon, type, limit });
// 0,0001° de latitude ≈ 11 m
const near = 0.0001;

test("deux sources qui coïncident confirment le radar, une seule non", () => {
  const { confirmed, candidates } = consolidate([
    p("osm", "1", 45, 5),
    p("mapatlas", "a", 45 + near, 5),
    p("osm", "2", 46, 6),
  ]);
  assert.equal(confirmed.length, 1);
  assert.deepEqual(confirmed[0].sources, ["osm", "mapatlas"]);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].sources, ["osm"]);
});

test("deux points de la même source ne se confirment pas entre eux", () => {
  const { confirmed, candidates } = consolidate([p("osm", "1", 45, 5), p("osm", "2", 45 + near, 5)]);
  assert.equal(confirmed.length, 0);
  assert.equal(candidates.length, 2);
});

test("types différents ou trop éloignés : pas de confirmation", () => {
  assert.equal(consolidate([p("osm", "1", 45, 5, "fixe"), p("gouv", "2", 45, 5, "feu_rouge")]).confirmed.length, 0);
  assert.equal(consolidate([p("osm", "1", 45, 5), p("gouv", "2", 45.01, 5)]).confirmed.length, 0);
});

test("position et limite viennent de la source la plus fiable, l'identifiant de la liste officielle", () => {
  const { confirmed } = consolidate([
    p("mapatlas", "m", 45.00005, 5, "fixe", 80),
    p("osm", "o", 45.00002, 5, "fixe", null),
    p("gouv", "12001", 45, 5, "fixe", 70),
  ]);
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].id, "fr-g12001");
  assert.equal(confirmed[0].lat, 45);
  assert.equal(confirmed[0].limit, 70);
  assert.deepEqual(confirmed[0].sources, ["gouv", "osm", "mapatlas"]);
});

test("le rayon et le nombre minimal de sources se règlent", () => {
  const pts = [p("osm", "1", 45, 5), p("gouv", "2", 45.0005, 5)];
  assert.equal(consolidate(pts, { radiusM: 30 }).confirmed.length, 0);
  assert.equal(consolidate(pts, { radiusM: 100 }).confirmed.length, 1);
  assert.equal(consolidate(pts, { radiusM: 30, minSources: 1 }).confirmed.length, 2);
});

test("lecture des trois formats", () => {
  const gouv = parseGouv(
    "Numéro de radar;Type de radar;Date de mise en service;VMA ;Latitude; Longitude\r\n" +
      "12001;ETD;31/10/2011 00:00;70;+45.361;+4.2526\r\n12002;ETFR;01/01/2012 00:00;50;+45.4;+4.3\r\n" +
      "12003;ETVM;01/01/2012 00:00;90;+45.5;+4.4\r\n12004;ETPN;01/01/2012 00:00;;+45.6;+4.5\r\n12005;ETD;x;80;;\r\n",
  );
  assert.deepEqual(gouv.map((r) => [r.id, r.type, r.limit]), [["12001", "fixe", 70], ["12002", "feu_rouge", 50]]);
  assert.equal(gouv[0].lon, 4.2526);

  const osm = parseOsm({
    elements: [
      { type: "node", id: 1, lat: 45, lon: 5, tags: { highway: "speed_camera", maxspeed: "90" } },
      { type: "node", id: 2, lat: 45, lon: 5, tags: { enforcement: "traffic_signals" } },
      { type: "node", id: 3, lat: 45, lon: 5, tags: { highway: "bus_stop" } },
    ],
  });
  assert.deepEqual(osm.map((r) => [r.type, r.limit]), [["fixe", 90], ["feu_rouge", null]]);

  const map = parseMapAtlas({
    features: [
      { geometry: { type: "Point", coordinates: [5, 45] }, properties: { ref: "A", class: "spot", limitKph: 50 } },
      { geometry: { type: "Point", coordinates: [5, 45] }, properties: { ref: "B", class: "signal" } },
      { geometry: { type: "Point", coordinates: [5, 45] }, properties: { ref: "C", class: "corridor" } },
    ],
  });
  assert.deepEqual(map.map((r) => [r.id, r.type, r.limit, r.lat, r.lon]), [["A", "fixe", 50, 45, 5], ["B", "feu_rouge", null, 45, 5]]);
});

test("le CSV respecte le format lu par l'appli", () => {
  const csv = toCsv([{ id: "x", lat: 45.123456, lon: 5.1, type: "fixe", limit: null, sources: ["osm", "gouv"] }], false);
  assert.equal(csv, "id,lat,lon,type,maxspeed,direction\nx,45.12346,5.10000,fixe,,\n");
  assert.match(toCsv([{ id: "x", lat: 1, lon: 2, type: "fixe", limit: 50, sources: ["osm", "gouv"] }], true), /,50,,osm\+gouv\n$/);
});
