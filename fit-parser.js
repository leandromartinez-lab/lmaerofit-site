/* ============================================================
 * LMAeroFit · assets/fit-parser.js
 * Decoder de arquivos .FIT (Garmin / ANT+) em JS puro, sem dependências.
 * Validado contra o encoder oficial Garmin FIT SDK.
 * Expõe window.LMA.fit.parseFIT(arrayBuffer).
 *
 * fit.records -> [{ timestamp:Date, lat, lng, altitude, distance,
 *                   speed, power, heartRate, cadence, temperature }]
 * fit.sessions / fit.laps / fit.fileId / fit.sport
 * ============================================================*/
(function (root) {
  'use strict';
  const FIT_EPOCH_MS = 631065600 * 1000;
  const SC_TO_DEG = 180 / Math.pow(2, 31);

  const BASE_TYPES = {
    0x00:{name:'enum',size:1,read:(v,o)=>v.getUint8(o),invalid:0xFF},
    0x01:{name:'sint8',size:1,read:(v,o)=>v.getInt8(o),invalid:0x7F},
    0x02:{name:'uint8',size:1,read:(v,o)=>v.getUint8(o),invalid:0xFF},
    0x83:{name:'sint16',size:2,read:(v,o,le)=>v.getInt16(o,le),invalid:0x7FFF},
    0x84:{name:'uint16',size:2,read:(v,o,le)=>v.getUint16(o,le),invalid:0xFFFF},
    0x85:{name:'sint32',size:4,read:(v,o,le)=>v.getInt32(o,le),invalid:0x7FFFFFFF},
    0x86:{name:'uint32',size:4,read:(v,o,le)=>v.getUint32(o,le),invalid:0xFFFFFFFF},
    0x07:{name:'string',size:1,read:(v,o)=>v.getUint8(o),invalid:0x00},
    0x88:{name:'float32',size:4,read:(v,o,le)=>v.getFloat32(o,le),invalid:0xFFFFFFFF},
    0x89:{name:'float64',size:8,read:(v,o,le)=>v.getFloat64(o,le),invalid:0xFFFFFFFFFFFFFFFF},
    0x0A:{name:'uint8z',size:1,read:(v,o)=>v.getUint8(o),invalid:0x00},
    0x8B:{name:'uint16z',size:2,read:(v,o,le)=>v.getUint16(o,le),invalid:0x0000},
    0x8C:{name:'uint32z',size:4,read:(v,o,le)=>v.getUint32(o,le),invalid:0x00000000},
    0x0D:{name:'byte',size:1,read:(v,o)=>v.getUint8(o),invalid:0xFF},
    0x8E:{name:'sint64',size:8,read:(v,o,le)=>readU64(v,o,le),invalid:null},
    0x8F:{name:'uint64',size:8,read:(v,o,le)=>readU64(v,o,le),invalid:null},
    0x90:{name:'uint64z',size:8,read:(v,o,le)=>readU64(v,o,le),invalid:0},
  };
  function readU64(v,o,le){const a=v.getUint32(o,le),b=v.getUint32(o+4,le);return le?b*4294967296+a:a*4294967296+b;}

  const MSG = { FILE_ID:0, RECORD:20, LAP:19, SESSION:18 };
  const RECORD_FIELDS = {
    253:{key:'timestamp'},
    0:{key:'lat',transform:r=>r*SC_TO_DEG}, 1:{key:'lng',transform:r=>r*SC_TO_DEG},
    2:{key:'altitude',scale:5,offset:500}, 78:{key:'altitude',scale:5,offset:500},
    3:{key:'heartRate'}, 4:{key:'cadence'},
    5:{key:'distance',scale:100}, 6:{key:'speed',scale:1000}, 73:{key:'speed',scale:1000},
    7:{key:'power'}, 13:{key:'temperature'}, 9:{key:'grade',scale:100},
  };
  const SESSION_FIELDS = {
    253:{key:'timestamp'}, 5:{key:'sport'}, 6:{key:'subSport'},
    7:{key:'totalElapsedTime',scale:1000}, 8:{key:'totalTimerTime',scale:1000},
    9:{key:'totalDistance',scale:100}, 11:{key:'totalCalories'},
    14:{key:'avgSpeed',scale:1000}, 15:{key:'maxSpeed',scale:1000},
    16:{key:'avgHeartRate'}, 17:{key:'maxHeartRate'}, 18:{key:'avgCadence'},
    20:{key:'avgPower'}, 21:{key:'maxPower'},
  };
  const LAP_FIELDS = { 253:{key:'timestamp'}, 7:{key:'totalElapsedTime',scale:1000},
    9:{key:'totalDistance',scale:100}, 13:{key:'avgSpeed',scale:1000}, 15:{key:'avgHeartRate'}, 19:{key:'avgPower'} };
  const SPORT_NAMES = {0:'generic',1:'running',2:'cycling',5:'swimming',11:'multisport',17:'triathlon',18:'duathlon',254:'all'};

  function parseFIT(buffer){
    const bytes = buffer instanceof ArrayBuffer ? buffer : (buffer.buffer || buffer);
    const view = new DataView(bytes);
    const len = view.byteLength;
    if (len < 14) throw new Error('Arquivo muito pequeno para ser um FIT válido.');
    const headerSize = view.getUint8(0);
    const sig = String.fromCharCode(view.getUint8(8),view.getUint8(9),view.getUint8(10),view.getUint8(11));
    if (sig !== '.FIT') throw new Error('Assinatura .FIT não encontrada.');
    const dataSize = view.getUint32(4,true);
    let pos = headerSize;
    const dataEnd = Math.min(headerSize + dataSize, len - 2);
    const localDefs = {};
    const out = { records:[], sessions:[], laps:[], fileId:null,
      protocolVersion:view.getUint8(1), profileVersion:view.getUint16(2,true) };
    let lastTimestamp = 0;

    while (pos < dataEnd) {
      const recHeader = view.getUint8(pos); pos += 1;
      if (recHeader & 0x80) {
        const localType = (recHeader >> 5) & 0x03;
        const timeOffset = recHeader & 0x1F;
        const def = localDefs[localType]; if (!def) break;
        let ts;
        if (timeOffset >= (lastTimestamp & 0x1F)) ts = (lastTimestamp & ~0x1F) + timeOffset;
        else ts = (lastTimestamp & ~0x1F) + timeOffset + 0x20;
        lastTimestamp = ts;
        pos = readDataMessage(view, pos, def, out, ts);
      } else if (recHeader & 0x40) {
        const localType = recHeader & 0x0F;
        const hasDevData = (recHeader & 0x20) !== 0;
        pos += 1;
        const arch = view.getUint8(pos); pos += 1;
        const le = arch === 0;
        const globalNum = view.getUint16(pos, le); pos += 2;
        const numFields = view.getUint8(pos); pos += 1;
        const fields = [];
        for (let i = 0; i < numFields; i++) {
          fields.push({ fdn:view.getUint8(pos), size:view.getUint8(pos+1), baseType:view.getUint8(pos+2) });
          pos += 3;
        }
        if (hasDevData) {
          const numDev = view.getUint8(pos); pos += 1;
          for (let i = 0; i < numDev; i++) { fields.push({ fdn:-1, size:view.getUint8(pos+1), baseType:0x0D, dev:true }); pos += 3; }
        }
        localDefs[localType] = { globalNum, le, fields };
      } else {
        const def = localDefs[recHeader & 0x0F]; if (!def) break;
        pos = readDataMessage(view, pos, def, out, null);
      }
    }
    out.records.sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
    out.sport = out.sessions[0] ? (SPORT_NAMES[out.sessions[0].sport]||'generic') : null;
    return out;
  }

  function readDataMessage(view, pos, def, out, forcedTimestamp){
    const le = def.le, raw = {}; let p = pos;
    for (const f of def.fields) {
      const bt = BASE_TYPES[f.baseType] || BASE_TYPES[0x0D];
      if (bt.name === 'string') {
        let s = '';
        for (let i=0;i<f.size;i++){ const c=view.getUint8(p+i); if(c===0)break; s+=String.fromCharCode(c); }
        if (!f.dev && f.fdn>=0) raw[f.fdn]=s;
      } else if (f.size === bt.size) {
        const val = bt.read(view, p, le);
        if (!f.dev && f.fdn>=0 && val!==bt.invalid) raw[f.fdn]=val;
      } else if (f.size > bt.size && f.size % bt.size === 0) {
        let val=null;
        for (let i=0;i<f.size;i+=bt.size){ const c=bt.read(view,p+i,le); if(c!==bt.invalid){val=c;break;} }
        if (!f.dev && f.fdn>=0 && val!==null) raw[f.fdn]=val;
      }
      p += f.size;
    }
    routeMessage(def.globalNum, raw, out, forcedTimestamp);
    return p;
  }

  function applyFields(raw, map, forcedTimestamp){
    const o = {};
    for (const fdn in raw) {
      const spec = map[fdn]; if (!spec) continue;
      let v = raw[fdn];
      if (spec.transform) v = spec.transform(v);
      else if (spec.scale || spec.offset) v = v/(spec.scale||1) - (spec.offset||0);
      if (o[spec.key] === undefined) o[spec.key] = v;
    }
    if (forcedTimestamp != null && o.timestamp === undefined) o.timestamp = forcedTimestamp;
    return o;
  }

  function routeMessage(globalNum, raw, out, forcedTimestamp){
    if (globalNum === MSG.RECORD) {
      const r = applyFields(raw, RECORD_FIELDS, forcedTimestamp);
      if (r.timestamp != null) r.timestamp = new Date(FIT_EPOCH_MS + r.timestamp*1000);
      out.records.push(r);
    } else if (globalNum === MSG.SESSION) {
      const s = applyFields(raw, SESSION_FIELDS, forcedTimestamp);
      if (s.timestamp != null) s.timestamp = new Date(FIT_EPOCH_MS + s.timestamp*1000);
      out.sessions.push(s);
    } else if (globalNum === MSG.LAP) {
      const l = applyFields(raw, LAP_FIELDS, forcedTimestamp);
      if (l.timestamp != null) l.timestamp = new Date(FIT_EPOCH_MS + l.timestamp*1000);
      out.laps.push(l);
    } else if (globalNum === MSG.FILE_ID && !out.fileId) {
      out.fileId = { manufacturer:raw[1], product:raw[2], serial:raw[3],
        timeCreated: raw[4]!=null ? new Date(FIT_EPOCH_MS + raw[4]*1000) : null, type:raw[0] };
    }
  }

  // ---- helper p/ as ferramentas: converte FIT no shape de stream do site ----
  // Retorna { distKm, durSec, gainM, hr:[], pw:[], spd:[], startTime } compatível
  // com computeSegFromData() do Session Debrief.
  function fitToSeg(arrayBuffer){
    const fit = parseFIT(arrayBuffer);
    const recs = fit.records || [];
    if (!recs.length) return null;
    const hr = [], pw = [], spd = [];
    let prevAlt = null, gain = 0;
    recs.forEach(r=>{
      if (r.heartRate != null) hr.push(r.heartRate);
      if (r.power != null) pw.push(r.power);
      if (r.speed != null) spd.push(r.speed);
      if (r.altitude != null){ if (prevAlt!=null && r.altitude>prevAlt) gain += r.altitude-prevAlt; prevAlt = r.altitude; }
    });
    const lastDist = [...recs].reverse().find(r=>r.distance!=null);
    const distKm = lastDist ? lastDist.distance/1000 : 0;
    const ts = recs.map(r=>r.timestamp).filter(Boolean);
    let durSec = ts.length>1 ? (ts[ts.length-1]-ts[0])/1000 : recs.length;
    if (fit.sessions[0] && fit.sessions[0].totalElapsedTime) durSec = fit.sessions[0].totalElapsedTime;
    return { distKm, durSec, gainM:gain, hr, pw, spd, startTime: ts[0]?ts[0].getTime():null, records: recs, sport: fit.sport };
  }

  root.LMA = root.LMA || {};
  root.LMA.fit = { parseFIT, fitToSeg, SC_TO_DEG, FIT_EPOCH_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LMA.fit;
})(typeof self !== 'undefined' ? self : this);
