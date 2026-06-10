/* ============================================================
 * LMAeroFit · assets/debrief-core.js
 * Motor de ANÁLISE PÓS-PROVA (estilo Método Norueguês / Double-Threshold).
 * Processa os STREAMS por registro (act.records) e devolve um relatório
 * estruturado. O RENDERIZADOR (HTML + gráficos) vive em debrief-render.js.
 *
 * API:  LMA.debrief.analyze(act, profile, opts) -> report (objeto)
 *
 * Substitui lactato por: Potência, FC, Pace, NP, IF, VI, EF, Pa:Hr,
 * deriva cardíaca, distribuição de zonas, tempo acima do limiar.
 * ============================================================*/
(function (root) {
  'use strict';

  const sum = a => a.reduce((x, y) => x + y, 0);
  const avg = a => a.length ? sum(a) / a.length : 0;
  const round = (x, d = 0) => { const m = 10 ** d; return Math.round(x * m) / m; };
  const fmtMin = s => {
    s = Math.round(s); const h = (s / 3600) | 0, m = Math.round((s % 3600) / 60);
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
  };
  const haversine = (a, b) => {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const la1 = a.lat * rad, la2 = b.lat * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  function smooth(arr, win) {
    const out = new Array(arr.length), half = (win / 2) | 0;
    for (let i = 0; i < arr.length; i++) {
      let s = 0, c = 0;
      for (let j = i - half; j <= i + half; j++) if (arr[j] != null && isFinite(arr[j])) { s += arr[j]; c++; }
      out[i] = c ? s / c : (arr[i] ?? 0);
    }
    return out;
  }
  function wavg(vals, dts) {
    let s = 0, w = 0;
    for (let i = 0; i < vals.length; i++) if (vals[i] != null && isFinite(vals[i])) { s += vals[i] * dts[i]; w += dts[i]; }
    return w ? s / w : 0;
  }

  function buildSeries(records) {
    const N = records.length;
    const t = new Array(N), dt = new Array(N), dist = new Array(N), alt = new Array(N),
      pw = new Array(N), hr = new Array(N), cad = new Array(N), spd = new Array(N),
      temp = new Array(N), lat = new Array(N), lng = new Array(N);
    let t0 = null;
    for (let i = 0; i < N; i++) {
      const r = records[i];
      const ti = r.t ? (r.t instanceof Date ? r.t.getTime() : new Date(r.t).getTime()) : null;
      if (ti != null && t0 == null) t0 = ti;
      t[i] = ti != null && t0 != null ? (ti - t0) / 1000 : i;
      alt[i] = r.altitude; pw[i] = r.power; hr[i] = r.heartRate; cad[i] = r.cadence;
      spd[i] = r.speed; temp[i] = r.temperature; lat[i] = r.lat; lng[i] = r.lng;
      dist[i] = r.distance;
    }
    for (let i = 0; i < N; i++) {
      let d = i === 0 ? (t[1] != null ? t[1] - t[0] : 1) : t[i] - t[i - 1];
      if (!isFinite(d) || d <= 0) d = 1;
      if (d > 15) d = 1;
      dt[i] = d;
    }
    let haveDist = dist.some(d => d != null);
    if (!haveDist) {
      let cum = 0; dist[0] = 0;
      for (let i = 1; i < N; i++) {
        if (lat[i] != null && lng[i] != null && lat[i - 1] != null && lng[i - 1] != null)
          cum += haversine({ lat: lat[i - 1], lng: lng[i - 1] }, { lat: lat[i], lng: lng[i] });
        dist[i] = cum;
      }
    } else {
      let last = 0;
      for (let i = 0; i < N; i++) { if (dist[i] == null) dist[i] = last; else last = dist[i]; }
    }
    let haveSpd = spd.some(s => s != null && s > 0);
    if (!haveSpd) for (let i = 0; i < N; i++) {
      const dd = i === 0 ? 0 : dist[i] - dist[i - 1];
      spd[i] = dt[i] > 0 ? dd / dt[i] : 0;
    }
    return { N, t, dt, dist, alt, pw, hr, cad, spd, temp, lat, lng,
      has: {
        pw: pw.some(v => v != null), hr: hr.some(v => v != null), cad: cad.some(v => v != null),
        alt: alt.some(v => v != null), gps: lat.some(v => v != null), temp: temp.some(v => v != null),
        spd: spd.some(v => v != null && v > 0), dist: dist[N - 1] > 0,
      } };
  }

  function normalizedPower(pw, t) {
    const vals = [], n = pw.length;
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (pw[i] == null) continue;
      while (t[i] - t[j] > 30) j++;
      let s = 0, c = 0;
      for (let k = j; k <= i; k++) if (pw[k] != null) { s += pw[k]; c++; }
      if (c) vals.push((s / c) ** 4);
    }
    if (!vals.length) return 0;
    return (sum(vals) / vals.length) ** 0.25;
  }

  function gradeSeries(alt, dist) {
    const n = alt.length, g = new Array(n).fill(0);
    const sa = smooth(alt.map(v => v == null ? null : v), 15);
    for (let i = 1; i < n; i++) {
      const dd = dist[i] - dist[i - 1];
      if (dd > 0.5 && sa[i] != null && sa[i - 1] != null) g[i] = ((sa[i] - sa[i - 1]) / dd) * 100;
      else g[i] = g[i - 1];
    }
    return smooth(g, 9);
  }

  function analyze(act, profile, opts) {
    opts = opts || {}; profile = profile || {};
    const records = (act && act.records) || [];
    if (records.length < 5) return { error: 'Arquivo sem registros suficientes para análise detalhada.' };

    const s = buildSeries(records);
    const sport = opts.sport || act.sport || guessSportFromData(s) || 'cycling';
    const ftp = +profile.ftpW || 250;
    const massKg = +profile.massKg || 72;
    const age = +profile.age || 40;
    const hrMaxProfile = +profile.hrMax || 0;
    const runThrPace = +profile.runThrPace || 0;

    const elapsedSec = s.t[s.N - 1] - s.t[0] || s.N;
    let movingSec = 0;
    for (let i = 0; i < s.N; i++) if (s.spd[i] == null || s.spd[i] > 0.4) movingSec += s.dt[i];
    if (!movingSec) movingSec = sum(s.dt);
    const distM = s.dist[s.N - 1] || 0;

    let gain = 0;
    if (s.has.alt) {
      const sa = smooth(s.alt.map(v => v == null ? null : v), 11);
      for (let i = 1; i < s.N; i++) if (sa[i] != null && sa[i - 1] != null && sa[i] > sa[i - 1]) gain += sa[i] - sa[i - 1];
    }

    const hrVals = s.hr.filter(v => v != null && v > 30 && v < 240);
    const avgHR = hrVals.length ? wavg(s.hr, s.dt) : 0;
    const maxHR = hrVals.length ? Math.max(...hrVals) : 0;
    const minHR = hrVals.length ? Math.min(...hrVals) : 0;
    const hrMax = hrMaxProfile || Math.max(maxHR, 220 - age);
    const lthr = Math.round(hrMax * 0.92);

    const pwVals = s.pw.filter(v => v != null && v >= 0 && v < 2000);
    const hasPower = pwVals.length > 10;
    const avgPower = hasPower ? wavg(s.pw, s.dt) : 0;
    const maxPower = hasPower ? Math.max(...pwVals) : 0;
    const NP = hasPower ? normalizedPower(s.pw, s.t) : 0;
    const VI = hasPower && avgPower ? NP / avgPower : 0;
    const IF = hasPower ? NP / ftp : 0;
    const TSS = hasPower ? (movingSec * NP * IF) / (ftp * 3600) * 100 : hrTSS(avgHR, lthr, movingSec);

    const cadVals = s.cad.filter(v => v != null && v > 0);
    const avgCad = cadVals.length ? avg(cadVals) : 0;
    const avgSpeedMs = movingSec ? distM / movingSec : 0;
    const avgSpeedKmh = avgSpeedMs * 3.6;
    const avgPaceSecKm = avgSpeedMs > 0 ? 1000 / avgSpeedMs : 0;
    const tempVals = s.temp.filter(v => v != null);
    const tempAvg = tempVals.length ? avg(tempVals) : null;
    const tempMax = tempVals.length ? Math.max(...tempVals) : null;

    const isRun = sport === 'running';
    const efOverall = avgHR ? (hasPower ? NP / avgHR : (isRun ? (avgSpeedMs * 100) / avgHR : 0)) : 0;

    const pdc = hasPower ? powerCurve(s.pw, s.t) : null;
    let ftpEst = null;
    if (pdc) {
      if (pdc[3600]) ftpEst = pdc[3600];
      else if (pdc[1200]) ftpEst = pdc[1200] * 0.95;
      else if (pdc[600]) ftpEst = pdc[600] * 0.90;
    }
    const ftpDivergence = ftpEst ? (ftp - ftpEst) / ftpEst : 0;

    const decoup = computeDecoupling(s, hasPower, isRun);
    const quarters = computeQuarters(s, { hasPower, isRun, ftp, lthr });
    const grade = s.has.alt ? gradeSeries(s.alt, s.dist) : null;
    const terrain = grade ? computeTerrain(s, grade, { hasPower, isRun }) : null;
    const zones = hasPower ? powerZones(s, ftp) : (hrVals.length ? hrZones(s, lthr, hrMax) : null);
    const splits = s.has.dist ? computeSplits(s, isRun ? 1 : 5, { hasPower, isRun }) : null;

    let aboveThrSec = 0, atThrSec = 0, grayZoneSec = 0;
    if (hasPower) {
      for (let i = 0; i < s.N; i++) {
        if (s.pw[i] == null) continue;
        const r = s.pw[i] / ftp;
        if (r > 1.05) aboveThrSec += s.dt[i];
        else if (r >= 0.91) atThrSec += s.dt[i];
        else if (r >= 0.76) grayZoneSec += s.dt[i];
      }
    } else if (hrVals.length) {
      for (let i = 0; i < s.N; i++) {
        if (s.hr[i] == null) continue;
        const r = s.hr[i] / lthr;
        if (r > 1.0) aboveThrSec += s.dt[i];
        else if (r >= 0.95) atThrSec += s.dt[i];
        else if (r >= 0.88) grayZoneSec += s.dt[i];
      }
    }

    const general = {
      sport, source: act.source,
      elapsedSec, movingSec, stoppedSec: Math.max(0, elapsedSec - movingSec),
      distKm: distM / 1000, gainM: Math.round(gain),
      avgSpeedKmh, avgPaceSecKm,
      avgHR: Math.round(avgHR), maxHR, minHR, hrMax, lthr,
      avgPower: hasPower ? Math.round(avgPower) : null, NP: hasPower ? Math.round(NP) : null,
      maxPower: hasPower ? Math.round(maxPower) : null,
      VI: hasPower ? round(VI, 2) : null, IF: hasPower ? round(IF, 2) : null,
      TSS: Math.round(TSS), EF: round(efOverall, hasPower ? 2 : 1),
      avgCad: avgCad ? Math.round(avgCad) : null,
      tempAvg: tempAvg != null ? round(tempAvg, 1) : null, tempMax,
      wkg: hasPower ? round(NP / massKg, 2) : null,
      ftp, ftpEst: ftpEst ? Math.round(ftpEst) : null, ftpDivergence,
      pdc, hasPower, hasHr: hrVals.length > 0, hasGps: s.has.gps, hasCad: cadVals.length > 0,
      aboveThrSec, atThrSec, grayZoneSec,
    };

    const scores = computeScores(general, quarters, decoup, zones, terrain);
    const alerts = computeAlerts(general, quarters, decoup, terrain, { isRun });
    const exageros = computeExageros(general, quarters, terrain, splits, { ftp, isRun });
    const fortes = computeFortes(general, quarters, decoup, terrain);
    const diagnosis = computeDiagnosis(general, scores, decoup);
    const recs = computeRecommendations(general, scores, { isRun, ftp, runThrPace });
    const semaphore = computeSemaphore(general, scores, decoup, terrain);

    return { ok: true, general, quarters, terrain, zones, splits, decoup,
      scores, alerts, exageros, fortes, diagnosis, recs, semaphore, series: s, grade };
  }

  function guessSportFromData(s) { return (s.has.pw && s.has.gps && !s.has.cad) ? 'cycling' : null; }
  function hrTSS(avgHR, lthr, sec) { if (!avgHR || !lthr) return 0; const IFhr = avgHR / lthr; return (sec / 3600) * (IFhr ** 2) * 100; }

  function powerCurve(pw, t) {
    const durations = [5, 30, 60, 300, 600, 1200, 3600], out = {}, n = pw.length;
    for (const D of durations) {
      let best = 0, s = 0, c = 0; const q = [];
      for (let i = 0; i < n; i++) {
        if (pw[i] == null) continue;
        q.push(i); s += pw[i]; c++;
        while (q.length && t[i] - t[q[0]] > D) { s -= pw[q[0]]; c--; q.shift(); }
        if (t[i] - t[q[0]] >= D * 0.9 && c > 0) best = Math.max(best, s / c);
      }
      if (best > 0) out[D] = Math.round(best);
    }
    return Object.keys(out).length ? out : null;
  }

  function computeDecoupling(s, hasPower, isRun) {
    const idx = [];
    for (let i = 0; i < s.N; i++) if ((s.spd[i] == null || s.spd[i] > 0.4)) idx.push(i);
    if (idx.length < 20) return null;
    const mid = idx[(idx.length / 2) | 0];
    const eff = (from, to) => {
      let num = [], hr = [], dts = [];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        if (i < from || i >= to) continue;
        if (s.hr[i] == null || s.hr[i] < 40) continue;
        const power = hasPower ? s.pw[i] : (isRun ? s.spd[i] * 100 : (s.spd[i] || 0) * 100);
        if (power == null) continue;
        num.push(power); hr.push(s.hr[i]); dts.push(s.dt[i]);
      }
      if (hr.length < 5) return null;
      const p = wavg(num, dts), h = wavg(hr, dts);
      return h ? p / h : null;
    };
    const e1 = eff(idx[0], mid), e2 = eff(mid, idx[idx.length - 1] + 1);
    if (e1 == null || e2 == null) return null;
    const pct = ((e1 - e2) / e1) * 100, a = Math.abs(pct);
    let band = a <= 3 ? 'excelente' : a <= 5 ? 'muito-bom' : a <= 8 ? 'aceitavel' : a <= 10 ? 'atencao' : 'critico';
    return { e1, e2, pct, band };
  }

  function computeQuarters(s, o) {
    const total = s.t[s.N - 1] - s.t[0] || s.N;
    const bounds = [0, .25, .5, .75, 1].map(f => s.t[0] + f * total);
    const out = [];
    for (let q = 0; q < 4; q++) {
      const lo = bounds[q], hi = bounds[q + 1], I = [];
      for (let i = 0; i < s.N; i++) if (s.t[i] >= lo && s.t[i] < hi) I.push(i);
      if (q === 3) for (let i = 0; i < s.N; i++) if (s.t[i] >= hi) I.push(i);
      if (!I.length) { out.push(null); continue; }
      const pick = arr => I.map(i => arr[i]);
      const dts = pick(s.dt);
      const pw = pick(s.pw), hr = pick(s.hr), cad = pick(s.cad), alt = pick(s.alt), temp = pick(s.temp);
      const dKm = (s.dist[I[I.length - 1]] - s.dist[I[0]]) / 1000;
      const tSec = s.t[I[I.length - 1]] - s.t[I[0]] || sum(dts);
      const aP = o.hasPower ? wavg(pw, dts) : 0;
      const aH = wavg(hr, dts);
      const spdMs = tSec > 0 ? (dKm * 1000) / tSec : 0;
      let g = 0; const sa = smooth(alt.map(v => v == null ? null : v), 9);
      for (let i = 1; i < sa.length; i++) if (sa[i] != null && sa[i - 1] != null && sa[i] > sa[i - 1]) g += sa[i] - sa[i - 1];
      const ef = aH ? (o.hasPower ? aP / aH : (o.isRun ? (spdMs * 100) / aH : 0)) : 0;
      out.push({
        idx: q, distKm: dKm, durSec: tSec,
        avgPower: o.hasPower ? Math.round(aP) : null,
        IF: o.hasPower ? round(aP ? (aP / o.ftp) : 0, 2) : null,
        avgHR: Math.round(aH), spdKmh: round(spdMs * 3.6, 1),
        paceSecKm: spdMs > 0 ? 1000 / spdMs : 0,
        avgCad: cad.filter(v => v != null && v > 0).length ? Math.round(avg(cad.filter(v => v != null && v > 0))) : null,
        gainM: Math.round(g), EF: round(ef, o.hasPower ? 2 : 1),
        tempAvg: temp.filter(v => v != null).length ? round(avg(temp.filter(v => v != null)), 1) : null,
      });
    }
    return out;
  }

  function computeTerrain(s, grade, o) {
    const cat = { climb: [], flat: [], descent: [] };
    for (let i = 0; i < s.N; i++) {
      const g = grade[i];
      cat[g > 2 ? 'climb' : (g < -2 ? 'descent' : 'flat')].push(i);
    }
    const build = I => {
      if (I.length < 3) return null;
      const pick = arr => I.map(i => arr[i]);
      const dts = pick(s.dt);
      const aP = o.hasPower ? wavg(pick(s.pw), dts) : 0;
      const aH = wavg(pick(s.hr), dts);
      const tSec = sum(dts);
      const dKm = sum(I.map((i, k) => k === 0 ? 0 : Math.max(0, s.dist[i] - s.dist[I[k - 1]]))) / 1000;
      const spdMs = tSec > 0 ? (dKm * 1000) / tSec : 0;
      const cadV = pick(s.cad).filter(v => v != null && v > 0);
      const ef = aH ? (o.hasPower ? aP / aH : (o.isRun ? (spdMs * 100) / aH : 0)) : 0;
      return { durSec: tSec, distKm: dKm, pctTime: 0,
        avgPower: o.hasPower ? Math.round(aP) : null, avgHR: Math.round(aH),
        spdKmh: round(spdMs * 3.6, 1), paceSecKm: spdMs > 0 ? 1000 / spdMs : 0,
        avgCad: cadV.length ? Math.round(avg(cadV)) : null, EF: round(ef, o.hasPower ? 2 : 1) };
    };
    const r = { climb: build(cat.climb), flat: build(cat.flat), descent: build(cat.descent) };
    const tot = (r.climb?.durSec || 0) + (r.flat?.durSec || 0) + (r.descent?.durSec || 0);
    ['climb', 'flat', 'descent'].forEach(k => { if (r[k] && tot) r[k].pctTime = round(r[k].durSec / tot * 100, 0); });
    return r;
  }

  function powerZones(s, ftp) {
    const defs = [['Z1', 'Recuperação', 0, 0.55], ['Z2', 'Endurance', 0.55, 0.75], ['Z3', 'Tempo', 0.75, 0.90],
      ['Z4', 'Limiar', 0.90, 1.05], ['Z5', 'VO₂max', 1.05, 1.20], ['Z6', 'Anaeróbico', 1.20, 1.50], ['Z7', 'Neuromuscular', 1.50, 99]];
    const time = defs.map(() => 0);
    for (let i = 0; i < s.N; i++) {
      if (s.pw[i] == null) continue;
      const r = s.pw[i] / ftp;
      for (let z = 0; z < defs.length; z++) if (r >= defs[z][2] && r < defs[z][3]) { time[z] += s.dt[i]; break; }
    }
    const tot = sum(time) || 1;
    return { type: 'power', zones: defs.map((d, z) => ({ z: d[0], name: d[1], sec: time[z], pct: round(time[z] / tot * 100, 0) })) };
  }
  function hrZones(s, lthr, hrMax) {
    const defs = [['Z1', 'Recuperação', 0, 0.85], ['Z2', 'Endurance', 0.85, 0.90], ['Z3', 'Tempo', 0.90, 0.95],
      ['Z4', 'Limiar', 0.95, 1.00], ['Z5', 'Acima', 1.00, 99]];
    const time = defs.map(() => 0);
    for (let i = 0; i < s.N; i++) {
      if (s.hr[i] == null || s.hr[i] < 40) continue;
      const r = s.hr[i] / lthr;
      for (let z = 0; z < defs.length; z++) if (r >= defs[z][2] && r < defs[z][3]) { time[z] += s.dt[i]; break; }
    }
    const tot = sum(time) || 1;
    return { type: 'hr', lthr, zones: defs.map((d, z) => ({ z: d[0], name: d[1], sec: time[z], pct: round(time[z] / tot * 100, 0) })) };
  }

  function computeSplits(s, km, o) {
    const out = [], stepM = km * 1000;
    let next = stepM, startIdx = 0;
    for (let i = 0; i < s.N; i++) {
      if (s.dist[i] >= next || i === s.N - 1) {
        if (i - startIdx > 1) {
          const I = []; for (let k = startIdx; k <= i; k++) I.push(k);
          const dts = I.map(k => s.dt[k]);
          const dKm = (s.dist[i] - s.dist[startIdx]) / 1000;
          const tSec = s.t[i] - s.t[startIdx] || sum(dts);
          const spdMs = tSec > 0 ? (dKm * 1000) / tSec : 0;
          out.push({ km: round(s.dist[i] / 1000, 1),
            avgPower: o.hasPower ? Math.round(wavg(I.map(k => s.pw[k]), dts)) : null,
            avgHR: Math.round(wavg(I.map(k => s.hr[k]), dts)),
            spdKmh: round(spdMs * 3.6, 1), paceSecKm: spdMs > 0 ? 1000 / spdMs : 0 });
        }
        startIdx = i; next += stepM;
      }
    }
    return out.length ? out : null;
  }

  function computeScores(g, quarters, decoup, zones, terrain) {
    let pacing = 70;
    if (g.hasPower && g.VI != null) pacing = g.VI <= 1.05 ? 95 : g.VI <= 1.10 ? 80 : g.VI <= 1.20 ? 60 : g.VI <= 1.30 ? 42 : 30;
    else if (quarters[0] && quarters[3] && quarters[0].spdKmh) {
      const drop = (quarters[0].spdKmh - quarters[3].spdKmh) / quarters[0].spdKmh * 100;
      pacing = drop < 2 ? 92 : drop < 5 ? 78 : drop < 10 ? 58 : 38;
    }
    let eff = 70;
    if (decoup) { const a = Math.abs(decoup.pct); eff = a <= 3 ? 95 : a <= 5 ? 85 : a <= 8 ? 68 : a <= 10 ? 50 : 35; }
    let control = 80;
    const aboveFrac = g.movingSec ? g.aboveThrSec / g.movingSec : 0;
    control = aboveFrac < 0.05 ? 92 : aboveFrac < 0.12 ? 78 : aboveFrac < 0.20 ? 60 : aboveFrac < 0.30 ? 45 : 32;
    let climbs = 75;
    if (terrain && terrain.climb && terrain.flat && g.hasPower && terrain.flat.avgPower) {
      const ratio = terrain.climb.avgPower / terrain.flat.avgPower;
      climbs = ratio < 1.15 ? 90 : ratio < 1.30 ? 72 : ratio < 1.50 ? 52 : 38;
    } else if (terrain && terrain.climb && terrain.flat && terrain.flat.avgHR) {
      const dHR = terrain.climb.avgHR - terrain.flat.avgHR;
      climbs = dHR < 6 ? 88 : dHR < 12 ? 70 : dHR < 20 ? 52 : 40;
    }
    let finish = 70;
    if (quarters[0] && quarters[3]) {
      if (g.hasPower && quarters[0].avgPower) {
        const ret = quarters[3].avgPower / quarters[0].avgPower;
        finish = ret >= 0.98 ? 92 : ret >= 0.93 ? 78 : ret >= 0.85 ? 58 : 40;
      } else if (quarters[0].spdKmh) {
        const ret = quarters[3].spdKmh / quarters[0].spdKmh;
        finish = ret >= 0.98 ? 90 : ret >= 0.93 ? 76 : ret >= 0.85 ? 56 : 38;
      }
    }
    const strategy = Math.round((pacing + eff + control + climbs + finish) / 5);
    return { pacing: Math.round(pacing), efficiency: Math.round(eff), control: Math.round(control),
      climbs: Math.round(climbs), finish: Math.round(finish), strategy };
  }

  function computeAlerts(g, quarters, decoup, terrain, o) {
    const A = [];
    if (g.hasPower) {
      if (g.VI > 1.06) A.push({ lvl: g.VI > 1.15 ? 'crit' : 'warn', txt: `VI ${g.VI} acima de 1,06 — esforço picado, gasto desnecessário.` });
      if (g.IF > 0.85 && g.movingSec > 9000) A.push({ lvl: 'warn', txt: `IF ${g.IF} numa prova longa (>2h30) é agressivo para 70.3 (alvo 0,75–0,83).` });
      const aboveFrac = g.movingSec ? g.aboveThrSec / g.movingSec : 0;
      if (aboveFrac > 0.15) A.push({ lvl: aboveFrac > 0.25 ? 'crit' : 'warn', txt: `${round(aboveFrac * 100, 0)}% do tempo acima do limiar (>105% FTP) — acúmulo de lactato que compromete durabilidade.` });
      if (g.ftpDivergence > 0.08) A.push({ lvl: 'warn', txt: `FTP do perfil (${g.ftp} W) parece ${round(g.ftpDivergence * 100, 0)}% acima do estimado pela curva (${g.ftpEst} W) — IF/TSS podem estar subestimados.` });
      if (g.ftpDivergence < -0.08) A.push({ lvl: 'info', txt: `Curva sugere FTP ~${g.ftpEst} W, acima do perfil (${g.ftp} W) — você pode ter evoluído; considere reteste.` });
    }
    if (decoup && Math.abs(decoup.pct) > 8) A.push({ lvl: decoup.pct > 10 ? 'crit' : 'warn', txt: `Desacoplamento ${round(decoup.pct, 1)}% — fadiga, calor, nutrição ou pacing agressivo.` });
    if (quarters[0] && quarters[3] && g.hasPower && quarters[0].avgPower) {
      const drop = (quarters[0].avgPower - quarters[3].avgPower) / quarters[0].avgPower * 100;
      if (drop > 8) A.push({ lvl: 'warn', txt: `Potência caiu ${round(drop, 0)}% do 1º ao 4º quarto — fadiga progressiva / saída forte demais.` });
    }
    if (terrain && terrain.climb && terrain.flat && g.hasPower && terrain.flat.avgPower) {
      const r = terrain.climb.avgPower / terrain.flat.avgPower;
      if (r > 1.30) A.push({ lvl: 'warn', txt: `Subidas a ${round((r - 1) * 100, 0)}% acima da potência do plano — você atacou as subidas (custo alto).` });
    }
    if (g.tempMax != null && g.tempMax >= 30) A.push({ lvl: 'warn', txt: `Temperatura chegou a ${g.tempMax}°C — impacto térmico provável na FC e no fueling.` });
    return A;
  }

  function computeExageros(g, quarters, terrain, splits, o) {
    const E = [];
    if (terrain && terrain.climb && g.hasPower && terrain.flat && terrain.flat.avgPower) {
      const r = terrain.climb.avgPower / terrain.flat.avgPower;
      if (r > 1.20) E.push({ trecho: 'Subidas', metrica: `Potência ${round((r - 1) * 100, 0)}% acima do plano`, evidencia: `${terrain.climb.avgPower} W subindo vs ${terrain.flat.avgPower} W no plano`, consequencia: 'FC elevada e lactato acumulado → menos durabilidade no final / corrida' });
    }
    if (g.hasPower) {
      const aboveFrac = g.movingSec ? g.aboveThrSec / g.movingSec : 0;
      if (aboveFrac > 0.12) E.push({ trecho: 'Geral', metrica: `${round(aboveFrac * 100, 0)}% acima do limiar`, evidencia: `${fmtMin(g.aboveThrSec)} > 105% FTP`, consequencia: 'Gray zone: custo metabólico alto sem o benefício do trabalho controlado de limiar' });
    }
    if (quarters[0] && g.hasPower && quarters[0].avgPower && g.NP && quarters[0].avgPower > g.NP * 1.05) {
      E.push({ trecho: '1º quarto', metrica: 'Saída acima da NP da prova', evidencia: `${quarters[0].avgPower} W no início vs NP ${g.NP} W`, consequencia: 'Saída agressiva — primeiro terço caro tende a cobrar no final' });
    }
    return E;
  }
  function computeFortes(g, quarters, decoup, terrain) {
    const F = [];
    if (g.hasPower && g.VI != null && g.VI <= 1.06) F.push({ trecho: 'Pacing geral', evidencia: `VI ${g.VI}`, porque: 'Potência estável, pouco desperdício em acelerações' });
    if (decoup && Math.abs(decoup.pct) <= 5) F.push({ trecho: 'Resistência aeróbica', evidencia: `Pa:Hr ${round(decoup.pct, 1)}%`, porque: 'Eficiência preservada do início ao fim — fueling/pacing adequados' });
    if (quarters[0] && quarters[3] && g.hasPower && quarters[0].avgPower && quarters[3].avgPower / quarters[0].avgPower >= 0.97)
      F.push({ trecho: 'Final', evidencia: `${quarters[3].avgPower} W no 4º quarto vs ${quarters[0].avgPower} W no 1º`, porque: 'Terminou forte — reservas bem geridas' });
    if (terrain && terrain.climb && terrain.flat && g.hasPower && terrain.flat.avgPower && terrain.climb.avgPower / terrain.flat.avgPower < 1.15)
      F.push({ trecho: 'Subidas', evidencia: `${terrain.climb.avgPower} W subindo (próximo do plano)`, porque: 'Subiu controlado, sem queimar fósforos' });
    return F;
  }
  function computeDiagnosis(g, scores, decoup) {
    if (scores.strategy >= 85) return { tag: 'Excelente execução', cls: 'good', txt: 'Prova bem distribuída, eficiente e sustentável.' };
    if (g.hasPower && g.VI > 1.20) return { tag: 'Execução agressiva / picada', cls: 'bad', txt: 'Muita variação de potência (ataques) — custo metabólico desnecessário.' };
    if (decoup && decoup.pct > 10) return { tag: 'Limitada por fadiga / calor', cls: 'bad', txt: 'Desacoplamento alto: a segunda metade degradou bem mais que a primeira.' };
    if (scores.finish < 55) return { tag: 'Saída forte demais', cls: 'warn', txt: 'O final caiu — o começo foi caro demais.' };
    if (scores.strategy >= 70) return { tag: 'Boa execução com ajustes', cls: 'warn', txt: 'Sólida, mas há pontos de eficiência a recuperar.' };
    return { tag: 'Execução conservadora', cls: 'info', txt: 'Sobrou margem — dá pra ser mais agressivo com segurança.' };
  }
  function computeRecommendations(g, scores, o) {
    const nextRace = [], nextCycle = [];
    if (g.hasPower) {
      const idealIF = g.movingSec > 9000 ? 0.78 : 0.83;
      nextRace.push(`Potência-alvo: NP ~${Math.round(g.ftp * idealIF)} W (IF ${idealIF}) — teto, não média.`);
      nextRace.push(`VI alvo ≤ 1,05: suba as ladeiras mais controlado, sem ataques acima de ${Math.round(g.ftp * 1.05)} W.`);
    }
    if (g.lthr) nextRace.push(`FC teto na primeira metade: ~${Math.round(g.lthr * 0.95)} bpm (abaixo do limiar ${g.lthr}).`);
    nextRace.push('Estratégia de subida: segurar potência/FC, deixar a velocidade cair — recuperar na descida.');
    nextRace.push('Nutrição: ≥ 80 g CHO/h se a prova passa de 2h30; reforçar sódio se calor > 28°C.');
    if (scores.control < 60) nextCycle.push('Treino de LIMIAR controlado (estilo norueguês): blocos longos em Z3–Z4 sem estourar — acumular tempo no limiar, não acima.');
    if (scores.efficiency < 65) nextCycle.push('Volume aeróbico Z2 (durabilidade) + longões com fueling de prova para reduzir o decoupling.');
    if (scores.climbs < 60) nextCycle.push('Força específica em subida com potência-teto (não atacar): repetir o gesto de subir controlado.');
    if (g.hasPower && g.ftpDivergence > 0.08) nextCycle.push(`Refazer teste de FTP — o valor do perfil (${g.ftp} W) parece alto vs a curva (${g.ftpEst} W).`);
    if (!nextCycle.length) nextCycle.push('Manter a base: 80% fácil + sessões de limiar frequentes e controladas.');
    return { nextRace, nextCycle };
  }
  function computeSemaphore(g, scores, decoup, terrain) {
    const lvl = v => v >= 75 ? 'green' : v >= 55 ? 'yellow' : 'red';
    return [
      { area: 'Pacing', status: lvl(scores.pacing), c: g.hasPower && g.VI != null ? `VI ${g.VI}` : 'evenness dos splits' },
      { area: 'Eficiência', status: lvl(scores.efficiency), c: decoup ? `Pa:Hr ${round(decoup.pct, 1)}%` : 'sem FC contínua' },
      { area: 'Desacoplamento', status: decoup ? (Math.abs(decoup.pct) <= 5 ? 'green' : Math.abs(decoup.pct) <= 8 ? 'yellow' : 'red') : 'yellow', c: decoup ? `${round(decoup.pct, 1)}%` : '—' },
      { area: 'Subidas', status: lvl(scores.climbs), c: terrain && terrain.climb ? `${terrain.climb.pctTime}% do tempo subindo` : 'sem altimetria' },
      { area: 'Resistência final', status: lvl(scores.finish), c: 'último quarto vs primeiro' },
      { area: 'Nutrição provável', status: g.movingSec > 9000 ? (decoup && decoup.pct > 8 ? 'red' : decoup && decoup.pct > 5 ? 'yellow' : 'green') : 'green', c: g.movingSec > 9000 ? 'prova longa: fueling decisivo' : 'duração curta' },
      { area: 'Recuperação esperada', status: g.TSS > 250 ? 'red' : g.TSS > 150 ? 'yellow' : 'green', c: `${g.TSS} TSS` },
    ];
  }

  root.LMA = root.LMA || {};
  root.LMA.debrief = Object.assign(root.LMA.debrief || {}, {
    analyze, _util: { fmtMin, normalizedPower, buildSeries, powerCurve },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.debrief;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
