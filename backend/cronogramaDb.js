/* ==========================================================================
 * CRONOGRAMA — FONTE DE VERDADE
 *
 * A partir do Geração Tech 4.0 o cronograma vive no BANCO (tabelas `turmas`
 * e `calendario_aulas`), para que a coordenação possa incluir, editar e
 * remover datas de aula pelo painel admin sem precisar de novo deploy.
 *
 * `calendario.js` continua existindo como semente: se as tabelas ainda não
 * foram criadas (SQL não rodado) ou estiverem vazias, o sistema cai no
 * calendário gerado em código e continua funcionando.
 * ========================================================================== */

const base = require("./calendario");

const TTL_CACHE_MS = 60 * 1000;

// A configuração tem cache bem curto: quem virar janela_ponto para
// WINDOW_OPEN no Supabase quer ver o efeito na hora, não daqui a um minuto.
const TTL_CONFIG_MS = 5 * 1000;

let cache = null;
let cacheEm = 0;

let cacheConfig = null;
let cacheConfigEm = 0;

/** "18:30:00" ou "18:30" -> 18.5 */
const timeParaDecimal = (valor, padrao) => {
  if (!valor) return padrao;
  const [h, m] = String(valor).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return padrao;
  return h + m / 60;
};

/** 18.5 -> "18:30:00" */
const decimalParaTime = (valor) => `${base.formatarHoraDecimal(valor)}:00`;

/** Normaliza um registro da tabela `turmas` para o formato usado no código. */
const montarTurma = (linha) => ({
  id: linha.id,
  nome: linha.nome,
  curso: linha.curso,
  modalidade: linha.modalidade,
  turno: linha.turno,
  dias: Array.isArray(linha.dias_semana) ? linha.dias_semana.map(Number) : [],
  ativa: linha.ativa !== false,
  sede: linha.sede || null,
  local: {
    latitude: Number.isFinite(Number(linha.latitude)) ? Number(linha.latitude) : null,
    longitude: Number.isFinite(Number(linha.longitude)) ? Number(linha.longitude) : null,
    raio: Number.isFinite(Number(linha.raio_metros)) ? Number(linha.raio_metros) : 250,
    exige: linha.exige_local === true,
  },
  janelas: {
    aula: {
      inicio: timeParaDecimal(linha.aula_inicio, 18),
      fim: timeParaDecimal(linha.aula_fim, 22),
    },
    checkIn: {
      inicio: timeParaDecimal(linha.checkin_inicio, 18),
      fim: timeParaDecimal(linha.checkin_fim, 20.5),
    },
    checkOut: {
      inicio: timeParaDecimal(linha.checkout_inicio, 21.5),
      fim: timeParaDecimal(linha.checkout_fim, 22.5),
    },
    label: `${base.formatarHoraDecimal(timeParaDecimal(linha.aula_inicio, 18))} às ${base.formatarHoraDecimal(timeParaDecimal(linha.aula_fim, 22))}`,
  },
});

/** Cronograma montado a partir de `calendario.js` (usado como fallback). */
/**
 * Configurações vivas do sistema, na tabela `configuracoes`.
 * Dá para trocar direto no editor de tabelas do Supabase, sem deploy.
 *
 *   janela_ponto = 'WINDOW_CLOSE'  -> check-in/check-out só no dia e hora da aula
 *   janela_ponto = 'WINDOW_OPEN'   -> liberado a qualquer dia e hora (teste)
 *   exigir_localizacao = 'false'   -> ninguém precisa liberar GPS
 */
const CONFIG_PADRAO = {
  janela_ponto: "WINDOW_CLOSE",
  exigir_localizacao: "false",
};

const cronogramaDoCodigo = () => {
  const turmas = new Map();
  const aulas = new Map();

  for (const f of base.FORMACOES) {
    const janelas = base.getJanelasHorario(f.id);
    turmas.set(f.id, {
      id: f.id,
      nome: f.nome,
      curso: f.curso,
      modalidade: f.modalidade,
      turno: f.turno,
      dias: f.dias,
      ativa: true,
      janelas,
    });
    aulas.set(f.id, new Set(base.gerarCalendario(f.id)));
  }

  return { turmas, aulas, config: { ...CONFIG_PADRAO }, origem: "codigo" };
};

const carregarConfig = async (supabase, { forcar = false } = {}) => {
  if (!forcar && cacheConfig && Date.now() - cacheConfigEm < TTL_CONFIG_MS) {
    return cacheConfig;
  }

  try {
    const { data, error } = await supabase
      .from("configuracoes")
      .select("chave, valor");

    if (error) throw error;

    const config = { ...CONFIG_PADRAO };
    for (const linha of data || []) {
      config[linha.chave] = linha.valor;
    }

    cacheConfig = config;
    cacheConfigEm = Date.now();
    return config;
  } catch {
    cacheConfig = { ...CONFIG_PADRAO };
    cacheConfigEm = Date.now();
    return cacheConfig;
  }
};

