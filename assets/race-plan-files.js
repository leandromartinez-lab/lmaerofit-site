/* ============================================================
 * LMAeroFit · assets/race-plan-files.js  (Race Plan — arquivos de execução)
 * Gera, no navegador, os arquivos para colar o plano no rolo/cabeça:
 *   - Zwift .zwo   (workout: blocos de %FTP)
 *   - ERG .erg     (watts absolutos vs minutos)
 *   - MRC .mrc     (%FTP vs minutos)
 *   - CSV          (cola: bloco, duração, watts, %FTP)
 *   - TCX Course   (rota navegável — sem potência por ponto; o schema de
 *                   Course do TCX não carrega potência, então a potência vai
 *                   pelos arquivos de workout acima. Honesto.)
 *
 * Coalesce os segmentos do plano em blocos (potência ~constante) para não
 * gerar milhares de passos. Entrada: plan = LMA.racePlan.plan(...).
 * API: LMA.racePlanFiles.{blocks,toZWO,toERG,toMRC,toCSV,toTCX}
 * ============================================================*/
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // coalesce segmentos em blocos com potência dentro de tolW watts
  function blocks(segments, tolW) {
    tolW = tolW || 8; var out = [], cur = null;
    segments.forEach(function (s) {
      if (cur && Math.abs(s.power - cur.w0) <= tolW) { cur.dt += s.dt; cur.wsum += s.power * s.dt; cur.dist += s.dist; }
      else { if (cur) out.push(fin(cur)); cur = { w0: s.power, dt: s.dt, wsum: s.power * s.dt, dist: s.dist }; }
    });
    if (cur) out.push(fin(cur));
    return out;
    function fin(c) { return { durSec: c.dt, watts: Math.round(c.wsum / c.dt), distM: c.dist }; }
  }

  function toZWO(plan, opts) {
    opts = opts || {}; var ftp = opts.ftp || 250, bl = blocks(plan.segments, opts.tolW);
    var body = bl.map(function (b) { return '    <SteadyState Duration="' + Math.max(1, Math.round(b.durSec)) + '" Power="' + (b.watts / ftp).toFixed(3) + '"/>'; }).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>LMAeroFit</author>\n  <name>' + esc(opts.name || 'Race Plan') + '</name>\n  <description>' + esc(opts.desc || 'Plano de potência LMAeroFit') + '</description>\n  <sportType>bike</sportType>\n  <workout>\n' + body + '\n  </workout>\n</workout_file>\n';
  }

  function ergRows(plan, opts, percent) {
    var ftp = opts.ftp || 250, bl = blocks(plan.segments, opts.tolW), rows = [], t = 0;
    bl.forEach(function (b) {
      var val = percent ? Math.round(b.watts / ftp * 100) : b.watts;
      rows.push([(t / 60).toFixed(2), val]); t += b.durSec; rows.push([(t / 60).toFixed(2), val]);
    });
    return rows;
  }
  function ergHeader(unitsLine, opts) {
    return '[COURSE HEADER]\nVERSION = 2\nUNITS = METRIC\nDESCRIPTION = ' + (opts.desc || 'LMAeroFit Race Plan') + '\nFILE NAME = ' + (opts.file || 'raceplan') + '\n' + unitsLine + '\n[END COURSE HEADER]\n';
  }
  function toERG(plan, opts) {
    opts = opts || {};
    return ergHeader('MINUTES WATTS', opts) + '[COURSE DATA]\n' + ergRows(plan, opts, false).map(function (r) { return r[0] + '\t' + r[1]; }).join('\n') + '\n[END COURSE DATA]\n';
  }
  function toMRC(plan, opts) {
    opts = opts || {};
    return ergHeader('MINUTES PERCENT', opts) + '[COURSE DATA]\n' + ergRows(plan, opts, true).map(function (r) { return r[0] + '\t' + r[1]; }).join('\n') + '\n[END COURSE DATA]\n';
  }
  function toCSV(plan, opts) {
    opts = opts || {}; var ftp = opts.ftp || 250, bl = blocks(plan.segments, opts.tolW), t = 0;
    var rows = [['bloco', 'inicio_min', 'duracao_min', 'dist_km', 'watts', 'pct_ftp']];
    bl.forEach(function (b, i) { rows.push([i + 1, (t / 60).toFixed(1), (b.durSec / 60).toFixed(1), (b.distM / 1000).toFixed(2), b.watts, Math.round(b.watts / ftp * 100)]); t += b.durSec; });
    return rows.map(function (r) { return r.join(','); }).join('\n') + '\n';
  }

  // TCX Course: rota navegável (lat/lng/alt). records = pontos do GPX/FIT.
  function toTCX(records, opts) {
    opts = opts || {}; var pts = (records || []).filter(function (r) { return r.lat != null && r.lng != null; });
    var t0 = Date.now(), tp = pts.map(function (p, i) {
      var iso = new Date(t0 + i * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
      return '      <Trackpoint><Time>' + iso + '</Time><Position><LatitudeDegrees>' + p.lat.toFixed(6) + '</LatitudeDegrees><LongitudeDegrees>' + p.lng.toFixed(6) + '</LongitudeDegrees></Position>' + (p.altitude != null ? '<AltitudeMeters>' + p.altitude.toFixed(1) + '</AltitudeMeters>' : '') + '</Trackpoint>';
    }).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n  <Courses>\n    <Course>\n      <Name>' + esc((opts.name || 'Race Plan').slice(0, 15)) + '</Name>\n      <Track>\n' + tp + '\n      </Track>\n    </Course>\n  </Courses>\n</TrainingCenterDatabase>\n';
  }

  root.LMA = root.LMA || {}; root.LMA.racePlanFiles = { blocks: blocks, toZWO: toZWO, toERG: toERG, toMRC: toMRC, toCSV: toCSV, toTCX: toTCX };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.racePlanFiles;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
