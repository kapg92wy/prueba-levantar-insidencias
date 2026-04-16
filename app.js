/* ═══════════════════════════════════════════════
   app.js — Router principal e inicialización
   ═══════════════════════════════════════════════ */

// Suscripción Realtime activa
window._rtChannel = null;

/* ── Inicializar app tras login ─────────────────── */
async function initApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Header según rol
  const rolMap   = { cinepolis:'cine', mantenimiento:'mant', admin:'admin', ejecutivo:'exec' };
  const rolLabel = { cinepolis:'CINÉPOLIS', mantenimiento:'MANTENIMIENTO', admin:'ADMINISTRADOR', ejecutivo:'EJECUTIVO' };
  const badge = document.getElementById('roleBadge');
  badge.textContent = rolLabel[currentUser.rol] || currentUser.rol.toUpperCase();
  badge.className   = 'hbadge ' + (rolMap[currentUser.rol] || 'bw');
  document.getElementById('userLabel').textContent = currentUser.nombre;

  if (['admin','mantenimiento','ejecutivo'].includes(currentUser.rol)) {
    document.getElementById('liveBadge').style.display = 'flex';
    document.getElementById('fechaBadge').style.display = 'block';
    document.getElementById('headerTitle').textContent = 'DASHBOARD OPERATIVO';
    document.getElementById('headerSub').textContent   = 'Cinépolis · Gestión de Máquinas y Servicios';
    await cargarDashboardSnapshot();
    const fb = document.getElementById('fechaBadge');
    if (fb) fb.textContent = D.fecha_actualizacion || '—';
  }

  buildNav();

  // Tab inicial según rol
  const firstTab = currentUser.rol === 'cinepolis'
    ? 'inicio'
    : currentUser.rol === 'mantenimiento'
      ? 'incidencias_cines'
      : 'dashboard';
  renderTab(firstTab);

  // Realtime para todos excepto cines
  if (currentUser.rol !== 'cinepolis') {
    window._rtChannel = DB.suscribirIncidencias((payload) => {
      // Actualizar badge automáticamente cuando hay cambios
      updateBadge();
      // Si la lista de incidencias está visible, recargar silenciosamente
      const tbC = document.getElementById('tbCinesLista');
      if (tbC) {
        DB.getIncidencias().then(data => {
          _todasIncs = data;
          filtrarCines();
        }).catch(()=>{});
      }
    });
  }

  // Event listeners globales de modales y botones
  setupEventListeners();
}

/* ── Construir navegación ────────────────────────── */
function buildNav() {
  const rol = currentUser.rol;
  let tabs = [];

  if (rol === 'cinepolis') {
    tabs = [
      { id:'inicio',  label:'🏠 Mi Panel' },
      { id:'nueva',   label:'➕ Reportar Incidencia' },
      { id:'lista',   label:'📋 Mis Incidencias', badge:true },
    ];
  } else if (rol === 'mantenimiento') {
    tabs = [
      { id:'incidencias_cines',    label:'📩 Incidencias Reportadas', badge:true },
      { id:'dashboard_resumen',    label:'📊 Resumen General' },
      { id:'dashboard_incidencias',label:'🔧 Incidencias BD' },
      { id:'dashboard_prioridad',  label:'⚡ Por Prioridad' },
      { id:'dashboard_venta',      label:'📈 Alerta Venta' },
      { id:'dashboard_cinepolis',  label:'🎯 Reporte Cinépolis' },
    ];
  } else if (rol === 'ejecutivo') {
    // Solo lectura — ve todo pero no puede modificar nada
    tabs = [
      { id:'dashboard',            label:'📊 Resumen General' },
      { id:'incidencias_cines',    label:'📩 Incidencias Cines', badge:true },
      { id:'dashboard_incidencias',label:'🔧 Incidencias BD' },
      { id:'dashboard_prioridad',  label:'⚡ Por Prioridad' },
      { id:'dashboard_venta',      label:'📈 Alerta Venta' },
      { id:'dashboard_cinepolis',  label:'🎯 Reporte Cinépolis' },
    ];
  } else { // admin
    tabs = [
      { id:'dashboard',            label:'📊 Resumen General' },
      { id:'incidencias_cines',    label:'📩 Incidencias Cines', badge:true },
      { id:'dashboard_incidencias',label:'🔧 Incidencias BD' },
      { id:'dashboard_prioridad',  label:'⚡ Por Prioridad' },
      { id:'dashboard_venta',      label:'📈 Alerta Venta' },
      { id:'dashboard_cinepolis',  label:'🎯 Reporte Cinépolis' },
      { id:'actualizador',         label:'⚡ Actualizar Datos' },
      { id:'usuarios',             label:'👥 Usuarios' },
    ];
  }

  const nav = document.getElementById('mainNav');
  nav.innerHTML = tabs.map(t =>
    `<div class="ntab" data-tab="${t.id}">${t.label}${t.badge ? '<span class="nbadge" id="nbTotal">0</span>' : ''}</div>`
  ).join('');

  nav.querySelectorAll('.ntab').forEach(t => {
    t.addEventListener('click', function() {
      nav.querySelectorAll('.ntab').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      renderTab(this.dataset.tab);
    });
  });

  nav.querySelector('.ntab').classList.add('active');
  updateBadge();
}

