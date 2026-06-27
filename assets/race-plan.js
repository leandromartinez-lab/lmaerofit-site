/* ============================================================
 * LMAeroFit · assets/race-plan.js  (Race Plan — pacing variável + métricas)
 * Distribui a potência de forma VARIÁVEL por segmento (mais em subida/
 * headwind, menos em descida/tailwind) e prevê splits/tempo, em dois modos:
 *   - IF/potência-alvo -> tempo
 *   - tempo-meta        -> potência (NP) que atinge o tempo
 * Reaproveita o motor de física LMAModel (assets/bike-model.js, Martin 1998).
 *
 * Heurística documentada (NÃO promete ótimo matemático): potência relativa
 * por segmento = clamp(1 + k·grade + kw·headwind, lo, hi), escalada para
 * bater a NP-alvo. NP ≈ média 4ª-potência ponderada no tempo (aprox. da
 * definição de Coggan; NP/IF/TSS são marcas da TrainingPeaks).
 *
 * API: LMA.racePlan.plan(segs, opts) · LMA.racePlan.metrics(out, p)
 * ============================================================*/
(function (root) {
  'use strict';
  function M() { return root.LMAModel; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  var RAD = Math.PI / 180;

  function segCtx(s, p) {
    return {
      rho: M().airDensity(s.alt != null ? s.alt : (p.baseAltitude || 0), p.temp == null ? 25 : p.temp),
      cda: p.cda, crr: p.crr, mass: p.mass, eta: p.eta, grade: s.grade,
      wind: (p.wind || 0) / 3.6, windFrom: p.windFromDeg == null ? 0 : p.windFromDeg, bearing: s.bearing
    };
  }
  // forma relativa da potência por segmento (demanda)
  function shapes(segs, p, lo, hi) {
    var windMs = (p.wind || 0) / 3.6, wFrom = p.windFromDeg == null ? 0 : p.windFromDeg;
    return segs.map(function (s) {
      var Hw = windMs * Math.cos((wFrom - s.bearing) * RAD);  // headwind > 0
      return clamp(1 + 6.0 * s.grade + 0.03 * Hw, lo, hi);
    });
  }
  function runAtScale(segs, p, shp, scale) {
    var out = [], t = 0;
    for (var i = 0; i < segs.length; i++) {
      var pw = scale * shp[i];
      var v = M().solveV(pw, segCtx(segs[i], p));
      var dt = segs[i].dist / v; t += dt;
      out.push({ dist: segs[i].dist, grade: segs[i].grade, bearing: segs[i].bearing, power: pw, speed: v, dt: dt, tCum: t });
    }
    return out;
  }
  function metrics(out, p) {
    var sumT = 0, sumPdt = 0, sum4 = 0, dist = 0;
    out.forEach(function (o) { sumT += o.dt; sumPdt += o.power * o.dt; sum4 += Math.pow(o.power, 4) * o.dt; dist += o.dist; });
    var avg = sumT ? sumPdt / sumT : 0, np = sumT ? Math.pow(sum4 / sumT, 0.25) : 0;
    var iff = p.ftp ? np / p.ftp : 0;
    return {
      timeSec: sumT, avgPower: avg, np: np, if: iff, vi: avg ? np / avg : 0,
      tss: (sumT / 3600) * iff * iff * 100, kj: sumPdt / 1000,
      wkg: p.massRider ? avg / p.massRider : 0, avgSpeed: sumT ? dist / sumT : 0, distM: dist
    };
  }
  // escala as formas para que a NP resultante = targetNP (bisseção)
  function planForNP(segs, p, targetNP, lo, hi) {
    var shp = shapes(segs, p, lo, hi), sLo = 10, sHi = 2000;
    for (var k = 0; k < 60; k++) {
      var mid = (sLo + sHi) / 2;
      if (metrics(runAtScale(segs, p, shp, mid), p).np > targetNP) sHi = mid; else sLo = mid;
    }
    return runAtScale(segs, p, shp, (sLo + sHi) / 2);
  }

  function plan(segs, opts) {
    var p = {
      mass: opts.massRider + opts.massBike, massRider: opts.massRider, cda: opts.cda, crr: opts.crr,
      eta: opts.eta == null ? 0.977 : opts.eta, temp: opts.temp, baseAltitude: opts.baseAltitude || 0,
      wind: opts.wind, windFromDeg: opts.windFromDeg, ftp: opts.ftp
    };
    var lo = (opts.limits && opts.limits.lo) || 0.70, hi = (opts.limits && opts.limits.hi) || 1.20;
    var out, usedNP, note = null;
    if (opts.mode === 'time' && opts.targetTimeSec) {
      // acha a NP que faz o tempo total = targetTimeSec (NP maior -> mais rápido)
      var nLo = 50, nHi = opts.ftp * 1.3;
      var tFastest = metrics(planForNP(segs, p, nHi, lo, hi), p).timeSec;
      if (opts.targetTimeSec < tFastest) note = 'tempo-meta abaixo do alcançável para a sua FTP — mostrando o plano mais rápido possível';
      for (var k = 0; k < 50; k++) {
        var midNP = (nLo + nHi) / 2;
        if (metrics(planForNP(segs, p, midNP, lo, hi), p).timeSec > opts.targetTimeSec) nLo = midNP; else nHi = midNP;
      }
      usedNP = (nLo + nHi) / 2; out = planForNP(segs, p, usedNP, lo, hi);
    } else {
      usedNP = opts.ftp * (opts.targetIF || 0.75);
      out = planForNP(segs, p, usedNP, lo, hi);
    }
    return { segments: out, overview: metrics(out, p), targetNP: usedNP, note: note };
  }

  root.LMA = root.LMA || {}; root.LMA.racePlan = { plan: plan, metrics: metrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.racePlan;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
