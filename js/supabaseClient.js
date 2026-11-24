import { APP_CONFIG } from './config.js';

let clientInstance = null;

export function obterClienteSupabase() {
  if (clientInstance) return clientInstance;

  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    throw new Error('SDK do Supabase não foi carregado na página.');
  }

  if (!APP_CONFIG.supabaseUrl?.startsWith('https://') || !APP_CONFIG.supabaseKey) {
    throw new Error('Configuração do Supabase inválida em js/config.js.');
  }

  clientInstance = sdk.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });

  return clientInstance;
}

export function traduzirErroSupabase(erro, mensagemPadrao = 'Ocorreu um erro inesperado.') {
  const texto = String(erro?.message || erro?.details || erro || '');
  const codigo = String(erro?.code || '');

  if (codigo === '23P01' || texto.includes('excl_escalas_sem_sobreposicao_operacional')) {
    return 'Já existe um registro de Porto, Embarque ou Folga nessas datas. Ajuste o período ou edite o lançamento existente.';
  }
  if (texto.includes('chk_escalas_datas_ordenadas') || texto.includes('anterior à data inicial')) {
    return 'A data final deve ser igual ou posterior à data inicial.';
  }
  if (texto.includes('chk_escalas_dias_totais_positivo')) {
    return 'A duração do período deve ser de pelo menos 1 dia.';
  }
  if (texto.includes('chk_perfis_dias_trabalho_range') || texto.includes('chk_perfis_dias_folga_range')) {
    return `Os dias de trabalho e de folga da escala devem ficar entre ${APP_CONFIG.escalaPadrao.minDias} e ${APP_CONFIG.escalaPadrao.maxDias}.`;
  }
  if (texto.includes('chk_perfis_posto_valido')) {
    return 'Patente ou função inválida selecionada.';
  }
  if (texto.toLowerCase().includes('maximum allowed size') || texto.toLowerCase().includes('payload too large')) {
    return 'A imagem ultrapassa o limite máximo de 2 MB.';
  }
  if (texto.toLowerCase().includes('mime type') || texto.toLowerCase().includes('invalid file type')) {
    return 'Formato de imagem inválido. Use JPEG, PNG ou WebP.';
  }
  if (codigo === '42501' || texto.toLowerCase().includes('row-level security')) {
    return 'Sem permissão para realizar esta operação. Faça login novamente.';
  }

  return erro?.message || mensagemPadrao;
}

export function escutarMudancaAuth(callback) {
  const sb = obterClienteSupabase();
  return sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

export async function obterSessaoAtual() {
  const sb = obterClienteSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function entrarComSenha(email, password) {
  const sb = obterClienteSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function cadastrarComSenha(email, password) {
  const sb = obterClienteSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function enviarResetSenha(email) {
  const sb = obterClienteSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function sairDaConta() {
  const sb = obterClienteSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export async function atualizarUsuarioAuth(updates) {
  const sb = obterClienteSupabase();
  const { error } = await sb.auth.updateUser(updates);
  if (error) throw error;
}

export async function buscarOuCriarPerfil(user) {
  const sb = obterClienteSupabase();

  const { data, error } = await sb
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const perfilInicial = {
    id: user.id,
    nome_exibicao: user.user_metadata?.nome_exibicao || '',
    empresa: 'Atem',
    dias_trabalho: APP_CONFIG.escalaPadrao.diasTrabalho,
    dias_folga: APP_CONFIG.escalaPadrao.diasFolga
  };

  const { data: criado, error: erroInsert } = await sb
    .from('perfis')
    .insert([perfilInicial])
    .select()
    .maybeSingle();

  if (erroInsert) throw erroInsert;
  return criado || perfilInicial;
}

export async function atualizarPerfilUsuario(userId, payload) {
  const sb = obterClienteSupabase();
  const { data, error } = await sb
    .from('perfis')
    .update(payload)
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function prepararImagemAvatar(arquivo) {
  if (!arquivo) return null;

  const { maxBytes, maxDimensao, mimePermitidos } = APP_CONFIG.avatar;
  if (!mimePermitidos.includes(arquivo.type)) {
    throw new Error('Formato de imagem inválido. Use JPEG, PNG ou WebP.');
  }

  const bitmap = await createImageBitmap(arquivo);
  let largura = bitmap.width;
  let altura = bitmap.height;

  if (largura > maxDimensao || altura > maxDimensao) {
    if (largura >= altura) {
      altura = Math.round((altura * maxDimensao) / largura);
      largura = maxDimensao;
    } else {
      largura = Math.round((largura * maxDimensao) / altura);
      altura = maxDimensao;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, largura);
  canvas.height = Math.max(1, altura);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === 'function') bitmap.close();

  const formatoSaida = arquivo.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const extensaoSaida = formatoSaida === 'image/webp' ? 'webp' : 'jpg';

  let qualidade = 0.86;
  let blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, formatoSaida, qualidade)
  );

  while (blob && blob.size > maxBytes && qualidade > 0.45) {
    qualidade = Number((qualidade - 0.1).toFixed(2));
    blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, formatoSaida, qualidade)
    );
  }

  if (!blob || blob.size > maxBytes) {
    throw new Error('Não foi possível reduzir a imagem para até 2 MB. Escolha uma foto menor.');
  }

  return { blob, ext: extensaoSaida, contentType: formatoSaida };
}

export async function uploadAvatarUsuario(userId, arquivo) {
  const sb = obterClienteSupabase();
  const imagemPronta = await prepararImagemAvatar(arquivo);
  const caminhoArquivo = `${userId}/avatar.${imagemPronta.ext}`;

  const candidatosAntigos = ['png', 'jpg', 'jpeg', 'webp']
    .filter((ext) => ext !== imagemPronta.ext)
    .map((ext) => `${userId}/avatar.${ext}`);

  if (candidatosAntigos.length > 0) {
    await sb.storage.from('avatars').remove(candidatosAntigos);
  }

  const { error: uploadError } = await sb.storage
    .from('avatars')
    .upload(caminhoArquivo, imagemPronta.blob, {
      upsert: true,
      contentType: imagemPronta.contentType
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = sb.storage.from('avatars').getPublicUrl(caminhoArquivo);
  return `${publicData.publicUrl}?v=${Date.now()}`;
}

export async function listarEscalasUsuario() {
  const sb = obterClienteSupabase();
  const { data, error } = await sb
    .from('escalas')
    .select('*')
    .order('data_inicio', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function salvarEscala({ editId, payload, userId }) {
  const sb = obterClienteSupabase();

  if (editId) {
    const { data, error } = await sb
      .from('escalas')
      .update(payload)
      .eq('id', editId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await sb
    .from('escalas')
    .insert([{ ...payload, user_id: userId }])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function estenderEscalaTrabalho(id, novaDataFim) {
  const sb = obterClienteSupabase();
  const { data, error } = await sb
    .from('escalas')
    .update({ data_fim: novaDataFim })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function excluirEscalaPorId(id) {
  const sb = obterClienteSupabase();
  const { error } = await sb.from('escalas').delete().eq('id', id);
  if (error) throw error;
}

export async function limparEscalasUsuario(userId) {
  const sb = obterClienteSupabase();
  const { error } = await sb.from('escalas').delete().eq('user_id', userId);
  if (error) throw error;
}
