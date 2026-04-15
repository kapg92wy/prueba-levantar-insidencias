/* ═══════════════════════════════════════════════
   dashboard.js — Dashboard operativo
   Lee datos del snapshot de Supabase (cp_dashboard_snapshot)
   y renderiza KPIs, gráficas, Top 10, tablas BD.
   ═══════════════════════════════════════════════ */

let charts = {};
let D = { kpi:{}, incidencias:[], venta_alerta:[], romel:[], by_region:[],
          nombre_count:{}, clasif_count:{}, dias_ranges:{}, top_priority:[],
          semana_cols_last4:[], fecha_actualizacion:'Sin actualizar' };
let incF = [], prioF = [], cineF = [];
let incPg = 1, prioPg = 1;
const PS = 50;

const CHARTOPT = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#1f2b45',titleColor:'#e8eaf0',bodyColor:'#8b95ab',borderColor:'#2a3550',borderWidth:1}},
  scales:{ x:{ticks:{color:'#8b95ab',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}},
           y:{ticks:{color:'#8b95ab',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}} }
};

// Cargar snapshot desde Supabase al iniciar
async function cargarDashboardSnapshot() {
  try {
    const row = await DB.getDashboard();
    if (row && row.datos && row.datos.kpi) {
      Object.assign(D, row.datos);
      const fb = document.getElementById('fechaBadge');
      if (fb && D.fecha_actualizacion) { fb.textContent = D.fecha_actualizacion; fb.style.display='block'; }
    }
  } catch(e) { console.warn('[dashboard] No hay snapshot aún:', e.message); }
}

/* ══════════════════════════════════════════════
   RESUMEN GENERAL
══════════════════════════════════════════════ */
function renderDashboard(container) {
  const k = D.kpi;
  container.innerHTML =
    '<div class="kgrid">'
    + kcard('gold',   'Máquinas en Ruta',          k.maquinas_en_ruta||0,            'Total activas en Cinépolis')
    + kcard('red',    'Incidencias Abiertas',       k.total_incidencias_abiertas||0,  'Status: Abierta')
    + kcard('red',    'Urgentes',                   k.urgentes||0,                    'Atención inmediata')
    + kcard('orange', 'Back Order',                 k.back_order||0,                  'En espera de refacción')
    + kcard('purple', '+90 Días Abiertas',          k.mas_90_dias||0,                 'Críticas por tiempo')
    + kcard('orange', 'Alerta Venta Cero',          k.alertas_venta_cero||0,          '2+ semanas sin venta')
    + kcard('cyan',   'Reporte Cinépolis',          k.romel_total||0,                 'Máquinas reportadas')
    + kcard('red',    'Sin Incidencia Nuestra',     k.romel_no_en_sistema||0,         'Cinépolis reportó, nosotros no')
    + '</div>'
    + '<div class="cgrid">'
    + '<div class="ccard"><div class="ctitle">Incidencias por Región</div><div class="csub">Total abiertas por región</div><div class="cwrap"><canvas id="cRegion"></canvas></div></div>'
    + '<div class="ccard"><div class="ctitle">Tipo de Incidencia</div><div class="csub">Distribución por nombre</div><div class="cwrap"><canvas id="cTipo"></canvas></div></div>'
    + '<div class="ccard"><div class="ctitle">Antigüedad de Incidencias</div><div class="csub">Días desde apertura</div><div class="cwrap"><canvas id="cDias"></canvas></div></div>'
    + '</div>'
    + '<div class="cgrid2">'
    + '<div class="ccard"><div class="ctitle">Clasificación</div><div class="csub">Estado de diagnóstico</div><div class="cwrap2"><canvas id="cClasif"></canvas></div></div>'
    + '<div class="ccard"><div class="ctitle">Urgentes por Región</div><div class="csub">Solo incidencias urgentes</div><div class="cwrap2"><canvas id="cUrg"></canvas></div></div>'
    + '</div>'
    + '<div class="top10-grid">'
    + '<div class="ccard"><div class="ctitle">🏆 Top 10 — Mayor Venta en Riesgo</div><div class="csub">Incidencias abiertas por venta semanal</div><div id="top10Left"></div></div>'
    + '<div class="ccard"><div class="ctitle">⏰ Top 10 — Más Antiguas</div><div class="csub">Incidencias con más días sin resolverse</div><div id="top10Right"></div></div>'
    + '</div>';
  buildDashCharts();
  buildTop10();
}

