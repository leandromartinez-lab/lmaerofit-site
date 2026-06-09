// ============================================================
// LMAeroFit — Athlete Profile (shared across tools)
// localStorage-only, no backend.
// ============================================================
(function(){
  const KEY = 'lma.profile.v1';
  const DEFAULTS = {
    name: '',
    sex: 'M',        // 'M' | 'F'
    age: 35,
    massKg: 72,
    heightCm: 175,
    ftpW: 280,
    runThrPace: 240, // s/km @ threshold (armazenado em SEGUNDOS; input é min:seg)
    swimCss: 95,     // s/100m (armazenado em SEGUNDOS; input é min:seg)
    sweatRate: 1.0,  // L/h base
    sweatNa: 800,    // mg/L
    altitudeM: 100,
    region: 'BR',
    // ----- Forma & carga (Performance Management) -----
    ctl: 0,            // Chronic Training Load (fitness) — TSS/dia 42d
    atl: 0,            // Acute Training Load (fatigue)  — TSS/dia 7d
    tsb: 0,            // Training Stress Balance (form) = CTL-ATL
    rampRate: 0,       // TSS/sem de incremento últimas 4 semanas
    weeklyHours: 0,    // h/sem média últimas 4 semanas
    weeklyTss: 0,      // TSS/sem média
    longestRunKm: 0,   // maior corrida últimas 8 semanas
    longestRideKm: 0,  // maior pedal últimas 8 semanas
    longestSwimKm: 0,  // maior nado últimas 8 semanas
    formUpdated: 0,    // timestamp ms do último update dos dados de forma
    onboarded: false,
  };

  // Campos mínimos exigidos para liberar o uso das ferramentas
  const REQUIRED = ['name','age','massKg','heightCm','ftpW'];
  function isComplete(p){
    p = p || load();
    if(!p.onboarded) return false;
    return REQUIRED.every(k => p[k] !== '' && p[k] != null && !(typeof p[k]==='number' && isNaN(p[k])));
  }

  // ----- Pace helpers: armazenamos em segundos, mas o atleta digita min:seg -----
  function secToPace(sec){
    if(sec == null || isNaN(sec)) return '';
    sec = Math.round(sec);
    return Math.floor(sec/60) + ':' + String(sec % 60).padStart(2,'0');
  }
  function paceToSec(str){
    if(str == null) return null;
    str = String(str).trim().replace(',', '.');
    if(str === '') return null;
    if(str.indexOf(':') >= 0){
      const parts = str.split(':');
      return Math.round((+parts[0] || 0) * 60 + (+parts[1] || 0));
    }
    const num = +str;
    if(isNaN(num)) return null;
    // sem ':' — heurística: valor pequeno = minutos (ex.: "4" = 4:00); grande = segundos
    return Math.round(num < 20 ? num * 60 : num);
  }


  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return {...DEFAULTS};
      return {...DEFAULTS, ...JSON.parse(raw)};
    }catch(e){ return {...DEFAULTS}; }
  }
  function save(p){
    try{ localStorage.setItem(KEY, JSON.stringify(p)); }catch(e){}
    document.dispatchEvent(new CustomEvent('lma:profile', {detail:p}));
  }
  function patch(partial){
    const cur = load();
    const next = {...cur, ...partial};
    save(next);
    return next;
  }

  // Mini badge that mounts in the nav and lets the user edit shared profile
  function mountBadge(targetEl){
    if(!targetEl) return;
    const p = load();
    const complete = isComplete(p);
    const dot = complete ? '#7ab814' : '#f4b942';
    const label = complete
      ? `${p.name ? p.name.split(' ')[0]+' · ' : ''}${p.massKg}kg · ${p.ftpW}W`
      : 'Preencher perfil';
    targetEl.innerHTML = `
      <button id="lma-prof-btn" style="display:inline-flex;align-items:center;gap:6px;font-family:var(--mono,monospace);font-size:10px;letter-spacing:.12em;padding:6px 10px;border:1px solid var(--line-strong,rgba(255,255,255,.14));border-radius:6px;color:var(--ink-soft,#b0b6bc);background:transparent;cursor:pointer;text-transform:uppercase">
        <span style="width:6px;height:6px;border-radius:50%;background:${dot};box-shadow:0 0 6px ${dot}"></span>${label}
      </button>
    `;
    targetEl.querySelector('#lma-prof-btn').addEventListener('click', ()=>openModal());
  }

  function openModal(opts){
    opts = opts || {};
    const required = !!opts.required;
    const p = load();
    const wrap = document.createElement('div');
    wrap.id = 'lma-prof-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:0;animation:lmaFade .2s ease';
    wrap.innerHTML = `
      <style>
        @keyframes lmaFade{from{opacity:0}to{opacity:1}}
        @keyframes lmaSlide{from{transform:translateY(20px)}to{transform:translateY(0)}}
        #lma-prof-modal .panel{background:#11151a;border:1px solid rgba(255,255,255,.14);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:520px;animation:lmaSlide .25s ease;max-height:90vh;overflow-y:auto}
        @media(min-width:600px){#lma-prof-modal{align-items:center}#lma-prof-modal .panel{border-radius:20px;margin-bottom:0}}
        #lma-prof-modal .eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.18em;color:#ff8a1c;text-transform:uppercase;margin-bottom:8px}
        #lma-prof-modal h3{font-family:'Fraunces',serif;font-weight:400;font-style:italic;font-size:24px;color:#ecedef;margin-bottom:6px}
        #lma-prof-modal .sub{font-size:12px;color:#7a8088;margin-bottom:20px;line-height:1.5}
        #lma-prof-modal label{display:block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:#7a8088;text-transform:uppercase;margin:12px 0 5px}
        #lma-prof-modal label .req{color:#ff8a1c;margin-left:3px}
        #lma-prof-modal input,#lma-prof-modal select{width:100%;background:#0a0c0e;border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:9px 11px;font-size:14px;color:#ecedef;font-family:inherit}
        #lma-prof-modal input:focus,#lma-prof-modal select:focus{outline:none;border-color:#ff8a1c}
        #lma-prof-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        #lma-prof-modal .actions{display:flex;gap:10px;margin-top:24px}
        #lma-prof-modal button.act{flex:1;padding:12px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border:1px solid rgba(255,255,255,.14);background:transparent;color:#b0b6bc;cursor:pointer}
        #lma-prof-modal button.primary{background:#ff8a1c;color:#0a0c0e;border-color:#ff8a1c;font-weight:600}
        #lma-prof-modal .err{color:#e15a4f;font-size:11px;margin-top:8px;min-height:14px;font-family:'JetBrains Mono',monospace}
      </style>
      <div class="panel">
        ${required ? '<div class="eyebrow">◉ Configuração inicial · obrigatório</div>' : ''}
        <h3>Perfil do atleta</h3>
        <div class="sub">${required
          ? 'Antes de usar as ferramentas, preencha seus dados. Tudo fica salvo localmente no seu navegador e é reutilizado em todos os cálculos (aerodinâmica, fueling, debrief, etc.).'
          : 'Salvo no seu navegador. Usado por todas as ferramentas pra evitar redigitar dados.'}</div>
        <div class="row">
          <div><label>Nome <span class="req">*</span></label><input id="p-name" type="text" value="${p.name}" placeholder="Como prefere ser chamado"></div>
          <div><label>Sexo</label><select id="p-sex"><option value="M" ${p.sex==='M'?'selected':''}>Masculino</option><option value="F" ${p.sex==='F'?'selected':''}>Feminino</option></select></div>
        </div>
        <div class="row">
          <div><label>Idade <span class="req">*</span></label><input id="p-age" type="number" value="${p.age||''}"></div>
          <div><label>Peso kg <span class="req">*</span></label><input id="p-mass" type="number" step="0.1" value="${p.massKg||''}"></div>
        </div>
        <div class="row">
          <div><label>Altura cm <span class="req">*</span></label><input id="p-h" type="number" value="${p.heightCm||''}"></div>
          <div><label>FTP W <span class="req">*</span></label><input id="p-ftp" type="number" value="${p.ftpW||''}"></div>
        </div>
        <div class="row">
          <div><label>Limiar corrida (min/km)</label><input id="p-run" type="text" inputmode="numeric" value="${secToPace(p.runThrPace)}" placeholder="4:00"></div>
          <div><label>CSS natação (min/100m)</label><input id="p-swim" type="text" inputmode="numeric" value="${secToPace(p.swimCss)}" placeholder="1:35"></div>
        </div>
        <div class="row">
          <div><label>Taxa de suor (L/h)</label><input id="p-sw" type="number" step="0.05" value="${p.sweatRate}"></div>
          <div><label>Sódio no suor (mg/L)</label><input id="p-na" type="number" value="${p.sweatNa}"></div>
        </div>

        <div style="margin-top:18px;padding-top:14px;border-top:1px dashed rgba(255,255,255,.1)">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:#ff8a1c;text-transform:uppercase;margin-bottom:4px">◉ Forma & carga (opcional)</div>
          <div style="font-size:11px;color:#7a8088;line-height:1.5;margin-bottom:8px">Cole do TrainingPeaks / Intervals.icu / Strava. Usado pelo Race Briefing pra estimar desempenho na data da prova. Atualize a cada 7-14 dias.</div>
        </div>
        <div class="row">
          <div><label>CTL atual (fitness)</label><input id="p-ctl" type="number" step="1" value="${p.ctl||''}" placeholder="ex: 75"></div>
          <div><label>ATL atual (fadiga)</label><input id="p-atl" type="number" step="1" value="${p.atl||''}" placeholder="ex: 68"></div>
        </div>
        <div class="row">
          <div><label>TSB (forma = CTL-ATL)</label><input id="p-tsb" type="number" step="1" value="${p.tsb||''}" placeholder="auto"></div>
          <div><label>Ramp rate (TSS/sem)</label><input id="p-ramp" type="number" step="1" value="${p.rampRate||''}" placeholder="ex: 5"></div>
        </div>
        <div class="row">
          <div><label>Volume médio (h/sem)</label><input id="p-wh" type="number" step="0.5" value="${p.weeklyHours||''}" placeholder="ex: 10"></div>
          <div><label>TSS médio (TSS/sem)</label><input id="p-wtss" type="number" step="5" value="${p.weeklyTss||''}" placeholder="ex: 550"></div>
        </div>
        <div class="row">
          <div><label>Maior corrida 8s (km)</label><input id="p-lr" type="number" step="0.5" value="${p.longestRunKm||''}" placeholder="ex: 28"></div>
          <div><label>Maior pedal 8s (km)</label><input id="p-lb" type="number" step="1" value="${p.longestRideKm||''}" placeholder="ex: 120"></div>
        </div>
        <div class="row">
          <div><label>Maior nado 8s (km)</label><input id="p-ls" type="number" step="0.1" value="${p.longestSwimKm||''}" placeholder="ex: 3.0"></div>
          <div></div>
        </div>
        <div class="err" id="p-err"></div>
        <div class="actions">
          ${required ? '' : '<button class="act" id="p-cancel">Cancelar</button>'}
          <button class="act primary" id="p-save">${required ? 'Salvar e continuar' : 'Salvar'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    if(!required){
      wrap.addEventListener('click', (e)=>{ if(e.target===wrap) close(); });
      const cancelBtn = wrap.querySelector('#p-cancel');
      if(cancelBtn) cancelBtn.addEventListener('click', close);
    }
    wrap.querySelector('#p-save').addEventListener('click', ()=>{
      const cur = load();
      const ctl = +wrap.querySelector('#p-ctl').value || 0;
      const atl = +wrap.querySelector('#p-atl').value || 0;
      const tsbRaw = wrap.querySelector('#p-tsb').value;
      const tsb = tsbRaw === '' ? (ctl - atl) : +tsbRaw;
      const formChanged = (ctl !== cur.ctl) || (atl !== cur.atl) || (tsb !== cur.tsb);
      const next = {
        name: wrap.querySelector('#p-name').value.trim(),
        sex: wrap.querySelector('#p-sex').value,
        age: +wrap.querySelector('#p-age').value,
        massKg: +wrap.querySelector('#p-mass').value,
        heightCm: +wrap.querySelector('#p-h').value,
        ftpW: +wrap.querySelector('#p-ftp').value,
        runThrPace: paceToSec(wrap.querySelector('#p-run').value) || DEFAULTS.runThrPace,
        swimCss: paceToSec(wrap.querySelector('#p-swim').value) || DEFAULTS.swimCss,
        sweatRate: +wrap.querySelector('#p-sw').value || DEFAULTS.sweatRate,
        sweatNa: +wrap.querySelector('#p-na').value || DEFAULTS.sweatNa,
        ctl, atl, tsb,
        rampRate:   +wrap.querySelector('#p-ramp').value || 0,
        weeklyHours:+wrap.querySelector('#p-wh').value   || 0,
        weeklyTss:  +wrap.querySelector('#p-wtss').value || 0,
        longestRunKm: +wrap.querySelector('#p-lr').value || 0,
        longestRideKm:+wrap.querySelector('#p-lb').value || 0,
        longestSwimKm:+wrap.querySelector('#p-ls').value || 0,
        formUpdated: formChanged ? Date.now() : (cur.formUpdated || 0),
        onboarded: true,
      };
      const missing = [];
      if(!next.name) missing.push('Nome');
      if(!next.age) missing.push('Idade');
      if(!next.massKg) missing.push('Peso');
      if(!next.heightCm) missing.push('Altura');
      if(!next.ftpW) missing.push('FTP');
      if(missing.length){
        wrap.querySelector('#p-err').textContent = 'Preencha: ' + missing.join(', ');
        return;
      }
      patch(next);
      close();
      if(opts.onSave) opts.onSave();
      else location.reload();
    });
  }

  // Bloqueia o uso da ferramenta até o perfil estar completo
  function requireProfile(opts){
    if(isComplete()) return true;
    openModal({required:true, onSave: (opts && opts.onSave) || (()=>location.reload())});
    return false;
  }

  // Auto-init baseado em atributos no <body data-lma="tool|hub">
  function autoInit(){
    const body = document.body;
    if(!body) return;
    const mode = body.dataset.lma;
    const slot = document.getElementById('prof-badge') || document.getElementById('lma-prof-slot');
    if(slot) mountBadge(slot);
    if(mode === 'tool') requireProfile();
    if(mode === 'hub'){
      // Banner com seta apontando pro badge quando perfil incompleto
      if(!isComplete()){
        const banner = document.createElement('div');
        banner.id = 'lma-prof-hint';
        banner.innerHTML = `
          <style>
            #lma-prof-hint{position:fixed;top:64px;right:14px;z-index:90;max-width:280px;font-family:'JetBrains Mono',monospace;animation:lmaHintIn .4s ease}
            @keyframes lmaHintIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
            @keyframes lmaArrowBounce{0%,100%{transform:translateY(-4px)}50%{transform:translateY(2px)}}
            #lma-prof-hint .arrow{display:flex;justify-content:flex-end;margin-right:18px;color:#ff8a1c;animation:lmaArrowBounce 1.4s ease-in-out infinite;font-size:22px;line-height:1}
            #lma-prof-hint .box{background:linear-gradient(135deg,rgba(255,138,28,.18),rgba(255,138,28,.06));border:1px solid #ff8a1c;border-radius:10px;padding:12px 14px;color:#ecedef;font-size:11px;letter-spacing:.06em;line-height:1.5;box-shadow:0 8px 24px rgba(255,138,28,.18);position:relative}
            #lma-prof-hint .box strong{color:#ff8a1c;display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px}
            #lma-prof-hint .box button{margin-top:8px;width:100%;background:#ff8a1c;color:#0a0c0e;border:0;border-radius:6px;padding:7px;font-family:inherit;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;cursor:pointer}
            #lma-prof-hint .close{position:absolute;top:6px;right:8px;background:none;border:0;color:#7a8088;cursor:pointer;font-size:14px;padding:2px}
            @media(max-width:640px){#lma-prof-hint{top:60px;right:8px;left:8px;max-width:none}}
          </style>
          <div class="arrow">▲</div>
          <div class="box">
            <button class="close" aria-label="Fechar">×</button>
            <strong>◉ Antes de começar</strong>
            Preencha seu perfil de atleta. As ferramentas usam seus dados pra calcular tudo (CdA, fueling, pacing).
            <button id="lma-hint-open">Preencher perfil</button>
          </div>
        `;
        document.body.appendChild(banner);
        banner.querySelector('.close').addEventListener('click', ()=>banner.remove());
        banner.querySelector('#lma-hint-open').addEventListener('click', ()=>{ banner.remove(); openModal({required:false}); });
        document.addEventListener('lma:profile', ()=>{ if(isComplete()) banner.remove(); });
      }
      document.addEventListener('click', (e)=>{
        const a = e.target.closest('a[href]');
        if(!a) return;
        const href = a.getAttribute('href') || '';
        if(!/\.html(\?|#|$)/.test(href)) return;
        if(/index\.html/.test(href)) return;
        if(/^https?:/.test(href)) return;
        if(isComplete()) return;
        e.preventDefault();
        const target = a.href;
        openModal({required:true, onSave: ()=>{ window.location.href = target; }});
      }, true);
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
  else autoInit();

  // ============================================================
  // Catálogo compartilhado de MODALIDADES (usado por Fuel Lab,
  // Race Fueling, Race Briefing e outras ferramentas).
  // Tempos em minutos, baseados em atleta age-grouper médio.
  // ============================================================
  // Ordem dos segmentos: 'order' define a sequência cronológica real
  // (importante para Race Fueling ler do início ao fim da prova).
  const MODALIDADES = {
    triatlo: {
      label: 'Triatlo',
      opts: {
        'super-sprint': {label:'Super Sprint · 400m + 10km + 2.5km',  order:['swim','t1','bike','t2','run'], swim:8,  t1:2, bike:18,  t2:1, run:12,  dist:{swim:0.4,  bike:10,  run:2.5}},
        'sprint':       {label:'Sprint · 750m + 20km + 5km',          order:['swim','t1','bike','t2','run'], swim:12, t1:2, bike:35,  t2:2, run:24,  dist:{swim:0.75, bike:20,  run:5}},
        'oly':          {label:'Olímpico · 1.5km + 40km + 10km',      order:['swim','t1','bike','t2','run'], swim:28, t1:3, bike:68,  t2:2, run:42,  dist:{swim:1.5,  bike:40,  run:10}},
        't100':         {label:'T100 (PTO) · 2km + 80km + 18km',      order:['swim','t1','bike','t2','run'], swim:30, t1:4, bike:130, t2:3, run:80,  dist:{swim:2,    bike:80,  run:18}},
        '70.3':         {label:'Meio Ironman 70.3 · 1.9km + 90km + 21.1km', order:['swim','t1','bike','t2','run'], swim:35, t1:5, bike:160, t2:4, run:115, dist:{swim:1.9,  bike:90,  run:21.1}},
        'im':           {label:'Ironman · 3.8km + 180km + 42.2km',    order:['swim','t1','bike','t2','run'], swim:75, t1:8, bike:320, t2:6, run:230, dist:{swim:3.8,  bike:180, run:42.2}},
        'itu-long':     {label:'ITU Long Distance · 4km + 120km + 30km', order:['swim','t1','bike','t2','run'], swim:75, t1:8, bike:230, t2:6, run:170, dist:{swim:4,    bike:120, run:30}},
        'ultraman':     {label:'Ultraman (3 dias · 10/421/84)',       order:['swim','t1','bike','t2','run'], swim:240,t1:10,bike:780, t2:10,run:540, dist:{swim:10,   bike:421, run:84.4}},
      }
    },
    duatlo: {
      label: 'Duatlo',
      opts: {
        'super-sprint': {label:'Super Sprint · 2km + 8km + 1km',           order:['run1','t1','bike','t2','run'], swim:0, t1:1, bike:18,  t2:1, run1:10, run:5,   dist:{run1:2,  bike:8,  run:1}},
        'sprint':       {label:'Sprint · 5km + 20km + 2.5km',              order:['run1','t1','bike','t2','run'], swim:0, t1:2, bike:40,  t2:2, run1:24, run:12,  dist:{run1:5,  bike:20, run:2.5}},
        'standard':     {label:'Standard (olímpico) · 10km + 40km + 5km',  order:['run1','t1','bike','t2','run'], swim:0, t1:3, bike:75,  t2:2, run1:50, run:24,  dist:{run1:10, bike:40, run:5}},
        'powerman-mid': {label:'Powerman Middle · 10km + 60km + 10km',     order:['run1','t1','bike','t2','run'], swim:0, t1:4, bike:115, t2:3, run1:50, run:50,  dist:{run1:10, bike:60, run:10}},
        'powerman-long':{label:'Powerman Long · 10km + 150km + 30km',      order:['run1','t1','bike','t2','run'], swim:0, t1:5, bike:280, t2:5, run1:50, run:160, dist:{run1:10, bike:150,run:30}},
        'itu-long-du':  {label:'ITU Long Du · 10km + 60km + 10km',         order:['run1','t1','bike','t2','run'], swim:0, t1:4, bike:115, t2:3, run1:50, run:50,  dist:{run1:10, bike:60, run:10}},
      }
    },
    corrida: {
      label: 'Só corrida',
      opts: {
        '5k':    {label:'5 km',                    order:['run'], swim:0, bike:0, run:25,  dist:{run:5}},
        '10k':   {label:'10 km',                   order:['run'], swim:0, bike:0, run:52,  dist:{run:10}},
        '15k':   {label:'15 km',                   order:['run'], swim:0, bike:0, run:80,  dist:{run:15}},
        '10mi':  {label:'10 milhas (16.1 km)',     order:['run'], swim:0, bike:0, run:86,  dist:{run:16.1}},
        '21k':   {label:'Meia Maratona (21.1 km)', order:['run'], swim:0, bike:0, run:115, dist:{run:21.1}},
        '30k':   {label:'30 km',                   order:['run'], swim:0, bike:0, run:165, dist:{run:30}},
        '42k':   {label:'Maratona (42.2 km)',      order:['run'], swim:0, bike:0, run:240, dist:{run:42.2}},
        '50k':   {label:'Ultra 50 km',             order:['run'], swim:0, bike:0, run:330, dist:{run:50}},
        '80k':   {label:'Ultra 80 km',             order:['run'], swim:0, bike:0, run:600, dist:{run:80}},
        '100k':  {label:'Ultra 100 km',            order:['run'], swim:0, bike:0, run:780, dist:{run:100}},
        '160k':  {label:'Ultra 100 milhas (161 km)',order:['run'],swim:0, bike:0, run:1500,dist:{run:160.9}},
      }
    },
    bike: {
      label: 'Só ciclismo',
      opts: {
        'tt-10mi':{label:'TT 10 milhas (16.1 km)', order:['bike'], swim:0, bike:24,  run:0, dist:{bike:16.1}},
        'tt-40k': {label:'TT 40 km',               order:['bike'], swim:0, bike:60,  run:0, dist:{bike:40}},
        '80k':    {label:'Gran Fondo 80 km',       order:['bike'], swim:0, bike:140, run:0, dist:{bike:80}},
        '120k':   {label:'Gran Fondo 120 km',      order:['bike'], swim:0, bike:215, run:0, dist:{bike:120}},
        '160k':   {label:'Gran Fondo 160 km',      order:['bike'], swim:0, bike:300, run:0, dist:{bike:160}},
        '200k':   {label:'Audax / Brevet 200 km',  order:['bike'], swim:0, bike:420, run:0, dist:{bike:200}},
        '300k':   {label:'Brevet 300 km',          order:['bike'], swim:0, bike:660, run:0, dist:{bike:300}},
      }
    },
    natacao: {
      label: 'Só natação',
      opts: {
        '750':   {label:'750 m águas abertas',  order:['swim'], swim:13, bike:0, run:0, dist:{swim:0.75}},
        '1500':  {label:'1500 m águas abertas', order:['swim'], swim:25, bike:0, run:0, dist:{swim:1.5}},
        '3000':  {label:'3000 m águas abertas', order:['swim'], swim:52, bike:0, run:0, dist:{swim:3}},
        '3800':  {label:'3800 m águas abertas', order:['swim'], swim:65, bike:0, run:0, dist:{swim:3.8}},
        '5000':  {label:'5 km águas abertas',   order:['swim'], swim:85, bike:0, run:0, dist:{swim:5}},
        '10000': {label:'10 km águas abertas (Maratona FINA)', order:['swim'], swim:175,bike:0, run:0, dist:{swim:10}},
        '25000': {label:'25 km águas abertas',  order:['swim'], swim:450,bike:0, run:0, dist:{swim:25}},
      }
    },
  };

  // ============================================================
  // Form readiness — análise da forma do atleta para uma data alvo
  // Retorna {tsbProj, ctlProj, label, color, advice, stale, daysSince}
  // ============================================================
  function formReadiness(targetDateMs){
    const p = load();
    const now = Date.now();
    const target = targetDateMs || now;
    const daysToRace = Math.max(0, Math.round((target - now)/86400000));
    const updated = p.formUpdated || 0;
    const daysSince = updated ? Math.round((now - updated)/86400000) : 999;
    const stale = !updated || daysSince > 14;
    const hasData = (p.ctl > 0 || p.atl > 0);

    // Projeção simples assumindo manutenção (decay 42d/7d)
    // CTL_proj = CTL * exp(-d/42) + assumed daily TSS * (1-exp(-d/42))
    const dailyTss = (p.weeklyTss || 0) / 7;
    const ctlDecay = Math.exp(-daysToRace/42);
    const atlDecay = Math.exp(-daysToRace/7);
    const ctlProj = p.ctl * ctlDecay + dailyTss * 42 * (1 - ctlDecay);
    const atlProj = p.atl * atlDecay + dailyTss * 7  * (1 - atlDecay);
    const tsbProj = ctlProj - atlProj;

    let label='—', color='#7a8088', advice='Sem dados de forma. Preencha o perfil pra estimar.';
    if(hasData){
      if(tsbProj >= 15)      { label='Pico/Super-compensado'; color='#7ab814'; advice='Forma de pico. Risco de sub-recuperar carga; mantenha estímulos curtos de alta qualidade.'; }
      else if(tsbProj >= 5)  { label='Fresco · em forma';     color='#7ab814'; advice='TSB ideal pra prova A. Pacing pode ser agressivo no alvo.'; }
      else if(tsbProj >= -10){ label='Neutro · pronto';       color='#f4b942'; advice='Forma OK. Considere taper de 7-10 dias se possível.'; }
      else if(tsbProj >= -20){ label='Cansado · em carga';    color='#ff8a1c'; advice='Ainda em bloco de carga. Reduzir 25-35% TSS nos últimos 10d.'; }
      else                   { label='Fadigado · risco alto'; color='#e15a4f'; advice='TSB muito negativo. Performance comprometida em ≈3-5%. Considere taper agressivo.'; }
    }
    return {hasData, stale, daysSince, daysToRace, ctlProj, atlProj, tsbProj, label, color, advice};
  }

  window.LMA = window.LMA || {};
  window.LMA.profile = { load, save, patch, mountBadge, openModal, isComplete, requireProfile, formReadiness, secToPace, paceToSec };
  window.LMA.modalidades = MODALIDADES;
})();
