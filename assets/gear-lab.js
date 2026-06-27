/* ============================================================
 * LMAeroFit · assets/gear-lab.js  (Gear Lab 2.0 — motor de recomendação)
 * Ranqueia tênis (assets/shoes.json) por prova + perfil + preferências.
 *
 * Sem dado fantasma: drop/stack/peso/placa são specs do fabricante (com source).
 * A "economia" NÃO é número de laboratório por modelo — é uma ESTIMATIVA
 * modelada de placa + espuma; a magnitude da placa de carbono é ancorada em
 * Hoogkamer et al. (2018) (~4% de economia metabólica vs trainer convencional).
 *
 * API (puro, testável em node):
 *   LMA.gear.economyEst(shoe) -> 0..1 (estimativa)
 *   LMA.gear.bucketForKm(km)  -> 'short'|'mid'|'long'|'ultra'
 *   LMA.gear.filter(shoes, f) -> shoes filtrados
 *   LMA.gear.rank(shoes, ctx) -> [{...shoe, score(0-100), why, economyEst, conf}]
 * ============================================================*/
(function (root) {
  'use strict';
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  // economia estimada (0..1) a partir de placa + espuma
  function economyEst(s) {
    var e = 0;
    if (s.plate === 'carbono') e += 0.6;            // Hoogkamer 2018: placa+foam ~ -4%
    if (s.foam === 'supercrítica') e += 0.3;
    else if (s.foam === 'tpu' || s.foam === 'outra') e += 0.1;
    return clamp(e, 0, 1);
  }

  // distância (km) -> balde de viés
  function bucketForKm(km) {
    if (km == null) return 'mid';
    if (km <= 10) return 'short';
    if (km <= 21.1) return 'mid';
    if (km <= 42.2) return 'long';
    return 'ultra';
  }
  // viés por balde: economia, leveza, amortecimento(stack), durabilidade
  var BIAS = {
    short: { eco: 0.8, light: 1.3, cush: 0.5, dura: 0.4 },
    mid:   { eco: 1.1, light: 1.0, cush: 0.9, dura: 0.7 },
    long:  { eco: 1.3, light: 0.8, cush: 1.2, dura: 1.0 },
    ultra: { eco: 1.0, light: 0.6, cush: 1.4, dura: 1.4 },
    trail: { eco: 0.5, light: 0.7, cush: 1.1, dura: 1.3 }
  };

  function filter(shoes, f) {
    f = f || {};
    return shoes.filter(function (s) {
      if (f.q) { var q = f.q.toLowerCase(); if ((s.brand + ' ' + s.model).toLowerCase().indexOf(q) < 0) return false; }
      if (f.category && s.category !== f.category) return false;
      if (f.plate && s.plate !== f.plate) return false;
      if (f.surface) { if (f.surface === 'trail' ? (s.surface !== 'trail') : (s.surface === 'trail')) return false; }
      if (f.dropMax != null && s.drop_mm != null && s.drop_mm > f.dropMax) return false;
      if (f.dropMin != null && s.drop_mm != null && s.drop_mm < f.dropMin) return false;
      if (f.stackMin != null && s.stack_mm != null && s.stack_mm < f.stackMin) return false;
      if (f.stackMax != null && s.stack_mm != null && s.stack_mm > f.stackMax) return false;
      if (f.weightMax != null && s.weight_g != null && s.weight_g > f.weightMax) return false;
      if (f.weightMin != null && s.weight_g != null && s.weight_g < f.weightMin) return false;
      if (f.priceMax != null && s.price_brl != null && s.price_brl > f.priceMax) return false;
      return true;
    });
  }

  // ctx: { km, trail, athleteWeightKg, prefs:{er,light,stack,drop} }
  function rank(shoes, ctx) {
    ctx = ctx || {}; var prefs = ctx.prefs || { er: 7, light: 6, stack: 5, drop: 4 };
    var set = ctx.trail ? shoes.filter(function (s) { return s.surface === 'trail'; })
      : shoes.filter(function (s) { return s.surface !== 'trail'; });
    if (!set.length) return [];
    var bucket = ctx.trail ? 'trail' : bucketForKm(ctx.km);
    var b = BIAS[bucket];
    // ajuste pelo peso do atleta: mais pesado -> mais amortecimento/durabilidade
    var wKg = ctx.athleteWeightKg || 70;
    var wf = clamp((wKg - 70) / 40, -0.3, 0.6);
    var cushBias = b.cush * (1 + wf * 0.6), duraBias = b.dura * (1 + wf * 0.6), lightBias = b.light * (1 - wf * 0.3);

    var weights = [], values = set.map(function (s) { return null; });
    // normalização min-max no conjunto
    var ws = set.map(function (s) { return s.weight_g; }).filter(function (x) { return x != null; });
    var ss = set.map(function (s) { return s.stack_mm; }).filter(function (x) { return x != null; });
    var ds = set.map(function (s) { return s.drop_mm; }).filter(function (x) { return x != null; });
    var wMin = Math.min.apply(0, ws), wMax = Math.max.apply(0, ws);
    var sMin = Math.min.apply(0, ss), sMax = Math.max.apply(0, ss);
    var dMin = Math.min.apply(0, ds), dMax = Math.max.apply(0, ds);
    var nz = function (v, mn, mx) { return (mx > mn && v != null) ? (v - mn) / (mx - mn) : 0.5; };

    // pesos finais por atributo (pref x viés)
    var wEco = prefs.er * b.eco, wLight = prefs.light * lightBias, wCush = prefs.stack * cushBias, wDrop = prefs.drop * 1.0;
    var wDura = 2 * duraBias; // durabilidade entra com peso fixo modulado
    var wTot = wEco + wLight + wCush + wDrop + wDura || 1;

    var ranked = set.map(function (s) {
      var eco = economyEst(s);
      var light = 1 - nz(s.weight_g, wMin, wMax);
      var cush = nz(s.stack_mm, sMin, sMax);
      var drop = nz(s.drop_mm, dMin, dMax);
      var dura = clamp((s.weight_g != null ? (s.weight_g - wMin) / ((wMax - wMin) || 1) : 0.5) * 0.6 + (s.category === 'treino' || s.category === 'trail' ? 0.4 : 0), 0, 1);
      var raw = wEco * eco + wLight * light + wCush * cush + wDrop * drop + wDura * dura;
      var score = clamp(Math.round(100 * raw / wTot), 0, 100);
      return Object.assign({}, s, { score: score, economyEst: Math.round(eco * 100), conf: 'estimado', _eco: eco, _light: light, _cush: cush });
    }).sort(function (a, b) { return b.score - a.score || (a.weight_g || 999) - (b.weight_g || 999); });

    // porquê (1 frase) relativo à prova/perfil
    ranked.forEach(function (s) { s.why = whyFor(s, bucket, wKg); });
    return ranked;
  }

  function whyFor(s, bucket, wKg) {
    var bits = [];
    var long = (bucket === 'long' || bucket === 'ultra');
    if (s.plate === 'carbono') bits.push('placa de carbono' + (s.foam === 'supercrítica' ? ' + espuma supercrítica' : '') + (long ? ' = economia na distância' : ' = ritmo rápido'));
    if (s._light > 0.7 && (bucket === 'short' || bucket === 'mid')) bits.push('leve para o ritmo');
    if (s._cush > 0.7 && (long || wKg >= 80)) bits.push('amortecimento alto' + (wKg >= 80 ? ' para o seu peso' : ' para a distância'));
    if (s.surface === 'trail') bits.unshift('feito para trilha');
    if (!bits.length) bits.push(s.category === 'treino' ? 'pisada confortável para rodar volume' : 'equilíbrio de peso e amortecimento');
    return bits.slice(0, 2).join(' · ');
  }

  root.LMA = root.LMA || {}; root.LMA.gear = { economyEst: economyEst, bucketForKm: bucketForKm, filter: filter, rank: rank, BIAS: BIAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.gear;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
