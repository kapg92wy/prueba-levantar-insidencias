/* ═══════════════════════════════════════════════
   supabase.js — Capa de acceso a datos
   Reemplaza completamente al localStorage.
   Todas las operaciones de BD pasan por aquí.
   ═══════════════════════════════════════════════ */

const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// Helper: lanza error descriptivo si Supabase devuelve error
function sbCheck(data, error, op) {
  if (error) throw new Error(`[${op}] ${error.message}`);
  return data;
}

const DB = {

  /* ─────────────────────────────────────────────
     USUARIOS
  ───────────────────────────────────────────── */
  async getUsuarios() {
    const { data, error } = await sb
      .from(CONFIG.TABLA_USUARIOS)
      .select('*')
      .eq('activo', 1)
      .order('created_at');
    return sbCheck(data, error, 'getUsuarios');
  },

  async loginUsuario(username, password) {
    const { data, error } = await sb
      .from(CONFIG.TABLA_USUARIOS)
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .eq('activo', 1)
      .maybeSingle();
    return sbCheck(data, error, 'loginUsuario');
  },

  async crearUsuario(u) {
    const { data, error } = await sb
      .from(CONFIG.TABLA_USUARIOS)
      .insert([u]).select().single();
    return sbCheck(data, error, 'crearUsuario');
  },

  async actualizarUsuario(id, cambios) {
    cambios.updated_at = new Date().toISOString();
    const { data, error } = await sb
      .from(CONFIG.TABLA_USUARIOS)
      .update(cambios).eq('id', id).select().single();
    return sbCheck(data, error, 'actualizarUsuario');
  },

  async desactivarUsuario(id) {
    const { error } = await sb
      .from(CONFIG.TABLA_USUARIOS)
      .update({ activo: 0, updated_at: new Date().toISOString() })
      .eq('id', id);
    sbCheck(null, error, 'desactivarUsuario');
  },

  /* ─────────────────────────────────────────────
     INCIDENCIAS
  ───────────────────────────────────────────── */
  async getIncidencias(filtros = {}) {
    let q = sb.from(CONFIG.TABLA_INCIDENCIAS).select('*');
    if (filtros.usuario_id) q = q.eq('usuario_id', filtros.usuario_id);
    if (filtros.estado)     q = q.eq('estado', filtros.estado);
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    return sbCheck(data, error, 'getIncidencias');
  },

  async getIncidencia(id) {
    const { data, error } = await sb
      .from(CONFIG.TABLA_INCIDENCIAS)
      .select('*').eq('id', id).single();
    return sbCheck(data, error, 'getIncidencia');
  },

  async crearIncidencia(inc) {
    const { data, error } = await sb
      .from(CONFIG.TABLA_INCIDENCIAS)
      .insert([inc]).select().single();
    return sbCheck(data, error, 'crearIncidencia');
  },

  async actualizarIncidencia(id, cambios) {
    cambios.updated_at = new Date().toISOString();
    // Registrar cuándo se marcó Resuelta (para el auto-cierre de 24h)
    if (cambios.estado === 'Resuelta') cambios.fecha_resuelta = cambios.updated_at;
    else if (cambios.estado && cambios.estado !== 'Resuelta') cambios.fecha_resuelta = null;
    const { data, error } = await sb
      .from(CONFIG.TABLA_INCIDENCIAS)
      .update(cambios).eq('id', id).select().single();
    return sbCheck(data, error, 'actualizarIncidencia');
  },

  async eliminarIncidencia(id) {
    const { error } = await sb
      .from(CONFIG.TABLA_INCIDENCIAS).delete().eq('id', id);
    sbCheck(null, error, 'eliminarIncidencia');
  },

  /* ─────────────────────────────────────────────
     LOG
  ───────────────────────────────────────────── */
  async getLog() {
    const { data, error } = await sb
      .from(CONFIG.TABLA_LOG)
      .select('*')
      .order('created_at', { ascending: false });
    return sbCheck(data, error, 'getLog');
  },

  async escribirLog(entrada) {
    const { error } = await sb
      .from(CONFIG.TABLA_LOG).insert([entrada]);
    sbCheck(null, error, 'escribirLog');
  },

  /* ─────────────────────────────────────────────
     DASHBOARD SNAPSHOT
  ───────────────────────────────────────────── */
  async getDashboard() {
    const { data, error } = await sb
      .from(CONFIG.TABLA_SNAPSHOT)
      .select('*').eq('id', 1).single();
    return sbCheck(data, error, 'getDashboard');
  },

  async guardarDashboard(datos, usuario) {
    const { error } = await sb
      .from(CONFIG.TABLA_SNAPSHOT)
      .upsert({ id: 1, datos, actualizado_por: usuario, updated_at: new Date().toISOString() });
    sbCheck(null, error, 'guardarDashboard');
  },

  /* ─────────────────────────────────────────────
     REALTIME — incidencias en tiempo real
  ───────────────────────────────────────────── */
  suscribirIncidencias(callback) {
    return sb.channel('inc-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: CONFIG.TABLA_INCIDENCIAS }, callback)
      .subscribe();
  },

  desuscribir(ch) { if (ch) sb.removeChannel(ch); },

  /* ─────────────────────────────────────────────
     STORAGE (FOTOS)
  ───────────────────────────────────────────── */
  async subirFotoResolucion(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `resolucion_${Date.now()}.${fileExt}`;
    
    // Sube el archivo al bucket "fotos_incidencias"
    const { error } = await sb.storage.from('fotos_incidencias').upload(fileName, file);
    if (error) throw new Error(`Error al subir foto: ${error.message}`);
    
    // Obtiene el link público de la foto
    const { data } = sb.storage.from('fotos_incidencias').getPublicUrl(fileName);
    return data.publicUrl;
  }
  /* ─────────────────────────────────────────────
     MÁQUINAS (cp_maquinas)
  ───────────────────────────────────────────── */
  async getMaquinas(cine) {
    let q = sb.from('cp_maquinas').select('*').order('nombre');
    if (cine) q = q.eq('cine', cine);
    const { data, error } = await q;
    return sbCheck(data, error, 'getMaquinas');
  },

  async getCinesUnicos() {
    const { data, error } = await sb
      .from('cp_maquinas').select('cine').order('cine');
    if (error) throw new Error('[getCinesUnicos] ' + error.message);
    return [...new Set(data.map(r => r.cine))];
  },

  async sincronizarMaquinas(maquinas) {
    if (!maquinas || !maquinas.length) return { ok: 0 };
    const BATCH = 200;
    let ok = 0;
    const errores = [];
    for (let i = 0; i < maquinas.length; i += BATCH) {
      const lote = maquinas.slice(i, i + BATCH);
      const { error } = await sb.from('cp_maquinas').upsert(lote, { onConflict: 'id' });
      if (error) errores.push(`Lote ${Math.floor(i/BATCH)+1}: ${error.message}`);
      else ok += lote.length;
    }
    if (errores.length) throw new Error(errores.join(' | '));
    return { ok };
  },

  /* ─────────────────────────────────────────────
     STORAGE (FOTOS)
  ───────────────────────────────────────────── */
  async subirFoto(file, carpeta) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${carpeta||'general'}/${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`;
    const { error } = await sb.storage.from('fotos_incidencias').upload(path, file, { cacheControl:'3600', upsert:false });
    if (error) throw new Error('Error al subir foto: ' + error.message);
    const { data } = sb.storage.from('fotos_incidencias').getPublicUrl(path);
    return data.publicUrl;
  },

  async subirFotoResolucion(file) { return this.subirFoto(file, 'resoluciones'); },


};
