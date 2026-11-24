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
  CFL: {
    sigla: 'CFL',
    titulo: 'Capitão Fluvial',
    secao: 'Seção de Convés',
    foco: 'Comando e Manobra',
    nota: 'posto máximo no comando dos comboios',
    comando: true
  },
  PLF: {
    sigla: 'PLF',
    titulo: 'Piloto Fluvial',
    secao: 'Seção de Convés',
    foco: 'Comando e Manobra',
    nota: '',
    comando: true
  },
  MFL: {
    sigla: 'MFL',
    titulo: 'Mestre Fluvial',
    secao: 'Seção de Convés',
    foco: 'Comando e Manobra',
    nota: '',
    comando: true
  },
  CMF: {
    sigla: 'CMF',
    titulo: 'Contramestre Fluvial',
    secao: 'Seção de Convés',
    foco: 'Comando e Manobra',
    nota: '',
    comando: false
  },
  MFC: {
    sigla: 'MFC',
    titulo: 'Marinheiro Fluvial de Convés',
    secao: 'Seção de Convés',
    foco: 'Comando e Manobra',
    nota: '',
    comando: false
  },
  MAC: {
    sigla: 'MAC',
    titulo: 'Marinheiro Auxiliar de Convés',
    secao: 'Seção de Convés',
    foco: 'Comando e Manobra',
    nota: '',
    comando: false
  },
  SUF: {
    sigla: 'SUF',
    titulo: 'Supervisor Maquinista-Motorista Fluvial',
    secao: 'Seção de Máquinas',
    foco: 'Motores e Propulsão',
    nota: 'chefe de máquinas da embarcação',
    comando: true
  },
  CTF: {
    sigla: 'CTF',
    titulo: 'Condutor Maquinista-Motorista Fluvial',
    secao: 'Seção de Máquinas',
    foco: 'Motores e Propulsão',
    nota: '',
    comando: true
  },
  MFM: {
    sigla: 'MFM',
    titulo: 'Marinheiro Fluvial de Máquinas',
    secao: 'Seção de Máquinas',
    foco: 'Motores e Propulsão',
    nota: '',
    comando: false
  },
  MAM: {
    sigla: 'MAM',
    titulo: 'Marinheiro Auxiliar de Máquinas',
    secao: 'Seção de Máquinas',
    foco: 'Motores e Propulsão',
    nota: '',
    comando: false
  },
  CZA: {
    sigla: 'CZA',
    titulo: 'Cozinheiro',
    secao: 'Seção de Câmara',
    foco: 'Alimentação e Apoio',
    nota: '',
    comando: false
  },
  TAA: {
    sigla: 'TAA',
    titulo: 'Taifeiro',
    secao: 'Seção de Câmara',
    foco: 'Alimentação e Apoio',
    nota: '',
    comando: false
  }
};