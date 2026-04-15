/* ═══════════════════════════════════════════════
   incidencias.js — Vistas y lógica de incidencias
   ═══════════════════════════════════════════════ */

let editingIncId = null;
let photoBase64  = '';
let _listaIncs   = [];   // caché para filtrado local (cine)
let _todasIncs   = [];   // caché para filtrado local (manto/admin)

/* ══════════════════════════════════════════════
   CINE — Mi Panel
══════════════════════════════════════════════ */
async function renderInicio(container) {
  container.innerHTML = loadingHTML();
  try {
    const incs = await DB.getIncidencias({ usuario_id: currentUser.id });
    const total     = incs.length;
    const abiertas  = incs.filter(i => i.estado === 'Abierta').length;
    const proceso   = incs.filter(i => i.estado === 'En proceso').length;
    const urgentes  = incs.filter(i => i.prioridad === 'Urgente' && i.estado !== 'Resuelta').length;
    const resueltas = incs.filter(i => i.estado === 'Resuelta').length;
    const recientes = [...incs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,10);

    container.innerHTML =
      '<div class="kgrid">'
      + kcard('gold',   'Total',     total,     '')
      + kcard('red',    'Abiertas',  abiertas,  '')
      + kcard('orange', 'En Proceso',proceso,   '')
      + kcard('red',    'Urgentes',  urgentes,  '')
      + kcard('green',  'Resueltas', resueltas, '')
      + '</div>'
      + '<div class="section-header">MIS ÚLTIMAS INCIDENCIAS</div>'
      + '<div class="twrap"><div class="tscroll"><table>'
      + '<thead><tr><th>ID</th><th>Cine</th><th>Serie</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Fecha</th></tr></thead>'
      + '<tbody id="tbRecientes"></tbody></table></div></div>';

    const tb = document.getElementById('tbRecientes');
    if (!recientes.length) {
      tb.innerHTML = '<tr><td colspan="7" class="nodata">No tienes incidencias. ¡Usa "Reportar Incidencia"!</td></tr>';
      return;
    }
    tb.innerHTML = recientes.map(r => {
      const cn = r.cine.length > 26 ? r.cine.substring(0,24)+'…' : r.cine;
      return `<tr style="cursor:pointer;" onclick="openModal('${r.id}')">
        <td style="font-family:var(--ff);color:var(--gold);font-weight:600;">${r.id}</td>
        <td title="${r.cine}">${cn}</td>
        <td style="color:var(--cyan);">${r.serie}</td>
        <td>${r.tipo}</td>
        <td>${prioBadge(r.prioridad)}</td>
        <td>${estadoBadge(r.estado)}</td>
        <td style="color:var(--text2);">${formatDate(r.created_at)}</td>
      </tr>`;
    }).join('');
  } catch(err) {
    container.innerHTML = errorBox('No se pudieron cargar tus incidencias: ' + err.message);
  }
}

