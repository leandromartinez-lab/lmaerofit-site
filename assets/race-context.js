// ============================================================
// LMAeroFit — Race Context (contexto da prova, compartilhado)
// localStorage-only, espelha o padrão do Athlete Profile.
// O atleta define a prova + condições UMA vez; as ferramentas leem daqui.
// Auto-preenche clima + altitude via Open-Meteo (ECMWF/ERA5), sem chave.
// ============================================================
(function(){
  const KEY = 'lma.race.v1';
  const DEFAULTS = {
    name: '',            // nome/apelido da prova
    dateISO: '',         // 'YYYY-MM-DD'
    startTime: '07:00',  // 'HH:MM' horário de largada (p/ vento time-aware)
    cat: 'triatlo',      // categoria (LMA.modalidades)
    mod: 'oly',          // modalidade
    temp: 25,            // °C
    humidity: 65,        // %
    windKmh: 15,         // km/h
    windFromDeg: 180,    // graus (de onde vem)
    altitudeM: 50,       // m
    rainPct: 10,         // %
    locName: '',         // local (cidade) geocodificado
    lat: null, lng: null,
    weatherSource: '',   // 'previsão ECMWF · X dias' | 'climatologia · média N anos'
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

  // ---------- Open-Meteo: geocoding + clima (roda no navegador) ----------
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
  function circMeanDeg(degs){
    if(!degs.length) return 0;
    let sx=0, sy=0; degs.forEach(d=>{const r=d*Math.PI/180; sx+=Math.cos(r); sy+=Math.sin(r);});
    return ((Math.round(Math.atan2(sy,sx)*180/Math.PI)) % 360 + 360) % 360;
  }
  async function geocode(name){
    const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt&format=json`;
    const j = await (await fetch(u)).json();
    if(!j.results || !j.results.length) throw new Error('Local não encontrado. Tente "Cidade, País".');
    const r = j.results[0];
    return { lat:r.latitude, lng:r.longitude, elevation:Math.round(r.elevation||0),
             label:[r.name, r.admin1, r.country].filter(Boolean).join(', ') };
  }
  async function fetchWeather(lat, lng, dateISO){
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(dateISO + 'T12:00:00');
    if(isNaN(target)) throw new Error('Data inválida.');
    const days = Math.round((target - today)/86400000);

    if(days >= -2 && days <= 15){
      // Previsão real (ECMWF) — janela de até ~16 dias
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`+
        `&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant`+
        `&hourly=relative_humidity_2m&start_date=${dateISO}&end_date=${dateISO}&timezone=auto&wind_speed_unit=kmh`;
      const j = await (await fetch(u)).json();
      if(!j.daily || !j.daily.time || !j.daily.time.length) throw new Error('Sem previsão para essa data.');
      const hum = (j.hourly && j.hourly.relative_humidity_2m) ? avg(j.hourly.relative_humidity_2m.filter(v=>v!=null)) : 65;
      return {
        temp: Math.round(j.daily.temperature_2m_max[0]),
        humidity: Math.round(hum),
        windKmh: Math.round(j.daily.wind_speed_10m_max[0]),
        windFromDeg: Math.round(j.daily.wind_direction_10m_dominant[0] || 0),
        source: `previsão ECMWF · ${days<=0?'hoje':'em '+days+' dias'}`,
      };
    }

    // Climatologia: média da mesma data nos últimos 5 anos (ERA5)
    const mmdd = dateISO.slice(5); // MM-DD
    const baseYear = target.getFullYear();
    const reqs = [];
    for(let k=1;k<=5;k++){
      const d = `${baseYear-k}-${mmdd}`;
      const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}`+
        `&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant`+
        `&hourly=relative_humidity_2m&start_date=${d}&end_date=${d}&timezone=auto&wind_speed_unit=kmh`;
      reqs.push(fetch(u).then(r=>r.json()).catch(()=>null));
    }
    const res = (await Promise.all(reqs)).filter(j=>j && j.daily && j.daily.time && j.daily.time.length);
    if(!res.length) throw new Error('Sem histórico para essa localização/data.');
    const temps=[], winds=[], dirs=[], hums=[];
    res.forEach(j=>{
      if(j.daily.temperature_2m_max[0]!=null) temps.push(j.daily.temperature_2m_max[0]);
      if(j.daily.wind_speed_10m_max[0]!=null) winds.push(j.daily.wind_speed_10m_max[0]);
      if(j.daily.wind_direction_10m_dominant[0]!=null) dirs.push(j.daily.wind_direction_10m_dominant[0]);
      if(j.hourly && j.hourly.relative_humidity_2m){ const h=avg(j.hourly.relative_humidity_2m.filter(v=>v!=null)); if(h) hums.push(h); }
    });
    return {
      temp: Math.round(avg(temps)),
      humidity: hums.length ? Math.round(avg(hums)) : 65,
      windKmh: Math.round(avg(winds)),
      windFromDeg: circMeanDeg(dirs),
      source: `climatologia · média ${res.length} anos`,
    };
  }

  // ---------- Vento hora a hora (p/ análise time-aware ao longo do percurso) ----------
  // Retorna [{hour:0-23, windKmh, windFromDeg}] para a data; usa a previsão ECMWF
  // (janela ~16 dias). Para datas fora da janela, lança erro e o chamador usa o vento único.
  async function fetchHourlyWind(lat, lng, dateISO){
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`+
      `&hourly=wind_speed_10m,wind_direction_10m&start_date=${dateISO}&end_date=${dateISO}&timezone=auto&wind_speed_unit=kmh`;
    const j = await (await fetch(u)).json();
    if(!j.hourly || !j.hourly.time || !j.hourly.time.length) throw new Error('Sem vento horário para essa data (fora da janela de previsão).');
    return j.hourly.time.map((t,i)=>({
      hour: +String(t).slice(11,13),
      windKmh: j.hourly.wind_speed_10m[i],
      windFromDeg: j.hourly.wind_direction_10m[i] || 0
    }));
  }

  // ---------- Badge no nav (abre o modal) ----------
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
        #lma-race-modal .geobtn{width:100%;margin-top:6px;padding:10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;border:1px solid #ff8a1c;background:rgba(255,138,28,.1);color:#ff8a1c;cursor:pointer}
        #lma-race-modal .geobtn:disabled{opacity:.6;cursor:default}
        #lma-race-modal .status{font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.5;color:#7a8088;margin-top:8px;min-height:16px}
        #lma-race-modal .auto-sep{margin:18px 0 4px;padding-top:14px;border-top:1px dashed rgba(255,255,255,.1);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:#7a8088;text-transform:uppercase}
      </style>
      <div class="panel">
        <div class="eyebrow">◎ Contexto da prova</div>
        <h3>Prova &amp; condições</h3>
        <div class="sub">Digite o local e a data e clique em <b style="color:#ff8a1c">Buscar clima</b>: eu preencho altitude, temperatura, umidade e vento automaticamente (previsão se a prova estiver perto, média histórica se estiver longe). Tudo editável. Salvo no seu navegador.</div>
        <div class="row">
          <div><label>Nome da prova</label><input id="r-name" type="text" value="${r.name}" placeholder="Ex.: 70.3 Floripa"></div>
          <div><label>Data</label><input id="r-date" type="date" value="${r.dateISO}"></div>
        </div>
        <div class="row">
          <div><label>Horário de largada</label><input id="r-start" type="time" value="${r.startTime||'07:00'}"></div>
          <div></div>
        </div>
        <label>Local (cidade, país)</label>
        <input id="r-loc" type="text" value="${r.locName||''}" placeholder="Ex.: Florianópolis, Brasil">
        <button type="button" class="geobtn" id="r-geo">🔍 Buscar clima e altitude</button>
        <div class="status" id="r-status"></div>

        <div class="auto-sep">Condições · preenchidas ou manuais</div>
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
    const Q = s => wrap.querySelector(s);
    wrap.dataset.lat = r.lat != null ? r.lat : '';
    wrap.dataset.lng = r.lng != null ? r.lng : '';
    wrap.dataset.wsource = r.weatherSource || '';

    wrap.addEventListener('click', e=>{ if(e.target===wrap) close(); });
    Q('#r-cancel').addEventListener('click', close);

    Q('#r-cat').addEventListener('change', e=>{
      const cat = e.target.value;
      Q('#r-mod').innerHTML = Object.entries((M[cat]||{opts:{}}).opts).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
    });

    // ---- Buscar clima + altitude ----
    Q('#r-geo').addEventListener('click', async ()=>{
      const loc = Q('#r-loc').value.trim();
      const date = Q('#r-date').value;
      const st = Q('#r-status'), btn = Q('#r-geo');
      if(!loc){ st.textContent='⚠ Digite o local (cidade, país).'; st.style.color='#f4b942'; return; }
      if(!date){ st.textContent='⚠ Escolha a data da prova primeiro.'; st.style.color='#f4b942'; return; }
      btn.disabled = true; st.textContent='◌ Buscando localização e clima…'; st.style.color='#7a8088';
      try{
        const geo = await geocode(loc);
        Q('#r-loc').value = geo.label;
        Q('#r-alt').value = geo.elevation;
        wrap.dataset.lat = geo.lat; wrap.dataset.lng = geo.lng;
        const w = await fetchWeather(geo.lat, geo.lng, date);
        Q('#r-temp').value = w.temp;
        Q('#r-hum').value  = w.humidity;
        Q('#r-wind').value = w.windKmh;
        Q('#r-wdir').value = w.windFromDeg;
        wrap.dataset.wsource = w.source;
        st.innerHTML = `✓ ${geo.label} · alt ${geo.elevation} m<br><b style="color:#ff8a1c">${w.source}</b>: ${w.temp}°C · ${w.humidity}% UR · vento ${w.windKmh} km/h (${w.windFromDeg}°). Ajuste se quiser.`;
        st.style.color='#7ab814';
      }catch(e){
        st.textContent = '⚠ ' + (e.message || 'Não consegui buscar agora. Preencha à mão.');
        st.style.color='#e15a4f';
      }finally{ btn.disabled = false; }
    });

    Q('#r-clear').addEventListener('click', ()=>{
      save({...DEFAULTS}); close(); if(opts.onSave) opts.onSave(); else location.reload();
    });
    Q('#r-save').addEventListener('click', ()=>{
      const next = {
        name: Q('#r-name').value.trim(),
        dateISO: Q('#r-date').value,
        startTime: Q('#r-start').value || '07:00',
        cat: Q('#r-cat').value,
        mod: Q('#r-mod').value,
        temp: +Q('#r-temp').value || DEFAULTS.temp,
        humidity: +Q('#r-hum').value || DEFAULTS.humidity,
        windKmh: +Q('#r-wind').value || 0,
        windFromDeg: ((+Q('#r-wdir').value % 360) + 360) % 360,
        altitudeM: +Q('#r-alt').value || 0,
        rainPct: +Q('#r-rain').value || 0,
        locName: Q('#r-loc').value.trim(),
        lat: wrap.dataset.lat !== '' ? +wrap.dataset.lat : null,
        lng: wrap.dataset.lng !== '' ? +wrap.dataset.lng : null,
        weatherSource: wrap.dataset.wsource || '',
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
  window.LMA.race = { load, save, patch, isSet, openModal, mountBadge, modLabel, geocode, fetchWeather, fetchHourlyWind };
})();
