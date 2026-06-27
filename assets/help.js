/* ============================================================
 * LMAeroFit · assets/help.js  (componente de ajuda reutilizável)
 * Coloque data-help="chave" em qualquer elemento (label, título,
 * resultado). Um botão "?" é anexado; ao clicar, abre um balão com:
 *   • o que é   • a fórmula / modelo   • a fonte científica
 *
 * Self-contained: injeta o próprio CSS, sem dependência externa.
 * Mobile-first (toque). Não aparece na impressão / PDF.
 *
 * API:
 *   LMA.help.refresh()                  varre o DOM e liga os "?" novos
 *   LMA.help.register({chave:{t,w,f,s}}) adiciona/edita verbetes
 * ============================================================*/
(function (root) {
  'use strict';
  const D = document;

  // ---- Registro de verbetes: t=título, w=o que é, f=fórmula/modelo, s=fonte ----
  const REG = {
    // ---------- aeróbio ----------
    vo2max: { t: 'VO₂máx', w: 'O maior volume de oxigênio que você consegue usar por minuto — o "tamanho do motor" aeróbio. Quanto maior, maior o teto de performance em endurance.', f: 'mL·kg⁻¹·min⁻¹. Classificação por idade e sexo.', s: 'Normas FRIEND (Kaminsky & Myers); classes Weber & Janicki.' },
    rer: { t: 'RER / razão de trocas (VCO₂/VO₂)', w: 'Diz de onde vem a energia no momento: perto de 0,80 você queima mais gordura; acima de 1,0, quase só carboidrato. Em repouso o normal é ~0,80 — valores muito acima disso indicam erro de calibração do aparelho.', f: 'RER = VCO₂ ÷ VO₂. Acima de 1,10 não serve para cálculo de substrato.', s: 'Fisiologia do exercício (Wasserman; Jeukendrup & Wallis 2005).' },
    lt1: { t: 'LV1 · limiar aeróbio (LT1 / VT1)', w: 'A intensidade em que o corpo começa a acelerar o metabolismo do carboidrato e o lactato sobe acima do repouso. É o teto do treino fácil (Z2) e o piso do trabalho de base.', f: 'Identificado por gases (VT1) ou DFA-α1 = 0,75.', s: 'Skinner & McLellan 1980; Seiler (modelo trifásico).' },
    lt2: { t: 'LV2 · limiar anaeróbio (LT2 / VT2)', w: 'O ponto de virada em que o lactato passa a acumular mais rápido do que o corpo limpa. Acima dele você não sustenta por muito tempo. Ancora o limite de prova longa e o FTP.', f: 'Ponto de compensação respiratória, ou DFA-α1 = 0,50.', s: 'Skinner & McLellan 1980; modelo trifásico de Seiler.' },
    dfa: { t: 'DFA-α1 (HRV)', w: 'Um índice da variabilidade dos seus batimentos que cai de forma previsível conforme o esforço sobe. Permite estimar os limiares no campo, sem coleta de lactato — só com o cinta de FC.', f: 'α1 ≈ 0,75 marca o LV1; α1 ≈ 0,50 marca o LV2.', s: 'Rogers et al. 2021; Gronwald et al. (detrended fluctuation analysis).' },
    pulseo2: { t: 'Pulso de O₂', w: 'Oxigênio entregue por batimento do coração — um espelho do volume de sangue bombeado a cada batida. Subir bem no esforço é sinal de bom motor central.', f: 'Pulso O₂ = VO₂ ÷ FC.', s: 'CPET — Wasserman & Hansen.' },
    oues: { t: 'OUES', w: 'Mede a eficiência com que você usa o oxigênio que respira. Útil porque é confiável mesmo sem ir até a exaustão máxima.', f: 'Inclinação de VO₂ vs log(VE).', s: 'Baba et al. 1996.' },
    vevco2: { t: 'VE/VCO₂ slope', w: 'Quanto ar você precisa mover para eliminar o CO₂ produzido. Quanto menor, mais eficiente a ventilação. Valores altos indicam ineficiência respiratória.', f: 'Inclinação de VE vs VCO₂. Bom < 30.', s: 'CPET — Wasserman.' },

    // ---------- zonas ----------
    zones: { t: 'Zonas de treino (modelo trifásico)', w: 'Cinco faixas ancoradas nos seus dois limiares (LV1 e LV2), não em percentuais genéricos de FC máxima. Cada zona tem um propósito fisiológico diferente.', f: 'Z1/Z2 abaixo do LV1 · Z3 entre limiares · Z4/Z5 acima do LV2.', s: 'Skinner & McLellan; Seiler (distribuição polarizada).' },
    decoupling: { t: 'Decoupling Pw:Hr (Pa:Hr)', w: 'Mede se, com a fadiga, sua frequência cardíaca "descola" da potência/pace — ou seja, o mesmo esforço passa a custar mais batimentos. Pouco descolamento = boa resistência aeróbica (durabilidade).', f: 'Variação % FC÷potência entre 1ª e 2ª metade. Bom < 5%.', s: 'Friel; Coggan (aerobic decoupling).' },

    // ---------- energia & combustível ----------
    fatmax: { t: 'FatMax', w: 'A intensidade em que você queima gordura na maior taxa. É a base do treino longo e da "economia" de glicogênio — quanto mais alto o FatMax, mais longe você vai poupando o carboidrato.', f: 'Pico da curva de oxidação de gordura ao longo dos estágios.', s: 'Achten & Jeukendrup 2004.' },
    carbmax: { t: 'CarbMax', w: 'A maior taxa de queima de carboidrato registrada no seu teste — o "motor de cima", quando você força. Mostra o quanto você depende do carbo nas intensidades altas.', f: 'Pico da curva de oxidação de CHO ao longo dos estágios.', s: 'Jeukendrup & Wallis 2005.' },
    substrate: { t: 'Substrato (gordura vs carbo)', w: 'A divisão da energia entre gordura e carboidrato em cada intensidade, calculada a partir dos gases respiratórios (VO₂ e VCO₂) medidos no teste.', f: 'Gordura g/min = 1,695·VO₂ − 1,701·VCO₂ · Carbo g/min = 4,344·VCO₂ − 3,061·VO₂ (VO₂/VCO₂ em L/min).', s: 'Jeukendrup & Wallis 2005 (oxidação de substratos).' },
    energy: { t: 'Gasto energético (kcal/h)', w: 'Quantas calorias por hora você gasta em cada zona, a partir do oxigênio e do CO₂ medidos. É a base para dimensionar o quanto repor.', f: 'kcal/min = 3,941·VO₂ + 1,106·VCO₂ (Weir).', s: 'Weir 1949 (calorimetria indireta).' },
    fuelplan: { t: 'Plano de combustível da prova', w: 'O alvo de carboidrato por hora para a sua prova. A lógica: repor o que você queima, respeitando o teto de absorção do intestino. O glicogênio guardado cobre a diferença — e se não cobrir até o fim, é risco de "muro".', f: 'Repor = min(queima de carbo/h, teto). Glicogênio cobre a lacuna restante.', s: 'ACSM/Burke; Jeukendrup 2014 (fueling for the work required).' },
    glycogen: { t: 'Glicogênio', w: 'O carboidrato guardado no músculo e no fígado — seu tanque-reserva. Acaba em prova longa ou intensa; por isso a reposição importa. Pode ser ajustado se você fez carga de carbo.', f: 'Estimativa ~6 g por kg de peso (até ~8 g/kg com supercompensação).', s: 'Bergström & Hultman; revisão de Burke.' },
    gutceiling: { t: 'Teto do intestino (absorção)', w: 'O máximo de carboidrato por hora que o seu intestino consegue absorver. Acima disso, o resto só causa desconforto. O intestino é treinável: dá para elevar o teto com prática.', f: '~60 g/h só glicose; ~90 g/h com mistura glicose:frutose 2:1; até 120 g/h com gut training.', s: 'Jeukendrup 2010; Cox et al. 2010 (gut training).' },
    glufru: { t: 'Mistura glicose:frutose', w: 'Usar dois açúcares que entram por "portas" diferentes no intestino permite absorver mais carbo por hora do que glicose sozinha. Por isso provas longas pedem a mistura.', f: 'Proporção ~2:1 (glicose:frutose) acima de 60 g/h.', s: 'Jeukendrup 2010 (multiple transportable carbohydrates).' },

    // ---------- composição ----------
    phaseangle: { t: 'Ângulo de fase', w: 'Um indicador de bioimpedância ligado à integridade e hidratação das células. Valores mais altos costumam acompanhar boa massa muscular e recuperação.', f: 'Relação entre resistência e reatância (graus).', s: 'Bioimpedância — Lukaski.' },
    bmr: { t: 'Taxa metabólica basal (TMB)', w: 'As calorias que o corpo gasta em repouso absoluto só para se manter vivo. Base para dimensionar a necessidade energética diária.', f: 'Medida (bioimpedância) ou estimada (Cunningham: 500 + 22·massa magra).', s: 'Cunningham 1980.' },
    aec: { t: 'AEC · água extra/intracelular', w: 'A proporção entre a água por fora e por dentro das células. Desequilíbrio (muita água extracelular) pode sinalizar inflamação ou recuperação incompleta.', f: 'Água extracelular ÷ água corporal total.', s: 'Bioimpedância segmentar.' },

    // ---------- força / pisada ----------
    energyreturn: { t: 'Retorno de energia (tênis)', w: 'O quanto a espuma/placa do tênis devolve da energia que você aplica a cada passada. Mais retorno tende a melhorar a economia de corrida.', f: '% de energia restituída no impacto.', s: 'Hoogkamer et al. 2018 (Nike Vaporfly).' },

    // ---------- bike / aero ----------
    cda: { t: 'CdA · arrasto aerodinâmico', w: 'O quanto você "corta" o ar — junta o tamanho da sua área frontal e o quão lisa ela é. Na bike, acima de ~40 km/h é o que mais custa watts. Menor CdA = mais rápido com a mesma potência.', f: 'Força de arrasto = ½·ρ·CdA·v². Unidade m².', s: 'Martin et al. 1998 (modelo de potência no ciclismo).' },
    ftp: { t: 'FTP · potência de limiar', w: 'A maior potência que você sustenta por cerca de uma hora — a âncora das zonas de bike e do pacing de prova.', f: 'FTP ≈ 95% da potência média de um teste de 20 min.', s: 'Allen & Coggan (Training and Racing with a Power Meter).' },

    // ---------- potência / carga / análise ----------
    np: { t: 'Potência normalizada (NP)', w: 'A potência que reflete o custo fisiológico real de um pedal com variações — pesa mais os picos do que a média simples. Em terreno ondulado, fica acima da potência média.', f: 'Média móvel de 30 s elevada à 4ª potência.', s: 'Allen & Coggan.' },
    intensityfactor: { t: 'IF · fator de intensidade', w: 'O quão forte foi a sessão em relação ao seu limiar de uma hora (FTP). 1,0 = na cara do FTP; prova longa fica bem abaixo.', f: 'IF = potência normalizada ÷ FTP.', s: 'Allen & Coggan.' },
    vi: { t: 'VI · índice de variabilidade', w: 'Mede o quão constante foi o seu ritmo. Perto de 1,0 = pedalada lisa e econômica; alto = muito acelera-e-freia, que custa caro numa prova.', f: 'VI = potência normalizada ÷ potência média.', s: 'Allen & Coggan.' },
    tss: { t: 'TSS · carga da sessão', w: 'Um número que junta intensidade e duração para dizer o "tamanho" do treino. Serve para dosar fadiga e montar a semana.', f: 'TSS = 100 equivale a 1 h no FTP (duração × IF²).', s: 'Allen & Coggan.' },
    ef: { t: 'EF · fator de eficiência', w: 'Quanto de potência (ou ritmo) você entrega por batimento do coração. Subir ao longo das semanas é sinal de motor aeróbio melhorando.', f: 'EF = potência normalizada (ou pace) ÷ FC média.', s: 'Friel (Training Bible).' },
    drift: { t: 'Drift cardíaco', w: 'A tendência de a frequência cardíaca subir mantendo o mesmo esforço, por calor, desidratação ou fadiga. Pouco drift = boa durabilidade aeróbica.', f: 'Variação % da relação esforço×FC entre as metades.', s: 'Coggan; Friel (aerobic decoupling).' },
    atl: { t: 'ATL · fadiga aguda', w: 'A média de curto prazo da sua carga de treino — o cansaço recente acumulado. Sobe rápido com treinos pesados e cai rápido no descanso.', f: 'Média exponencial da carga diária (~7 dias).', s: 'Modelo de Performance (PMC).' },

    // ---------- aero / bike ----------
    yaw: { t: 'Ângulo de guinada (yaw)', w: 'O ângulo real com que o ar bate em você — soma o vento da natureza com o vento que você cria ao se mover. É ele, não a direção do vento no mapa, que decide o arrasto.', f: 'Combina sua velocidade e o vetor do vento.', s: 'Aerodinâmica de ciclismo (túnel de vento).' },
    wind: { t: 'Vento de frente / través', w: 'O vento é separado em duas partes: a de frente (headwind), que te freia direto, e a de través (crosswind), que vira arrasto conforme a sua posição e rodas.', s: 'Modelo aerodinâmico (Martin et al. 1998).' },
    crr: { t: 'Crr · resistência ao rolamento', w: 'O atrito entre o pneu e o chão. Pneu, pressão e piso mudam esse número; em baixa velocidade ele pesa mais que a aerodinâmica.', f: 'Força de rolamento = Crr × peso × g.', s: 'Martin et al. 1998.' },

    // ---------- nutrição / hidratação ----------
    sweatrate: { t: 'Taxa de suor', w: 'Quantos litros por hora você perde de líquido — a base do plano de hidratação. Varia muito com calor e intensidade. O ideal é medir pesando antes e depois de um treino.', f: 'Litros/h = (peso perdido + líquido ingerido) ÷ tempo.', s: 'ACSM — Sawka et al. 2007.' },
    sodium: { t: 'Sódio do suor', w: 'A concentração de sal que você perde no suor (mg por litro). Muito individual: há quem seja "salgado". Em prova longa ou calor, repor sódio evita cãibra e queda de rendimento.', f: 'mg de sódio por litro de suor.', s: 'Baker et al. 2017.' },
    hydration: { t: 'Hidratação (líquido por hora)', w: 'Quanto líquido repor por hora — em geral parte da taxa de suor, não tudo. Beber demais sem sódio traz risco de hiponatremia, tão ruim quanto desidratar.', f: 'Repor ~70–90% da taxa de suor, com sódio junto.', s: 'ACSM; consenso de hiponatremia 2015.' },
    caffeine: { t: 'Cafeína', w: 'Um dos poucos suplementos com efeito comprovado em endurance: reduz a percepção de esforço. Dose e momento importam — e tolerância/intestino são individuais.', f: '~3–6 mg por kg, 45–60 min antes (ou fracionada).', s: 'ISSN — Guest et al. 2021.' },

    // ---------- tênis ----------
    drop: { t: 'Drop do tênis', w: 'A diferença de altura entre o calcanhar e a ponta do pé (mm). Drop baixo exige mais da panturrilha/aquiles; alto alivia. É preferência e adaptação, não "melhor ou pior".', f: 'Altura do calcanhar − altura do antepé (mm).', s: 'Biomecânica do calçado.' },
    stack: { t: 'Stack do tênis', w: 'A altura total de espuma entre o pé e o chão (mm). Mais stack = mais amortecimento em prova longa; menos = mais contato e estabilidade.', f: 'Espessura da entressola sob o calcanhar (mm).', s: 'Geometria do calçado.' },
    pacing: { t: 'Pacing (estratégia de ritmo)', w: 'Como distribuir o esforço ao longo da prova. Largar forte demais custa caro no fim; um ritmo parelho (ou levemente negativo) costuma render mais.', s: 'Fisiologia de prova (pacing negativo).' },

    // ---------- forma / carga ----------
    tsb: { t: 'TSB · forma (saldo de treino)', w: 'O equilíbrio entre o cansaço acumulado e a base de condicionamento. Positivo = descansado/afiado; muito negativo = fundo de bloco, cansado. Indica o quão "pronto" você chega na prova.', f: 'TSB = CTL − ATL (forma = base crônica − fadiga aguda).', s: 'Banister; modelo PMC (Coggan).' },
    ctl: { t: 'CTL · condicionamento (base)', w: 'A média de longo prazo da sua carga de treino — quanto "motor de resistência" você construiu. Sobe devagar, com consistência.', f: 'Média exponencial da carga diária (~42 dias).', s: 'Modelo de Performance (PMC).' },
    confidence: { t: 'Grau de confiança do dado', w: 'Cada número é rotulado pela origem: medido (veio do seu teste/arquivo), estimado (calculado dos seus dados) ou populacional (média de gente parecida com você, na falta do seu). Serve para você saber em quê confiar mais.', s: 'Doutrina LMAeroFit — transparência de fonte.' }
  };

  // ---- CSS injetado uma vez ----
  function injectCSS() {
    if (D.getElementById('lmah-css')) return;
    const s = D.createElement('style'); s.id = 'lmah-css';
    s.textContent = `
.lmah-btn{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-left:5px;vertical-align:middle;
  border-radius:50%;border:1px solid currentColor;background:transparent;color:#ff8a1c;opacity:.6;
  font:600 10px/1 'JetBrains Mono',monospace;cursor:pointer;padding:0;transition:opacity .15s,background .15s;flex:0 0 auto}
.lmah-btn:hover,.lmah-btn[aria-expanded="true"]{opacity:1;background:rgba(255,138,28,.14)}
.lmah-pop{position:fixed;z-index:9999;max-width:330px;width:calc(100vw - 28px);
  background:#15191e;border:1px solid rgba(255,255,255,.14);border-radius:12px;
  box-shadow:0 18px 50px -12px rgba(0,0,0,.7);padding:14px 15px;color:#e7e9ec;
  font-family:'Inter Tight',system-ui,sans-serif;font-size:13px;line-height:1.55;
  opacity:0;transform:translateY(4px);transition:opacity .14s,transform .14s;pointer-events:none}
.lmah-pop.on{opacity:1;transform:none;pointer-events:auto}
.lmah-pop h4{margin:0 0 6px;font-size:13.5px;font-weight:600;color:#fff;letter-spacing:-.01em}
.lmah-pop .w{color:#c9ccd2;margin:0 0 8px}
.lmah-pop .row{margin:7px 0 0;padding-top:7px;border-top:1px solid rgba(255,255,255,.09)}
.lmah-pop .lab{font:600 9.5px/1 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#8b9098;margin-bottom:3px}
.lmah-pop .f{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#ffb978}
.lmah-pop .s{font-size:11.5px;color:#9aa0a8;font-style:italic}
.lmah-pop .x{position:absolute;top:9px;right:11px;cursor:pointer;color:#777;font-size:15px;line-height:1;background:none;border:0;padding:2px}
.lmah-pop .x:hover{color:#fff}
@media print{.lmah-btn,.lmah-pop{display:none!important}}
`;
    D.head.appendChild(s);
  }

  let openPop = null;
  function closePop() { if (openPop) { openPop.pop.classList.remove('on'); openPop.btn.setAttribute('aria-expanded', 'false'); const p = openPop.pop; setTimeout(() => p.remove(), 160); openPop = null; } }

  function openFor(btn, key) {
    closePop();
    const e = REG[key]; if (!e) return;
    const pop = D.createElement('div'); pop.className = 'lmah-pop'; pop.setAttribute('data-html2canvas-ignore', 'true');
    let html = `<button class="x" aria-label="fechar">×</button><h4>${e.t || key}</h4>`;
    if (e.w) html += `<p class="w">${e.w}</p>`;
    if (e.f) html += `<div class="row"><div class="lab">Fórmula / modelo</div><div class="f">${e.f}</div></div>`;
    if (e.s) html += `<div class="row"><div class="lab">Base científica</div><div class="s">${e.s}</div></div>`;
    pop.innerHTML = html;
    D.body.appendChild(pop);
    // posiciona perto do botão, dentro da janela
    const r = btn.getBoundingClientRect(), pw = Math.min(330, window.innerWidth - 28), ph = pop.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - pw - 14); left = Math.max(14, left);
    let top = r.bottom + 8; if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    requestAnimationFrame(() => pop.classList.add('on'));
    btn.setAttribute('aria-expanded', 'true');
    pop.querySelector('.x').addEventListener('click', closePop);
    openPop = { pop, btn };
  }

  function attach(el) {
    if (el.dataset.lmahOn) return; el.dataset.lmahOn = '1';
    const key = el.getAttribute('data-help'); if (!REG[key]) return;
    const btn = D.createElement('button');
    btn.className = 'lmah-btn'; btn.type = 'button'; btn.textContent = '?';
    btn.setAttribute('aria-label', 'O que é ' + (REG[key].t || key) + '?');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('data-html2canvas-ignore', 'true');
    btn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); if (openPop && openPop.btn === btn) closePop(); else openFor(btn, key); });
    el.appendChild(btn);
  }

  function refresh() { injectCSS(); D.querySelectorAll('[data-help]').forEach(attach); }

  function register(obj) { Object.assign(REG, obj || {}); }

  // fecha ao clicar fora / rolar / ESC
  D.addEventListener('click', e => { if (openPop && !openPop.pop.contains(e.target) && e.target !== openPop.btn) closePop(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('scroll', closePop, true);

  // auto-religa quando a página injeta novos resultados (sem hook por ferramenta)
  let obs = null, t = null;
  function schedule() { clearTimeout(t); t = setTimeout(() => { if (obs) obs.disconnect(); refresh(); if (obs && D.body) obs.observe(D.body, { childList: true, subtree: true }); }, 150); }
  function start() { refresh(); if (window.MutationObserver && D.body) { obs = new MutationObserver(schedule); obs.observe(D.body, { childList: true, subtree: true }); } }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();

  root.LMA = root.LMA || {}; root.LMA.help = { refresh, register, REG };
})(window);