function buildDashCharts() {
  if (!D.by_region || !D.by_region.length) return;
  const byR = [...D.by_region].sort((a,b) => b.total - a.total);
  charts['region'] = new Chart(document.getElementById('cRegion'), {
    type:'bar', data:{ labels:byR.map(r=>r.Region), datasets:[{ data:byR.map(r=>r.total),
      backgroundColor:byR.map(r=>r.urgentes>0?'rgba(239,68,68,0.65)':'rgba(59,130,246,0.55)'),
      borderColor:byR.map(r=>r.urgentes>0?'#ef4444':'#3b82f6'), borderWidth:1, borderRadius:3 }]
    }, options:CHARTOPT });

  const tk = Object.keys(D.nombre_count).slice(0,7);
  const tc = ['rgba(245,197,24,0.8)','rgba(59,130,246,0.8)','rgba(34,197,94,0.8)','rgba(249,115,22,0.8)','rgba(139,92,246,0.8)','rgba(6,182,212,0.8)','rgba(239,68,68,0.8)'];
  charts['tipo'] = new Chart(document.getElementById('cTipo'), {
    type:'doughnut', data:{ labels:tk, datasets:[{ data:tk.map(k=>D.nombre_count[k]), backgroundColor:tc, borderColor:'#141c2e', borderWidth:2 }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'right',labels:{color:'#8b95ab',font:{size:10},boxWidth:10,padding:8}},tooltip:{backgroundColor:'#1f2b45',titleColor:'#e8eaf0',bodyColor:'#8b95ab',borderColor:'#2a3550',borderWidth:1}}}
  });

  const dk = Object.keys(D.dias_ranges), dv = Object.values(D.dias_ranges);
  const dc = ['rgba(34,197,94,0.7)','rgba(245,197,24,0.7)','rgba(249,115,22,0.7)','rgba(239,68,68,0.7)'];
  charts['dias'] = new Chart(document.getElementById('cDias'), {
    type:'bar', data:{ labels:dk, datasets:[{ data:dv, backgroundColor:dc, borderColor:dc.map(c=>c.replace('0.7','1')), borderWidth:1, borderRadius:4 }]}, options:CHARTOPT });

  const ck = Object.keys(D.clasif_count), cv = Object.values(D.clasif_count);
  charts['clasif'] = new Chart(document.getElementById('cClasif'), {
    type:'doughnut', data:{ labels:ck, datasets:[{ data:cv, backgroundColor:['rgba(59,130,246,0.8)','rgba(249,115,22,0.8)','rgba(239,68,68,0.8)'], borderColor:'#141c2e', borderWidth:2 }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'right',labels:{color:'#8b95ab',font:{size:10},boxWidth:10,padding:6}},tooltip:{backgroundColor:'#1f2b45',titleColor:'#e8eaf0',bodyColor:'#8b95ab',borderColor:'#2a3550',borderWidth:1}}}
  });

  const urg = D.by_region.filter(r=>r.urgentes>0).sort((a,b)=>b.urgentes-a.urgentes);
  charts['urg'] = new Chart(document.getElementById('cUrg'), {
    type:'bar', data:{ labels:urg.map(r=>r.Region), datasets:[{ data:urg.map(r=>r.urgentes), backgroundColor:'rgba(239,68,68,0.65)', borderColor:'#ef4444', borderWidth:1, borderRadius:3 }]}, options:CHARTOPT });
}

