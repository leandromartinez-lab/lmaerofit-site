// ============================================================
// LMAeroFit — Race Context (contexto da prova, compartilhado)
// localStorage-only, espelha o padrão do Athlete Profile.
// O atleta define a prova + condições UMA vez; as ferramentas leem daqui.
// ============================================================
(function(){
  const KEY = 'lma.race.v1';
  const DEFAULTS = {
    name: '',            // nome/apelido da prova
    dateISO: '',         // 'YYYY-MM-DD'
    cat: 'triatlo',      // categoria (LMA.modalidades)
    mod: 'oly',          // modalidade
    temp: 25,            // °C
    humidity: 65,        // %
    windKmh: 15,         // km/h
    windFromDeg: 180,    // graus (de onde vem)
    altitudeM: 50,       // m
    rainPct: 10,         // %
    set: false,          // true quando o atleta configurou
  };

  function load(){
    try{ const raw = localStorage.getItem(KEY); if(!raw) return {...DEFAULTS}; return {...DEFAULTS, ...JSON.parse(raw)}; }
    catch(e){ return {...DEFAULTS}; }
  }
  function save(r){
    try{ localStorage.setItem(KEY, JSON.stringify(r)); }catch(e){}
    document.dispatchEvent(new CustomEvent('lma:race', {detail:r}));
  }
  function patch(partial){ const next = {...load(), ...partial}; save(next); return next; }
  function isSet(){ return !!load().set; }

  function modLabel(r){
    r = r || load();
    const M = (window.LMA && LMA.modalidades) || {};
    const cat = M[r.cat]; const opt = cat && cat.opts[r.mod];
    return opt ? opt.label.split(' · ')[0] : (r.cat || '—');
  }

  // ---- Badge no nav (abre o modal) ----
  function mountBadge(targetEl){
    if(!targetEl) return;
    const r = load();
    const on = r.set;
    const dot = on ? '#ff8a1c' : '#4a525a';
    const label = on
      ? `${r.name ? r.name + ' · ' : ''}${modLabel(r)} · ${r.temp}°C`
      : 'Contexto da prova';
    targetEl.innerHTML = `
      <button id="lma-race-btn" style="display:inline-flex;align-items:center;gap:6px;font-family:var(--mono,monospace);font-size:10px;letter-spacing:.12em;padding:6px 10px;border:1px solid var(--line-strong,rgba(255,255,255,.14));border-radius:6px;color:var(--ink-soft,#b0b6bc);background:transparent;cursor:pointer;text-transform:uppercase">
        <span style="width:6px;height:6px;border-radius:50%;background:${dot};box-shadow:0 0 6px ${dot}"></span>◎ ${label}
      </button>`;
    targetEl.querySelector('#lma-race-btn').addEventListener('click', ()=>openModal());
  }

  function openModal(opts){
    opts = opts || {};
    const r = load();
    const M = (window.LMA && LMA.modalidades) || {};
    const catOpts = Object.entries(M).map(([k,v])=>`<option value="${k}" ${r.cat===k?'selected':''}>${v.label}</option>`).join('');
    const modOptsFor = (cat)=> Object.entries((M[cat]||{opts:{}}).opts).map(([k,v])=>`<option value="${k}" ${r.mod===k?'selected':''}>${v.label}</option>`).join('');

    const wrap = document.createElement('div');
    wrap.id = 'lma-race-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:0;animation:lmaFade .2s ease';
    wrap.innerHTML = `
      <style>
        @keyframes lmaFade{from{opacity:0}to{opacity:1}}
        @keyframes lmaSlide{from{transform:translateY(20px)}to{transform:translateY(0)}}
        #lma-race-modal .panel{background:#11151a;border:1px solid rgba(255,255,255,.14);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:520px;animation:lmaSlide .25s ease;max-height:90vh;overflow-y:auto}
        @media(min-width:600px){#lma-race-modal{align-items:center}#lma-race-modal .panel{border-radius:20px}}
        #lma-race-modal .eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.18em;color:#ff8a1c;text-transform:uppercase;margin-bottom:8px}
        #lma-race-modal h3{font-family:'Fraunces',serif;font-weight:400;font-style:italic;font-size:24px;color:#ecedef;margin-bottom:6px}
        #lma-race-modal .sub{font-size:12px;color:#7a8088;margin-bottom:20px;line-height:1.5}
        #lma-race-modal label{display:block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:#7a8088;text-transform:uppercase;margin:12px 0 5px}
        #lma-race-modal input,#lma-race-modal select{width:100%;background:#0a0c0e;border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:9px 11px;font-size:14px;color:#ecedef;font-family:inherit}
        #lma-race-modal input:focus,#lma-race-modal select:focus{outline:none;border-color:#ff8a1c}
        #lma-race-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        #lma-race-modal .actions{display:flex;gap:10px;margin-top:24px}
        #lma-race-modal button.act{flex:1;padding:12px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border:1px solid rgba(255,255,255,.14);background:transparent;color:#b0b6bc;cursor:pointer}
        #lma-race-modal button.primary{background:#ff8a1c;color:#0a0c0e;border-color:#ff8a1c;font-weight:600}
        #lma-race-modal button.clear{flex:0 0 auto;min-width:90px}
      </style>
      <div class="panel">
        <div class="eyebrow">◎ Contexto da prova</div>
        <h3>Prova &amp; condições</h3>
        <div class="sub">Preencha uma vez. A Nutrição e o Race Briefing abrem já com a prova e o clima daqui — sem redigitar. Salvo no seu navegador.</div>
        <div class="row">
          <div><label>Nome da prova</label><input id="r-name" type="text" value="${r.name}" placeholder="Ex.: 70.3 Floripa"></div>
          <div><label>Data</label><input id="r-date" type="date" value="${r.dateISO}"></div>
        </div>
        <div class="row">
          <div><label>Categoria</label><select id="r-cat">${catOpts}</select></div>
          <div><label>Modalidade</label><select id="r-mod">${modOptsFor(r.cat)}</select></div>
        </div>
        <div class="row">
          <div><label>Temperatura (°C)</label><input id="r-temp" type="number" value="${r.temp}"></div>
          <div><label>Umidade (%)</label><input id="r-hum" type="number" value="${r.humidity}"></div>
        </div>
        <div class="row">
          <div><label>Vento (km/h)</label><input id="r-wind" type="number" value="${r.windKmh}"></div>
          <div><label>Direção do vento (°)</label><input id="r-wdir" type="number" value="${r.windFromDeg}" placeholder="0-359"></div>
        </div>
        <div class="row">
          <div><label>Altitude (m)</label><input id="r-alt" type="number" value="${r.altitudeM}"></div>
          <div><label>Chuva esperada (%)</label><input id="r-rain" type="number" value="${r.rainPct}"></div>
        </div>
        <div class="actions">
          <button class="act clear" id="r-clear">Limpar</button>
          <button class="act" id="r-cancel">Cancelar</button>
          <button class="act primary" id="r-save">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = ()=>wrap.remove();
    wrap.addEventListener('click', e=>{ if(e.target===wrap) close(); });
    wrap.querySelector('#r-cancel').addEventListener('click', close);

    // categoria muda → repopular modalidades
    wrap.querySelector('#r-cat').addEventListener('change', e=>{
      const cat = e.target.value;
      wrap.querySelector('#r-mod').innerHTML = Object.entries((M[cat]||{opts:{}}).opts).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
    });

    wrap.querySelector('#r-clear').addEventListener('click', ()=>{
      save({...DEFAULTS}); close(); if(opts.onSave) opts.onSave(); else location.reload();
    });
    wrap.querySelector('#r-save').addEventListener('click', ()=>{
      const next = {
        name: wrap.querySelector('#r-name').value.trim(),
        dateISO: wrap.querySelector('#r-date').value,
        cat: wrap.querySelector('#r-cat').value,
        mod: wrap.querySelector('#r-mod').value,
        temp: +wrap.querySelector('#r-temp').value || DEFAULTS.temp,
        humidity: +wrap.querySelector('#r-hum').value || DEFAULTS.humidity,
        windKmh: +wrap.querySelector('#r-wind').value || 0,
        windFromDeg: ((+wrap.querySelector('#r-wdir').value % 360) + 360) % 360,
        altitudeM: +wrap.querySelector('#r-alt').value || 0,
        rainPct: +wrap.querySelector('#r-rain').value || 0,
        set: true,
      };
      save(next); close();
      if(opts.onSave) opts.onSave(); else location.reload();
    });
  }

  // Auto-mount do badge (procura #race-badge)
  function autoInit(){
    const slot = document.getElementById('race-badge');
    if(slot) mountBadge(slot);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
  else autoInit();

  window.LMA = window.LMA || {};
  window.LMA.race = { load, save, patch, isSet, openModal, mountBadge, modLabel };
})();
