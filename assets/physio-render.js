/* ============================================================
 * LMAeroFit · assets/physio-render.js  (Physio Lab — renderizador)
 * Consome o report de LMA.physio.analyze e produz o parecer em HTML
 * (estilo cockpit evoluído · classes pl-* de cockpit.css).
 * API:  LMA.physio.renderToHTML(report) · renderReport(report, el)
 * ============================================================*/
(function (root) {
  'use strict';
  const esc = x => String(x == null ? '' : x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const dotCls = c => c === 'medido' ? 'm' : c === 'estimado' ? 'e' : c === 'populacional' ? 'p' : 'm';

  function metricCard(m) {
    const cls = m.careful ? 'warn' : '';
    const u = m.u ? `<span class="u">${esc(m.u)}</span>` : '';
    return `<div class="pl-metric ${cls}"><span class="src-dot ${dotCls(m.conf)}"></span>`
      + `<div class="lab">${esc(m.k)}</div><div class="val">${esc(m.v)}${u}</div>`
      + (m.ctx ? `<div class="ctx">${esc(m.ctx)}</div>` : '') + `</div>`;
  }
  function metricsBlock(metrics) {
    if (!metrics || !metrics.length) return '';
    return `<div class="pl-metrics">${metrics.map(metricCard).join('')}</div>`;
  }
  function sec(mark, title, note, body) {
    return `<section class="pl-sec"><div class="pl-sec-head"><span class="pl-mark">${esc(mark)}</span>`
      + `<h2 class="pl-h2">${title}</h2>${note ? `<div class="pl-note">${esc(note)}</div>` : ''}</div>${body}</section>`;
  }
  const srcLine = s => s ? `<div class="pl-src">Fonte: ${esc(s)}</div>` : '';

  function zonesBlock(z) {
    if (!z || !z.available) return '<p class="pl-src">Sem limiares — informe LV1/LV2 (laudo) ou os estágios de DFA-α1 (campo / pista).</p>';
    const isPace = z.metric === 'pace';
    const ps = s => { if (!s || !isFinite(s)) return '—'; const m = (s / 60) | 0, ss = Math.round(s % 60); return m + ':' + String(ss).padStart(2, '0'); };
    const main = q => {
      if (isPace) { const lo = q.paceLo, hi = q.paceHi; const r = lo == null ? `> ${ps(hi)}` : hi == null ? `< ${ps(lo)}` : `${ps(lo)}–${ps(hi)}`; return `Pace <b>${r} /km</b>`; }
      const lo = q.powLo, hi = q.powHi; const r = lo == null ? `< ${hi} W` : hi == null ? `> ${lo} W` : `${lo}–${hi} W`; return `Pot <b>${r}</b>`;
    };
    const fc = (lo, hi) => lo == null ? `< ${hi}` : hi == null ? `> ${lo}` : `${lo}–${hi}`;
    const rows = z.zones.map((q, i) => `<div class="pl-zone z${i + 1}"><div class="pl-zbar">${q.z}</div>`
      + `<div class="pl-zbody"><div class="pl-zname">${esc(q.name)}</div><div class="pl-zpurpose">${esc(q.purpose)}</div>`
      + `<div class="pl-zdata"><span class="d">${main(q)}</span>`
      + `<span class="d">FC <b>${fc(q.hrLo, q.hrHi)}</b></span><span class="d">RPE <b>${q.rpe}</b></span></div></div>`
      + `<span class="pl-zconf ${dotCls(q.conf)}">${esc(q.conf)}</span></div>`).join('');
    return `<div class="pl-zones">${rows}</div>${srcLine(z.source)}`;
  }
  function fuelBlock(f) {
    const cards = f.byDuration.map(d => `<div class="pl-fcard"><div class="dur">${esc(d.dur)}</div>`
      + `<div class="gph">${esc(d.gph)}<span class="u"> g/h</span></div><div class="desc">${esc(d.note)}</div></div>`).join('');
    let sub = '';
    if (f.substrate) sub = `<p class="pl-src" style="color:var(--ink-soft)">Substrato individual (RER medido): FatMax em ${f.substrate.fatmaxLoad} W · gordura ${f.substrate.fatGmin} g/min · CHO ${f.substrate.choGmin} g/min.</p>`;
    return `<div class="pl-fuel">${cards}</div>${sub}${srcLine(f.source)}`;
  }
  function energyFuelBlock(e) {
    let h = '';
    if (e.fatmax || e.carbmax) {
      h += '<div class="pl-metrics">';
      if (e.fatmax) h += `<div class="pl-metric"><span class="src-dot m"></span><div class="lab">FatMax</div><div class="val">${e.fatmax.fatGmin}<span class="u">g gord/min</span></div><div class="ctx">máx oxidação de gordura · ${e.fatmax.load} W · FC ${e.fatmax.hr}</div></div>`;
      if (e.carbmax) h += `<div class="pl-metric"><span class="src-dot m"></span><div class="lab">CarbMax (observado)</div><div class="val">${e.carbmax.choGh}<span class="u">g CHO/h</span></div><div class="ctx">maior combustão de CHO no teste · ${e.carbmax.load} W</div></div>`;
      h += '</div>';
    }
    if (e.perZone && e.perZone.length) {
      const th = s => `<th style="padding:6px 9px;font-weight:400;text-transform:uppercase;font-size:9.5px;letter-spacing:.06em;color:var(--ink-mute);text-align:left">${s}</th>`;
      const td = (s, c) => `<td style="padding:6px 9px;color:${c || 'var(--ink-soft)'}">${s == null ? '—' : s}</td>`;
      let rows = e.perZone.map(z => `<tr style="border-top:1px solid var(--line)">${td(z.z, 'var(--amber)')}${td(z.kcalH)}${td(z.choH)}${td(z.fatH)}${td(z.pctCho != null ? z.pctCho + '%' : null)}</tr>`).join('');
      h += `<div style="overflow-x:auto;margin-top:12px"><table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px"><tr>${th('Zona')}${th('kcal/h')}${th('CHO g/h')}${th('Gordura g/h')}${th('% energia CHO')}</tr>${rows}</table></div>`;
    }
    if (e.plan) {
      const p = e.plan;
      let body = `Prova de <strong>${p.durationH} h</strong> em <strong>${p.zone}</strong>: combustão de <span class="pmono">~${p.choBurnH} g CHO/h</span> (${p.choBurnTotal} g no total). Glicogênio ~<span class="pmono">${p.glycogenG} g</span>${p.glySrc === 'estimado' ? ' (estimado do peso — ajustável)' : ''} → a demanda para não esgotar é <span class="pmono">${p.intakePerH} g/h</span>.`;
      if (p.capped) body += ` <strong>Acima do teto de absorção (${p.ceiling} g/h)</strong>: nessa intensidade × duração o glicogênio é o limitante — segure numa zona mais baixa, ou aceite a queda no final. Reposição prática máxima: <span class="pmono">${p.tier}</span> (${p.mix}).`;
      else body += ` Reposição: <span class="pmono">~${Math.min(p.intakePerH, p.ceiling)} g/h</span> (${p.mix}), dentro do teto de ${p.ceiling} g/h. Diretriz por duração: ${p.tier}.`;
      h += `<div class="pl-parecer" style="margin-top:14px"><p>${body}</p><p style="margin-top:8px;font-size:13px"><a href="./race-fueling.html" style="color:var(--amber)">→ montar o kit completo na Nutrição</a> (sódio, líquido, cafeína, produtos).</p></div>`;
    }
    if (!h) h = '<p class="pl-src">Para a combustão por intensidade (estilo INSCYD), cole a <b>curva estágio a estágio</b> do laudo (carga, VO₂, VCO₂, RER) no formulário. Sem ela, fica só a diretriz por duração acima.</p>';
    return h + srcLine(e.source);
  }
  function flagBox(fl) {
    const cls = fl.lvl === 'flag' ? '' : fl.lvl === 'safety' ? 'safe' : fl.lvl === 'warn' ? 'crit' : '';
    const ft = fl.lvl === 'safety' ? '↗ energia / segurança' : fl.lvl === 'warn' ? '⚠ atenção' : '⚠ flag de qualidade do laudo';
    return `<div class="pl-flag ${cls}"><div class="ft">${ft}</div><p>${esc(fl.txt)}</p></div>`;
  }

  function renderToHTML(r) {
    if (!r || !r.ok) return '<p class="pl-src">Preencha os campos do laudo para gerar o parecer.</p>';
    const m = r.modules, out = [];
    out.push(`<div class="conf-legend"><span><span class="conf-dot m"></span>medido (laudo)</span>`
      + `<span><span class="conf-dot e"></span>estimado / diretriz</span>`
      + `<span><span class="conf-dot p"></span>populacional</span>`
      + `<span><span class="conf-dot w"></span>atenção</span></div>`);

    if (m.aerobic.metrics.length) out.push(sec('§ 01 · motor aeróbio', 'Perfil <em>máximo</em>', 'Ergoespirometria — o tamanho do motor.', metricsBlock(m.aerobic.metrics) + srcLine(m.aerobic.source)));
    if (m.efficiency.metrics.length) out.push(sec('§ 02 · eficiência', 'Eficiência do <em>motor</em>', 'Onde está o limitante.', metricsBlock(m.efficiency.metrics) + srcLine(m.efficiency.source)));
    if (r.zones.available) out.push(sec('§ 03 · zonas', 'Zonas de <em>treino</em>', 'Trifásico nos limiares.', zonesBlock(r.zones)));
    out.push(sec('§ 04 · combustível', 'Combustível <em>por duração</em>', 'Diretriz publicada — ponte com a Nutrição.', fuelBlock(r.fuel)
      + (r.flags.filter(f => f.mod === 'fuel').map(flagBox).join(''))));
    if (r.modules.energy && r.modules.energy.available) out.push(sec('§ 04b · energia', 'Energia &amp; <em>combustível por intensidade</em>', 'Estilo INSCYD — medido quando o laudo traz gases por estágio.', energyFuelBlock(r.modules.energy)));
    if (m.composition.metrics.length) out.push(sec('§ 05 · composição', 'Composição &amp; <em>recuperação</em>', 'Bioimpedância — e o que acompanhar.', metricsBlock(m.composition.metrics)
      + (r.flags.filter(f => f.mod === 'composition').map(flagBox).join('')) + srcLine(m.composition.source)));
    if (m.strength.metrics.length) out.push(sec('§ 06 · força', 'Força &amp; <em>potência</em>', 'A peça que conversa com a corrida.', metricsBlock(m.strength.metrics) + srcLine(m.strength.source)));
    if (m.foot.metrics.length) out.push(sec('§ 07 · pisada', 'Pé &amp; <em>pisada</em>', 'Alimenta o tênis e a prevenção.', metricsBlock(m.foot.metrics) + srcLine(m.foot.source)));
    if (m.clearance.metrics.length) out.push(sec('§ 08 · liberação', 'Liberação &amp; <em>segurança</em>', 'O que destrava a intensidade.', metricsBlock(m.clearance.metrics) + srcLine(m.clearance.source)));
    if (m.conciliation.available) {
      let body = `<div class="pl-parecer blue"><p>`;
      if (m.conciliation.deltaPct != null) body += `LV2 do laudo <strong>${m.conciliation.lv2} W</strong> × FTP de campo <strong>${m.conciliation.ftp} W</strong> = <strong>${m.conciliation.deltaPct}%</strong> (${esc(m.conciliation.cls)}). ${esc(m.conciliation.txt)} `;
      if (m.conciliation.decoupling) body += `<span class="pmono">Decoupling Pw:Hr ${m.conciliation.decoupling.pct}%</span> — ${esc(m.conciliation.decoupling.txt)}`;
      body += `</p></div>` + srcLine(m.conciliation.source);
      out.push(sec('§ 09 · lab × campo', 'Conciliação <em>laboratório × campo</em>', 'Onde o lab e o campo conversam.', body));
    }
    if (m.dfa && (m.dfa.lt1 || m.dfa.lt2)) {
      const d = m.dfa, txt = `LT1 (aeróbio, α1=0,75): <strong>${d.lt1 ? (d.lt1.load || d.lt1.hr) + (d.lt1.load ? ' W' : ' bpm') : '—'}</strong> · LT2 (anaeróbio, α1=0,50): <strong>${d.lt2 ? (d.lt2.load || d.lt2.hr) + (d.lt2.load ? ' W' : ' bpm') : '—'}</strong>.`;
      out.push(sec('§ 09b · DFA-α1', 'Limiares por <em>HRV</em>', 'Estimativa de campo, sem lactato.', `<div class="pl-parecer"><p>${txt}</p></div>` + srcLine(d.source)));
    }
    if (r.portrait) out.push(sec('§ 10 · síntese', 'Retrato <em>integrado</em>', 'Os 7 módulos cruzados.', `<div class="pl-parecer"><p>${esc(r.portrait)}</p></div>`
      + `<div class="pl-src">A ferramenta não diagnostica, não prescreve, não libera — registra com fonte e confiança.</div>`));

    // alertas restantes (não específicos de módulo já mostrado)
    const shown = new Set(['fuel', 'composition']);
    const rest = r.flags.filter(f => !shown.has(f.mod));
    if (rest.length) out.push(sec('alertas', 'Alertas <em>automáticos</em>', '', rest.map(flagBox).join('')));

    return `<div class="pl-report">${out.join('')}</div>`;
  }
  function renderReport(r, el) { if (el) el.innerHTML = renderToHTML(r); }

  root.LMA = root.LMA || {}; root.LMA.physio = root.LMA.physio || {};
  root.LMA.physio.renderToHTML = renderToHTML; root.LMA.physio.renderReport = renderReport;
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderToHTML, renderReport };
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
