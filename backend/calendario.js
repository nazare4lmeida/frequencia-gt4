/* ==========================================================================
 * CRONOGRAMA OFICIAL — PROJETO GERAÇÃO TECH 4.0
 * Edital nº 01/2026 – IEL-CE / ADECE / Governo do Estado do Ceará
 *
 * ESPELHO de `frontend/src/Constants.js`. Alterou lá? Altere aqui também
 * e rode novamente o seed de `turmas` / `calendario_aulas` no Supabase.
 * ========================================================================== */

const PERIODO_LETIVO = {
  aulaInaugural: "2026-09-08", // terça — presencial e online, todas as formações
  inicio: "2026-09-09", // quarta
  fim: "2026-11-19", // quinta
  formatura: "2026-11-25",
  recruitingDay: "2027-01-27",
};

const FERIADOS = [
  "2026-09-07", // Independência do Brasil
  "2026-10-12", // Nossa Senhora Aparecida (segunda-feira)
  "2026-11-02", // Finados (segunda-feira)
  "2026-11-15", // Proclamação da República (domingo)
];

const JANELAS_POR_TURNO = {
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

const DIAS_TRES_VEZES_SEMANA = [1, 3, 5]; // Seg, Qua, Sex
const DIAS_SEG_A_SEX = [1, 2, 3, 4, 5];
const DIAS_SOMENTE_SEGUNDA = [1];

const FORMACOES = [
  {
    id: "fullstack_online",
    nome: "Full Stack — Online (seg, 18h às 22h)",
    curso: "fullstack",
    modalidade: "online",
    turno: "noite",
    dias: DIAS_SOMENTE_SEGUNDA,
  },
  {
    id: "fullstack_pres_manha",
    nome: "Full Stack — Presencial manhã (seg a sex, 8h às 12h)",
    curso: "fullstack",
    modalidade: "presencial",
    turno: "manha",
    dias: DIAS_SEG_A_SEX,
  },
  {
    id: "fullstack_pres_tarde",
    nome: "Full Stack — Presencial tarde (seg a sex, 13h às 17h)",
    curso: "fullstack",
    modalidade: "presencial",
    turno: "tarde",
    dias: DIAS_SEG_A_SEX,
  },
  {
    id: "ia_online",
    nome: "IA Generativa — Online (seg, 18h às 22h)",
    curso: "ia",
    modalidade: "online",
    turno: "noite",
    dias: DIAS_SOMENTE_SEGUNDA,
  },
  {
    id: "ia_pres_manha",
    nome: "IA Generativa — Presencial manhã (3x/semana, 8h às 12h)",
    curso: "ia",
    modalidade: "presencial",
    turno: "manha",
    dias: DIAS_TRES_VEZES_SEMANA,
  },
  {
    id: "ia_pres_tarde",
    nome: "IA Generativa — Presencial tarde (3x/semana, 13h às 17h)",
    curso: "ia",
    modalidade: "presencial",
    turno: "tarde",
    dias: DIAS_TRES_VEZES_SEMANA,
  },
  {
    id: "fullcycle_online",
    nome: "FullCycle — Online (seg, 18h às 22h)",
    curso: "fullcycle",
    modalidade: "online",
    turno: "noite",
    dias: DIAS_SOMENTE_SEGUNDA,
  },
  {
    id: "fullcycle_pres_noite",
    nome: "FullCycle — Presencial noite (3x/semana, 18h às 22h)",
    curso: "fullcycle",
    modalidade: "presencial",
    turno: "noite",
    dias: DIAS_TRES_VEZES_SEMANA,
  },
];

const IDS_FORMACOES = FORMACOES.map((f) => f.id);

/* -------------------------------------------------------------------------- */

const paraData = (iso) => {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
};

const paraISO = (data) => data.toISOString().slice(0, 10);

const getFormacao = (id) => FORMACOES.find((f) => f.id === id);

const getJanelasHorario = (id) => {
  const turno = getFormacao(id)?.turno || "noite";
  return JANELAS_POR_TURNO[turno] || JANELAS_POR_TURNO.noite;
};

const cacheCalendario = new Map();

/** Todas as datas de aula ao vivo da turma, ordem crescente ("YYYY-MM-DD"). */
const gerarCalendario = (id) => {
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

/** Mapa { formacao_id: [datas] } para todas as turmas. */
const gerarCalendarioCompleto = () =>
  Object.fromEntries(FORMACOES.map((f) => [f.id, gerarCalendario(f.id)]));

const isDiaDeAula = (id, iso) => gerarCalendario(id).includes(iso);

const getAulasOcorridas = (id, ate) =>
  gerarCalendario(id).filter((d) => d <= ate);

const getProximasAulas = (id, quantidade, apartirDe) =>
  gerarCalendario(id)
    .filter((d) => d >= apartirDe)
    .slice(0, quantidade || 5);

/** "21:47:03" ou "21:47" -> 21.783... */
const horaParaDecimal = (hora) => {
  if (!hora) return null;
  const texto = hora.includes("T") ? hora.split("T")[1] : hora;
  const [h, m] = texto.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h + m / 60;
};

const formatarHoraDecimal = (valor) => {
  const horas = Math.floor(valor);
  const minutos = Math.round((valor - horas) * 60);
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
};

module.exports = {
  PERIODO_LETIVO,
  FERIADOS,
  JANELAS_POR_TURNO,
  FORMACOES,
  IDS_FORMACOES,
  getFormacao,
  getJanelasHorario,
  gerarCalendario,
  gerarCalendarioCompleto,
  isDiaDeAula,
  getAulasOcorridas,
  getProximasAulas,
  horaParaDecimal,
  formatarHoraDecimal,
};
