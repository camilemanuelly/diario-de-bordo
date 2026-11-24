import { APP_CONFIG } from './config.js';

function chavePerfil(userId) {
  return `${APP_CONFIG.storageKeys.cachePerfilPrefix}${userId}`;
}

function chaveEscalas(userId) {
  return `${APP_CONFIG.storageKeys.cacheEscalasPrefix}${userId}`;
}

export function lerFlagStorage(chave) {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function salvarFlagStorage(chave, valor) {
  try {
    if (valor === null || valor === undefined) {
      window.localStorage.removeItem(chave);
    } else {
      window.localStorage.setItem(chave, String(valor));
    }
    return true;
  } catch {
    return false;
  }
}

export function removerFlagStorage(chave) {
  try {
    window.localStorage.removeItem(chave);
    return true;
  } catch {
    return false;
  }
}

function escreverEnvelope(chave, dados) {
  try {
    const payload = {
      dados,
      salvoEm: new Date().toISOString()
    };
    window.localStorage.setItem(chave, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function lerEnvelope(chave) {
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return null;
    const parsed = JSON.parse(bruto);
    if (!parsed || typeof parsed !== 'object' || !('dados' in parsed)) return null;
    return {
      dados: parsed.dados,
      salvoEm: parsed.salvoEm || null
    };
  } catch {
    return null;
  }
}

export function salvarCachePerfil(userId, perfil) {
  if (!userId) return false;
  return escreverEnvelope(chavePerfil(userId), perfil);
}

export function lerCachePerfil(userId) {
  if (!userId) return null;
  return lerEnvelope(chavePerfil(userId));
}

export function salvarCacheEscalas(userId, escalas) {
  if (!userId || !Array.isArray(escalas)) return false;
  return escreverEnvelope(chaveEscalas(userId), escalas);
}

export function lerCacheEscalas(userId) {
  if (!userId) return null;
  const envelope = lerEnvelope(chaveEscalas(userId));
  if (!envelope || !Array.isArray(envelope.dados)) return null;
  return envelope;
}

export function limparCacheUsuario(userId) {
  if (!userId) return;
  removerFlagStorage(chavePerfil(userId));
  removerFlagStorage(chaveEscalas(userId));
}

export function lerAvisoFolgaVistoHoje(userId) {
  if (!userId) return null;
  return lerFlagStorage(`${APP_CONFIG.storageKeys.avisoFolgaDispensado}_${userId}`);
}

export function marcarAvisoFolgaVistoHoje(userId, hojeIso) {
  if (!userId) return false;
  return salvarFlagStorage(`${APP_CONFIG.storageKeys.avisoFolgaDispensado}_${userId}`, hojeIso);
}

export function lerContinuaTrabalhandoHoje(userId) {
  if (!userId) return null;
  return lerFlagStorage(`${APP_CONFIG.storageKeys.continuaTrabalhandoHoje}_${userId}`);
}

export function salvarContinuaTrabalhandoHoje(userId, hojeIso) {
  if (!userId) return false;
  return salvarFlagStorage(`${APP_CONFIG.storageKeys.continuaTrabalhandoHoje}_${userId}`, hojeIso);
}