/* ═══════════════════════════════════════════════
   usuarios.js — Gestión de usuarios y log
   Solo accesible para rol admin
   ═══════════════════════════════════════════════ */

let editingUserId = null;

async function renderUsuarios(container) {
  container.innerHTML = loadingHTML('Cargando usuarios...');
  try {
    const users = await DB.getUsuarios();
    const rolBadge = {
      cinepolis:    '<span class="badge bc">Cinépolis</span>',
      mantenimiento:'<span class="badge bo">Mantenimiento</span>',
      admin:        '<span class="badge bp">Admin</span>',
    };

    container.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">'
      + '<div><div style="font-family:var(--ff);font-size:18px;font-weight:700;">Gestión de Usuarios</div>'
      + '<div style="font-size:11px;color:var(--text2);margin-top:2px;">'+users.length+' usuarios activos · Supabase</div></div>'
      + '<button class="btn-primary" onclick="openUserModal()">+ Nuevo Usuario</button></div>'

      // Tarjetas BD
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px;">'
      + '<div class="icard" onclick="renderTab(\'log\')">'
      + '<div class="ititle"><div style="font-size:18px;">📋</div>Ver Log de Auditoría</div>'
      + '<div style="font-size:11px;color:var(--text2);">Historial de cambios guardado en Supabase.</div></div>'
      + '</div>'

      // Tabla usuarios
      + '<div class="twrap"><div class="tscroll"><table>'
      + '<thead><tr><th>ID</th><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Creado</th><th>Acciones</th></tr></thead>'
      + '<tbody>' + users.map(u => `
          <tr>
            <td style="color:var(--text3);font-size:10px;">${u.id}</td>
            <td style="font-family:var(--ff);color:var(--gold);font-weight:600;">${u.username}</td>
            <td>${u.nombre}</td>
            <td>${rolBadge[u.rol] || u.rol}</td>
            <td style="color:var(--text2);font-size:11px;">${formatDate(u.created_at)}</td>
            <td style="display:flex;gap:6px;">
              <button class="btn-sm" onclick="openUserModal('${u.id}')">Editar</button>
              ${u.username !== 'admin' ? `<button class="btn-sm danger" onclick="deleteUser('${u.id}')">Eliminar</button>` : ''}
            </td>
          </tr>`).join('')
      + '</tbody></table></div></div>';

  } catch(err) {
    container.innerHTML = errorBox('No se pudieron cargar los usuarios: ' + err.message);
  }
}

/* ══════════════════════════════════════════════
   MODAL — Gestión de Usuarios (Dinámico)
══════════════════════════════════════════════ */
function openUserModal(userId) {
  editingUserId = userId || null;
  const users = window._cachedUsers || [];
  const u = userId ? users.find(x => x.id === userId) : null;

  // 1. Extraer cines únicos leyendo la variable D directamente (¡Corregido!)
  const cat = (typeof D !== 'undefined' && D.catalogo_maquinas) ? D.catalogo_maquinas : [];
  const cinesUnicos = cat.length > 0 ? [...new Set(cat.map(m => m.cine))].sort() : [];
  
  const cineOptions = cinesUnicos.length > 0 
    ? cinesUnicos.map(c => `<option value="${c}" ${u && u.nombre===c ? 'selected':''}>${c}</option>`).join('')
    : '<option value="">⚠️ Sube el archivo Excel primero para ver los cines</option>';

  // 2. Función para alternar entre lista de cines y campo de texto
  window.toggleUserForm = function() {
    const rol = document.getElementById('uRol').value;
    const isCine = (rol === 'cinepolis');
    document.getElementById('boxNombreCine').style.display = isCine ? 'block' : 'none';
    document.getElementById('boxNombreTexto').style.display = isCine ? 'none' : 'block';
  };

  document.getElementById('userModalTitle').textContent = u ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('userModalContent').innerHTML = `
    
    <div class="form-group" style="margin-bottom:14px;">
      <label class="form-label">Rol</label>
      <select class="form-select" id="uRol" onchange="toggleUserForm()" ${u && u.username === 'admin' ? 'disabled' : ''}>
        <option value="cinepolis"     ${u?.rol==='cinepolis'?'selected':''}>Cinépolis (Conjunto)</option>
        <option value="mantenimiento" ${u?.rol==='mantenimiento'?'selected':''}>Mantenimiento (Técnico)</option>
        <option value="admin"         ${u?.rol==='admin'?'selected':''}>Admin</option>
      </select>
    </div>

    <div class="form-group" id="boxNombreCine" style="margin-bottom:14px;">
      <label class="form-label">Nombre Exacto del Conjunto *</label>
      <select class="form-select" id="uNombreCine">
        <option value="">— Selecciona el Cine de la lista —</option>
        ${cineOptions}
      </select>
    </div>

    <div class="form-group" id="boxNombreTexto" style="margin-bottom:14px; display:none;">
      <label class="form-label">Nombre del Empleado *</label>
      <input class="form-input" id="uNombreTexto" type="text" value="${u && u.rol !== 'cinepolis' ? u.nombre : ''}" placeholder="Ej. Juan Pérez">
    </div>

    <div class="form-group" style="margin-bottom:14px;">
      <label class="form-label">Usuario (login)</label>
      <input class="form-input" id="uUser" type="text" value="${u ? u.username : ''}" placeholder="usuario123"
        ${u && u.username === 'admin' ? 'readonly' : ''} autocomplete="off">
    </div>

    <div class="form-group" style="margin-bottom:20px;">
      <label class="form-label">Contraseña ${u ? '(vacío = no cambiar)' : '*'}</label>
      <input class="form-input" id="uPass" type="password" placeholder="••••••••" autocomplete="new-password">
    </div>

    <div style="display:flex;gap:10px;">
      <button class="btn-primary" id="saveUserBtn" onclick="saveUser()">Guardar</button>
      <button class="btn-ghost" onclick="closeUserModal()">Cancelar</button>
    </div>
    <div style="color:var(--red);font-size:12px;margin-top:8px;" id="userFormErr"></div>`;

  document.getElementById('modalUserBg').classList.add('open');
  toggleUserForm(); // Ejecutar al abrir para acomodar las cajas correctamente

  // Si estamos editando, necesitamos los datos actuales del usuario para el form
  if (userId) {
    DB.getUsuarios().then(users => { window._cachedUsers = users; }).catch(()=>{});
  }
}

