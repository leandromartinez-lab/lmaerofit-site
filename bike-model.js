/* ============================================================
 * LMAeroFit · assets/bike-model.js
 * Motor de simulação de tempo de ciclismo sobre um percurso, para a
 * comparação "Road vs TT" dentro do Race Briefing.
 *
 * Física: Martin et al. (1998), por segmento do percurso.
 *   P = ½·ρ·CdA·v_air²·v + Crr·m·g·cosθ·v + m·g·senθ·v   (÷ η)
 *   v_air = √((v + Hw)² + Cw²) · Hw=headwind · Cw=crosswind
 *   ρ(altitude,temp) pela fórmula barométrica internacional.
 *
 * Expõe window.LMAModel.compare(records, athlete, weather, setups).
 * ============================================================*/
(function (root) {
  'use strict';
  const G = 9.80665, R_AIR = 287.058, P0 = 101325, T0 = 288.15, L = 0.0065;
  const toRad = Math.PI / 180;

  function airDensity(altitude_m, temp_C) {
    const p = P0 * Math.pow(1 - (L * altitude_m) / T0, 5.255);
    return p / (R_AIR * (temp_C + 273.15));
  }
  function haversine(a, b) {
    const Rt = 6371000, dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
    const la1 = a.lat * toRad, la2 = b.lat * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * Rt * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const la1 = a.lat * toRad, la2 = b.lat * toRad, dLng = (b.lng - a.lng) * toRad;
    const y = Math.sin(dLng) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
    return (Math.atan2(y, x) / toRad + 360) % 360;
  }
  function smooth(arr, win) {
    const out = new Array(arr.length), half = (win / 2) | 0;
    for (let i = 0; i < arr.length; i++) {
      let s = 0, n = 0;
      for (let j = i - half; j <= i + half; j++) if (arr[j] != null) { s += arr[j]; n++; }
      out[i] = n ? s / n : arr[i];
    }
    return out;
  }

  function buildSegments(records, opts) {
    opts = opts || {};
    const pts = records.filter(r => r.lat != null && r.lng != null);
    if (pts.length < 2) throw new Error('Percurso sem coordenadas suficientes (precisa de GPX/FIT/TCX com GPS).');
    let alts = pts.map(p => p.altitude);
    const hasAlt = alts.some(a => a != null);
    if (hasAlt) alts = smooth(alts, 9); else alts = null;

    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      const d = haversine(pts[i - 1], pts[i]);
      if (d < 0.5) continue;
      let grade = 0;
      if (alts) { const dz = alts[i] - alts[i - 1]; grade = Math.max(-0.25, Math.min(0.25, dz / d)); }
      segs.push({ dist: d, grade, bearing: bearing(pts[i - 1], pts[i]),
        // altitude ABSOLUTA do GPX; sem GPX, cai no baseAltitude do atleta
        alt: alts ? alts[i] : (opts.baseAltitude || 0) });
    }
    return segs;
  }

  function powerAt(v, c) {
    const Hw = c.wind * Math.cos((c.windFrom - c.bearing) * toRad);
    const Cw = c.wind * Math.sin((c.windFrom - c.bearing) * toRad);
    const vAir = Math.sqrt((v + Hw) * (v + Hw) + Cw * Cw);
    const aero = 0.5 * c.rho * c.cda * vAir * vAir * v;
    const roll = c.crr * c.mass * G * Math.cos(Math.atan(c.grade)) * v;
    const grav = c.mass * G * Math.sin(Math.atan(c.grade)) * v;
    return (aero + roll + grav) / c.eta;
  }
  function solveV(Ptarget, c, vmax) {
    let lo = 0.1, hi = vmax || 25;
    if (powerAt(hi, c) - Ptarget < 0) return hi;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (powerAt(mid, c) - Ptarget > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  function courseProfile(segs) {
    let total = 0, climb = 0, desc = 0, flat = 0, ascentM = 0;
    for (const s of segs) {
      total += s.dist;
      if (s.grade > 0.03) climb += s.dist; else if (s.grade < -0.03) desc += s.dist; else flat += s.dist;
      if (s.grade > 0) ascentM += s.grade * s.dist;
    }
    let turns = 0;
    for (let i = 1; i < segs.length; i++) {
      let d = Math.abs(segs[i].bearing - segs[i - 1].bearing); if (d > 180) d = 360 - d;
      if (d > 30) turns++;
    }
    return { totalM: total, climbM: climb, descM: desc, flatM: flat, ascentM,
      climbPct: total ? climb / total : 0, turnsPerKm: total ? turns / (total / 1000) : 0 };
  }

  function simulate(segs, p) {
    const mass = p.massRider + p.massBike;
    const Ptarget = p.FTP * p.intensity;
    const windMs = (p.wind || 0) / 3.6;
    let time = 0, climbTime = 0, flatTime = 0, descTime = 0, sumCw = 0, sumV = 0, n = 0;
    for (const s of segs) {
      const c = { rho: airDensity(s.alt != null ? s.alt : (p.baseAltitude || 0), p.temp == null ? 25 : p.temp),
        cda: p.cda, crr: p.crr, mass, eta: p.eta, grade: s.grade,
        wind: windMs, windFrom: p.windFromDeg == null ? 0 : p.windFromDeg, bearing: s.bearing };
      const v = solveV(Ptarget, c);
      const dt = s.dist / v;
      time += dt;
      if (s.grade > 0.03) climbTime += dt; else if (s.grade < -0.03) descTime += dt; else flatTime += dt;
      sumCw += Math.abs(windMs * Math.sin((c.windFrom - s.bearing) * toRad)) * dt;
      sumV += v * dt; n += dt;
    }
    return { timeSec: time, climbTime, flatTime, descTime, avgSpeed: n ? sumV / n : 0, avgCrosswind: n ? sumCw / n : 0 };
  }

  function compare(records, athlete, weather, setups) {
    const segs = buildSegments(records, { baseAltitude: weather.baseAltitude });
    const prof = courseProfile(segs);
    const base = { massRider: athlete.massRider, FTP: athlete.FTP, intensity: athlete.intensity,
      eta: athlete.eta == null ? 0.977 : athlete.eta, temp: weather.temp, baseAltitude: weather.baseAltitude || 0,
      wind: weather.wind, windFromDeg: weather.windFromDeg };
    const road = simulate(segs, Object.assign({}, base, { massBike: setups.road.massBike, cda: setups.road.cda, crr: setups.road.crr }));
    const tt = simulate(segs, Object.assign({}, base, { massBike: setups.tt.massBike, cda: setups.tt.cda, crr: setups.tt.crr }));
    const deltaSec = road.timeSec - tt.timeSec;
    return { segments: segs.length, profile: prof, road, tt, deltaSec, recommendation: recommend(deltaSec, prof, tt.avgCrosswind, setups) };
  }

  function recommend(deltaSec, prof, avgCrosswind, setups) {
    const min = deltaSec / 60;
    const climby = prof.climbPct > 0.35;
    const techy = prof.turnsPerKm > 6;
    const windy = avgCrosswind > 6 && setups.tt.deepWheels !== false;
    let verdict, level;
    if (min > 1.5 && !climby) { verdict = 'tt'; level = 'forte'; }
    else if (min > 0.5) { verdict = 'tt'; level = (climby || techy || windy) ? 'leve' : 'clara'; }
    else if (min > -0.5) { verdict = 'empate'; level = ''; }
    else { verdict = 'road'; level = 'clara'; }
    const caveats = [];
    if (climby) caveats.push('percurso montanhoso: o peso e a entrega em subida pesam mais que a aerodinâmica');
    if (techy) caveats.push('percurso técnico/sinuoso: a road é mais ágil e segura nas curvas');
    if (windy) caveats.push('crosswind relevante: rodas profundas de TT aumentam o risco de manejo');
    return { verdict, level, deltaMin: min, caveats };
  }

  root.LMAModel = Object.assign(root.LMAModel || {}, { airDensity, buildSegments, simulate, compare, courseProfile, powerAt, solveV });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMAModel;
})(typeof self !== 'undefined' ? self : this);
