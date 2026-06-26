/* ============================================================
 * LMAeroFit · assets/physio-core.js  (Physio Lab — motor de cálculo)
 * Traduz o laudo / teste de campo em zonas + combustível + 7 módulos.
 * Fórmulas auditadas em Physio-Lab-Anexo-Formulas.docx.
 * v3: + classe FRIEND · + DFA-α1 (pilar de campo) em POTÊNCIA e PACE ·
 *     + zonas de pace (teste de pista/corrida) · + decoupling.
 *
 * Princípios: sem dado fantasma · rótulo de confiança · não diagnostica/
 * prescreve/libera · só registra.
 * API:  LMA.physio.analyze(input) -> report
 * ============================================================*/
(function (root) {
  'use strict';

  const num = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? null : +v;
  const r1 = x => x == null ? null : Math.round(x * 10) / 10;
  const r0 = x => x == null ? null : Math.round(x);
  const M = 'medido', E = 'estimado', P = 'populacional';
  const paceStr = s => { if (!s || !isFinite(s)) return '—'; const m = (s / 60) | 0, ss = Math.round(s % 60); return m + ':' + String(ss).padStart(2, '0'); };
  const parsePace = x => { if (x == null || x === '') return null; const s = String(x).trim(); if (s.indexOf(':') >= 0) { const p = s.split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); } const n = +s.replace(',', '.'); return isNaN(n) ? null : (n < 20 ? n * 60 : n); };

  // ---------- FRIEND / ACSM · classe de VO₂máx ----------
  const VO2_NORMS = {
    M: { 40: [25, 28, 31, 34, 36, 39, 41, 44, 48], 50: [22, 25, 28, 30, 33, 35, 38, 41, 45], 60: [19, 22, 25, 27, 30, 32, 34, 37, 41] },
    F: { 40: [20, 23, 25, 28, 30, 32, 34, 37, 41], 50: [18, 21, 23, 25, 27, 29, 31, 34, 38], 60: [16, 18, 20, 22, 24, 26, 28, 31, 34] },
  };
  function friendClass(vo2, age, sex, mode) {
    if (vo2 == null || age == null) return null;
    const s = (sex === 'F' || sex === 'f') ? 'F' : 'M';
    const dec = age < 50 ? 40 : age < 60 ? 50 : 60;
    const row = VO2_NORMS[s] && VO2_NORMS[s][dec]; if (!row) return null;
    const adj = (mode && /bike|ciclo/i.test(mode)) ? 0.9 : 1;
    const cuts = row.map(v => v * adj);
    let pct = null;
    if (vo2 >= cuts[8]) pct = 90; else if (vo2 <= cuts[0]) pct = 10;
    else for (let i = 0; i < 8; i++) if (vo2 >= cuts[i] && vo2 < cuts[i + 1]) { pct = 10 + 10 * i + 10 * (vo2 - cuts[i]) / (cuts[i + 1] - cuts[i]); break; }
    if (pct == null) return null;
    pct = Math.round(pct);
    const cls = pct >= 90 ? 'Superior' : pct >= 70 ? 'Excelente' : pct >= 50 ? 'Bom' : pct >= 30 ? 'Regular' : 'Abaixo da média';
    return { pct, cls, mode: adj < 1 ? 'cicloergômetro (norma ajustada −10%)' : 'esteira/pista', conf: P };
  }

  // ---------- DFA-α1 · pilar de campo (potência OU pace OU velocidade) ----------
  function dfaThresholds(stages) {
    const S = (stages || []).map(s => ({
      power: num(s.load) ?? num(s.power),
      paceSec: (s.pace != null && s.pace !== '') ? parsePace(s.pace) : (num(s.speed) ? 3600 / num(s.speed) : null),
      hr: num(s.hr), a1: num(s.dfaA1),
    })).filter(s => s.a1 != null && (s.power != null || s.paceSec != null || s.hr != null));
    if (S.length < 3) return null;
    const interp = (a, b, f) => (a != null && b != null) ? a + f * (b - a) : null;
    const cross = level => {
      for (let i = 1; i < S.length; i++) {
        const a = S[i - 1], b = S[i];
        if (a.a1 >= level && b.a1 < level) {
          const f = (a.a1 - level) / (a.a1 - b.a1);
          const ps = interp(a.paceSec, b.paceSec, f);
          return { power: r0(interp(a.power, b.power, f)), paceSec: ps != null ? Math.round(ps) : null, hr: r0(interp(a.hr, b.hr, f)) };
        }
      }
      return null;
    };
    const lt1 = cross(0.75), lt2 = cross(0.50);
    if (!lt1 && !lt2) return null;
    return { lt1, lt2, conf: E, source: 'Rogers & Gronwald — DFA-α1 (0,75 aeróbio / 0,50 anaeróbio).' };
  }

  // ---------- guardas anti-fantasma ----------
  function phantomChecks(I) {
    const flags = [];
    const a = I.aerobic || {}, l1 = I.lt1 || {}, l2 = I.lt2 || {}, s = I.substrate || {};
    if (s && s.fatPct != null && s.choPct != null && +s.fatPct === 0 && +s.choPct === 100)
      flags.push({ lvl: 'flag', mod: 'fuel', txt: 'Substrato reporta FAT 0% / CHO 100% em todos os pontos — implausível (calibração de RER). Substrato medido descartado; usando diretriz.' });
    if (a.rerPeak != null && (+a.rerPeak < 0.65 || +a.rerPeak > 1.30))
      flags.push({ lvl: 'flag', mod: 'aerobic', txt: `RER de pico ${a.rerPeak} fora da faixa plausível [0,65–1,30] — conferir.` });
    if (l1.power != null && l2.power != null && +l1.power >= +l2.power)
      flags.push({ lvl: 'flag', mod: 'zones', txt: 'LV1 ≥ LV2 (limiares invertidos) — conferir.' });
    if (parsePace(l1.pace) != null && parsePace(l2.pace) != null && parsePace(l1.pace) <= parsePace(l2.pace))
      flags.push({ lvl: 'flag', mod: 'zones', txt: 'Pace do LV1 igual/mais rápido que o LV2 (limiares invertidos) — conferir.' });
    if (l1.vo2 != null && l2.vo2 != null && +l1.vo2 >= +l2.vo2)
      flags.push({ lvl: 'flag', mod: 'zones', txt: 'VO₂ do LV1 ≥ VO₂ do LV2 — conferir.' });
    if (a.hrMax != null && l2.hr != null && +l2.hr > +a.hrMax)
      flags.push({ lvl: 'flag', mod: 'zones', txt: 'FC do LV2 acima da FCmáx informada — conferir.' });
    if (a.vo2max_mlkg != null && (+a.vo2max_mlkg < 15 || +a.vo2max_mlkg > 90))
      flags.push({ lvl: 'warn', mod: 'aerobic', txt: `VO₂máx ${a.vo2max_mlkg} fora do usual — confere?` });
    const bf = (I.athlete || {}).bodyFatPct;
    if (bf != null && +bf < 8)
      flags.push({ lvl: 'safety', mod: 'composition', txt: 'Percentual de gordura baixo — sinal neutro: vale conversar com nutricionista/médico sobre energia disponível (RED-S). Sem alvo numérico, sem prescrever dieta.' });
    return flags;
  }

  // ---------- A · zonas (potência OU pace) ----------
  function computeZones(I, dfa) {
    const l1 = I.lt1 || {}, l2 = I.lt2 || {}, a = I.aerobic || {};
    let p1 = num(l1.power), p2 = num(l2.power), h1 = num(l1.hr), h2 = num(l2.hr);
    let pc1 = parsePace(l1.pace), pc2 = parsePace(l2.pace);
    let conf1 = M, src = 'limiares medidos';
    if ((p1 == null && pc1 == null && h1 == null) && dfa && dfa.lt1) { p1 = dfa.lt1.power; pc1 = dfa.lt1.paceSec; h1 = dfa.lt1.hr; src = 'limiares por DFA-α1 (campo)'; conf1 = E; }
    if ((p2 == null && pc2 == null && h2 == null) && dfa && dfa.lt2) { p2 = dfa.lt2.power; pc2 = dfa.lt2.paceSec; h2 = dfa.lt2.hr; }
    if (p1 == null && pc1 == null && h1 == null) return { available: false };
    const usePace = (p1 == null && p2 == null) && (pc1 != null || pc2 != null);
    const hrMax = num(a.hrMax), wmax = num(a.wmax), zc = conf1 === E ? E : M;
    const hmid = (h1 != null && h2 != null) ? Math.round(h1 + (h2 - h1) / 2) : null;
    const Z = [];
    if (usePace) {
      // pace em s/km: LT1 mais lento (s/km maior) que LT2
      const mid = (pc1 != null && pc2 != null) ? Math.round(pc1 + (pc2 - pc1) / 2) : null;
      const z4fast = pc2 != null ? Math.round(pc2 * 0.94) : null; // ~6% mais rápido (estimado)
      const z4est = pc2 != null && wmax == null;
      const mk = (z, name, purpose, lo, hi, hl, hh, rpe, cf) => ({ z, name, purpose, paceLo: lo, paceHi: hi, hrLo: hl, hrHi: hh, rpe, conf: cf, metric: 'pace' });
      Z.push(mk('Z1', 'Base aeróbica / regenerativo', 'Mais lento que o LV1. Base, gordura, volume.', null, pc1, null, h1, '2–3', zc));
      Z.push(mk('Z2', 'Tempo / sub-limiar', 'Entre LV1 e o meio do caminho ao LV2.', pc1, mid, h1, hmid, '4–5', zc));
      Z.push(mk('Z3', 'Limiar', 'Aproximando o LV2. Ritmo de ~1 h.', mid, pc2, hmid, h2, '6–7', zc));
      Z.push(mk('Z4', 'VO₂máx', 'Mais rápido que o LV2. Intervalado.', pc2, z4fast, h2, hrMax, '8–9', z4est ? E : zc));
      Z.push(mk('Z5', 'Anaeróbico / neuromuscular', 'Tiros máximos curtos.', z4fast, null, hrMax, null, '10', z4est ? E : zc));
      return { available: true, metric: 'pace', model: 'trifásico (LT1/LT2)', zones: Z, z4estimated: z4est, thrSource: src, source: 'Skinner & McLellan; Seiler. ' + src };
    }
    // potência
    let z4top = null, z4est = false;
    if (p2 != null) { if (wmax != null) z4top = wmax; else { z4top = p2 * 1.12; z4est = true; } }
    const mid = (p1 != null && p2 != null) ? p1 + (p2 - p1) / 2 : null;
    const f = x => x == null ? null : Math.round(x);
    Z.push({ z: 'Z1', name: 'Base aeróbica / regenerativo', purpose: 'Abaixo do LV1. Base, gordura, volume.', powLo: null, powHi: f(p1), hrLo: null, hrHi: h1, rpe: '2–3', conf: zc, metric: 'power' });
    Z.push({ z: 'Z2', name: 'Tempo / sub-limiar', purpose: 'Entre LV1 e o meio do caminho ao LV2.', powLo: f(p1), powHi: f(mid), hrLo: h1, hrHi: hmid, rpe: '4–5', conf: zc, metric: 'power' });
    Z.push({ z: 'Z3', name: 'Limiar', purpose: 'Aproximando o LV2. Ritmo de ~1 h.', powLo: f(mid), powHi: f(p2), hrLo: hmid, hrHi: h2, rpe: '6–7', conf: zc, metric: 'power' });
    Z.push({ z: 'Z4', name: 'VO₂máx', purpose: 'Acima do LV2. Potência aeróbia máxima.', powLo: f(p2), powHi: f(z4top), hrLo: h2, hrHi: hrMax, rpe: '8–9', conf: z4est ? E : zc, metric: 'power' });
    Z.push({ z: 'Z5', name: 'Anaeróbico / neuromuscular', purpose: 'Esforços máximos curtos.', powLo: f(z4top), powHi: null, hrLo: hrMax, hrHi: null, rpe: '10', conf: z4est ? E : zc, metric: 'power' });
    return { available: true, metric: 'power', model: 'trifásico (LT1/LT2)', zones: Z, z4estimated: z4est, thrSource: src, source: 'Skinner & McLellan; Seiler. ' + src + (z4est ? ' · teto Z4/Z5 estimado (sem Pmáx)' : '') };
  }

  // ---------- B · combustível ----------
  function substrate(vo2L, vco2L) { if (vo2L == null || vco2L == null) return null; return { fat: 1.695 * vo2L - 1.701 * vco2L, cho: 4.344 * vco2L - 3.061 * vo2L }; }
  function computeFuel(I) {
    const out = { byDuration: [
      { dur: '< 45 min', gph: '0', note: 'Água. Começar abastecido.' },
      { dur: '45–75 min', gph: 'bochecho', note: 'Mouth rinse de CHO; ingestão não obrigatória.' },
      { dur: '75 min – 2,5 h', gph: '30–60', note: 'Escalar com intensidade e duração.' },
      { dur: '2,5–4 h', gph: '60–90', note: 'Glicose:frutose ~2:1.' },
      { dur: '> 4 h', gph: '90', note: '100–120 só com gut training (evidência não plena).' },
    ], substrate: null, conf: P, source: 'ACSM/Thomas 2016; Jeukendrup; Burke. Oxidação: Jeukendrup & Wallis 2005.' };
    const w = num((I.athlete || {}).weightKg);
    const stages = (I.stages || []).map(s => ({ load: num(s.load),
      vo2L: num(s.vo2L) ?? (num(s.vo2) != null && w != null ? num(s.vo2) * w / 1000 : null), vco2L: num(s.vco2L), rer: num(s.rer), hr: num(s.hr) }))
      .filter(s => s.vo2L != null && s.vco2L != null && s.rer != null && s.rer >= 0.70 && s.rer <= 1.10);
    if (stages.length) {
      let best = null;
      stages.forEach(s => { const sub = substrate(s.vo2L, s.vco2L); if (sub && sub.fat >= 0) { s.fatG = sub.fat; s.choG = sub.cho; if (!best || sub.fat > best.fatG) best = s; } });
      if (best) out.substrate = { fatmaxLoad: r0(best.load), fatmaxHr: r0(best.hr), fatGmin: r1(best.fatG), choGmin: r1(best.choG), conf: M };
    }
    return out;
  }

  // ---------- C/D · aeróbio + eficiência ----------
  function veVco2Class(s) { if (s == null) return null; return s < 30 ? 'I (ótima)' : s < 36 ? 'II' : s < 45 ? 'III' : 'IV'; }
  function computeAerobic(I, friend) {
    const a = I.aerobic || {}, l2 = I.lt2 || {}, w = num((I.athlete || {}).weightKg), vo2 = num(a.vo2max_mlkg);
    const out = { metrics: [], friend, conf: M, source: 'FRIEND (Kaminsky/Myers); Weber & Janicki; Wasserman.' };
    if (vo2 != null) out.metrics.push({ k: 'VO₂máx', v: r1(vo2), u: 'ml/kg/min', conf: M, ctx: 'METs ' + r1(vo2 / 3.5) + (friend ? ' · ~p' + friend.pct + ' (' + friend.cls + ', ' + friend.mode + ')' : '') });
    if (l2.power != null && w) out.metrics.push({ k: 'LV2 (W/kg)', v: r1(num(l2.power) / w), u: 'W/kg', conf: M, ctx: 'FTP fisiológico de referência' });
    return out;
  }
  function computeEfficiency(I) {
    const e = I.efficiency || {}, out = { metrics: [], conf: M, source: 'Wasserman; Arena et al. 2007; Cole et al. 1999.' };
    const pm = (k, v, u, ctx, careful) => { if (num(v) != null) out.metrics.push({ k, v: r1(num(v)), u, conf: M, ctx, careful: !!careful }); };
    pm('Recuperação FC · 1′', e.hrr1, 'bpm', num(e.hrr1) != null ? (+e.hrr1 > 12 ? 'Normal/bom (>12). Recupera rápido.' : 'Abaixo de 12 — acompanhar.') : '');
    pm('Pulso de O₂', e.pulseO2, 'ml/bat', 'Proxy de volume sistólico.');
    pm('OUES', e.oues, '', 'Eficiência de captação de O₂ — comparar ao predito.');
    const vc = veVco2Class(num(e.veVco2Slope));
    if (vc) out.metrics.push({ k: 'VE/VCO₂ slope', v: r1(num(e.veVco2Slope)), u: '', conf: M, ctx: 'Classe ' + vc });
    pm('Reserva ventilatória', e.br, '%', 'Se há reserva, o limitante não é pulmonar.');
    if (num(e.vo2wrSlope) != null) out.metrics.push({ k: 'Economia VO₂/W', v: r1(num(e.vo2wrSlope)), u: 'ml/min/W', conf: M, careful: true, ctx: 'Abaixo do predito é leitura ambígua (economia OU entrega de O₂) — conferir com o médico.' });
    return out;
  }

  // ---------- E/F/G/H ----------
  function computeComposition(I) {
    const a = I.athlete || {}, c = I.composition || {}, out = { metrics: [], conf: M, source: 'Bioimpedância; Cunningham 1991 (TMB estimada).' };
    const push = (k, v, u, ctx, conf, careful) => { if (num(v) != null) out.metrics.push({ k, v: num(v), u, ctx, conf: conf || M, careful: !!careful }); };
    push('Gordura corporal', a.bodyFatPct, '%', a.bodyFatMethod ? 'método: ' + a.bodyFatMethod : '', M, num(a.bodyFatPct) != null && +a.bodyFatPct < 8);
    push('Massa magra', a.leanMassKg, 'kg', '');
    push('Ângulo de fase', c.phaseAngle, '°', 'Qualidade celular — tendência longitudinal (sem corte populacional).');
    push('Razão água E/I (AEC)', c.aec, '', 'Hidratação/inflamação — tendência.');
    let tmb = num(c.bmr), tc = M;
    if (tmb == null && num(a.leanMassKg) != null) { tmb = 500 + 22 * num(a.leanMassKg); tc = E; }
    if (tmb != null) out.metrics.push({ k: 'TMB', v: r0(tmb), u: 'kcal', ctx: 'Base do gasto diário (somar treino).', conf: tc });
    return out;
  }
  function computeStrength(I) {
    const s = I.strength || {}, out = { metrics: [], conf: M, source: 'Salto/dinamometria; força×economia (Mann et al.; ACSM).' };
    const asym = (d, e) => (d != null && e != null && Math.max(d, e) > 0) ? r1(Math.abs(d - e) / Math.max(d, e) * 100) : null;
    if (num(s.verticalJumpCm) != null) out.metrics.push({ k: 'Salto vertical', v: r1(num(s.verticalJumpCm)), u: 'cm', conf: M, careful: true, ctx: (s.jumpResult ? s.jumpResult + ' · ' : '') + 'comparar com norma idade/sexo.' });
    if (num(s.gripR) != null) out.metrics.push({ k: 'Preensão', v: r1(num(s.gripR)), u: 'kgf', conf: M, ctx: (num(s.gripL) != null ? 'E ' + r1(num(s.gripL)) + ' · ' : '') + 'força geral / prognóstico.' });
    const at = asym(num(s.thighR), num(s.thighL));
    if (at != null) out.metrics.push({ k: 'Assimetria coxa', v: at, u: '%', conf: M, ctx: at > 10 ? '>10% — observar.' : 'Dentro do usual.' });
    return out;
  }
  function computeFoot(I) {
    const f = I.foot || {}, out = { metrics: [], conf: M, source: 'Baropodometria; categoria via Gear Lab. Preventivo, não diagnóstico.' };
    const cat = { neutra: 'categoria neutra', pronada: 'estabilidade/controle', supinada: 'neutro amortecido' };
    if (f.strikeType) out.metrics.push({ k: 'Tipo de pisada', v: f.strikeType, u: '', conf: M, ctx: '→ ' + (cat[String(f.strikeType).toLowerCase()] || 'ver Gear Lab') });
    if (num(f.antPct) != null) out.metrics.push({ k: 'Distribuição anterior', v: r0(num(f.antPct)), u: '%', conf: M, careful: +f.antPct > 50, ctx: +f.antPct > 50 ? 'Acima da referência (40%) — atenção a antepé/metatarso.' : 'Dentro da referência.' });
    if (num(f.loadL) != null && num(f.loadR) != null) out.metrics.push({ k: 'Carga lateral', v: 'E' + r0(num(f.loadL)) + '/D' + r0(num(f.loadR)), u: '%', conf: M, ctx: 'Descarga lateral.' });
    return out;
  }
  function computeClearance(I) {
    const e = I.ecg || {}, sp = I.spirometry || {}, out = { metrics: [], conf: M, source: 'Registro do laudo. A ferramenta não libera — registra a liberação médica.' };
    if (e.result) out.metrics.push({ k: 'ECG de esforço', v: e.result, u: '', conf: M, ctx: (e.crm || e.date) ? `Liberação médica${e.crm ? ' · ' + e.crm : ''}${e.date ? ' · ' + e.date : ''}` : 'Registrar liberação (data/CRM).' });
    if (num(sp.ratio) != null) out.metrics.push({ k: 'VEF1/CVF', v: r0(num(sp.ratio)), u: '%', conf: M, careful: +sp.ratio < 70, ctx: +sp.ratio < 70 ? 'Abaixo de 70% — sinal obstrutivo; deferir ao médico.' : 'Função pulmonar não-limitante.' });
    return out;
  }

  // ---------- J · conciliação (+ decoupling) ----------
  function computeConciliation(I) {
    const f = I.field || {};
    let ftp = num(f.ftp);
    if (ftp == null && num(f.power20) != null) ftp = 0.95 * num(f.power20);
    const l2 = num((I.lt2 || {}).power);
    const out = { available: false, conf: M, source: 'Coggan (FTP); Friel (decoupling); conciliação descritiva.' };
    if (l2 != null && ftp != null) {
      const d = (ftp - l2) / l2 * 100;
      out.available = true; out.lv2 = r0(l2); out.ftp = r0(ftp); out.deltaPct = r1(d);
      out.cls = Math.abs(d) <= 5 ? 'alinhado' : d < 0 ? 'campo abaixo' : 'campo acima';
      out.txt = Math.abs(d) <= 5 ? 'FTP de campo alinhado ao LV2 do laudo.' : d < 0 ? `FTP ${r0(Math.abs(d))}% abaixo do LV2: possível teste submáximo, mudança de forma, ou protocolo diferente.` : `FTP ${r0(d)}% acima do LV2: forma melhorou, ou protocolo diferente.`;
    }
    const dec = num(f.decouplingPct);
    if (dec != null) { out.decoupling = { pct: r1(dec), txt: dec < 5 ? 'Pw:Hr < 5% — boa base aeróbica/durabilidade.' : dec < 8 ? 'Pw:Hr moderado — durabilidade a desenvolver.' : 'Pw:Hr alto — base aeróbica ou pacing a trabalhar.', conf: M }; out.available = true; }
    return out;
  }

  // ---------- Energia & combustível por intensidade (estilo INSCYD, honesto) ----------
  function computeEnergyFuel(I, zones) {
    const ath = I.athlete || {}, w = num(ath.weightKg);
    const out = { available: false, perZone: [], fatmax: null, carbmax: null, plan: null,
      source: 'Weir 1949 (gasto energético); Jeukendrup & Wallis 2005 (substrato); ACSM/Burke/Jeukendrup (fueling).' };
    // estágios com gases (VO₂/VCO₂) — detecta unidade ml/min vs ml/kg/min
    const stages = (I.stages || []).map(s => {
      const vo2 = num(s.vo2), vco2 = num(s.vco2);
      const vo2L = vo2 == null ? null : (vo2 < 120 && w ? vo2 * w / 1000 : vo2 / 1000);
      const vco2L = vco2 == null ? null : (vco2 < 120 && w ? vco2 * w / 1000 : vco2 / 1000);
      return { load: num(s.load), hr: num(s.hr), rer: num(s.rer), vo2L, vco2L };
    }).filter(s => s.vo2L != null && s.vco2L != null && s.vo2L > 0.3 && s.vo2L < 7);
    if (stages.length) {
      stages.forEach(s => {
        s.kcalH = (3.941 * s.vo2L + 1.106 * s.vco2L) * 60;       // Weir
        if (s.rer == null) s.rer = s.vco2L / s.vo2L;
        if (s.rer >= 0.70 && s.rer <= 1.10) {
          s.choH = Math.max(0, 4.344 * s.vco2L - 3.061 * s.vo2L) * 60;
          s.fatH = Math.max(0, 1.695 * s.vo2L - 1.701 * s.vco2L) * 60;
        } else { s.choH = null; s.fatH = null; }
      });
      let fm = null, cm = null;
      stages.forEach(s => { if (s.fatH != null && (!fm || s.fatH > fm.fatH)) fm = s; if (s.choH != null && (!cm || s.choH > cm.choH)) cm = s; });
      if (fm) out.fatmax = { load: r0(fm.load), hr: r0(fm.hr), fatGmin: r1(fm.fatH / 60), conf: M };
      if (cm) out.carbmax = { load: r0(cm.load), hr: r0(cm.hr), choGh: r0(cm.choH), conf: M };
      if (zones && zones.available && zones.metric === 'power') {
        const zb = zones.zones, agg = {};
        stages.forEach(s => { if (s.load == null) return;
          for (let i = 0; i < zb.length; i++) { const lo = zb[i].powLo, hi = zb[i].powHi; if ((lo == null || s.load >= lo) && (hi == null || s.load < hi)) { (agg[i] = agg[i] || []).push(s); break; } } });
        Object.keys(agg).forEach(zi => { const arr = agg[zi], mean = k => { const v = arr.map(x => x[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
          const kc = mean('kcalH'), ch = mean('choH'), ft = mean('fatH');
          out.perZone.push({ z: zb[zi].z, name: zb[zi].name, kcalH: r0(kc), choH: r0(ch), fatH: r1(ft), pctCho: (ch != null && kc) ? Math.min(100, Math.round(ch * 4 / kc * 100)) : null, conf: M }); });
        out.perZone.sort((a, b) => a.z.localeCompare(b.z));
      }
      out.available = true;
    }
    // plano de combustível para uma prova (medido se há zona; senão estimado)
    const fp = I.fuelPlan || {}, dur = num(fp.durationH), tzi = num(fp.targetZone) || 2;
    if (dur && dur > 0) {
      let choPerH = null, src = M;
      const pz = out.perZone.find(z => z.z === 'Z' + tzi);
      if (pz && pz.choH != null) choPerH = pz.choH;
      else {
        const pctMap = { 1: 0.35, 2: 0.5, 3: 0.7, 4: 0.85, 5: 0.95 }, pct = pctMap[tzi];
        const vo2max = num((I.aerobic || {}).vo2max_mlkg), l1v = num((I.lt1 || {}).vo2), l2v = num((I.lt2 || {}).vo2);
        const vz = { 1: l1v ? l1v * 0.85 : null, 2: l1v, 3: (l1v && l2v) ? (l1v + l2v) / 2 : l2v, 4: l2v, 5: vo2max }[tzi] || l2v || (vo2max ? vo2max * 0.8 : null);
        if (vz && w) { const kcalH = (vz * w / 1000) * 5 * 60; choPerH = Math.round(kcalH * pct / 4); src = E; }
      }
      if (choPerH != null) {
        const gut = !!fp.gutTrained; let gly = num(fp.glycogenG), glySrc = M;
        if (gly == null && w) { gly = Math.round(w * 6); glySrc = E; }
        const burnTotal = Math.round(choPerH * dur), intakeTotal = Math.max(0, burnTotal - (gly || 0)), intakePerH = Math.round(intakeTotal / dur), ceiling = gut ? 120 : 90;
        out.plan = { durationH: dur, zone: 'Z' + tzi, choBurnH: choPerH, choBurnTotal: burnTotal, glycogenG: gly, glySrc, intakePerH, intakeTotal, ceiling, capped: intakePerH > ceiling, gut, choSrc: src,
          tier: dur < 1.25 ? 'água / bochecho' : dur < 2.5 ? '30–60 g/h' : dur < 4 ? '60–90 g/h' : '90 g/h (100–120 só gut trained)',
          mix: intakePerH > 60 ? 'glicose:frutose ~2:1' : 'glicose simples ok' };
        out.available = true;
      }
    }
    return out;
  }

  function integratedPortrait(I, friend) {
    const a = I.aerobic || {}, e = I.efficiency || {}, s = I.strength || {}, bits = [];
    if (a.vo2max_mlkg != null) bits.push(`motor aeróbio ${friend ? friend.cls.toLowerCase() : (+a.vo2max_mlkg >= 40 ? 'forte' : 'a desenvolver')} (VO₂máx ${a.vo2max_mlkg})`);
    if (e.hrr1 != null && +e.hrr1 > 12) bits.push(`recuperação de FC boa (${e.hrr1} bpm/min)`);
    if (s.verticalJumpCm != null) bits.push(`potência de membros inferiores a observar (salto ${s.verticalJumpCm} cm)`);
    if (e.vo2wrSlope != null) bits.push('economia mecânica: leitura ambígua, conferir');
    if ((I.athlete || {}).bodyFatPct != null) bits.push(`composição enxuta (${I.athlete.bodyFatPct}% — monitorar energia disponível)`);
    if (!bits.length) return null;
    return 'Retrato (a partir do que o teste trouxe): ' + bits.join('; ') + '. Acompanhar no tempo: ângulo de fase, recuperação de FC e LV2/FTP contra o teste de campo.';
  }

  function analyze(input) {
    const I = input || {};
    const a = I.aerobic || {}, ath = I.athlete || {};
    const friend = friendClass(num(a.vo2max_mlkg), num(ath.age), ath.sex, (ath.testMode || ath.protocol));
    const dfa = dfaThresholds(I.dfa);
    const flags = phantomChecks(I);
    const zones = computeZones(I, dfa);
    const fuel = computeFuel(I);
    const modules = {
      aerobic: computeAerobic(I, friend), efficiency: computeEfficiency(I), composition: computeComposition(I),
      strength: computeStrength(I), foot: computeFoot(I), clearance: computeClearance(I),
      conciliation: computeConciliation(I), dfa,
      energy: computeEnergyFuel(I, zones),
    };
    return { ok: true, friend, dfa, flags, zones, fuel, modules, portrait: integratedPortrait(I, friend) };
  }

  root.LMA = root.LMA || {};
  root.LMA.physio = Object.assign(root.LMA.physio || {}, { analyze, substrate, friendClass, dfaThresholds, computeZones, computeFuel, phantomChecks, parsePace, paceStr });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.physio;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
