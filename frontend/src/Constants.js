export const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3001/api"
    : "/api";

/* ==========================================================================
 * CRONOGRAMA OFICIAL — PROJETO GERAÇÃO TECH 4.0
 * Edital nº 01/2026 – IEL-CE / ADECE / Governo do Estado do Ceará
 *
 * ATENÇÃO: este bloco é a ÚNICA fonte de verdade de dias e horários no
 * frontend. O backend tem um espelho em `backend/calendario.js` — ao alterar
 * qualquer coisa aqui, altere lá também (e rode o SQL de seed novamente).
 * ========================================================================== */

export const PERIODO_LETIVO = {
  aulaInaugural: "2026-09-08", // terça — presencial e online, todas as formações
  inicio: "2026-09-09", // quarta
  fim: "2026-11-19", // quinta
  formatura: "2026-11-25",
  recruitingDay: "2027-01-27",
};

/**
 * Feriados que caem dentro do período letivo e cancelam aula.
 * 12/10 e 02/11 caem em SEGUNDA-FEIRA — as turmas online perdem aula ao vivo
 * nessas duas datas. Ajuste esta lista se a organização definir reposição.
 */
export const FERIADOS = [
  "2026-09-07", // Independência do Brasil (antes do início — informativo)
  "2026-10-12", // Nossa Senhora Aparecida (segunda-feira)
  "2026-11-02", // Finados (segunda-feira)
  "2026-11-15", // Proclamação da República (domingo)
];

/**
 * Janelas de check-in / check-out por turno, em horas decimais.
 * Ex.: 10.5 = 10:30.
 */
export const JANELAS_POR_TURNO = {
  manha: {
    aula: { inicio: 8, fim: 12 },
    checkIn: { inicio: 8, fim: 10.5 },
    checkOut: { inicio: 11.5, fim: 12.5 },
    label: "08:00 às 12:00",
  },
  tarde: {
    aula: { inicio: 13, fim: 17 },
    checkIn: { inicio: 13, fim: 15.5 },
    checkOut: { inicio: 16.5, fim: 17.5 },
    label: "13:00 às 17:00",
  },
  noite: {
    aula: { inicio: 18, fim: 22 },
    checkIn: { inicio: 18, fim: 20.5 },
    checkOut: { inicio: 21.5, fim: 22.5 },
    label: "18:30 às 22:30",
  },
};

/**
 * Turmas do Geração Tech 4.0 (formação + modalidade + turno).
 * `dias` usa a convenção JS: 0=Dom, 1=Seg ... 6=Sáb.
 *
 * Regras do edital:
 *  - Online (todas as formações): segundas-feiras, 18h às 22h.
 *  - Full Stack presencial: segunda a sexta, manhã (08–12h) ou tarde (13–17h).
 *  - IA Generativa presencial: 3x/semana, manhã ou tarde.
 *  - FullCycle presencial: 3x/semana, noite (18–22h).
 *
 * O edital NÃO define quais são os 3 dias das turmas "3x/semana".
 * Adotamos Seg/Qua/Sex — troque em DIAS_TRES_VEZES_SEMANA se a organização
 * fechar outro calendário (ex.: [2, 4, 6] para Ter/Qui/Sáb).
 */
export const DIAS_TRES_VEZES_SEMANA = [1, 3, 5]; // Seg, Qua, Sex
const DIAS_SEG_A_SEX = [1, 2, 3, 4, 5];
const DIAS_SOMENTE_SEGUNDA = [1];

