/* ═══════════════════════════════════════════════
   config.js — Configuración y credenciales
   ⚠️  REEMPLAZA los dos valores de abajo con los
       de tu proyecto en supabase.com/dashboard
       Settings → API
   ═══════════════════════════════════════════════ */
const CONFIG = {
  SUPABASE_URL:      'https://lgvwtrwrwivzwcathviv.supabase.co',  // ← CAMBIA
  SUPABASE_ANON_KEY: 'sb_publishable_6yCTMT1SFK4j0_0hRet1gQ_ZjhC_K3K',                 // ← CAMBIA

  TABLA_USUARIOS:    'cp_usuarios',
  TABLA_INCIDENCIAS: 'cp_incidencias',
  TABLA_LOG:         'cp_incidencias_log',
  TABLA_SNAPSHOT:    'cp_dashboard_snapshot',

  PAGE_SIZE: 50,
};
