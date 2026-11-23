export const APP_CONFIG = {
  supabaseUrl: 'https://lnnsabfptrihvqxjsjet.supabase.co',
  supabaseKey: 'sb_publishable_JccD6GwRfiieTSCoqlJt9A_jrn--ykd',
  cacheName: 'diario-bordo-shell-v1',
  escalaPadrao: {
    diasTrabalho: 10,
    diasFolga: 5,
    minDias: 1,
    maxDias: 365
  },
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    maxDimensao: 800,
    mimePermitidos: ['image/jpeg', 'image/png', 'image/webp']
  },
  storageKeys: {
    avisoFolgaDispensado: 'diario_bordo_aviso_folga_dispensado',
    continuaTrabalhandoHoje: 'diario_bordo_continua_trab_hoje',
    cachePerfilPrefix: 'diario_bordo_cache_perfil_',
    cacheEscalasPrefix: 'diario_bordo_cache_escalas_'
  }
};

export const PATENTES_BORDO = {
  // Convés, Máquinas e Câmara...
};