export const FORMACOES = [
  // Formação 01 — Desenvolvedor Full Stack (192h)
  {
    id: "fullstack_online",
    nome: "Full Stack — Online (seg, 18h às 22h)",
    curtoNome: "Full Stack Online",
    tag: "FS",
    curso: "fullstack",
    cursoNome: "Desenvolvedor Full Stack",
    modalidade: "online",
    turno: "noite",
    dias: DIAS_SOMENTE_SEGUNDA,
    cor: "#052768;",
  },
  {
    id: "fullstack_pres_manha",
    nome: "Full Stack — Presencial manhã (seg a sex, 8h às 12h)",
    curtoNome: "Full Stack Presencial Manhã",
    tag: "FS",
    curso: "fullstack",
    cursoNome: "Desenvolvedor Full Stack",
    modalidade: "presencial",
    turno: "manha",
    dias: DIAS_SEG_A_SEX,
    cor: "#052768;",
  },
  {
    id: "fullstack_pres_tarde",
    nome: "Full Stack — Presencial tarde (seg a sex, 13h às 17h)",
    curtoNome: "Full Stack Presencial Tarde",
    tag: "FS",
    curso: "fullstack",
    cursoNome: "Desenvolvedor Full Stack",
    modalidade: "presencial",
    turno: "tarde",
    dias: DIAS_SEG_A_SEX,
    cor: "#052768;",
  },

  // Formação 02 — Inteligência Artificial Generativa (96h)
  {
    id: "ia_online",
    nome: "IA Generativa — Online (seg, 18h às 22h)",
    curtoNome: "IA Generativa Online",
    tag: "IA",
    curso: "ia",
    cursoNome: "Inteligência Artificial Generativa",
    modalidade: "online",
    turno: "noite",
    dias: DIAS_SOMENTE_SEGUNDA,
    cor: "#f59e0b",
  },
  {
    id: "ia_pres_manha",
    nome: "IA Generativa — Presencial manhã (3x/semana, 8h às 12h)",
    curtoNome: "IA Generativa Presencial Manhã",
    tag: "IA",
    curso: "ia",
    cursoNome: "Inteligência Artificial Generativa",
    modalidade: "presencial",
    turno: "manha",
    dias: DIAS_TRES_VEZES_SEMANA,
    cor: "#f59e0b",
  },
  {
    id: "ia_pres_tarde",
    nome: "IA Generativa — Presencial tarde (3x/semana, 13h às 17h)",
    curtoNome: "IA Generativa Presencial Tarde",
    tag: "IA",
    curso: "ia",
    cursoNome: "Inteligência Artificial Generativa",
    modalidade: "presencial",
    turno: "tarde",
    dias: DIAS_TRES_VEZES_SEMANA,
    cor: "#f59e0b",
  },

  // Formação 03 — FullCycle / Engenharia de Software (96h)
  {
    id: "fullcycle_online",
    nome: "FullCycle — Online (seg, 18h às 22h)",
    curtoNome: "FullCycle Online",
    tag: "FC",
    curso: "fullcycle",
    cursoNome: "FullCycle – Engenharia de Software",
    modalidade: "online",
    turno: "noite",
    dias: DIAS_SOMENTE_SEGUNDA,
    cor: "#6366f1",
  },
  {
    id: "fullcycle_pres_noite",
    nome: "FullCycle — Presencial noite (3x/semana, 18h às 22h)",
    curtoNome: "FullCycle Presencial Noite",
    tag: "FC",
    curso: "fullcycle",
    cursoNome: "FullCycle – Engenharia de Software",
    modalidade: "presencial",
    turno: "noite",
    dias: DIAS_TRES_VEZES_SEMANA,
    cor: "#6366f1",
  },
];

export const IDS_FORMACOES = FORMACOES.map((f) => f.id);

/* --------------------------------------------------------------------------
 * Helpers de data (tudo em "YYYY-MM-DD", sempre em UTC para não escorregar
 * de dia por causa de fuso).
 * ------------------------------------------------------------------------ */

const paraData = (iso) => {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
};

const paraISO = (data) => data.toISOString().slice(0, 10);

/** Data de hoje no fuso de Brasília, em "YYYY-MM-DD". */
export const hojeBrasilia = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Hora atual de Brasília em horas decimais (ex.: 18.5 = 18:30). */
export const horaAtualBrasilia = () => {
  const partes = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = partes.split(":").map(Number);
  return h + m / 60;
};

/** 18.5 -> "18:30" */
export const formatarHoraDecimal = (valor) => {
  const horas = Math.floor(valor);
  const minutos = Math.round((valor - horas) * 60);
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
};

/** "2026-09-09" -> "09/09/2026" */
export const formatarDataBR = (iso) => {
  if (!iso) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
};

/* --------------------------------------------------------------------------
 * Consultas de formação
 * ------------------------------------------------------------------------ */

export const getFormacao = (id) => FORMACOES.find((f) => f.id === id);

