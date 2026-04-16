/* ═══════════════════════════════════════════════
   actualizador.js — Lee el Excel en el browser
   y guarda snapshot + tabla cp_maquinas en Supabase.
   ═══════════════════════════════════════════════ */

function renderActualizador(container) {
  container.innerHTML = `
    <div style="max-width:700px;margin:0 auto;">
      <div style="font-family:var(--ff);font-size:22px;font-weight:700;margin-bottom:6px;">⚡ Actualizar Datos del Dashboard</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:24px;">
        Selecciona el archivo <strong style="color:var(--text);">Bases_de_datos.xlsx</strong>.
        Los datos y el catálogo de máquinas se guardan en <strong style="color:var(--gold);">Supabase</strong>.
      </div>
      <div class="upd-zone" id="updZone" ondragover="updDrag(event,true)" ondragleave="updDrag(event,false)" ondrop="updDrop(event)">
        <input type="file" id="updFile" accept=".xlsx,.xls" onchange="updLoad(event)">
        <div class="upd-icon">📂</div>
        <div class="upd-title">Arrastra aquí el Excel o haz clic para seleccionar</div>
        <div class="upd-sub">Bases_de_datos.xlsx · Hojas: BD INCIDENCIA, BD MAQUINAS CINEPOLIS, BD VENTA SEMANAL, BD ROMEL</div>
      </div>
      <div class="upd-progress" id="updProgress">
        <div class="upd-step" id="updStep">Leyendo archivo...</div>
        <div class="upd-bar-wrap"><div class="upd-bar" id="updBar"></div></div>
      </div>
      <div class="upd-result" id="updResult"></div>
    </div>`;
}

function updDrag(e, on) { e.preventDefault(); document.getElementById('updZone').classList[on?'add':'remove']('drag'); }
function updDrop(e) { e.preventDefault(); document.getElementById('updZone').classList.remove('drag'); const f=e.dataTransfer.files[0]; if(f) processExcel(f); }
function updLoad(e) { const f=e.target.files[0]; if(f) processExcel(f); }

function updSetBar(pct, msg) {
  document.getElementById('updProgress').style.display = 'block';
  document.getElementById('updBar').style.width = pct + '%';
  document.getElementById('updStep').textContent = msg;
}

