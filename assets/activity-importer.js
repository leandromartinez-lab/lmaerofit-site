/* ============================================================
 * LMAeroFit · assets/activity-importer.js
 * Importador UNIFICADO de atividades para todas as ferramentas.
 * Aceita: FIT (binário Garmin) · GPX · TCX · CSV  (+ .xml/.txt).
 * Depende de ./assets/fit-parser.js (LMA.fit) para a parte FIT.
 *
 * API:
 *   LMA.import.ACCEPT                      -> string p/ input[accept]
 *   LMA.import.fromFile(file) -> Promise<Activity>
 *   LMA.import.LABEL                       -> "FIT, GPX, TCX ou CSV"
 *
 * Activity = {
 *   source: 'fit'|'gpx'|'tcx'|'csv',
 *   sport:  'cycling'|'running'|'swimming'|null,
 *   records:[{ t, lat, lng, altitude, distance, speed, power, heartRate, cadence, temperature }],
 *   seg:   { distKm, durSec, gainM, hr:[], pw:[], spd:[], startTime },   // p/ Session Debrief
 *   route: { distKm, gainM, bearing, tech, hasGps },                     // p/ Race Briefing
 *   summary:{ points, durationSec, distanceM, elevGainM, avgSpeed,
 *             avgHeartRate, maxHeartRate, avgPower, maxPower, avgCadence,
 *             hasPower, hasHr, hasGps, hasCad }
 * }
 * ============================================================*/
