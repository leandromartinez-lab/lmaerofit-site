/* ============================================================
 * LMAeroFit · assets/debrief-render.js
 * RENDERIZADOR do Relatório Pós-Prova (gráficos SVG inline + HTML).
 * Consome o objeto devolvido por LMA.debrief.analyze (debrief-engine.js).
 *
 * API:  LMA.debrief.renderToHTML(report) -> string
 *       LMA.debrief.renderReport(report, containerEl)
 * ============================================================*/
(function (root) {
  'use strict';

  const round = (x, d = 0) => { const m = 10 ** d; return Math.round(x * m) / m; };
  const fmtMin = s => {
    s = Math.round(s); const h = (s / 3600) | 0, m = Math.round((s % 3600) / 60);
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
  };
  const paceStr = secPerKm => {
    if (!secPerKm || !isFinite(secPerKm)) return '—';
    const m = (secPerKm / 60) | 0, s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const esc = x => String(x == null ? '' : x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const SC = { green: 'var(--aero-bright)', yellow: 'var(--warn)', red: 'var(--crit)' };
  const scoreColor = v => v >= 75 ? 'var(--aero-bright)' : v >= 55 ? 'var(--warn)' : 'var(--crit)';

  function bucket(idxArr, valFn, n) {
    const out = [], L = idxArr.length;
    for (let b = 0; b < n; b++) {
      const lo = Math.floor(b * L / n), hi = Math.floor((b + 1) * L / n);
      let s = 0, c = 0;
      for (let k = lo; k < hi; k++) { const v = valFn(idxArr[k]); if (v != null && isFinite(v)) { s += v; c++; } }
      out.push(c ? s / c : null);
    }
    return out;
  }
  function pathFrom(vals, W, H, pad) {
    const v = vals.filter(x => x != null);
    if (!v.length) return '';
    const mn = Math.min(...v), mx = Math.max(...v), rng = (mx - mn) || 1;
    let d = '', started = false;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) continue;
      const x = pad + (i / (vals.length - 1)) * (W - 2 * pad);
      const y = H - pad - ((vals[i] - mn) / rng) * (H - 2 * pad);
      d += (started ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      started = true;
    }
    return d;
  }
  function areaFrom(vals, W, H, pad) {
    const v = vals.filter(x => x != null); if (!v.length) return '';
    const mn = Math.min(...v), mx = Math.max(...v), rng = (mx - mn) || 1;
    let d = '', first = null, lastX = pad;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) continue;
      const x = pad + (i / (vals.length - 1)) * (W - 2 * pad);
      const y = H - pad - ((vals[i] - mn) / rng) * (H - 2 * pad);
      if (first == null) { d += 'M' + x.toFixed(1) + ' ' + (H - pad) + ' L' + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; first = x; }
      else d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      lastX = x;
    }
    d += 'L' + lastX.toFixed(1) + ' ' + (H - pad) + ' Z';
    return d;
  }
  function wrapChart(title, body, sub) {
    return `<div class="dbf-chart"><div class="dbf-chart-h">${esc(title)}</div>${body}${sub ? `<div class="dbf-chart-sub">${sub}</div>` : ''}</div>`;
  }

  function chartElevPowerHR(r) {
    const s = r.series, n = 320, W = 680, H = 220, pad = 8;
    const idx = s.t.map((_, i) => i);
    const elev = s.has.alt ? bucket(idx, i => s.alt[i], n) : null;
    const pw = r.general.hasPower ? bucket(idx, i => s.pw[i], n) : null;
    const hr = s.has.hr ? bucket(idx, i => s.hr[i], n) : null;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:200px;display:block">`;
    if (elev) svg += `<path d="${areaFrom(elev, W, H, pad)}" fill="rgba(120,140,180,.16)" stroke="none"/>`;
    if (pw) svg += `<path d="${pathFrom(pw, W, H, pad)}" fill="none" stroke="var(--amber)" stroke-width="1.4"/>`;
    if (hr) svg += `<path d="${pathFrom(hr, W, H, pad)}" fill="none" stroke="var(--crit)" stroke-width="1.2" stroke-dasharray="3 2"/>`;
    svg += `</svg>`;
    const leg = [];
    if (elev) leg.push('<span style="color:#8aa">▮ elevação</span>');
    if (pw) leg.push('<span style="color:var(--amber)">▬ potência</span>');
    if (hr) leg.push('<span style="color:var(--crit)">▬ FC</span>');
    return wrapChart('Elevação × Potência × FC', svg, leg.join(' &nbsp; ') + ' &nbsp;·&nbsp; eixo = distância');
  }
  function chartSpeedHR(r) {
    const s = r.series, n = 320, W = 680, H = 160, pad = 8;
    if (!s.has.hr) return '';
    const idx = s.t.map((_, i) => i);
    const spd = bucket(idx, i => s.spd[i], n), hr = bucket(idx, i => s.hr[i], n);
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:140px;display:block">`;
    svg += `<path d="${pathFrom(spd, W, H, pad)}" fill="none" stroke="var(--aero-bright)" stroke-width="1.4"/>`;
    svg += `<path d="${pathFrom(hr, W, H, pad)}" fill="none" stroke="var(--crit)" stroke-width="1.2" stroke-dasharray="3 2"/>`;
    svg += `</svg>`;
    return wrapChart(r.general.sport === 'running' ? 'Pace × FC' : 'Velocidade × FC', svg,
      '<span style="color:var(--aero-bright)">▬ velocidade</span> &nbsp; <span style="color:var(--crit)">▬ FC</span>');
  }
  function chartRoute(r) {
    const s = r.series; if (!s.has.gps) return '';
    const lats = [], lngs = [];
    for (let i = 0; i < s.N; i++) if (s.lat[i] != null) { lats.push(s.lat[i]); lngs.push(s.lng[i]); }
    if (lats.length < 10) return '';
    const W = 680, H = 240, pad = 14;
    const mnLa = Math.min(...lats), mxLa = Math.max(...lats), mnLo = Math.min(...lngs), mxLo = Math.max(...lngs);
    const rLa = (mxLa - mnLa) || 1e-6, rLo = (mxLo - mnLo) || 1e-6;
    const sc = Math.min((W - 2 * pad) / rLo, (H - 2 * pad) / rLa);
    const px = lo => pad + (lo - mnLo) * sc, py = la => H - pad - (la - mnLa) * sc;
    const ftp = r.general.ftp;
    const col = i => {
      if (r.general.hasPower && s.pw[i] != null) {
        const z = s.pw[i] / ftp;
        return z > 1.05 ? 'var(--crit)' : z > 0.90 ? 'var(--warn)' : z > 0.75 ? 'var(--amber)' : 'var(--aero-bright)';
      }
      return 'var(--amber)';
    };
    let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">`;
    let prev = null;
    const step = Math.max(2, Math.floor(s.N / 400));   // limita a ~400 segmentos
    for (let i = 0; i < s.N; i += step) {
      if (s.lat[i] == null) continue;
      const x = px(s.lng[i]), y = py(s.lat[i]);
      if (prev) svg += `<line x1="${prev.x.toFixed(1)}" y1="${prev.y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col(i)}" stroke-width="2.2" stroke-linecap="round"/>`;
      prev = { x, y };
    }
    svg += `</svg>`;
    return wrapChart('Percurso · cor = intensidade', svg,
      '<span style="color:var(--aero-bright)">▬ Z1-2</span> <span style="color:var(--amber)">▬ Z3</span> <span style="color:var(--warn)">▬ limiar</span> <span style="color:var(--crit)">▬ acima</span>');
  }
  function chartZones(r) {
    if (!r.zones) return '';
    const z = r.zones.zones.filter(x => x.pct > 0);
    const maxPct = Math.max(...z.map(x => x.pct), 1);
    const colors = { Z1: 'var(--aero-bright)', Z2: 'var(--aero-bright)', Z3: 'var(--amber)', Z4: 'var(--warn)', Z5: 'var(--crit)', Z6: 'var(--crit)', Z7: 'var(--crit)' };
    let h = '<div style="display:grid;gap:5px;margin-top:6px">';
    z.forEach(x => {
      h += `<div style="display:grid;grid-template-columns:104px 1fr 78px;gap:8px;align-items:center;font-family:var(--mono);font-size:11px">
        <span style="color:var(--ink-soft)">${x.z} · ${esc(x.name)}</span>
        <div style="background:var(--bg-0);height:14px;border-radius:3px;overflow:hidden"><div style="width:${(x.pct / maxPct * 100).toFixed(0)}%;height:100%;background:${colors[x.z] || 'var(--amber)'}"></div></div>
        <span style="text-align:right;color:var(--ink-soft)">${x.pct}% · ${fmtMin(x.sec)}</span>
      </div>`;
    });
    h += '</div>';
    const sub = r.zones.type === 'power' ? 'distribuição por % do FTP' : `distribuição por % do limiar de FC (LTHR ${r.zones.lthr})`;
    return wrapChart('Tempo em zonas', h, sub);
  }

  const scoreCard = (label, v) => `<div class="dbf-score"><div class="dbf-score-v" style="color:${scoreColor(v)}">${v}</div><div class="dbf-score-l">${esc(label)}</div></div>`;
  const kpi = (label, val, unit, note) => `<div class="dbf-kpi"><div class="dbf-kpi-l">${esc(label)}</div><div class="dbf-kpi-v">${esc(val)}${unit ? `<span class="dbf-kpi-u">${esc(unit)}</span>` : ''}</div>${note ? `<div class="dbf-kpi-n">${esc(note)}</div>` : ''}</div>`;

  function renderToHTML(r) {
    if (!r || r.error) return `<div class="dbf-report"><p style="color:var(--warn)">${esc(r ? r.error : 'Sem dados.')}</p></div>`;
    const g = r.general, isRun = g.sport === 'running';
    const spd = v => v ? (isRun ? paceStr(v.paceSecKm) + ' /km' : v.spdKmh + ' km/h') : '—';
    let h = '<div class="dbf-report">';

    h += `<div class="dbf-sec"><div class="dbf-sec-k">01 · Resumo executivo</div>`;
    h += `<div class="dbf-diag dbf-${r.diagnosis.cls}"><span class="dbf-diag-tag">${esc(r.diagnosis.tag)}</span> ${esc(r.diagnosis.txt)}</div>`;
    h += `<div class="dbf-scores">${scoreCard('Pacing', r.scores.pacing)}${scoreCard('Eficiência', r.scores.efficiency)}${scoreCard('Controle', r.scores.control)}${scoreCard('Subidas', r.scores.climbs)}${scoreCard('Final', r.scores.finish)}${scoreCard('Geral', r.scores.strategy)}</div></div>`;

    h += `<div class="dbf-sec"><div class="dbf-sec-k">02 · Dados gerais</div><div class="dbf-kpis">`;
    h += kpi('Distância', g.distKm.toFixed(1), 'km');
    h += kpi('Tempo móvel', fmtMin(g.movingSec), '', g.stoppedSec > 60 ? '+' + fmtMin(g.stoppedSec) + ' parado' : '');
    h += isRun ? kpi('Pace médio', paceStr(g.avgPaceSecKm), '/km') : kpi('Velocidade', g.avgSpeedKmh.toFixed(1), 'km/h');
    if (g.gainM) h += kpi('Ganho elev.', g.gainM, 'm');
    if (g.hasPower) { h += kpi('NP', g.NP, 'W', 'média ' + g.avgPower + ' W'); h += kpi('IF', g.IF, '', (g.IF * 100).toFixed(0) + '% FTP'); h += kpi('VI', g.VI, '', 'NP/AP'); h += kpi('W/kg', g.wkg, '', 'na NP'); }
    h += kpi('TSS', g.TSS, '');
    if (g.hasHr) { h += kpi('FC média', g.avgHR, 'bpm', 'máx ' + g.maxHR); h += kpi('EF', g.EF, '', isRun ? 'vel/FC' : 'NP/FC'); }
    if (g.avgCad) h += kpi('Cadência', g.avgCad, isRun ? 'spm' : 'rpm');
    if (g.tempAvg != null) h += kpi('Temp.', g.tempAvg, '°C', g.tempMax ? 'máx ' + g.tempMax + '°C' : '');
    h += `</div>`;
    if (g.hasPower && g.ftpEst && Math.abs(g.ftpDivergence) > 0.08) {
      const up = g.ftpDivergence > 0;
      h += `<div class="dbf-flag ${up ? 'warn' : 'info'}">⚠ FTP do perfil = <b>${g.ftp} W</b>, mas a curva desta atividade sugere <b>~${g.ftpEst} W</b> (${up ? 'perfil ' + round(g.ftpDivergence * 100, 0) + '% acima' : 'você pode ter evoluído'}). ${up ? 'Com isso, seu IF/TSS reais foram <b>maiores</b> do que mostrado. Refazer o teste de FTP é a correção nº 1.' : 'Considere reteste.'}</div>`;
    }
    h += `</div>`;

    h += `<div class="dbf-sec"><div class="dbf-sec-k">03 · Gráficos</div>${chartElevPowerHR(r)}${chartSpeedHR(r)}${chartRoute(r)}</div>`;

    h += `<div class="dbf-sec"><div class="dbf-sec-k">04 · Pacing & distribuição</div>${chartZones(r)}`;
    h += `<p class="dbf-p">Tempo <b>no limiar</b> (controlado): ${fmtMin(g.atThrSec)} · <b>acima do limiar</b> (gray zone): ${fmtMin(g.aboveThrSec)}${g.movingSec ? ' (' + round(g.aboveThrSec / g.movingSec * 100, 0) + '% da prova)' : ''}. <span class="dbf-mut">A lente norueguesa premia tempo no limiar; tempo acima dele acumula lactato e cobra na durabilidade.</span></p></div>`;

    h += `<div class="dbf-sec"><div class="dbf-sec-k">05 · Análise fisiológica</div>`;
    if (r.decoup) {
      const bandTxt = { 'excelente': 'Excelente', 'muito-bom': 'Muito bom', 'aceitavel': 'Aceitável', 'atencao': 'Atenção', 'critico': 'Forte sinal de fadiga/calor/nutrição' }[r.decoup.band];
      const bandCls = r.decoup.band === 'excelente' || r.decoup.band === 'muito-bom' ? 'good' : r.decoup.band === 'aceitavel' ? 'warn' : 'bad';
      h += `<p class="dbf-p">Desacoplamento cardíaco (Pa:Hr): <b class="dbf-${bandCls}">${round(r.decoup.pct, 1)}%</b> — ${bandTxt}. <span class="dbf-mut">Eficiência 1ª metade ${round(r.decoup.e1, 3)} → 2ª metade ${round(r.decoup.e2, 3)}.</span></p>`;
    }
    h += `<div class="dbf-tbl-w"><table class="dbf-tbl"><thead><tr><th>Quarto</th>${g.hasPower ? '<th>Potência</th>' : ''}<th>FC</th><th>${isRun ? 'Pace' : 'Vel'}</th>${g.avgCad ? '<th>Cad</th>' : ''}<th>EF</th>${g.gainM ? '<th>Subida</th>' : ''}${g.tempAvg != null ? '<th>Temp</th>' : ''}</tr></thead><tbody>`;
    r.quarters.forEach(q => { if (!q) return;
      h += `<tr><td>${q.idx * 25}–${(q.idx + 1) * 25}%</td>${g.hasPower ? `<td>${q.avgPower} W</td>` : ''}<td>${q.avgHR}</td><td>${spd(q)}</td>${g.avgCad ? `<td>${q.avgCad || '—'}</td>` : ''}<td>${q.EF}</td>${g.gainM ? `<td>${q.gainM} m</td>` : ''}${g.tempAvg != null ? `<td>${q.tempAvg != null ? q.tempAvg + '°' : '—'}</td>` : ''}</tr>`;
    });
    h += `</tbody></table></div></div>`;

    if (r.terrain) {
      h += `<div class="dbf-sec"><div class="dbf-sec-k">06 · Análise por terreno</div><div class="dbf-tbl-w"><table class="dbf-tbl"><thead><tr><th>Terreno</th><th>% tempo</th>${g.hasPower ? '<th>Potência</th>' : ''}<th>FC</th><th>${isRun ? 'Pace' : 'Vel'}</th><th>EF</th></tr></thead><tbody>`;
      [['climb', '↗ Subida'], ['flat', '→ Plano'], ['descent', '↘ Descida']].forEach(([k, lbl]) => {
        const x = r.terrain[k]; if (!x) return;
        h += `<tr><td>${lbl}</td><td>${x.pctTime}%</td>${g.hasPower ? `<td>${x.avgPower} W</td>` : ''}<td>${x.avgHR}</td><td>${spd(x)}</td><td>${x.EF}</td></tr>`;
      });
      h += `</tbody></table></div>`;
      if (g.hasPower && r.terrain.climb && r.terrain.flat && r.terrain.flat.avgPower) {
        const rr = r.terrain.climb.avgPower / r.terrain.flat.avgPower;
        h += `<p class="dbf-p">Você subiu a <b>${r.terrain.climb.avgPower} W</b> vs <b>${r.terrain.flat.avgPower} W</b> no plano (${round((rr - 1) * 100, 0)}% mais forte). ${rr > 1.25 ? '<span class="dbf-bad">Subidas atacadas — principal fonte de custo metabólico.</span>' : '<span class="dbf-good">Subidas relativamente controladas.</span>'}</p>`;
      }
      h += `</div>`;
    }

    if (r.splits && r.splits.length > 1) {
      const sp = r.splits, maxV = Math.max(...sp.map(x => g.hasPower ? (x.avgPower || 0) : x.spdKmh));
      h += `<div class="dbf-sec"><div class="dbf-sec-k">07 · Splits por ${isRun ? 'km' : '5 km'}</div><div style="display:grid;gap:3px;margin-top:6px">`;
      sp.forEach(x => {
        const val = g.hasPower ? (x.avgPower || 0) : x.spdKmh;
        h += `<div style="display:grid;grid-template-columns:54px 1fr 120px;gap:8px;align-items:center;font-family:var(--mono);font-size:10.5px">
          <span style="color:var(--ink-mute)">${x.km} km</span>
          <div style="background:var(--bg-0);height:11px;border-radius:2px;overflow:hidden"><div style="width:${(val / maxV * 100).toFixed(0)}%;height:100%;background:var(--amber)"></div></div>
          <span style="text-align:right;color:var(--ink-soft)">${g.hasPower ? (x.avgPower || '—') + ' W' : x.spdKmh + ' km/h'} · ${x.avgHR} bpm</span>
        </div>`;
      });
      h += `</div></div>`;
    }

    if (r.exageros.length) {
      h += `<div class="dbf-sec"><div class="dbf-sec-k">08 · Onde você exagerou</div><div class="dbf-tbl-w"><table class="dbf-tbl"><thead><tr><th>Trecho</th><th>Métrica</th><th>Evidência</th><th>Consequência</th></tr></thead><tbody>`;
      r.exageros.forEach(e => h += `<tr><td>${esc(e.trecho)}</td><td>${esc(e.metrica)}</td><td>${esc(e.evidencia)}</td><td class="dbf-mut">${esc(e.consequencia)}</td></tr>`);
      h += `</tbody></table></div></div>`;
    }
    if (r.fortes.length) {
      h += `<div class="dbf-sec"><div class="dbf-sec-k">09 · Onde você foi bem</div><div class="dbf-tbl-w"><table class="dbf-tbl"><thead><tr><th>Trecho</th><th>Evidência</th><th>Por quê</th></tr></thead><tbody>`;
      r.fortes.forEach(e => h += `<tr><td>${esc(e.trecho)}</td><td>${esc(e.evidencia)}</td><td class="dbf-mut">${esc(e.porque)}</td></tr>`);
      h += `</tbody></table></div></div>`;
    }

    h += `<div class="dbf-sec"><div class="dbf-sec-k">10 · Recomendações</div><div class="dbf-recs"><div><div class="dbf-rec-h">▸ Próxima prova</div><ul>${r.recs.nextRace.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><div class="dbf-rec-h">▸ Próximo ciclo de treino</div><ul>${r.recs.nextCycle.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div></div>`;

    h += `<div class="dbf-sec"><div class="dbf-sec-k">11 · Painel · método norueguês</div><div class="dbf-sem">`;
    r.semaphore.forEach(sm => h += `<div class="dbf-sem-row"><span class="dbf-dot" style="background:${SC[sm.status]};box-shadow:0 0 6px ${SC[sm.status]}"></span><span class="dbf-sem-a">${esc(sm.area)}</span><span class="dbf-sem-c">${esc(sm.c)}</span></div>`);
    h += `</div></div>`;

    if (r.alerts.length) {
      h += `<div class="dbf-sec"><div class="dbf-sec-k">Alertas automáticos</div>`;
      r.alerts.forEach(a => h += `<div class="dbf-alert dbf-${a.lvl === 'crit' ? 'bad' : a.lvl === 'warn' ? 'warn' : 'info'}-a">${a.lvl === 'crit' ? '⛔' : a.lvl === 'warn' ? '⚠' : 'ℹ'} ${esc(a.txt)}</div>`);
      h += `</div>`;
    }

    h += `<p class="dbf-foot">Substituímos lactato por potência, FC, pace, NP, IF, VI, EF, Pa:Hr e distribuição de zonas — proxies, não medição direta. Análise educativa, não prescrição.</p></div>`;
    return h;
  }

  function renderReport(r, el) { if (el) el.innerHTML = renderToHTML(r); }

  root.LMA = root.LMA || {};
  root.LMA.debrief = Object.assign(root.LMA.debrief || {}, { renderToHTML, renderReport });
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderToHTML, renderReport };
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