/* ══════════════════════════════════════════════
   CINE — Reportar Incidencia
══════════════════════════════════════════════ */
async function renderNueva(container) {
  photoBase64 = '';
  container.innerHTML = loadingHTML('Cargando máquinas de tu cine...');

  // Cargar máquinas de este cine desde Supabase (tabla cp_maquinas)
  let maqCine = [];
  try {
    const nombreCineActual = currentUser.nombre.toUpperCase();
    maqCine = await DB.getMaquinas(nombreCineActual);
  } catch(e) {
    // Si falla Supabase, intentar con el catálogo en memoria del snapshot
    console.warn('[renderNueva] Falló getMaquinas, usando caché D:', e.message);
    const nombreCineActual = currentUser.nombre.toUpperCase();
    maqCine = (D.catalogo_maquinas || [])
      .filter(m => m.cine === nombreCineActual)
      .map(m => ({ nombre: m.nombre, id: m.serie }));
  }

  const nombresUnicos = [...new Set(maqCine.map(m => m.nombre))].sort();
  
  // Función para llenar series cuando eligen máquina
  window.actualizarSeries = function() {
    const selNombre = document.getElementById('fNombreMaquina').value;
    const series = maqCine.filter(m => m.nombre === selNombre).map(m => m.id);
    const comboSerie = document.getElementById('fSerie');
    if (!series.length) {
      comboSerie.innerHTML = '<option value="">No hay series disponibles</option>';
    } else {
      comboSerie.innerHTML = '<option value="">— Selecciona la Serie —</option>'
        + series.map(s => `<option value="${s}">${s}</option>`).join('');
    }
  };

  container.innerHTML = `
    <div class="form-card">
      <div class="form-title">Reportar Nueva Incidencia</div>
      <div class="form-sub" style="color:var(--gold);">Cine: <strong>${currentUser.nombre}</strong> · Completa los campos obligatorios (*)</div>
      <div class="form-grid">
        
        <div class="form-group">
          <label class="form-label">Máquina Afectada *</label>
          <select class="form-select" id="fNombreMaquina" onchange="actualizarSeries()">
            <option value="">— Selecciona Máquina —</option>
            ${nombresUnicos.map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Número de Serie *</label>
          <select class="form-select" id="fSerie">
            <option value="">Primero selecciona una máquina...</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Tipo de Falla *</label>
          <select class="form-select" id="fTipo">
            <option value="">— Selecciona —</option>
            <option>OPERANDO PARCIALMENTE</option>
            <option>FUERA DE SERVICIO</option>
            <option>IMAGEN / ESTÉTICA</option>
            <option>MONEDERO / COBRO</option>
            <option>PANTALLA / DISPLAY</option>
            <option>VENTA CERO</option>
            <option>OTRO</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Prioridad *</label>
          <select class="form-select" id="fPrioridad">
            <option value="Normal">Normal</option>
            <option value="Urgente">🔴 Urgente</option>
          </select>
        </div>
        
        <div class="form-group full">
          <label class="form-label">Descripción del Problema *</label>
          <textarea class="form-textarea" id="fDesc" placeholder="Describe detalladamente qué está pasando..."></textarea>
        </div>
        
        <div class="form-group full">
          <label class="form-label">Foto (opcional)</label>
          <div class="photo-zone">
            <input type="file" id="fFoto" accept="image/*" onchange="previewPhoto(event)">
            <div id="photoPlaceholder" style="color:var(--text3);">📷 Haz clic o arrastra una foto aquí</div>
            <img id="photoPreview" class="photo-preview" style="display:none;">
          </div>
        </div>
        
      </div>
      <button class="submit-btn" id="submitBtn" onclick="submitInc()">✔ REGISTRAR INCIDENCIA</button>
      <div class="success-msg" id="successMsg" style="display:none; color:var(--green); font-weight:bold; margin-top:10px;">✅ Incidencia registrada. Mantenimiento fue notificado.</div>
    </div>`;
}

