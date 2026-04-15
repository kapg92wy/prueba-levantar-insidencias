/* ═══════════════════════════════════════════════
   ui.js — Helpers de interfaz reutilizables
   ═══════════════════════════════════════════════ */

// ── IDs y timestamps ─────────────────────────────
function nowISO() { return new Date().toISOString(); }
function newId(prefix) {
  return (prefix || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
}

// ── Formatear fecha ISO a español ────────────────
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
       + ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
}

// ── Badges ───────────────────────────────────────
function prioBadge(p) {
  return p === 'Urgente'
    ? '<span class="badge br">🔴 Urgente</span>'
    : '<span class="badge bw">Normal</span>';
}
function estadoBadge(e) {
  const m = {
    'Abierta':    '<span class="badge br">Abierta</span>',
    'En proceso': '<span class="badge bo">En proceso</span>',
    'Resuelta':   '<span class="badge bg">Resuelta</span>',
  };
  return m[e] || `<span class="badge bw">${e || '—'}</span>`;
}

// ── KPI card HTML ─────────────────────────────────
function kcard(color, label, val, sub) {
  return `<div class="kcard ${color}">
    <div class="klabel">${label}</div>
    <div class="kval">${val}</div>
    ${sub ? `<div class="ksub">${sub}</div>` : ''}
  </div>`;
}

// ── Error box HTML ────────────────────────────────
function errorBox(msg) {
  return `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:16px;color:var(--red);font-size:13px;">❌ ${msg}</div>`;
}

// ── Loading spinner HTML ──────────────────────────
function loadingHTML(msg) {
  return `<div class="loading-wrap"><div class="spinner"></div><div style="font-size:12px;color:var(--text2);">${msg || 'Cargando...'}</div></div>`;
}

// ── Toast notifications ───────────────────────────
function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Paginación ───────────────────────────────────
function renderPag(containerId, total, currentPage, onPageChange) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const PS = CONFIG.PAGE_SIZE;
  const totalPages = Math.ceil(total / PS);
  if (totalPages <= 1) {
    c.innerHTML = `<span class="pinfo">${total} registros</span>`;
    return;
  }
  let h = `<span class="pinfo">${total} registros · Pág ${currentPage}/${totalPages}</span>`;
  if (currentPage > 1)
    h += `<button class="pbtn" onclick="(${onPageChange})(${currentPage - 1})">‹</button>`;
  const start = Math.max(1, currentPage - 2), end = Math.min(totalPages, currentPage + 2);
  for (let p = start; p <= end; p++)
    h += `<button class="pbtn ${p === currentPage ? 'active' : ''}" onclick="(${onPageChange})(${p})">${p}</button>`;
  if (currentPage < totalPages)
    h += `<button class="pbtn" onclick="(${onPageChange})(${currentPage + 1})">›</button>`;
  c.innerHTML = h;
}

// ── Badge de conteo en nav ─────────────────────────
async function updateBadge() {
  const nb = document.getElementById('nbTotal');
  if (!nb || !currentUser) return;
  try {
    const filtros = currentUser.rol === 'cinepolis' ? { usuario_id: currentUser.id } : {};
    const incs = await DB.getIncidencias(filtros);
    const count = incs.filter(r => r.estado !== 'Resuelta').length;
    nb.textContent = count;
  } catch(e) { /* silencioso */ }
}