(function (root) {
  'use strict';
  const ACCEPT = '.fit,.gpx,.tcx,.xml,.csv,.txt';
  const LABEL = 'FIT, GPX, TCX ou CSV';

  // ---------- geo helpers ----------
  function haversine(a, b) {
    if (!a || !b) return 0;
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const la1 = a.lat * rad, la2 = b.lat * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const rad = Math.PI / 180;
    const la1 = a.lat * rad, la2 = b.lat * rad, dLng = (b.lng - a.lng) * rad;
    const y = Math.sin(dLng) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  const n = x => (x === null || x === undefined || x === '' || isNaN(+x)) ? null : +x;

  // ---------- XML helpers (DOMParser nativo) ----------
  function dom(text) {
    if (typeof DOMParser === 'undefined') throw new Error('DOMParser indisponível.');
    const d = new DOMParser().parseFromString(text, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('XML inválido.');
    return d;
  }
  function childText(el, name) {
    for (const c of el.children) if (c.localName === name && c.textContent.trim() !== '') return c.textContent.trim();
    return null;
  }
  function deepFind(el, name) {
    const stack = [...el.children];
    while (stack.length) { const x = stack.shift(); if (x.localName === name) return x; stack.push(...x.children); }
    return null;
  }
  function deepText(el, name) { const x = deepFind(el, name); return x ? x.textContent.trim() : null; }

  function guessSport(s) {
    if (!s) return null; s = String(s).toLowerCase();
    if (/run|corrid/.test(s)) return 'running';
    if (/bik|cycl|ride|ciclis/.test(s)) return 'cycling';
    if (/swim|nata/.test(s)) return 'swimming';
    return null;
  }

  // ---------- format parsers -> records ----------
  function recordsFromGPX(text) {
    const doc = dom(text);
    const pts = doc.getElementsByTagName('trkpt');
    if (!pts.length) throw new Error('Sem trkpt (não é um GPX de trajeto).');
    const recs = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const ext = deepFind(p, 'extensions');
      recs.push({
        t: childText(p, 'time') ? new Date(childText(p, 'time')) : null,
        lat: n(p.getAttribute('lat')), lng: n(p.getAttribute('lon')),
        altitude: n(childText(p, 'ele')), distance: null, speed: ext ? n(deepText(ext, 'speed')) : null,
        power: ext ? (n(deepText(ext, 'power')) ?? n(deepText(ext, 'PowerInWatts'))) : null,
        heartRate: ext ? n(deepText(ext, 'hr')) : null,
        cadence: ext ? n(deepText(ext, 'cad')) : null,
        temperature: ext ? n(deepText(ext, 'atemp')) : null,
      });
    }
    return { records: recs, sport: guessSport(deepText(doc.documentElement, 'type')) };
  }

  function recordsFromTCX(text) {
    const doc = dom(text);
    const tps = doc.getElementsByTagName('Trackpoint');
    if (!tps.length) throw new Error('Sem Trackpoint (não é um TCX válido).');
    const recs = [];
    for (let i = 0; i < tps.length; i++) {
      const tp = tps[i];
      const pos = deepFind(tp, 'Position');
      const hrEl = deepFind(tp, 'HeartRateBpm');
      const ext = deepFind(tp, 'Extensions');
      recs.push({
        t: childText(tp, 'Time') ? new Date(childText(tp, 'Time')) : null,
        lat: pos ? n(deepText(pos, 'LatitudeDegrees')) : null,
        lng: pos ? n(deepText(pos, 'LongitudeDegrees')) : null,
        altitude: n(childText(tp, 'AltitudeMeters')),
        distance: n(childText(tp, 'DistanceMeters')),
        speed: ext ? n(deepText(ext, 'Speed')) : null,
        power: ext ? n(deepText(ext, 'Watts')) : null,
        heartRate: hrEl ? n(deepText(hrEl, 'Value')) : null,
        cadence: n(childText(tp, 'Cadence')) ?? (ext ? n(deepText(ext, 'RunCadence')) : null),
        temperature: null,
      });
    }
    const act = doc.getElementsByTagName('Activity')[0];
    return { records: recs, sport: guessSport(act ? act.getAttribute('Sport') : null) };
  }

  function recordsFromFIT(arrayBuffer) {
    if (!(root.LMA && root.LMA.fit)) throw new Error('Parser FIT não carregado (assets/fit-parser.js).');
    const fit = root.LMA.fit.parseFIT(arrayBuffer);
    const recs = (fit.records || []).map(r => ({
      t: r.timestamp || null, lat: r.lat ?? null, lng: r.lng ?? null,
      altitude: r.altitude ?? null, distance: r.distance ?? null, speed: r.speed ?? null,
      power: r.power ?? null, heartRate: r.heartRate ?? null, cadence: r.cadence ?? null,
      temperature: r.temperature ?? null,
    }));
    if (!recs.length) throw new Error('FIT sem registros de atividade.');
    return { records: recs, sport: fit.sport || null };
  }

  // CSV: sem lat/lng (sem trajeto). Detecta colunas power/hr/speed/distance/time.
  function recordsFromCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 3) throw new Error('CSV muito curto.');
    const head = lines[0].toLowerCase().split(/[,;\t]/);
    const idx = re => head.findIndex(h => re.test(h));
    const iP = idx(/power|watts|pwr/), iH = idx(/heart|hr|bpm/), iS = idx(/speed|kph|kmh|vel3?/),
          iD = idx(/dist/), iC = idx(/cad/), iT = idx(/time|secs|timestamp/);
    const recs = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(/[,;\t]/);
      const rec = { t: null, lat: null, lng: null, altitude: null,
        distance: iD >= 0 ? n(c[iD]) : null, speed: iS >= 0 ? n(c[iS]) : null,
        power: iP >= 0 ? n(c[iP]) : null, heartRate: iH >= 0 ? n(c[iH]) : null,
        cadence: iC >= 0 ? n(c[iC]) : null, temperature: null };
      if (rec.power != null && (rec.power < 0 || rec.power > 2000)) rec.power = null;
      if (rec.heartRate != null && (rec.heartRate < 30 || rec.heartRate > 240)) rec.heartRate = null;
      if (rec.power != null || rec.heartRate != null || rec.speed != null || rec.distance != null) recs.push(rec);
    }
    if (!recs.length) throw new Error('CSV sem colunas reconhecidas (power/hr/speed).');
    return { records: recs, sport: null };
  }

  // ---------- derivações (seg, route, summary) ----------
  function smooth(arr, win) {
    const out = new Array(arr.length), half = (win / 2) | 0;
    for (let i = 0; i < arr.length; i++) {
      let s = 0, c = 0;
      for (let j = i - half; j <= i + half; j++) if (arr[j] != null) { s += arr[j]; c++; }
      out[i] = c ? s / c : arr[i];
    }
    return out;
  }

  function finalize(source, sport, records) {
    const hr = [], pw = [], spd = [];
    let gain = 0, prevAlt = null, hasGps = false;
    let lastGps = null, cumDist = 0;
    const gpsPts = [];

    for (const r of records) {
      if (r.lat != null && r.lng != null) { hasGps = true; gpsPts.push({ lat: r.lat, lng: r.lng, alt: r.altitude }); }
      if (r.heartRate != null) hr.push(r.heartRate);
      if (r.power != null) pw.push(r.power);
      if (r.speed != null) spd.push(r.speed);
      if (r.altitude != null) { if (prevAlt != null && r.altitude > prevAlt) gain += r.altitude - prevAlt; prevAlt = r.altitude; }
    }

    // distância: usa o campo distance (FIT/TCX) se houver; senão haversine do trajeto
    const lastDist = [...records].reverse().find(r => r.distance != null);
    if (lastDist) cumDist = lastDist.distance;
    else if (gpsPts.length > 1) for (let i = 1; i < gpsPts.length; i++) cumDist += haversine(gpsPts[i - 1], gpsPts[i]);

    const ts = records.map(r => r.t).filter(Boolean);
    let durSec = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 1000 : records.length;

    const seg = { distKm: cumDist / 1000, durSec, gainM: Math.round(gain),
      hr, pw, spd, startTime: ts[0] ? ts[0].getTime() : null };

    // route p/ briefing (precisa de GPS p/ bearing/tech)
    let route = { distKm: cumDist / 1000, gainM: Math.round(gain), bearing: 0, tech: 0, hasGps };
    if (hasGps && gpsPts.length > 1) {
      route.bearing = Math.round(bearing(gpsPts[0], gpsPts[gpsPts.length - 1]));
      const eles = gpsPts.map(p => p.alt).filter(v => v != null);
      if (eles.length > 10) {
        const m = eles.reduce((a, b) => a + b, 0) / eles.length;
        const sd = Math.sqrt(eles.reduce((a, b) => a + (b - m) ** 2, 0) / eles.length);
        route.tech = Math.min(50, Math.round(sd / 4));
      }
    }

    // summary
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const summary = {
      points: records.length, durationSec: durSec, distanceM: cumDist,
      elevGainM: Math.round(gain) || null,
      avgSpeed: spd.length ? sum(spd) / spd.length : null,
      avgHeartRate: hr.length ? Math.round(sum(hr) / hr.length) : null,
      maxHeartRate: hr.length ? Math.max(...hr) : null,
      avgPower: pw.length ? Math.round(sum(pw) / pw.length) : null,
      maxPower: pw.length ? Math.max(...pw) : null,
      avgCadence: records.filter(r => r.cadence != null).length
        ? Math.round(sum(records.map(r => r.cadence).filter(v => v != null)) / records.filter(r => r.cadence != null).length) : null,
      hasPower: pw.length > 0, hasHr: hr.length > 0, hasGps, hasCad: records.some(r => r.cadence != null),
    };

    return { source, sport, records, seg, route, summary };
  }

  // ---------- entrada principal ----------
  function detectAndParse(name, text, buffer) {
    name = (name || '').toLowerCase();
    if (name.endsWith('.fit')) return recordsFromFIT(buffer);
    const t = (text || '').trim();
    if (name.endsWith('.tcx') || /<TrainingCenterDatabase/i.test(t)) return recordsFromTCX(text);
    if (name.endsWith('.gpx') || /<gpx[\s>]/i.test(t)) return recordsFromGPX(text);
    if (t.startsWith('<?xml') || t.startsWith('<')) {
      // xml genérico: tenta TCX depois GPX
      try { return recordsFromTCX(text); } catch (e) { return recordsFromGPX(text); }
    }
    return recordsFromCSV(text);
  }

  function fromFile(file) {
    const name = (file.name || '').toLowerCase();
    const isFit = name.endsWith('.fit');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.onload = () => {
        try {
          const parsed = isFit ? detectAndParse(name, null, reader.result)
                               : detectAndParse(name, reader.result, null);
          const source = name.endsWith('.fit') ? 'fit'
            : name.endsWith('.tcx') ? 'tcx'
            : name.endsWith('.gpx') ? 'gpx'
            : (parsed.records.some(r => r.lat != null) ? 'gpx' : 'csv');
          resolve(finalize(source, parsed.sport, parsed.records));
        } catch (e) { reject(e); }
      };
      if (isFit) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    });
  }

  root.LMA = root.LMA || {};
  root.LMA.import = { fromFile, ACCEPT, LABEL,
    // expostos para teste/uso avançado:
    _recordsFromGPX: recordsFromGPX, _recordsFromTCX: recordsFromTCX,
    _recordsFromFIT: recordsFromFIT, _recordsFromCSV: recordsFromCSV, _finalize: finalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.import;
})(typeof self !== 'undefined' ? self : this);