function previewPhoto(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    photoBase64 = ev.target.result;
    document.getElementById('photoPreview').src = photoBase64;
    document.getElementById('photoPreview').style.display = 'block';
    document.getElementById('photoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function submitInc() {
  const maquina   = document.getElementById('fNombreMaquina').value;
  const serie     = document.getElementById('fSerie').value;
  const tipo      = document.getElementById('fTipo').value;
  const prioridad = document.getElementById('fPrioridad').value;
  const desc      = document.getElementById('fDesc').value.trim();

  if (!maquina || !serie || !tipo || !desc) {
    showToast('Completa todos los campos obligatorios (*)', 'error');
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Guardando en Supabase...';

  try {
    const ts  = nowISO();

    // Subir foto al Storage si existe (en vez de guardar base64)
    let fotoFinalUrl = '';
    const fileInput = document.getElementById('fFoto');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      btn.textContent = 'Subiendo foto...';
      fotoFinalUrl = await DB.subirFoto(fileInput.files[0], 'reportes');
    }

    btn.textContent = 'Registrando incidencia...';
    const inc = {
      id: newId('INC'),
      cine: currentUser.nombre,
      serie: serie,
      tipo: maquina,
      clasificacion_falla: tipo,
      prioridad: prioridad,
      descripcion: desc,
      foto_url: fotoFinalUrl,
      estado: 'Abierta',
      usuario_id: currentUser.id,
      nombre_usuario: currentUser.nombre,
      nota_manto: '',
      created_at: ts,
      updated_at: ts,
    };

    const creada = await DB.crearIncidencia(inc);
    await DB.escribirLog({
      id: newId('log'),
      incidencia_id: creada.id,
      usuario_id: currentUser.id,
      nombre_usuario: currentUser.nombre,
      accion: 'creacion',
      estado_anterior: '',
      estado_nuevo: 'Abierta',
      nota: 'Incidencia creada por ' + currentUser.nombre,
      created_at: ts,
    });

    // Limpiar form
    document.getElementById('fNombreMaquina').value = '';
    document.getElementById('fSerie').innerHTML = '<option value="">Primero selecciona una máquina...</option>';
    document.getElementById('fTipo').value = '';
    document.getElementById('fPrioridad').value = 'Normal';
    document.getElementById('fDesc').value = '';
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('photoPlaceholder').style.display = 'block';
    if (fileInput) fileInput.value = '';
    photoBase64 = '';

    const msg = document.getElementById('successMsg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 4000);

    showToast('Incidencia registrada en Supabase ✓', 'success');
    updateBadge();

  } catch(err) {
    showToast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✔ REGISTRAR INCIDENCIA';
  }
}

/* ══════════════════════════════════════════════
   CINE — Mis Incidencias (lista)
══════════════════════════════════════════════ */
async function renderLista(container) {
  container.innerHTML =
    '<div style="background:rgba(6,182,212,.07);border:1px solid rgba(6,182,212,.2);border-radius:8px;padding:10px 16px;margin-bottom:14px;font-size:12px;color:var(--cyan);">📋 Mostrando solo las incidencias que tú has reportado</div>'
    + '<div class="filters">'
    + '<span class="flabel">Estado</span><select id="fEstado" onchange="filtrarLista()"><option value="">Todos</option><option>Abierta</option><option>En proceso</option><option>Resuelta</option></select>'
    + '<span class="flabel">Tipo</span><select id="fTipoF" onchange="filtrarLista()"><option value="">Todos</option><option>OPERANDO PARCIALMENTE</option><option>FUERA DE SERVICIO</option><option>IMAGEN / ESTÉTICA</option><option>MONEDERO / COBRO</option><option>PANTALLA / DISPLAY</option><option>VENTA CERO</option><option>OTRO</option></select>'
    + '<span class="flabel">Prioridad</span><select id="fPrioF" onchange="filtrarLista()"><option value="">Todas</option><option>Urgente</option><option>Normal</option></select>'
    + '<input type="text" id="fBuscar" placeholder="Buscar serie, ID..." oninput="filtrarLista()">'
    + '<button onclick="limpiarFiltrosLista()" class="btn-ghost" style="padding:5px 12px;font-size:11px;">Limpiar</button>'
    + '<button onclick="recargarLista()" class="btn-ghost" style="padding:5px 12px;font-size:11px;">🔄</button>'
    + '<span class="rcount" id="listaCount"></span></div>'
    + '<div class="twrap"><div class="tscroll"><table>'
    + '<thead><tr><th>ID</th><th>Cine</th><th>Serie</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>'
    + '<tbody id="tbLista">' + loadingHTML() + '</tbody></table></div></div>';
  await recargarLista();
}

async function recargarLista() {
  try {
    _listaIncs = await DB.getIncidencias({ usuario_id: currentUser.id });
    filtrarLista();
  } catch(err) {
    const tb = document.getElementById('tbLista');
    if (tb) tb.innerHTML = `<tr><td colspan="8" class="nodata">${errorBox(err.message)}</td></tr>`;
  }
}

function filtrarLista() {
  const est = document.getElementById('fEstado')?.value || '';
  const tip = document.getElementById('fTipoF')?.value  || '';
  const pri = document.getElementById('fPrioF')?.value  || '';
  const bus = (document.getElementById('fBuscar')?.value || '').toLowerCase();

  const data = _listaIncs.filter(r => {
    if (est && r.estado    !== est) return false;
    if (tip && r.tipo      !== tip) return false;
    if (pri && r.prioridad !== pri) return false;
    if (bus && ![r.cine,r.serie,r.id,r.tipo].join(' ').toLowerCase().includes(bus)) return false;
    return true;
  });

  const lc = document.getElementById('listaCount');
  if (lc) lc.textContent = data.length + ' registros';
  const tb = document.getElementById('tbLista'); if (!tb) return;
  if (!data.length) { tb.innerHTML = '<tr><td colspan="8" class="nodata">Sin resultados</td></tr>'; return; }

  tb.innerHTML = data.map(r => {
    const cn = r.cine.length > 24 ? r.cine.substring(0,22)+'…' : r.cine;
    return `<tr>
      <td style="font-family:var(--ff);color:var(--gold);font-weight:600;">${r.id}</td>
      <td title="${r.cine}">${cn}</td>
      <td style="color:var(--cyan);">${r.serie}</td>
      <td>${r.tipo}</td>
      <td>${prioBadge(r.prioridad)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td style="color:var(--text2);">${formatDate(r.created_at)}</td>
      <td><button onclick="openModal('${r.id}')" style="background:var(--panel3);border:1px solid var(--border2);color:var(--text);padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;">Ver</button></td>
    </tr>`;
  }).join('');
}

function limpiarFiltrosLista() {
  ['fEstado','fTipoF','fPrioF'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const fb = document.getElementById('fBuscar'); if(fb) fb.value='';
  filtrarLista();
}

/* ══════════════════════════════════════════════
   MANTENIMIENTO / ADMIN — Todas las incidencias
══════════════════════════════════════════════ */
async function renderIncidenciasCines(container) {
  container.innerHTML =
    '<div class="section-header">INCIDENCIAS REPORTADAS POR LOS CINES</div>'
    + '<div class="filters">'
    + '<span class="flabel">Estado</span><select id="fcEstado" onchange="filtrarCines()"><option value="">Todos</option><option>Abierta</option><option>En proceso</option><option>Resuelta</option></select>'
    + '<span class="flabel">Prioridad</span><select id="fcPrio" onchange="filtrarCines()"><option value="">Todas</option><option>Urgente</option><option>Normal</option></select>'
    + '<input type="text" id="fcBuscar" placeholder="Buscar cine, serie, ID..." oninput="filtrarCines()">'
    + '<button onclick="limpiarFiltrosCines()" class="btn-ghost" style="padding:5px 12px;font-size:11px;">Limpiar</button>'
    + '<button onclick="recargarCines()" class="btn-ghost" style="padding:5px 12px;font-size:11px;">🔄 Actualizar</button>'
    + '<span class="rcount" id="cinesCount"></span></div>'
    + '<div class="twrap"><div class="tscroll"><table>'
    + '<thead><tr><th>ID</th><th>Cine</th><th>Serie</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Reportado por</th><th>Fecha</th><th></th></tr></thead>'
    + '<tbody id="tbCinesLista">' + loadingHTML() + '</tbody></table></div></div>';
  await recargarCines();
}

async function recargarCines() {
  try {
    _todasIncs = await DB.getIncidencias();
    filtrarCines();
  } catch(err) {
    const tb = document.getElementById('tbCinesLista');
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="nodata">${errorBox(err.message)}</td></tr>`;
  }
}

function filtrarCines() {
  const est = document.getElementById('fcEstado')?.value || '';
  const pri = document.getElementById('fcPrio')?.value   || '';
  const bus = (document.getElementById('fcBuscar')?.value || '').toLowerCase();

  const data = _todasIncs.filter(r => {
    if (est && r.estado    !== est) return false;
    if (pri && r.prioridad !== pri) return false;
    if (bus && ![r.cine,r.serie,r.id,r.tipo,r.nombre_usuario||''].join(' ').toLowerCase().includes(bus)) return false;
    return true;
  });

  const lc = document.getElementById('cinesCount'); if (lc) lc.textContent = data.length + ' registros';
  const tb = document.getElementById('tbCinesLista'); if (!tb) return;
  if (!data.length) { tb.innerHTML = '<tr><td colspan="9" class="nodata">Sin resultados</td></tr>'; return; }

  const canDel = currentUser.rol === 'admin';
  tb.innerHTML = data.map(r => {
    const cn = r.cine.length > 24 ? r.cine.substring(0,22)+'…' : r.cine;
    const nu = r.nombre_usuario || r.usuario_id;
    const cineSafe = r.cine.replace(/'/g, "\\'");
    return `<tr>
      <td style="font-family:var(--ff);color:var(--gold);font-weight:600;">${r.id}</td>
      <td title="${r.cine}">${cn}</td>
      <td style="color:var(--cyan);">${r.serie}</td>
      <td>${r.tipo}</td>
      <td>${prioBadge(r.prioridad)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td style="color:var(--text2);font-size:11px;">${nu}</td>
      <td style="color:var(--text2);">${formatDate(r.created_at)}</td>
      <td style="display:flex;gap:5px;">
        <button onclick="openModal('${r.id}')" style="background:var(--panel3);border:1px solid var(--border2);color:var(--text);padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;">Gestionar</button>
        ${canDel ? `<button onclick="deleteIncDirect('${r.id}','${cineSafe}','${r.estado}')" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red);padding:4px 8px;border-radius:5px;font-size:11px;cursor:pointer;" title="Eliminar">🗑</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function limpiarFiltrosCines() {
  ['fcEstado','fcPrio'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const fb = document.getElementById('fcBuscar'); if(fb) fb.value='';
  filtrarCines();
}

async function deleteIncDirect(id, cine, estado) {
  if (!requireRole('admin')) return;
  if (!confirm(`¿Eliminar la incidencia de ${cine}?\nEsta acción no se puede deshacer.`)) return;
  try {
    await DB.eliminarIncidencia(id);
    await DB.escribirLog({ id: newId('log'), incidencia_id: id, usuario_id: currentUser.id,
      nombre_usuario: currentUser.nombre, accion: 'eliminacion', estado_anterior: estado,
      estado_nuevo: '', nota: 'Eliminada desde lista por admin', created_at: nowISO() });
    showToast('Incidencia eliminada', 'success');
    _todasIncs = _todasIncs.filter(x => x.id !== id);
    filtrarCines();
    updateBadge();
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

/* ══════════════════════════════════════════════
   MODAL — Detalle y gestión
══════════════════════════════════════════════ */
async function openModal(id) {
  editingIncId = id;
  document.getElementById('modalContent').innerHTML = loadingHTML();
  document.getElementById('modalBg').classList.add('open');

  try {
    const r = await DB.getIncidencia(id);
    if (!r) { closeModal(); return; }
    
    // Seguridad: cine solo ve las suyas
    if (currentUser.rol === 'cinepolis' && r.usuario_id !== currentUser.id) { closeModal(); return; }

    // Traer el historial de esta incidencia
    const allLogs = await DB.getLog();
    const logs = allLogs.filter(l => l.incidencia_id === id);
    const logsHtml = logs.length ? logs.map(l => `
      <div style="font-size:11px; padding:8px; border-left:2px solid var(--gold); margin-bottom:6px; background:var(--bg3); border-radius:0 6px 6px 0;">
        <span style="color:var(--text2); display:block; margin-bottom:2px;">${formatDate(l.created_at)}</span>
        <span style="color:var(--cyan); font-weight:600;">${l.nombre_usuario}</span> cambió a <b style="color:var(--text);">${l.estado_nuevo}</b>
        ${l.nota ? `<div style="color:var(--text3); margin-top:4px; font-style:italic;">"${l.nota}"</div>` : ''}
      </div>
    `).join('') : '<div style="color:var(--text3); font-size:11px;">Sin historial de cambios.</div>';

    const canEditManto = ['mantenimiento','admin'].includes(currentUser.rol) && r.estado !== 'Cerrada';
    const canConfirmCine = currentUser.rol === 'cinepolis' && r.estado === 'Resuelta';
    const canDelete = currentUser.rol === 'admin';
    const nota      = r.nota_manto || '';
    const fotoUrl   = r.foto_url   || '';
    const fotoCierre = r.foto_url_cierre || '';
    
    const statusOpts = ['Abierta','En proceso','Resuelta']
      .map(s => `<option value="${s}" ${r.estado===s?'selected':''}>${s}</option>`).join('');

    document.getElementById('modalContent').innerHTML = `
      <div class="detail-row"><span class="detail-key">ID</span><span class="detail-val" style="font-family:var(--ff);color:var(--gold);font-weight:700;">${r.id}</span></div>
      <div class="detail-row"><span class="detail-key">Cine</span><span class="detail-val">${r.cine}</span></div>
      
      <div class="detail-row"><span class="detail-key">Máquina</span><span class="detail-val" style="color:var(--cyan);">${r.tipo || 'N/A'} (Serie: ${r.serie})</span></div>
      <div class="detail-row"><span class="detail-key">Tipo de Falla</span><span class="detail-val">${r.clasificacion_falla || 'N/A'}</span></div>
      
      <div class="detail-row"><span class="detail-key">Prioridad</span><span class="detail-val">${prioBadge(r.prioridad)}</span></div>
      <div class="detail-row"><span class="detail-key">Estado Actual</span><span class="detail-val">${estadoBadge(r.estado)}</span></div>
      <div class="detail-row"><span class="detail-key">Reportado por</span><span class="detail-val" style="color:var(--cyan);">${r.nombre_usuario || r.usuario_id}</span></div>
      <div class="detail-row"><span class="detail-key">Fecha de Reporte</span><span class="detail-val">${formatDate(r.created_at)}</span></div>
      <div class="detail-row" style="flex-direction:column;gap:6px;"><span class="detail-key">Descripción</span><span class="detail-val" style="color:var(--text2);line-height:1.6;">${r.descripcion}</span></div>
      
      ${fotoUrl ? `<div class="detail-row" style="margin-top:10px;"><span class="detail-key" style="color:var(--text2);">Evidencia Inicial</span><img src="${fotoUrl}" class="modal-photo" style="margin-top:4px;"></div>` : ''}
      ${fotoCierre ? `<div class="detail-row" style="margin-top:10px;flex-direction:column;gap:4px;"><span class="detail-key" style="color:var(--green);">Evidencia de Solución</span><a href="${fotoCierre}" target="_blank" style="color:var(--cyan);text-decoration:none;font-weight:bold;">📸 Ver foto de Mantenimiento</a></div>` : ''}
      
      <div style="margin-top:20px; border-top:1px solid var(--border); padding-top:16px;">
        <div class="detail-key" style="margin-bottom:10px;color:var(--text2);">Historial de Seguimiento</div>
        <div style="max-height:150px; overflow-y:auto; padding-right:5px;">${logsHtml}</div>
      </div>

      ${canEditManto ? `
        <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px;background:var(--bg2);padding:15px;border-radius:8px;">
          <div class="detail-key" style="margin-bottom:8px;color:var(--gold);">Actualizar Estado Operativo</div>
          <select class="status-select" id="modalStatus" onchange="document.getElementById('cajaFoto').style.display = this.value==='Resuelta' ? 'block' : 'none'">
            ${statusOpts}
          </select>
          
          <div id="cajaFoto" style="display:${r.estado==='Resuelta'?'block':'none'}; margin-top:12px;">
            <label class="form-label" style="color:var(--gold);">📸 Subir Evidencia (Requerida para Resuelta)</label>
            <input type="file" id="mFoto" accept="image/*" class="form-input" style="font-size:11px; padding:6px;">
          </div>

          <textarea class="nota-input" id="modalNota" placeholder="Nota de servicio o reparación..." style="margin-top:12px;">${nota}</textarea>
          <div style="display:flex;gap:10px;margin-top:12px;align-items:center;">
            <button class="save-status-btn" id="saveStatusBtn" onclick="saveStatus()">Guardar Cambios</button>
            ${canDelete ? `<button onclick="deleteInc('${r.id}','${r.estado}')" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);color:var(--red);padding:9px 16px;border-radius:6px;font-size:12px;cursor:pointer;">🗑 Eliminar</button>` : ''}
          </div>
        </div>` : ''}
        
      ${canConfirmCine ? `
        <div style="margin-top:20px; border:1px solid var(--green); border-radius:8px; padding:15px; text-align:center; background:rgba(34,197,94,0.05);">
          <div style="font-size:12px; margin-bottom:12px; color:var(--text);">Mantenimiento ha reportado este equipo como <b>Resuelto</b>. Por favor, verifica el equipo.</div>
          <button onclick="confirmarCierre()" class="btn-primary" style="background:var(--green); width:100%; font-size:14px; padding:12px;">✅ Confirmar que funciona correctamente</button>
        </div>
      ` : ''}
      
      ${r.estado === 'Cerrada' ? `<div style="margin-top:20px; color:var(--green); text-align:center; padding:15px; border:1px dashed var(--green); border-radius:8px; font-weight:bold;">✅ Ticket Cerrado y Confirmado</div>` : ''}
      `;

  } catch(err) {
    document.getElementById('modalContent').innerHTML = errorBox('Error al cargar: ' + err.message);
  }
}

async function saveStatus() {
  const btn = document.getElementById('saveStatusBtn');
  const estadoNuevo = document.getElementById('modalStatus').value;
  const nota        = document.getElementById('modalNota').value.trim();
  const fileInput   = document.getElementById('mFoto');
  
  btn.disabled = true; btn.textContent = 'Verificando...';
  
  try {
    const r = await DB.getIncidencia(editingIncId);
    let urlCierre = r.foto_url_cierre || '';

    // Regla de Negocio: No puede marcar "Resuelta" sin foto
    if (estadoNuevo === 'Resuelta' && !urlCierre && (!fileInput || !fileInput.files[0])) {
      showToast('⚠️ Debes subir una foto de evidencia para resolver la incidencia.', 'error');
      btn.disabled = false; btn.textContent = 'Guardar Cambios';
      return;
    }

    // Subir nueva foto si la seleccionó
    if (fileInput && fileInput.files && fileInput.files[0]) {
      btn.textContent = 'Subiendo foto al servidor...';
      urlCierre = await DB.subirFotoResolucion(fileInput.files[0]);
    }

    btn.textContent = 'Guardando...';
    await DB.actualizarIncidencia(editingIncId, { 
      estado: estadoNuevo, 
      nota_manto: nota,
      foto_url_cierre: urlCierre 
    });
    
    await DB.escribirLog({ id: newId('log'), incidencia_id: editingIncId,
      usuario_id: currentUser.id, nombre_usuario: currentUser.nombre,
      accion: 'cambio_estado', estado_anterior: r.estado, estado_nuevo: estadoNuevo,
      nota, created_at: nowISO() });
      
    showToast('Incidencia actualizada', 'success');
    
    // Actualizar caché y vistas
    _todasIncs = _todasIncs.map(x => x.id === editingIncId ? {...x, estado: estadoNuevo, nota_manto: nota, foto_url_cierre: urlCierre} : x);
    if(typeof filtrarCines === 'function') filtrarCines();
    closeModal();
    updateBadge();
  } catch(err) { 
    showToast('Error: ' + err.message, 'error'); 
    btn.disabled = false; btn.textContent = 'Guardar Cambios';
  }
}

// Nueva función exclusiva para el usuario del Cine
async function confirmarCierre() {
  if(!confirm('¿Estás seguro de que la máquina funciona correctamente? Al aceptar, el ticket se cerrará permanentemente.')) return;
  try {
    const r = await DB.getIncidencia(editingIncId);
    await DB.actualizarIncidencia(editingIncId, { estado: 'Cerrada' });
    
    await DB.escribirLog({ id: newId('log'), incidencia_id: editingIncId,
      usuario_id: currentUser.id, nombre_usuario: currentUser.nombre,
      accion: 'cambio_estado', estado_anterior: r.estado, estado_nuevo: 'Cerrada',
      nota: 'El Cine validó la reparación y cerró el ticket.', created_at: nowISO() });

    showToast('Ticket cerrado exitosamente ✓', 'success');
    _todasIncs = _todasIncs.map(x => x.id === editingIncId ? {...x, estado: 'Cerrada'} : x);
    
    // Refrescar vistas locales dependiendo del archivo donde estés
    if(typeof filtrarCines === 'function') filtrarCines();
    else if (typeof refreshLista === 'function') refreshLista();
    
    closeModal();
    updateBadge();
  } catch(err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteInc(id, estado) {
  if (!requireRole('admin')) return;
  if (!confirm('¿Eliminar esta incidencia permanentemente?')) return;
  try {
    await DB.eliminarIncidencia(id);
    await DB.escribirLog({ id: newId('log'), incidencia_id: id,
      usuario_id: currentUser.id, nombre_usuario: currentUser.nombre,
      accion: 'eliminacion', estado_anterior: estado, estado_nuevo: '',
      nota: 'Eliminada por admin', created_at: nowISO() });
    showToast('Incidencia eliminada', 'success');
    _todasIncs = _todasIncs.filter(x => x.id !== id);
    closeModal(); 
    if(typeof filtrarCines === 'function') filtrarCines();
    updateBadge();
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalBg')) return;
  document.getElementById('modalBg').classList.remove('open');
  editingIncId = null;
}
