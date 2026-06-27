/* ============================================================
 * LMAeroFit · assets/fisiolab-n1.js  (FisioLab — motor Nível 1 + Cartão de Zonas)
 * Zonas a partir de FC/pace/potência, e o Cartão de Zonas para colar
 * no Garmin Connect, TrainingPeaks e Intervals.icu.
 *
 * Esquemas CONFIRMADOS na fonte (jun/2026):
 *  - FC por %LTHR e Pace por %pace-de-limiar: Joe Friel / TrainingPeaks
 *    (trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones).
 *  - Potência por %FTP: Allen & Coggan, "Training and Racing with a Power Meter".
 *  - FCmax estimada: Tanaka, Monahan & Seals (2001) — 208 − 0,7·idade.
 *  - As 3 plataformas aceitam %LTHR (FC) e %FTP (potência); Garmin também %FCmax/%HRR.
 *
 * Princípio: sem dado fantasma. Cada zona traz a base (medido/estimado/populacional).
 * API: LMA.fisiolab.* (tanakaMax, zonesHR, zonesHRmax, zonesPower, zonesPace, cartao)
 * ============================================================*/
(function (root) {
  'use strict';
  var M = 'medido', E = 'estimado', P = 'populacional';
  var num = function (x) { var n = +(('' + (x == null ? '' : x)).trim().replace(',', '.')); return isFinite(n) ? n : null; };
  var r0 = function (x) { return x == null ? null : Math.round(x); };
  var NAMES = { Z1: 'Recuperação', Z2: 'Base / Endurance', Z3: 'Tempo', Z4: 'Limiar', Z5: 'VO₂ / acima' };

  function tanakaMax(age) { age = num(age); return age ? Math.round(208 - 0.7 * age) : null; }

  // ---- FC por %LTHR (5 zonas; 5a/b/c do Friel colapsadas em Z5 ≥100%) ----
  // lower bounds (fração do LTHR) — run e bike diferem (Friel)
  var HR_LTHR = {
    run:  { Z1: 0,    Z2: 0.85, Z3: 0.90, Z4: 0.95, Z5: 1.00 },
    bike: { Z1: 0,    Z2: 0.81, Z3: 0.90, Z4: 0.94, Z5: 1.00 }
  };
  function bandsFromLower(lowerObj) {
    var zs = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'], out = [];
    for (var i = 0; i < zs.length; i++) {
      out.push({ z: zs[i], name: NAMES[zs[i]], pctLo: lowerObj[zs[i]], pctHi: (i < zs.length - 1) ? lowerObj[zs[i + 1]] : null });
    }
    return out;
  }
  function zonesHR(lthr, sport) {
    lthr = num(lthr); if (!lthr) return null;
    sport = (sport === 'run' || sport === 'corrida') ? 'run' : 'bike';
    var bands = bandsFromLower(HR_LTHR[sport]);
    return {
      metric: 'fc', basis: 'LTHR', sport: sport, conf: M,
      source: 'Friel / TrainingPeaks (%LTHR ' + (sport === 'run' ? 'corrida' : 'bike') + ')',
      zones: bands.map(function (b) {
        return { z: b.z, name: b.name, pctLo: b.pctLo, pctHi: b.pctHi,
          lo: b.pctLo ? Math.round(b.pctLo * lthr) : null, hi: b.pctHi ? Math.round(b.pctHi * lthr) - 1 : null, unit: 'bpm' };
      })
    };
  }
  // ---- FC por %FCmax (fallback sem LTHR; faixas padrão Garmin 5 zonas) ----
  var HR_MAX = { Z1: 0.50, Z2: 0.60, Z3: 0.70, Z4: 0.80, Z5: 0.90 };
  function zonesHRmax(fcmax, conf) {
    fcmax = num(fcmax); if (!fcmax) return null;
    var bands = bandsFromLower(HR_MAX);
    return {
      metric: 'fc', basis: 'FCmax', conf: conf || E,
      source: 'Zonas por %FCmax (padrão Garmin 5 zonas) — sem limiar medido',
      zones: bands.map(function (b) {
        return { z: b.z, name: b.name, pctLo: b.pctLo, pctHi: b.pctHi,
          lo: Math.round(b.pctLo * fcmax), hi: b.pctHi ? Math.round(b.pctHi * fcmax) - 1 : null, unit: 'bpm' };
      })
    };
  }
  // ---- Potência por %FTP (Coggan, 6 zonas) ----
  var PWR = { Z1: 0, Z2: 0.55, Z3: 0.75, Z4: 0.90, Z5: 1.05, Z6: 1.20 };
  var PWR_NAMES = { Z1: 'Recuperação', Z2: 'Endurance', Z3: 'Tempo', Z4: 'Limiar (FTP)', Z5: 'VO₂máx', Z6: 'Anaeróbico' };
  function zonesPower(ftp) {
    ftp = num(ftp); if (!ftp) return null;
    var zs = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'], out = [];
    for (var i = 0; i < zs.length; i++) {
      var lo = PWR[zs[i]], hi = (i < zs.length - 1) ? PWR[zs[i + 1]] : null;
      out.push({ z: zs[i], name: PWR_NAMES[zs[i]], pctLo: lo, pctHi: hi,
        lo: Math.round(lo * ftp), hi: hi ? Math.round(hi * ftp) - 1 : null, unit: 'W' });
    }
    return { metric: 'potencia', basis: 'FTP', conf: M, source: 'Allen & Coggan (%FTP)', zones: out };
  }
  // ---- Pace por % do pace de limiar (Friel, 5 zonas) ----
  // pace = segundos/km; % maior = mais lento. Z1 >129%, Z2 114-129, Z3 106-113, Z4 99-105, Z5 <99
  function fmtPace(s) { if (s == null || !isFinite(s)) return '—'; var m = Math.floor(s / 60), ss = Math.round(s % 60); if (ss === 60) { m++; ss = 0; } return m + ':' + ('' + ss).padStart(2, '0'); }
  function zonesPace(thrSecKm) {
    thrSecKm = num(thrSecKm); if (!thrSecKm) return null;
    // limites em fração do pace de limiar (do mais lento p/ mais rápido)
    var rows = [
      { z: 'Z1', name: NAMES.Z1, slow: null,  fast: 1.29 },
      { z: 'Z2', name: NAMES.Z2, slow: 1.29,  fast: 1.14 },
      { z: 'Z3', name: NAMES.Z3, slow: 1.14,  fast: 1.06 },
      { z: 'Z4', name: NAMES.Z4, slow: 1.06,  fast: 0.99 },
      { z: 'Z5', name: NAMES.Z5, slow: 0.99,  fast: null }
    ];
    return {
      metric: 'pace', basis: 'pace de limiar', conf: M, source: 'Friel / TrainingPeaks (% do pace de limiar)',
      zones: rows.map(function (r) {
        // mais lento = pace maior (slow fração) ; mais rápido = pace menor (fast fração)
        return { z: r.z, name: r.name,
          slowSec: r.slow ? Math.round(r.slow * thrSecKm) : null,
          fastSec: r.fast ? Math.round(r.fast * thrSecKm) : null,
          slow: r.slow ? fmtPace(r.slow * thrSecKm) : null,
          fast: r.fast ? fmtPace(r.fast * thrSecKm) : null, unit: '/km' };
      })
    };
  }

  // ---- Cartão de Zonas: onde colar em cada plataforma ----
  var HOWTO = {
    garmin: {
      fc: 'Garmin Connect → menu → Configurações do usuário → Zonas de frequência cardíaca → método "%LTHR" (informe seu LTHR) ou cole os bpm de cada zona.',
      potencia: 'Garmin Connect → Configurações do usuário → Zonas de potência → informe o FTP (ou cole os watts por zona).',
      pace: 'Garmin Connect → Configurações do usuário → Zonas de pace/ritmo de corrida → cole o ritmo de cada zona.'
    },
    tp: {
      fc: 'TrainingPeaks → app/site → Settings → Zones → Heart Rate → informe o LTHR e "Calculate New Zones" (sistema Friel), ou cole os bpm.',
      potencia: 'TrainingPeaks → Settings → Zones → Power → informe o FTP (sistema Coggan).',
      pace: 'TrainingPeaks → Settings → Zones → Pace (Run) → informe o Threshold Pace.'
    },
    intervals: {
      fc: 'Intervals.icu → Settings → informe o LTHR e selecione o sistema de zonas (ex.: %LTHR / Friel), ou cole os limites.',
      potencia: 'Intervals.icu → Settings → informe o FTP (zonas Coggan por padrão).',
      pace: 'Intervals.icu → Settings → informe o Threshold Pace (zonas de pace).'
    }
  };
  // perfil: { lthr, fcmax, ftp, thrPaceSecKm, sport }
  function cartao(profile) {
    profile = profile || {};
    var sport = profile.sport || 'bike';
    var hr = num(profile.lthr) ? zonesHR(profile.lthr, sport) : (num(profile.fcmax) ? zonesHRmax(profile.fcmax, profile.fcmaxConf || P) : null);
    var pw = num(profile.ftp) ? zonesPower(profile.ftp) : null;
    var pc = num(profile.thrPaceSecKm) ? zonesPace(profile.thrPaceSecKm) : null;
    var plats = ['garmin', 'tp', 'intervals'], names = { garmin: 'Garmin Connect', tp: 'TrainingPeaks', intervals: 'Intervals.icu' };
    var out = { platforms: [], missing: [] };
    if (!hr) out.missing.push('FC (informe LTHR ou FCmax)');
    if (!pw) out.missing.push('potência (informe FTP)');
    if (!pc) out.missing.push('pace (informe o pace de limiar de corrida)');
    plats.forEach(function (p) {
      var blocks = [];
      if (hr) blocks.push({ metric: 'fc', label: 'Frequência cardíaca', zones: hr, howto: HOWTO[p].fc });
      if (pw) blocks.push({ metric: 'potencia', label: 'Potência', zones: pw, howto: HOWTO[p].potencia });
      if (pc) blocks.push({ metric: 'pace', label: 'Pace (corrida)', zones: pc, howto: HOWTO[p].pace });
      out.platforms.push({ key: p, name: names[p], blocks: blocks });
    });
    return out;
  }

  root.LMA = root.LMA || {}; root.LMA.fisiolab = root.LMA.fisiolab || {};
  Object.assign(root.LMA.fisiolab, { tanakaMax: tanakaMax, zonesHR: zonesHR, zonesHRmax: zonesHRmax, zonesPower: zonesPower, zonesPace: zonesPace, cartao: cartao, fmtPace: fmtPace });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.fisiolab;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