async function saveUser() {
  const rol = document.getElementById('uRol').value;
  
  // Dependiendo del rol, tomamos el nombre del Select o del Input
  const nombre = (rol === 'cinepolis') 
    ? document.getElementById('uNombreCine').value 
    : document.getElementById('uNombreTexto').value.trim();

  const username = document.getElementById('uUser').value.trim().toLowerCase();
  const pass     = document.getElementById('uPass').value;
  const err      = document.getElementById('userFormErr');
  const btn      = document.getElementById('saveUserBtn');

  if (!nombre || !username) { err.textContent = 'Nombre y usuario son obligatorios'; return; }

  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    const ts = nowISO();
    if (editingUserId) {
      const cambios = { nombre, username, rol, updated_at: ts };
      if (pass) cambios.password = pass;
      await DB.actualizarUsuario(editingUserId, cambios);
      showToast('Usuario actualizado', 'success');
    } else {
      if (!pass) { err.textContent = 'La contraseña es obligatoria'; return; }
      await DB.crearUsuario({
        id: newId('u'), username, password: pass, rol, nombre,
        activo: 1, created_at: ts, updated_at: ts,
      });
      showToast('Usuario creado', 'success');
    }
    closeUserModal();
    renderTab('usuarios');
  } catch(e) {
    err.textContent = 'Error: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

async function deleteUser(userId) {
  if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
  try {
    await DB.desactivarUsuario(userId);
    showToast('Usuario eliminado', 'success');
    renderTab('usuarios');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function closeUserModal(e) {
  if (e && e.target !== document.getElementById('modalUserBg')) return;
  document.getElementById('modalUserBg').classList.remove('open');
  editingUserId = null;
}
/* ── Log de Auditoría ────────────────────────── */
async function renderLog(container) {
  container.innerHTML = loadingHTML('Cargando log de Supabase...');
  try {
    const logs = await DB.getLog();
    container.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<div><div style="font-family:var(--ff);font-size:18px;font-weight:700;">📋 Log de Auditoría</div>'
      + '<div style="font-size:11px;color:var(--text2);margin-top:2px;">'+ logs.length +' entradas · cp_incidencias_log en Supabase</div></div>'
      + '<button class="btn-ghost" onclick="renderTab(\'usuarios\')">← Volver</button></div>'
      + '<div class="twrap"><div class="tscroll"><table>'
      + '<thead><tr><th>Fecha</th><th>Incidencia</th><th>Usuario</th><th>Acción</th><th>Estado Anterior</th><th>Estado Nuevo</th><th>Nota</th></tr></thead>'
      + '<tbody>' + (logs.length ? logs.map(l => {
          const acBadge = {
            'creacion':     '<span class="badge bg">creación</span>',
            'cambio_estado':'<span class="badge bb">cambio estado</span>',
            'eliminacion':  '<span class="badge br">eliminación</span>',
          }[l.accion] || `<span class="badge bw">${l.accion}</span>`;
          const nota = (l.nota||'').substring(0,50) + ((l.nota||'').length>50?'…':'');
          return `<tr>
            <td style="color:var(--text2);font-size:11px;white-space:nowrap;">${formatDate(l.created_at)}</td>
            <td style="font-family:var(--ff);color:var(--gold);">${l.incidencia_id}</td>
            <td style="color:var(--cyan);font-size:11px;">${l.nombre_usuario}</td>
            <td>${acBadge}</td>
            <td>${estadoBadge(l.estado_anterior)}</td>
            <td>${estadoBadge(l.estado_nuevo)}</td>
            <td style="color:var(--text2);font-size:11px;" title="${(l.nota||'').replace(/"/g,"'")}">${nota}</td>
          </tr>`;
        }).join('') : '<tr><td colspan="7" class="nodata">Sin entradas en el log</td></tr>')
      + '</tbody></table></div></div>';
  } catch(err) {
    container.innerHTML = errorBox('No se pudo cargar el log: ' + err.message);
  }
}
