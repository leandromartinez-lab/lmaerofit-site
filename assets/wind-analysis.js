/* ============================================================
 * LMAeroFit · assets/wind-analysis.js  (análise de vento ao longo do percurso)
 * Inspirado na ideia do myWindsock, implementado do zero sobre o nosso motor:
 * para cada segmento do plano, decompõe o vento previsto em
 *   - headwind/tailwind (componente axial, no rumo do trecho)
 *   - crosswind (componente lateral)
 *   - yaw (ângulo do vento aparente, p/ escolha de roda)
 * e resume: % do tempo com vento contra/favor/lateral, piores trechos de
 * headwind, yaw médio, histograma de yaw e crosswind máximo (segurança).
 *
 * Vento por segmento (time-aware) se opts.windBySeg existir; senão o global.
 * Tudo geometria/trigonometria pura — sem dado externo, sem API.
 *
 * API: LMA.windAnalysis.field(planSegs, opts) · .summary(field) · .yawHistogram(field)
 * ============================================================*/
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;

  function segWind(opts, i) {
    if (opts.windBySeg && opts.windBySeg[i]) {
      var w = opts.windBySeg[i];
      return { ms: w.ms || 0, from: w.fromDeg == null ? 0 : w.fromDeg };
    }
    return { ms: (opts.wind || 0) / 3.6, from: opts.windFromDeg == null ? 0 : opts.windFromDeg };
  }

  // decomposição por segmento. planSegs vêm do LMA.racePlan.plan(...).segments
  function field(planSegs, opts) {
    opts = opts || {};
    var out = [], cumD = 0;
    for (var i = 0; i < planSegs.length; i++) {
      var s = planSegs[i], w = segWind(opts, i);
      var d = (w.from - s.bearing) * RAD;
      var hw = w.ms * Math.cos(d);          // + = headwind, − = tailwind (m/s)
      var xw = w.ms * Math.sin(d);          // crosswind assinado (m/s)
      var axial = (s.speed || 0) + hw;      // velocidade do ar aparente no eixo
      var yaw = Math.atan2(xw, axial < 0.1 ? 0.1 : axial) / RAD; // graus (assinado)
      var kind = hw >= 0.75 ? 'head' : hw <= -0.75 ? 'tail' : 'cross';
      cumD += s.dist;
      out.push({
        i: i, bearing: s.bearing, windMs: w.ms, windFromDeg: w.from,
        hwMs: hw, xwMs: xw, yawDeg: yaw, kind: kind,
        dt: s.dt, dist: s.dist, cumKm: cumD / 1000, speed: s.speed
      });
    }
    return out;
  }

  function summary(field) {
    var tH = 0, tT = 0, tC = 0, tw = 0, yawW = 0, maxXw = 0;
    field.forEach(function (f) {
      tw += f.dt;
      if (f.kind === 'head') tH += f.dt; else if (f.kind === 'tail') tT += f.dt; else tC += f.dt;
      yawW += Math.abs(f.yawDeg) * f.dt;
      if (Math.abs(f.xwMs) > maxXw) maxXw = Math.abs(f.xwMs);
    });
    // piores trechos de vento contra (segmentos contíguos com headwind)
    var stretches = [], cur = null;
    field.forEach(function (f) {
      if (f.kind === 'head') { if (!cur) cur = { startKm: f.cumKm - f.dist / 1000, dist: 0, time: 0, hwSum: 0 }; cur.dist += f.dist; cur.time += f.dt; cur.hwSum += f.hwMs * f.dt; }
      else if (cur) { stretches.push(cur); cur = null; }
    });
    if (cur) stretches.push(cur);
    var worst = stretches.map(function (c) {
      return { startKm: c.startKm, distKm: c.dist / 1000, timeSec: c.time, avgHwKmh: (c.time ? c.hwSum / c.time : 0) * 3.6 };
    }).sort(function (a, b) { return b.timeSec - a.timeSec; }).slice(0, 3);
    return {
      timeHead: tH, timeTail: tT, timeCross: tC, total: tw,
      pctHead: tw ? tH / tw : 0, pctTail: tw ? tT / tw : 0, pctCross: tw ? tC / tw : 0,
      meanYaw: tw ? yawW / tw : 0, maxXwKmh: maxXw * 3.6, worst: worst
    };
  }

  // histograma de yaw (|yaw|) ponderado pelo tempo — p/ escolha de roda
  function yawHistogram(field) {
    var edges = [0, 5, 10, 15, 20, 1e9];
    var bins = edges.slice(0, -1).map(function (lo, k) { return { lo: lo, hi: edges[k + 1], t: 0 }; });
    var tw = 0;
    field.forEach(function (f) {
      var y = Math.abs(f.yawDeg); tw += f.dt;
      for (var k = 0; k < bins.length; k++) { if (y >= bins[k].lo && y < bins[k].hi) { bins[k].t += f.dt; break; } }
    });
    return bins.map(function (b) { return { lo: b.lo, hi: b.hi, pct: tw ? b.t / tw : 0 }; });
  }

  root.LMA = root.LMA || {};
  root.LMA.windAnalysis = { field: field, summary: summary, yawHistogram: yawHistogram };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.windAnalysis;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