function buildTop10() {
  const rc = ['var(--gold)','var(--gold)','var(--gold)','var(--orange)','var(--orange)','var(--text2)','var(--text2)','var(--text2)','var(--text2)','var(--text2)'];
  const el = document.getElementById('top10Left');
  const byVenta = [...D.top_priority].slice(0,10);
  if (!el) return;
  if (!byVenta.length) { el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);">Sin datos de venta</div>'; }
  else el.innerHTML = byVenta.map((r,i) => {
    const d = r.dias_abierta||0, dc = d>90?'var(--red)':d>60?'var(--orange)':d>30?'var(--gold)':'var(--green)';
    let cine = (r.Conjunto||'').replace('CINÉPOLIS ',''); if(cine.length>28)cine=cine.substring(0,26)+'…';
    return `<div class="top10-row"><div class="top10-rank" style="color:${rc[i]};">${i+1}</div>
      <div class="top10-info"><div class="top10-serie">${r.Serie}</div>
      <div class="top10-cine" title="${r.Conjunto||''}">${cine}</div>
      <div style="font-size:10px;color:${dc};margin-top:2px;">${d} días · ${r.Region}</div></div>
      <div class="top10-val">$${r.avg_semanal?Math.round(r.avg_semanal).toLocaleString():'—'}/sem</div></div>`;
  }).join('');

  const el2 = document.getElementById('top10Right');
  const byDias = [...D.incidencias].sort((a,b)=>(b.dias_abierta||0)-(a.dias_abierta||0)).slice(0,10);
  if (!el2) return;
  if (!byDias.length) { el2.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);">Sin datos</div>'; }
  else el2.innerHTML = byDias.map((r,i) => {
    const d = r.dias_abierta||0, dc = d>90?'var(--red)':d>60?'var(--orange)':'var(--gold)';
    let cine = (r.Conjunto||'').replace('CINÉPOLIS ',''); if(cine.length>28)cine=cine.substring(0,26)+'…';
    const cls = r['Clasificacion Incidencia']==='BACK ORDER'?'<span class="badge bo" style="font-size:9px;">BO</span>':'<span class="badge bb" style="font-size:9px;">DX</span>';
    return `<div class="top10-row"><div class="top10-rank" style="color:${rc[i]};">${i+1}</div>
      <div class="top10-info"><div class="top10-serie">${r.Serie} ${cls}</div>
      <div class="top10-cine" title="${r.Conjunto||''}">${cine}</div>
      <div style="font-size:10px;color:var(--text2);margin-top:2px;">${r['Nombre de Incidencia']||''}</div></div>
      <div style="font-family:var(--ff);font-size:18px;font-weight:700;color:${dc};">${d}d</div></div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   INCIDENCIAS BD (del Excel)
══════════════════════════════════════════════ */
function renderDashboardIncidencias(container) {
  const regs  = [...new Set(D.incidencias.map(r=>r.Region).filter(Boolean))].sort();
  const tipos = [...new Set(D.incidencias.map(r=>r['Nombre de Incidencia']).filter(Boolean))].sort();
  container.innerHTML =
    '<div class="fbar">'
    + '<span class="flabel">Región</span><select id="fReg" onchange="filterInc()"><option value="">Todas</option>'+regs.map(r=>`<option>${r}</option>`).join('')+'</select>'
    + '<span class="flabel">Prioridad</span><select id="fPrio" onchange="filterInc()"><option value="">Todas</option><option value="Urgente">🔴 Urgente</option><option value="Normal">Normal</option></select>'
    + '<span class="flabel">Clasificación</span><select id="fClasif" onchange="filterInc()"><option value="">Todas</option><option value="EN DIAGNOSTICO">En Diagnóstico</option><option value="BACK ORDER">Back Order</option><option value="RETIRO">Retiro</option></select>'
    + '<span class="flabel">Tipo</span><select id="fTipo" onchange="filterInc()"><option value="">Todos</option>'+tipos.map(t=>`<option>${t}</option>`).join('')+'</select>'
    + '<span class="flabel">Días</span><select id="fDias" onchange="filterInc()"><option value="">Todos</option><option value="0">0-30</option><option value="31">31-60</option><option value="61">61-90</option><option value="91">+90</option></select>'
    + '<input type="text" id="fSearch" placeholder="Serie, Conjunto..." oninput="filterInc()">'
    + '<button class="btn btn-ghost2" onclick="resetInc()">Limpiar</button>'
    + '<span class="rcount" id="incCount"></span></div>'
    + '<div class="twrap"><div class="tscroll"><table><thead><tr><th>ID Inc</th><th>Serie</th><th>Prioridad</th><th>Tipo</th><th>Clasificación</th><th>Conjunto</th><th>Región</th><th>Ruta</th><th>Operador</th><th>Días</th><th>Observaciones</th></tr></thead><tbody id="tbInc"></tbody></table></div><div class="pag" id="pagInc"></div></div>';
  filterInc();
}

function filterInc() {
  const reg = document.getElementById('fReg')?.value||'', pri = document.getElementById('fPrio')?.value||'',
        cls = document.getElementById('fClasif')?.value||'', tip = document.getElementById('fTipo')?.value||'',
        dia = document.getElementById('fDias')?.value||'',
        src = (document.getElementById('fSearch')?.value||'').toLowerCase();
  incF = D.incidencias.filter(r => {
    if(reg&&r.Region!==reg)return false; if(pri&&r.Prioridad!==pri)return false;
    if(cls&&r['Clasificacion Incidencia']!==cls)return false; if(tip&&r['Nombre de Incidencia']!==tip)return false;
    if(dia){const d=r.dias_abierta||0;if(dia==='0'&&d>30)return false;if(dia==='31'&&!(d>30&&d<=60))return false;if(dia==='61'&&!(d>60&&d<=90))return false;if(dia==='91'&&d<=90)return false;}
    if(src&&![r.Serie,r.Conjunto,r.Region,r.Ruta,r.Operador,r['Nombre de Incidencia'],String(r.IdIncidencia||'')].join(' ').toLowerCase().includes(src))return false;
    return true;
  });
  incPg=1; renderInc();
  const ic=document.getElementById('incCount');if(ic)ic.textContent=incF.length+' registros';
}
function renderInc() {
  const s=(incPg-1)*PS,pg=incF.slice(s,s+PS),tb=document.getElementById('tbInc');if(!tb)return;
  if(!pg.length){tb.innerHTML='<tr><td colspan="11" class="nodata">Sin registros</td></tr>';renderPag('pagInc',0,incPg,null);return;}
  tb.innerHTML=pg.map(r=>{
    const pb=r.Prioridad==='Urgente'?'<span class="badge br">🔴 Urgente</span>':'<span class="badge bw">Normal</span>';
    const cb=r['Clasificacion Incidencia']==='BACK ORDER'?'<span class="badge bo">BACK ORDER</span>':r['Clasificacion Incidencia']==='RETIRO'?'<span class="badge br">RETIRO</span>':'<span class="badge bb">En Diagnóstico</span>';
    const d=r.dias_abierta||0,dc=d>90?'var(--red)':d>60?'var(--orange)':d>30?'var(--gold)':'var(--green)';
    const obs=(r.Observaciones||'').substring(0,45);
    return `<tr><td style="color:var(--text2);font-size:11px;">${r.IdIncidencia}</td><td style="font-family:var(--ff);color:var(--gold);font-weight:600;">${r.Serie}</td><td>${pb}</td><td>${r['Nombre de Incidencia']}</td><td>${cb}</td><td>${r.Conjunto}</td><td>${r.Region}</td><td>${r.Ruta}</td><td style="color:var(--text2);font-size:11px;">${r.Operador}</td><td><span style="color:${dc};font-family:var(--ff);font-size:16px;font-weight:700;">${d}</span></td><td style="color:var(--text2);font-size:11px;" title="${(r.Observaciones||'').replace(/"/g,"'")}">${obs}${obs.length>=45?'…':''}</td></tr>`;
  }).join('');
  renderPag('pagInc',incF.length,incPg,p=>{incPg=p;renderInc();});
}
function resetInc(){['fReg','fPrio','fClasif','fTipo','fDias'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const el=document.getElementById('fSearch');if(el)el.value='';filterInc();}

/* ══════════════════════════════════════════════
   POR PRIORIDAD
══════════════════════════════════════════════ */
function renderDashboardPrioridad(container) {
  prioF=[...D.top_priority];
  const regs=[...new Set(D.top_priority.map(r=>r.Region).filter(Boolean))].sort();
  container.innerHTML=
    '<div class="abn"><div style="font-size:20px;">⚡</div><div><div class="abt">Máquinas con incidencia abierta — ordenadas por venta semanal promedio</div><div class="abd">Las que más dinero generan deben atenderse primero.</div></div></div>'
    +'<div class="fbar"><span class="flabel">Región</span><select id="fpReg" onchange="filterPrio()"><option value="">Todas</option>'+regs.map(r=>`<option>${r}</option>`).join('')+'</select>'
    +'<span class="flabel">Prioridad</span><select id="fpPrio" onchange="filterPrio()"><option value="">Todas</option><option value="Urgente">Urgente</option><option value="Normal">Normal</option></select>'
    +'<input type="text" id="fpSearch" placeholder="Serie, Conjunto..." oninput="filterPrio()">'
    +'<button class="btn btn-ghost2" onclick="resetPrio()">Limpiar</button><span class="rcount" id="prioCount"></span></div>'
    +'<div class="twrap"><div class="tscroll"><table><thead><tr><th>#</th><th>ID Inc</th><th>Serie</th><th>Tipo</th><th>Prioridad</th><th>Conjunto</th><th>Región</th><th>Días</th><th>Venta/Sem</th><th>Total</th></tr></thead><tbody id="tbPrio"></tbody></table></div><div class="pag" id="pagPrio"></div></div>';
  filterPrio();
}
function filterPrio(){
  const reg=document.getElementById('fpReg')?.value||'',pri=document.getElementById('fpPrio')?.value||'',src=(document.getElementById('fpSearch')?.value||'').toLowerCase();
  prioF=D.top_priority.filter(r=>{
    if(reg&&r.Region!==reg)return false;if(pri&&r.Prioridad!==pri)return false;
    if(src&&![r.Serie,r.Conjunto,r.Region].join(' ').toLowerCase().includes(src))return false;return true;
  });
  prioPg=1;renderPrio();const pc=document.getElementById('prioCount');if(pc)pc.textContent=prioF.length+' registros';
}
function renderPrio(){
  const s=(prioPg-1)*PS,pg=prioF.slice(s,s+PS),tb=document.getElementById('tbPrio');if(!tb)return;
  if(!pg.length){tb.innerHTML='<tr><td colspan="10" class="nodata">Sin registros</td></tr>';return;}
  tb.innerHTML=pg.map((r,i)=>{
    const rk=s+i+1,rc=rk===1?'var(--gold)':rk<=3?'var(--orange)':'var(--text2)';
    const pb=r.Prioridad==='Urgente'?'<span class="badge br">Urgente</span>':'<span class="badge bw">Normal</span>';
    const d=r.dias_abierta||0,dc=d>90?'var(--red)':d>60?'var(--orange)':d>30?'var(--gold)':'var(--green)';
    const v=r.avg_semanal?'$'+Math.round(r.avg_semanal).toLocaleString():'-',t=r.TOTAL_VENTA?'$'+Math.round(r.TOTAL_VENTA).toLocaleString():'-';
    return `<tr><td style="color:${rc};font-family:var(--ff);font-size:17px;font-weight:700;">${rk}</td><td style="color:var(--text2);font-size:11px;">${r.IdIncidencia}</td><td style="font-family:var(--ff);color:var(--gold);font-weight:600;">${r.Serie}</td><td>${r['Nombre de Incidencia']}</td><td>${pb}</td><td>${r.Conjunto}</td><td>${r.Region}</td><td style="color:${dc};font-family:var(--ff);font-size:16px;font-weight:700;">${d}</td><td style="color:var(--gold);font-family:var(--ff);font-size:17px;font-weight:700;">${v}</td><td style="color:var(--text2);">${t}</td></tr>`;
  }).join('');
  renderPag('pagPrio',prioF.length,prioPg,p=>{prioPg=p;renderPrio();});
}
function resetPrio(){['fpReg','fpPrio'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const el=document.getElementById('fpSearch');if(el)el.value='';filterPrio();}

/* ══════════════════════════════════════════════
   ALERTA VENTA
══════════════════════════════════════════════ */
function renderDashboardVenta(container) {
  container.innerHTML=
    '<div class="abn orange"><div style="font-size:20px;">⚠️</div><div><div class="abt">Máquinas con 2+ semanas consecutivas en $0 de venta</div><div class="abd">Verifica si tienen incidencia abierta o si Cinépolis las reportó por separado.</div></div></div>'
    +'<div class="twrap"><div class="tscroll"><table><thead><tr><th>Conjunto</th><th>Región</th><th>Ruta</th><th>Serie</th><th>Máquina</th><th>Sem Cero</th><th>Prom Semanal</th><th>Venta Total</th><th>S10</th><th>S11</th><th>S12</th><th>S13</th></tr></thead><tbody id="tbVenta"></tbody></table></div></div>';
  const tb=document.getElementById('tbVenta');
  if(!D.venta_alerta.length){tb.innerHTML='<tr><td colspan="12" class="nodata">✅ No hay máquinas con alerta de venta cero</td></tr>';return;}
  tb.innerHTML=D.venta_alerta.map(r=>{
    const sc=(D.semana_cols_last4||[]).map(s=>{const v=r[s],c=v===0?'sz':v<100?'sl':'sok';return `<td><span class="sc ${c}">$${v}</span></td>`;}).join('');
    return `<tr><td>${r.CONJUNTO}</td><td>${r.REGION}</td><td>${r.RUTA}</td><td style="font-family:var(--ff);color:var(--orange);font-weight:600;">${r.NUM_SERIE}</td><td>${r.NOMBRE_MAQUINA}</td><td style="color:var(--red);font-family:var(--ff);font-size:20px;font-weight:700;">${r.max_consec_zeros}</td><td>$${Math.round(r.avg_semanal||0).toLocaleString()}</td><td>$${Math.round(r.TOTAL_VENTA||0).toLocaleString()}</td>${sc}</tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   REPORTE CINÉPOLIS (Romel)
══════════════════════════════════════════════ */
function renderDashboardCinepolis(container) {
  cineF=[...D.romel];
  const k=D.kpi;
  container.innerHTML=
    '<div class="igrid">'
    +'<div class="icard"><div class="ititle"><div class="dot-g"></div>Máquinas en Reporte Cinépolis</div><div style="font-size:36px;font-family:var(--ff);font-weight:700;color:var(--cyan);">'+(k.romel_total||0)+'</div><div style="font-size:11px;color:var(--text2);margin-top:6px;">Total reportadas por Cinépolis</div></div>'
    +'<div class="icard"><div class="ititle"><div class="dot-r"></div>Sin Incidencia en Nuestro Sistema</div><div style="font-size:36px;font-family:var(--ff);font-weight:700;color:var(--red);">'+(k.romel_no_en_sistema||0)+'</div><div style="font-size:11px;color:var(--text2);margin-top:6px;">⚠️ Cinépolis reportó pero NO tenemos incidencia</div></div>'
    +'</div>'
    +'<div class="fbar"><span class="flabel">En Sistema</span><select id="fcStatus" onchange="filterCineDash()"><option value="">Todos</option><option value="sin">⚠️ Sin incidencia nuestra</option><option value="con">✅ Con incidencia</option></select>'
    +'<span class="flabel">Modo Falla</span><select id="fcModo" onchange="filterCineDash()"><option value="">Todos</option><option value="Venta cero">Venta cero</option><option value="Parcialmente operando">Parcialmente operando</option></select>'
    +'<input type="text" id="fcSearch" placeholder="Serie, Cine, ORSAID..." oninput="filterCineDash()">'
    +'<button class="btn btn-ghost2" onclick="resetCineDash()">Limpiar</button><span class="rcount" id="cineCount"></span></div>'
    +'<div class="twrap"><div class="tscroll"><table><thead><tr><th>Fecha</th><th>Semana</th><th>ORSAID</th><th>Cine</th><th>Región CP</th><th>Región</th><th>Ruta</th><th>Gte Zona</th><th>Género</th><th>Serie VDJ</th><th>Nombre VDJ</th><th>Modo Falla</th><th>Solicitud</th><th>Responsable</th><th>Confirmación</th><th>Estatus</th><th>Comentarios</th><th>Prom Sem</th><th>Acumulado</th><th>VS Reporte</th><th>Días SLA</th><th>En Sistema</th></tr></thead><tbody id="tbCineD"></tbody></table></div></div>';
  filterCineDash();
}
function filterCineDash(){
  const st=document.getElementById('fcStatus')?.value||'',mo=document.getElementById('fcModo')?.value||'',sr=(document.getElementById('fcSearch')?.value||'').toLowerCase();
  cineF=D.romel.filter(r=>{
    if(st==='sin'&&r.en_nuestro_sistema)return false;if(st==='con'&&!r.en_nuestro_sistema)return false;
    if(mo&&r['MODO DE FALLA']!==mo)return false;
    if(sr&&![r['SERIE VDJ'],r['NOMBRE VDJ'],r['CINE'],r['ORSAID CINE'],String(r['REGIÓN CINÉPOLIS']||''),String(r.REGION||'')].join(' ').toLowerCase().includes(sr))return false;
    return true;
  });
  renderCineDash();const cc=document.getElementById('cineCount');if(cc)cc.textContent=cineF.length+' registros';
}
function renderCineDash(){
  const tb=document.getElementById('tbCineD');if(!tb)return;
  if(!cineF.length){tb.innerHTML='<tr><td colspan="22" class="nodata">Sin registros</td></tr>';return;}
  tb.innerHTML=cineF.map(r=>{
    const ens=r.en_nuestro_sistema,sb=ens?'<span class="badge bg">✅ Sí</span>':'<span class="badge br">⚠️ NO</span>';
    const mb=r['MODO DE FALLA']==='Venta cero'?'<span class="badge bo">Venta cero</span>':'<span class="badge bb">Parcial</span>';
    const ds=r['Días vs SLA']||0,dsc=ds>20?'var(--red)':ds>10?'var(--orange)':'var(--green)';
    const pm=r['PROMEDIO SEMANAL']?'$'+Math.round(r['PROMEDIO SEMANAL']).toLocaleString():'-';
    const ac=r['ACUMULADO']?'$'+Math.round(r['ACUMULADO']).toLocaleString():'-';
    const estBadge=r['ESTATUS']?`<span class="badge ${r['ESTATUS']==='En revisión'?'bb':'bo'}">${r['ESTATUS']}</span>`:'-';
    const t=(s,n)=>(s||'').substring(0,n)+((s||'').length>n?'…':'');
    return `<tr>
      <td style="color:var(--text2);font-size:11px;">${r['#FECHA DE REPORTE']||''}</td>
      <td style="color:var(--text2);font-size:11px;text-align:center;">${r['SEMANA']||''}</td>
      <td style="color:var(--text2);font-size:11px;">${r['ORSAID CINE']||''}</td>
      <td title="${r['CINE']||''}">${t(r['CINE'],22)}</td>
      <td style="color:var(--text2);font-size:11px;">${r['REGIÓN CINÉPOLIS']||''}</td>
      <td style="color:var(--text2);font-size:11px;">${r['REGION']||''}</td>
      <td style="color:var(--text2);font-size:11px;">${r['RUTA']||''}</td>
      <td style="color:var(--text2);font-size:11px;">${r['GERENTE DE ZONA GALEX']||''}</td>
      <td style="color:var(--text2);font-size:11px;">${r['GÉNERO']||''}</td>
      <td style="font-family:var(--ff);color:${ens?'var(--gold)':'var(--red)'};font-weight:600;">${r['SERIE VDJ']||''}</td>
      <td>${r['NOMBRE VDJ']||''}</td><td>${mb}</td>
      <td style="color:var(--text2);font-size:11px;" title="${r['SOLICITUD']||''}">${t(r['SOLICITUD'],20)}</td>
      <td style="color:var(--text2);font-size:11px;" title="${r['RESPONSABLE DE CERRAR ACCION']||''}">${t(r['RESPONSABLE DE CERRAR ACCION'],18)}</td>
      <td style="color:var(--text2);font-size:11px;" title="${r['CONFIRMACIÓN DE CINE']||''}">${t(r['CONFIRMACIÓN DE CINE'],16)}</td>
      <td>${estBadge}</td>
      <td style="color:var(--text2);font-size:11px;" title="${r['COMENTARIOS SUBGERENTES']||''}">${t(r['COMENTARIOS SUBGERENTES'],22)}</td>
      <td style="color:var(--gold);font-family:var(--ff);font-weight:600;">${pm}</td>
      <td style="color:var(--text2);">${ac}</td>
      <td style="color:var(--cyan);font-size:11px;">${r['VS Reporte']||'-'}</td>
      <td style="color:${dsc};font-family:var(--ff);font-size:16px;font-weight:700;">${ds}</td>
      <td>${sb}</td>
    </tr>`;
  }).join('');
}
function resetCineDash(){['fcStatus','fcModo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const el=document.getElementById('fcSearch');if(el)el.value='';filterCineDash();}