/**
 * Carrega turmas + calendário. Usa cache curto para não bater no banco a
 * cada check-in. Qualquer escrita do admin deve chamar `invalidarCache()`.
 */
const carregarCronograma = async (supabase, { forcar = false } = {}) => {
  if (!forcar && cache && Date.now() - cacheEm < TTL_CACHE_MS) {
    // Turmas e datas vêm do cache, mas a configuração é sempre reavaliada.
    cache.config = await carregarConfig(supabase);
    return cache;
  }

  try {
    const { data: linhasTurmas, error: erroTurmas } = await supabase
      .from("turmas")
      .select("*");

    if (erroTurmas) throw erroTurmas;

    if (!linhasTurmas || linhasTurmas.length === 0) {
      cache = cronogramaDoCodigo();
      cache.config = await carregarConfig(supabase);
      cacheEm = Date.now();
      return cache;
    }

    const { data: linhasAulas, error: erroAulas } = await supabase
      .from("calendario_aulas")
      .select("turma_id, data, tema, cancelada")
      .eq("cancelada", false);

    if (erroAulas) throw erroAulas;

    const turmas = new Map();
    const aulas = new Map();

    for (const linha of linhasTurmas) {
      turmas.set(linha.id, montarTurma(linha));
      aulas.set(linha.id, new Set());
    }

    for (const linha of linhasAulas || []) {
      const conjunto = aulas.get(linha.turma_id);
      if (conjunto) conjunto.add(String(linha.data).slice(0, 10));
    }

    cache = {
      turmas,
      aulas,
      config: await carregarConfig(supabase),
      origem: "banco",
    };
    cacheEm = Date.now();
    return cache;
  } catch (err) {
    // Tabelas ainda não criadas, ou banco indisponível: seguimos pelo código.
    console.warn(
      "Cronograma: caindo para o calendário do código —",
      err.message || err,
    );
    cache = cronogramaDoCodigo();
    cacheEm = Date.now();
    return cache;
  }
};

const invalidarCache = () => {
  cache = null;
  cacheEm = 0;
  cacheConfig = null;
  cacheConfigEm = 0;
};

/* -------------------------------------------------------------------------- */

const getTurma = (cronograma, turmaId) =>
  cronograma.turmas.get(turmaId) || null;

const getJanelas = (cronograma, turmaId) =>
  getTurma(cronograma, turmaId)?.janelas || base.JANELAS_POR_TURNO.noite;

const getAulas = (cronograma, turmaId) =>
  [...(cronograma.aulas.get(turmaId) || [])].sort();

const isDiaDeAula = (cronograma, turmaId, dataISO) =>
  Boolean(cronograma.aulas.get(turmaId)?.has(dataISO));

const getAulasOcorridas = (cronograma, turmaId, ate) =>
  getAulas(cronograma, turmaId).filter((d) => d <= ate);

const getProximasAulas = (cronograma, turmaId, quantidade, apartirDe) =>
  getAulas(cronograma, turmaId)
    .filter((d) => d >= apartirDe)
    .slice(0, quantidade || 5);

/**
 * Datas que a turma teria pelos dias da semana configurados, dentro de um
 * intervalo. Usado pelo admin para regerar o calendário de uma turma.
 */
const gerarDatasPorDiasSemana = (dias, inicioISO, fimISO) => {
  const paraData = (iso) => {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  };

  const datas = [];
  const cursor = paraData(inicioISO);
  const fim = paraData(fimISO);

  while (cursor <= fim) {
    if (dias.includes(cursor.getUTCDay())) {
      datas.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return datas;
};

/** A janela de ponto está aberta para teste? */
const janelaAberta = (cronograma) =>
  String(cronograma?.config?.janela_ponto || "").toUpperCase() ===
  "WINDOW_OPEN";

/** A conferência de GPS está ligada? */
const exigeLocalizacao = (cronograma) =>
  String(cronograma?.config?.exigir_localizacao || "").toLowerCase() === "true";

module.exports = {
  janelaAberta,
  exigeLocalizacao,
  CONFIG_PADRAO,
  carregarCronograma,
  invalidarCache,
  cronogramaDoCodigo,
  getTurma,
  getJanelas,
  getAulas,
  isDiaDeAula,
  getAulasOcorridas,
  getProximasAulas,
  gerarDatasPorDiasSemana,
  timeParaDecimal,
  decimalParaTime,
};