export const getNomeFormacao = (id) => getFormacao(id)?.nome || "Não informada";

export const getNomeCurto = (id) =>
  getFormacao(id)?.curtoNome || "Não informada";

export const getDiasAula = (id) => getFormacao(id)?.dias || [];

export const getJanelasHorario = (id) => {
  const turno = getFormacao(id)?.turno || "noite";
  return JANELAS_POR_TURNO[turno] || JANELAS_POR_TURNO.noite;
};

const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const getDiasAulaLegivel = (id) => {
  const dias = getDiasAula(id);
  if (!dias.length) return "Formação não definida";
  return dias.map((d) => NOMES_DIAS[d]).join(", ");
};

/* --------------------------------------------------------------------------
 * Calendário de aulas
 * ------------------------------------------------------------------------ */

const cacheCalendario = new Map();

/**
 * Todas as datas de aula ao vivo da turma, em ordem crescente ("YYYY-MM-DD").
 * Inclui a aula inaugural (08/09/2026) e exclui feriados.
 */
export const gerarCalendario = (id) => {
  if (cacheCalendario.has(id)) return cacheCalendario.get(id);

  const formacao = getFormacao(id);
  if (!formacao) return [];

  const feriados = new Set(FERIADOS);
  const datas = [];

  if (!feriados.has(PERIODO_LETIVO.aulaInaugural)) {
    datas.push(PERIODO_LETIVO.aulaInaugural);
  }

  const cursor = paraData(PERIODO_LETIVO.inicio);
  const fim = paraData(PERIODO_LETIVO.fim);

  while (cursor <= fim) {
    const iso = paraISO(cursor);
    if (formacao.dias.includes(cursor.getUTCDay()) && !feriados.has(iso)) {
      if (!datas.includes(iso)) datas.push(iso);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  datas.sort();
  cacheCalendario.set(id, datas);
  return datas;
};

/** A data informada é dia de aula para essa turma? */
export const isDiaDeAula = (id, iso = hojeBrasilia()) =>
  gerarCalendario(id).includes(iso);

/** Aulas que já aconteceram (usado para calcular faltas reais). */
export const getAulasOcorridas = (id, ate = hojeBrasilia()) =>
  gerarCalendario(id).filter((d) => d <= ate);

/** As próximas `quantidade` aulas a partir de hoje (inclui hoje). */
export const getProximasAulas = (
  id,
  quantidade = 5,
  apartirDe = hojeBrasilia(),
) =>
  gerarCalendario(id)
    .filter((d) => d >= apartirDe)
    .slice(0, quantidade);

/** Total de aulas previstas no período letivo. */
export const getTotalAulas = (id) => gerarCalendario(id).length;

/**
 * Avalia se o aluno pode bater ponto agora.
 * Retorna também os rótulos usados nas mensagens da interface.
 */
export const avaliarJanelaPonto = (id, opcoes = {}) => {
  const { modoTeste = false } = opcoes;
  const janelas = getJanelasHorario(id);
  const formacao = getFormacao(id);

  if (modoTeste) {
    return {
      modoTeste: true,
      isDiaDeAula: true,
      podeCheckIn: true,
      podeCheckOut: true,
      janelas,
      diasCorretos: "Todos os dias (modo teste)",
      rotuloCheckIn: "liberado",
      rotuloCheckOut: "liberado",
    };
  }

  const hoje = hojeBrasilia();
  const agora = horaAtualBrasilia();

  return {
    modoTeste: false,
    isDiaDeAula: isDiaDeAula(id, hoje),
    podeCheckIn:
      agora >= janelas.checkIn.inicio && agora <= janelas.checkIn.fim,
    podeCheckOut:
      agora >= janelas.checkOut.inicio && agora <= janelas.checkOut.fim,
    janelas,
    modalidade: formacao?.modalidade || "online",
    turno: formacao?.turno || "noite",
    diasCorretos: getDiasAulaLegivel(id),
    rotuloCheckIn: `${formatarHoraDecimal(janelas.checkIn.inicio)} às ${formatarHoraDecimal(janelas.checkIn.fim)}`,
    rotuloCheckOut: `${formatarHoraDecimal(janelas.checkOut.inicio)} às ${formatarHoraDecimal(janelas.checkOut.fim)}`,
  };
};
