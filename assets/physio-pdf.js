/* ============================================================
 * LMAeroFit · assets/physio-pdf.js  (Physio Lab — parser de laudo)
 * Recebe o TEXTO reconstruído de um PDF de laudo (ergoespirometria
 * tipo IEMEX/TCPE e similares) e devolve um objeto com os campos que
 * reconheceu, para pré-preencher o formulário. O atleta confere tudo.
 *
 * Não usa IA nem servidor — só regex. O que não reconhece fica vazio
 * (editável). Roda no navegador; o PDF nunca é guardado/enviado.
 *
 * API:  LMA.physio.parseLaudoText(text) -> { fields:{...}, hits:[], misses:[] }
 * ============================================================*/
(function (root) {
  'use strict';

  const N = s => { if (s == null) return null; s = String(s).trim().replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? null : n; };
  const m1 = (txt, re) => { const m = txt.match(re); return m ? m[1] : null; };
  // linha de tabela "Label ... - d1 d2 d3 d4 ..."  -> array de números após o primeiro "-"
  function tableRow(txt, labelRe) {
    const m = txt.match(labelRe);
    if (!m) return null;
    const nums = (m[0].split(/\s-\s|\s---?\s/)[1] || m[0]).match(/-?\d+(?:\.\d+)?/g);
    return nums ? nums.map(Number) : null;
  }

  function parseLaudoText(text) {
    const t = (text || '').replace(/ /g, ' ');
    const f = { athlete: {}, aerobic: {}, lt1: {}, lt2: {}, efficiency: {}, composition: {}, substrate: {}, strength: {}, foot: {}, ecg: {}, spirometry: {}, field: {} };
    const hits = [], misses = [];
    const put = (path, val, label) => {
      if (val == null || val === '' || (typeof val === 'number' && isNaN(val))) { if (label) misses.push(label); return; }
      const ks = path.split('.'); let o = f; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {}; o[ks[ks.length - 1]] = val; if (label) hits.push(label + '=' + val);
    };

    // ---- antropometria ----
    put('athlete.weightKg', N(m1(t, /Peso:\s*([\d.,]+)\s*kg/i)), 'peso');
    put('athlete.heightCm', N(m1(t, /Altura:\s*([\d.,]+)\s*cm/i)), 'altura');
    put('athlete.age', N(m1(t, /Idade:\s*(\d+)\s*anos/i)), 'idade');
    const sx = m1(t, /Sexo:\s*(Masculino|Feminino|M|F)/i); if (sx) put('athlete.sex', /fem|^f/i.test(sx) ? 'F' : 'M', 'sexo');
    if (/cicloerg|bicicleta|cycle|watt/i.test(t) && /\d{2,3}\s*W\b/.test(t)) put('athlete.testMode', 'cicloergômetro', 'modo');

    // ---- tabela metabólica/cardio ----
    const vo2 = tableRow(t, /VO2\/Kg\s+mL\/min\/Kg[^\n]*/i);   // [desc, AT, RC, Max, pred, %pred]
    if (vo2 && vo2.length >= 4) { put('aerobic.vo2max_mlkg', vo2[3], 'VO₂máx'); put('lt1.vo2', vo2[1], 'LV1 VO₂'); put('lt2.vo2', vo2[2], 'LV2 VO₂'); }
    const hr = tableRow(t, /\bHR\s+bpm[^\n]*/i);                // [desc, AT, RC, Max, pred, %]
    if (hr && hr.length >= 4) { put('aerobic.hrRest', hr[0], 'FC rep'); put('lt1.hr', hr[1], 'LV1 FC'); put('aerobic.hrMax', hr[3], 'FCmáx'); }
    const pulse = tableRow(t, /VO2\/HR\s+mL\/beat[^\n]*/i);     // [desc, AT, RC, Max,...]
    if (pulse && pulse.length >= 4) put('efficiency.pulseO2', pulse[3], 'pulso O₂');
    put('efficiency.oues', N(m1(t, /OUES\s+ml\/min\/l\/min\s+(\d+)/i)), 'OUES');
    put('efficiency.veVco2Slope', N(m1(t, /Curva VE\/VCO2\s*-*\s*([\d.]+)/i)), 'VE/VCO₂');
    put('efficiency.hrr1', N(m1(t, /FC em 1 min\s+bpm\s+(\d+)/i)), 'FC 1min');
    put('efficiency.vo2wrSlope', N(m1(t, /Slope VO2 ?\/ ?WR\s+mL\/min\/Watt\s+([\d.]+)/i)), 'VO₂/WR');
    const brRow = tableRow(t, /\bBR\s+%[^\n]*?>?\s*15/i);
    if (brRow && brRow.length) { const cand = brRow.filter(x => x > 0 && x < 100); if (cand.length) put('efficiency.br', cand[cand.length - 1], 'BR'); }
    put('aerobic.rerPeak', N(m1(t, /VCO2\/VO2\)\s*foi de\s*([\d.]+)/i) || m1(t, /foi de\s*(1\.[0-9]{1,2}),/i)), 'RER pico');

    // ---- limiares (narrativa) ----
    const lv1blk = (t.match(/\(LV1\)[\s\S]{0,200}/i) || [''])[0];
    put('lt1.power', N(m1(lv1blk, /em\s*(\d{2,3})\s*W/i)), 'LV1 W');
    const lv2blk = (t.match(/\(LV2\)[\s\S]{0,260}/i) || [''])[0];
    put('lt2.power', N(m1(lv2blk, /(\d{2,3})\s*W/i)), 'LV2 W');
    put('lt2.hr', N(m1(lv2blk, /FC de\s*(\d+)/i)), 'LV2 FC');
    if (f.lt2.vo2 == null) put('lt2.vo2', N(m1(lv2blk, /([\d.]+)\s*ml\/kg/i)), 'LV2 VO₂');

    // ---- bioimpedância ----
    put('composition.phaseAngle', N(m1(t, /[ÂA]ngulo de Fase[^:]*:\s*([\d.,]+)/i)), 'ângulo fase');
    put('composition.bmr', N(m1(t, /Taxa Metab[óo]lica Basal:\s*([\d.,]+)/i)), 'TMB');
    put('athlete.leanMassKg', N(m1(t, /Massa Magra\s+([\d.,]+)\s*\(kg\)/i)), 'massa magra');
    put('athlete.bodyFatPct', N(m1(t, /Gordura[\s\S]{0,40}?\(([\d.,]+)\s*%\)/i) || m1(t, /PGC[^\d]*([\d.,]+)\s*\(%\)/i)), '% gordura');
    if (f.athlete.bodyFatPct != null) put('athlete.bodyFatMethod', 'bioimpedância');
    const tbw = N(m1(t, /[ÁA]gua Corporal Total:\s*([\d.,]+)/i)), ecw = N(m1(t, /[ÁA]gua Extracelular:\s*([\d.,]+)/i));
    if (tbw && ecw) put('composition.aec', Math.round(ecw / tbw * 100) / 100, 'AEC');
    else put('composition.aec', N(m1(t, /Taxa de AEC\s+([\d.,]+)/i)), 'AEC');

    // ---- substrato (p/ disparar a guarda) ----
    if (/FAT%?\s+%?\s*-?\s*0\s+0\s+0\s+0/i.test(t) || /CHO%[^\n]*100\s+100\s+100\s+100/i.test(t)) { put('substrate.fatPct', 0); put('substrate.choPct', 100, 'substrato 0/100'); }

    // ---- força ----
    put('strength.verticalJumpCm', N(m1(t, /Salto Vertical Mensurado:\s*([\d.,]+)/i)), 'salto');
    const jr = m1(t, /Salto Vertical[\s\S]{0,60}?Resultado:\s*([A-Za-zÀ-ú]+)/i); if (jr) put('strength.jumpResult', jr, 'salto res');
    put('strength.gripR', N(m1(t, /M[ãa]o Dominante:\s*([\d.,]+)/i)), 'preensão D');
    put('strength.gripL', N(m1(t, /M[ãa]o N[ãa]o Dominante:\s*([\d.,]+)/i)), 'preensão E');
    put('strength.thighR', N(m1(t, /Coxa Direita:\s*([\d.,]+)/i)), 'coxa D');
    put('strength.thighL', N(m1(t, /Coxa Esquerda:\s*([\d.,]+)/i)), 'coxa E');

    // ---- pisada ----
    const pis = m1(t, /Tipo de Pisada\s+Pisada\s+([A-Za-zÀ-ú]+)/i) || m1(t, /Pisada\s+(Neutra|Pronada|Supinada)/i);
    if (pis) put('foot.strikeType', pis.toLowerCase(), 'pisada');
    put('foot.antPct', N(m1(t, /Anterior\s+([\d.,]+)%/i)), 'anterior%');
    put('foot.loadL', N(m1(t, /Lado Esquerdo\s+([\d.,]+)%/i)), 'carga E');
    put('foot.loadR', N(m1(t, /Lado Direito\s+([\d.,]+)%/i)), 'carga D');

    // ---- espiro / ECG / liberação ----
    put('spirometry.ratio', N(m1(t, /Rela[çc][ãa]o VEF1\/CVF:\s*([\d.,]+)/i)), 'VEF1/CVF');
    if (/Ausência de altera[çc][õo]es[^.]*isqu[êe]mi/i.test(t) || /sem isqu/i.test(t)) put('ecg.result', 'Sem isquemia, sem arritmia', 'ECG');
    const crm = m1(t, /CRM-PR:?\s*(\d{4,6})/i); if (crm) put('ecg.crm', 'CRM-PR ' + crm, 'CRM');
    const dt = m1(t, /Data:\s*(\d{2}\/\d{2}\/\d{4})/i) || m1(t, /(\d{2}\/\d{2}\/\d{4})/); if (dt) { put('athlete.testDate', dt); put('ecg.date', dt, 'data'); }

    return { fields: f, hits, misses };
  }

  root.LMA = root.LMA || {}; root.LMA.physio = root.LMA.physio || {};
  root.LMA.physio.parseLaudoText = parseLaudoText;
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseLaudoText };
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