async function processExcel(file) {
  const result = document.getElementById('updResult');
  result.style.display = 'none';
  updSetBar(5, 'Leyendo archivo Excel...');

  const reader = new FileReader();
  reader.onerror = () => showUpdError('No se pudo leer el archivo.');
  reader.onload = async (e) => {
    try {
      updSetBar(15, 'Cargando hojas...');
      const wb = XLSX.read(e.target.result, { type:'array', cellDates:true });

      const SHEETS = { INC:'BD INCIDENCIA', MAQ:'BD MAQUINAS CINEPOLIS', VENTA:'BD VENTA SEMANAL', ROMEL:'BD ROMEL' };
      const missing = Object.values(SHEETS).filter(s => !wb.Sheets[s]);
      if (missing.length) { showUpdError('Faltan hojas: ' + missing.join(', ')); return; }

      updSetBar(30, 'Procesando hojas...');
      const inc   = XLSX.utils.sheet_to_json(wb.Sheets[SHEETS.INC],   { defval:'' });
      const maq   = XLSX.utils.sheet_to_json(wb.Sheets[SHEETS.MAQ],   { defval:'' });
      const venta = XLSX.utils.sheet_to_json(wb.Sheets[SHEETS.VENTA], { defval:0  });
      const romel = XLSX.utils.sheet_to_json(wb.Sheets[SHEETS.ROMEL], { defval:'' });

      // ── KPIs de incidencias ─────────────────────────────────
      updSetBar(45, 'Calculando KPIs...');
      const today = new Date(); today.setHours(0,0,0,0);
      const incOpen = inc
        .filter(r => String(r['Status de la Incidencia']||'').trim() === 'Abierta')
        .map(r => {
          let d = 0;
          const fc = r['Fecha de Creacion'];
          if (fc) { const fd = fc instanceof Date ? fc : new Date(fc); if(!isNaN(fd)) d = Math.max(0, Math.floor((today-fd)/86400000)); }
          return { ...r, dias_abierta: d };
        });

      // ── Venta semanal — ceros consecutivos AL FINAL ─────────
      const ventaCols  = Object.keys(venta[0] || {});
      const semanaCols = ventaCols.filter(c => String(c).toUpperCase().includes('SEMANA'));

      const ventaMap = {};
      venta.forEach(r => {
        const serie = String(r['NUM_SERIE']||'');
        const vals  = semanaCols.map(c => parseFloat(r[c])||0);
        const avg   = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
        const total = vals.reduce((a,b)=>a+b,0);
        // Contar desde el FINAL (semanas más recientes)
        let consecFinal = 0;
        for (let i = vals.length - 1; i >= 0; i--) {
          if (vals[i] === 0) consecFinal++;
          else break;
        }
        ventaMap[serie] = { avg_semanal:Math.round(avg), TOTAL_VENTA:Math.round(total), max_consec_zeros:consecFinal, alerta:consecFinal>=2 };
      });

      const incMerged = incOpen.map(r => {
        const v = ventaMap[String(r['Serie']||'')] || {};
        return { ...r, avg_semanal:v.avg_semanal||'', TOTAL_VENTA:v.TOTAL_VENTA||'', alerta_venta:v.alerta||false };
      });

      updSetBar(55, 'Calculando KPIs...');
      const kpi = {
        total_incidencias_abiertas: incOpen.length,
        back_order:     incOpen.filter(r => r['Clasificacion Incidencia']==='BACK ORDER').length,
        en_diagnostico: incOpen.filter(r => r['Clasificacion Incidencia']==='EN DIAGNOSTICO').length,
        mas_30_dias:    incOpen.filter(r => r.dias_abierta>30).length,
        mas_90_dias:    incOpen.filter(r => r.dias_abierta>90).length,
        alertas_venta_cero: Object.values(ventaMap).filter(v=>v.alerta).length,
        romel_total:    romel.length,
        romel_no_en_sistema: 0,
        maquinas_en_ruta: maq.filter(r=>String(r['STATUS']||'').trim()==='EN RUTA').length,
      };

      updSetBar(65, 'Procesando Romel...');
      const incSeries = {}; inc.forEach(r=>{ incSeries[String(r['Serie']||'')] = true; });
      const romelP = romel.map(r => ({ ...r, en_nuestro_sistema: !!incSeries[String(r['SERIE VDJ']||'')] }));
      kpi.romel_no_en_sistema = romelP.filter(r=>!r.en_nuestro_sistema).length;

      // ── Tablas para el dashboard ────────────────────────────
      const colsInc = ['IdIncidencia','IdMaquina','Serie','Clasificacion Incidencia','Nombre de Incidencia','Conjunto','Region','Ruta','Operador','Fecha de Creacion','dias_abierta','Observaciones','avg_semanal','TOTAL_VENTA','alerta_venta'];
      const incTable = incMerged.slice(0,500).map(r => {
        const out = {};
        colsInc.forEach(c => { let v = r[c]; if(v instanceof Date) v=v.toISOString().slice(0,19).replace('T',' '); out[c]=v===null||v===undefined?'':v; });
        return out;
      });

      const topPriority = incMerged.filter(r=>r.avg_semanal>0).sort((a,b)=>(b.avg_semanal||0)-(a.avg_semanal||0)).slice(0,20)
        .map(r=>({ IdIncidencia:r.IdIncidencia, Serie:r.Serie, 'Nombre de Incidencia':r['Nombre de Incidencia'], Conjunto:r.Conjunto, Region:r.Region, dias_abierta:r.dias_abierta, avg_semanal:r.avg_semanal, TOTAL_VENTA:r.TOTAL_VENTA }));

      const last4 = semanaCols.slice(-4);
      const ventaAlerta = venta.filter(r => ventaMap[String(r['NUM_SERIE']||'')]?.alerta)
        .map(r => {
          const v = ventaMap[String(r['NUM_SERIE']||'')] || {};
          const out = { CONJUNTO:r['CONJUNTO']||'', REGION:r['REGION']||'', RUTA:r['RUTA']||'', NUM_SERIE:r['NUM_SERIE']||'', NOMBRE_MAQUINA:r['NOMBRE_MAQUINA']||'', avg_semanal:v.avg_semanal||0, TOTAL_VENTA:v.TOTAL_VENTA||0, max_consec_zeros:v.max_consec_zeros||0 };
          last4.forEach(c => { out[c] = parseFloat(r[c])||0; });
          return out;
        });

      const byRegion = {};
      incOpen.forEach(r => {
        const reg = r['Region']||'Sin región';
        if(!byRegion[reg]) byRegion[reg] = { Region:reg, total:0, back_order:0 };
        byRegion[reg].total++;
        if(r['Clasificacion Incidencia']==='BACK ORDER') byRegion[reg].back_order++;
      });

      const nombreCount = {};
      incOpen.forEach(r => { const n=r['Nombre de Incidencia']||''; if(n) nombreCount[n]=(nombreCount[n]||0)+1; });
      const nombreCountSorted = {};
      Object.entries(nombreCount).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,v])=>{ nombreCountSorted[k]=v; });

      const clasifCount = {};
      incOpen.forEach(r => { const c=r['Clasificacion Incidencia']||''; if(c) clasifCount[c]=(clasifCount[c]||0)+1; });

      const diasRanges = {'0-30 días':0,'31-60 días':0,'61-90 días':0,'+90 días':0};
      incOpen.forEach(r => {
        const d = r.dias_abierta||0;
        if(d<=30) diasRanges['0-30 días']++;
        else if(d<=60) diasRanges['31-60 días']++;
        else if(d<=90) diasRanges['61-90 días']++;
        else diasRanges['+90 días']++;
      });

      const now  = new Date();
      const fecha = ('0'+now.getDate()).slice(-2)+'/'+now.toLocaleString('es-MX',{month:'short'})+'/'+now.getFullYear();

      // ── Catálogo de máquinas → tabla cp_maquinas en Supabase ─
      // Columnas confirmadas del Excel: Nombre, Serie, Conjunto, STATUS, Region, Ruta, Categoria
      updSetBar(75, 'Preparando catálogo de máquinas...');
      const cols = Object.keys(maq[0] || {});
      const col = (exact, regex) => cols.find(k => k === exact) || cols.find(k => regex.test(k)) || exact;

      const colSerie  = col('Serie',    /^serie$/i);
      const colCine   = col('Conjunto', /conjunto/i);
      const colNombre = col('Nombre',   /^nombre$/i);
      const colCateg  = col('Categoria',/categ/i);
      const colStatus = col('STATUS',   /status/i);
      const colRegion = col('Region',   /^regi/i);
      const colRuta   = col('Ruta',     /^ruta$/i);

      const maquinasParaDB = maq
        .filter(m => String(m[colSerie]||'').trim() !== '')
        .map(m => ({
          id:        String(m[colSerie]  ||'').trim(),
          cine:      String(m[colCine]   ||'').trim().toUpperCase(),
          nombre:    String(m[colNombre] ||m[colCateg]||'SIN NOMBRE').trim(),
          categoria: String(m[colCateg]  ||'').trim(),
          status:    String(m[colStatus] ||'EN RUTA').trim().toUpperCase(),
          region:    String(m[colRegion] ||'').trim(),
          ruta:      String(m[colRuta]   ||'').trim(),
          updated_at: new Date().toISOString(),
        }));

      // Snapshot en memoria
      const catalogoMaquinas = maquinasParaDB.map(m => ({ cine:m.cine, nombre:m.nombre, serie:m.id }));

      const newD = {
        kpi, incidencias:incTable, venta_alerta:ventaAlerta, romel:romelP,
        by_region:Object.values(byRegion), nombre_count:nombreCountSorted, clasif_count:clasifCount,
        dias_ranges:diasRanges, top_priority:topPriority, semana_cols_last4:last4,
        fecha_actualizacion:fecha, catalogo_maquinas:catalogoMaquinas,
      };

      // ── Sincronizar cp_maquinas en Supabase ─────────────────
      updSetBar(83, `Sincronizando ${maquinasParaDB.length} máquinas...`);
      let maqOk = 0, maqError = '';
      try {
        const res = await DB.sincronizarMaquinas(maquinasParaDB);
        maqOk = res.ok;
      } catch(err) {
        maqError = err.message;
        console.error('[actualizador] sincronizarMaquinas:', err.message);
      }

      // ── Guardar snapshot del dashboard ──────────────────────
      updSetBar(93, 'Guardando dashboard en Supabase...');
      await DB.guardarDashboard(newD, currentUser.username);
      Object.assign(D, newD);

      const fb = document.getElementById('fechaBadge');
      if (fb) { fb.textContent = fecha; fb.style.display = 'block'; }

      updSetBar(100, '¡Listo!');

      result.className = 'upd-result ok';
      result.style.display = 'block';
      result.innerHTML = `
        <strong>✅ Dashboard actualizado en Supabase</strong>
        ${maqError ? `<br><span style="color:var(--red);font-size:11px;">⚠️ Error sincronizando máquinas: ${maqError}<br>Ve a Supabase → cp_maquinas → desactiva RLS o corre: ALTER TABLE cp_maquinas DISABLE ROW LEVEL SECURITY;</span>` : ''}
        <br><span style="font-size:11px;color:var(--text2);">${fecha} · ${maqOk} máquinas · Todos los usuarios verán los nuevos datos.</span>
        <div class="upd-kpi-grid">
          <div class="upd-kpi"><div class="upd-kpi-val">${kpi.total_incidencias_abiertas.toLocaleString()}</div><div class="upd-kpi-lbl">Incidencias</div></div>
          <div class="upd-kpi"><div class="upd-kpi-val" style="color:var(--orange);">${kpi.back_order}</div><div class="upd-kpi-lbl">Back Order</div></div>
          <div class="upd-kpi"><div class="upd-kpi-val" style="color:var(--purple);">${kpi.mas_90_dias}</div><div class="upd-kpi-lbl">+90 días</div></div>
          <div class="upd-kpi"><div class="upd-kpi-val" style="color:var(--orange);">${kpi.alertas_venta_cero}</div><div class="upd-kpi-lbl">Alerta Venta</div></div>
          <div class="upd-kpi"><div class="upd-kpi-val" style="color:var(--gold);">${maqOk.toLocaleString()}</div><div class="upd-kpi-lbl">Máquinas</div></div>
          <div class="upd-kpi"><div class="upd-kpi-val" style="color:var(--gold);">${kpi.maquinas_en_ruta.toLocaleString()}</div><div class="upd-kpi-lbl">En Ruta</div></div>
        </div>`;

    } catch(err) { showUpdError('Error: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
}

function showUpdError(msg) {
  document.getElementById('updProgress').style.display = 'none';
  const r = document.getElementById('updResult');
  r.className = 'upd-result err';
  r.style.display = 'block';
  r.innerHTML = `<strong>❌ Error</strong><br><span style="font-size:12px;">${msg.replace(/\n/g,'<br>')}</span>`;
}
