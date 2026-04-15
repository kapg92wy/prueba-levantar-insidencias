/* ═══════════════════════════════════════════════
   auth.js — Autenticación
   Valida contra Supabase, guarda sesión en
   sessionStorage (se limpia al cerrar pestaña).
   ═══════════════════════════════════════════════ */

let currentUser = null;

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim().toLowerCase();
  const password = document.getElementById('loginPass').value;
  const errEl    = document.getElementById('loginErr');
  const btn      = document.getElementById('loginBtn');

  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Ingresa usuario y contraseña'; return; }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>';

  try {
    const usuario = await DB.loginUsuario(username, password);
    if (!usuario) { errEl.textContent = 'Usuario o contraseña incorrectos'; return; }

    currentUser = { ...usuario };
    sessionStorage.setItem('cp_session', JSON.stringify(currentUser));
    await initApp();

  } catch (err) {
    errEl.textContent = 'Error de conexión. Verifica tu internet e intenta de nuevo.';
    console.error('[auth] login error:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'INGRESAR';
  }
}

function doLogout() {
  currentUser = null;
  sessionStorage.removeItem('cp_session');

  // Destruir gráficas
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
  Object.keys(charts).forEach(k => delete charts[k]);

  // Cancelar Realtime
  if (window._rtChannel) { DB.desuscribir(window._rtChannel); window._rtChannel = null; }

  document.getElementById('app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginErr').textContent = '';
}

async function checkSession() {
  try {
    const s = sessionStorage.getItem('cp_session');
    if (s) { currentUser = JSON.parse(s); await initApp(); }
  } catch(e) { sessionStorage.removeItem('cp_session'); }
}

function requireRole(...roles) {
  if (!currentUser || !roles.includes(currentUser.rol)) {
    showToast('No tienes permiso para esta acción', 'error');
    return false;
  }
  return true;
}