/* ── Router de tabs ──────────────────────────────── */
function renderTab(tab) {
  const mc = document.getElementById('mainContent');

  // Destruir gráficas anteriores
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
  Object.keys(charts).forEach(k => delete charts[k]);

  mc.innerHTML = `<div id="tab-${tab}" class="tab active"></div>`;
  const div = document.getElementById('tab-' + tab);

  switch(tab) {
    case 'inicio':               renderInicio(div);                break;
    case 'nueva':                renderNueva(div);                 break;
    case 'lista':                renderLista(div);                 break;
    case 'usuarios':             renderUsuarios(div);              break;
    case 'log':                  renderLog(div);                   break;
    case 'incidencias_cines':    renderIncidenciasCines(div);      break;
    case 'dashboard':
    case 'dashboard_resumen':    renderDashboard(div);             break;
    case 'dashboard_incidencias':renderDashboardIncidencias(div);  break;
    case 'dashboard_prioridad':  renderDashboardPrioridad(div);    break;
    case 'dashboard_venta':      renderDashboardVenta(div);        break;
    case 'dashboard_cinepolis':  renderDashboardCinepolis(div);    break;
    case 'actualizador':         renderActualizador(div);          break;
    default: div.innerHTML = `<div class="nodata">Tab "${tab}" no encontrado</div>`;
  }

  // Activar tab en nav (para llamadas programáticas)
  document.getElementById('mainNav').querySelectorAll('.ntab').forEach(t => {
    if (t.dataset.tab === tab) t.classList.add('active');
    else t.classList.remove('active');
  });
}

/* ── Event listeners globales ────────────────────── */
function setupEventListeners() {
  // Login con Enter
  document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('loginUser').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

  // Botón login
  document.getElementById('loginBtn').onclick = doLogin;

  // Botón logout
  document.getElementById('logoutBtn').onclick = doLogout;

  // Cerrar modal incidencia al click en fondo
  document.getElementById('modalBg').addEventListener('click', closeModal);
  document.getElementById('modalCloseBtn').addEventListener('click', () => closeModal());

  // Cerrar modal usuario al click en fondo
  document.getElementById('modalUserBg').addEventListener('click', closeUserModal);
  document.getElementById('userModalCloseBtn').addEventListener('click', () => closeUserModal());
}

/* ── Arrancar ─────────────────────────────────────── */
// Setup listeners del login (disponibles antes del login)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('loginUser').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('loginBtn').onclick = doLogin;

  // Verificar si hay sesión guardada
  checkSession();
});
