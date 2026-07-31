/* Teste de integração das rotas de cronograma.
 * Roda com um Supabase falso em memória — não toca no banco real.
 * Uso: node teste-cronograma.cjs
 */

const Module = require("module");
const path = require("path");

// ---------- Supabase falso -------------------------------------------------

const banco = {
  turmas: [],
  calendario_aulas: [],
  alunos: [],
  presencas: [],
  configuracoes: [],
};

let proximoId = 1;

const aplicarFiltros = (linhas, filtros) =>
  linhas.filter((l) =>
    filtros.every((f) => {
      if (f.tipo === "eq") return String(l[f.coluna]) === String(f.valor);
      if (f.tipo === "in") return f.valor.includes(l[f.coluna]);
      return true;
    }),
  );

const criarQuery = (tabela) => {
  const filtros = [];
  let operacao = { tipo: "select" };
  let retornarLinhas = false;

  const executar = () => {
    const linhas = banco[tabela] || [];

    if (operacao.tipo === "select") {
      return { data: aplicarFiltros(linhas, filtros), error: null };
    }

    if (operacao.tipo === "insert") {
      const criadas = [];
      for (const item of operacao.itens) {
        const dup = linhas.find(
          (l) => l.turma_id === item.turma_id && l.data === item.data,
        );
        if (dup && tabela === "calendario_aulas") {
          if (operacao.ignorarDuplicadas) continue;
          return { data: null, error: { code: "23505", message: "duplicada" } };
        }
        if (tabela === "calendario_aulas") {
          const turmaExiste = banco.turmas.some((t) => t.id === item.turma_id);
          if (!turmaExiste) {
            return { data: null, error: { code: "23503", message: "fk" } };
          }
        }
        const nova = { id: proximoId++, cancelada: false, ...item };
        linhas.push(nova);
        criadas.push(nova);
      }
      return { data: criadas, error: null };
    }

    if (operacao.tipo === "update") {
      const alvos = aplicarFiltros(linhas, filtros);
      alvos.forEach((l) => Object.assign(l, operacao.valores));
      return { data: alvos, error: null };
    }

    if (operacao.tipo === "delete") {
      const alvos = aplicarFiltros(linhas, filtros);
      banco[tabela] = linhas.filter((l) => !alvos.includes(l));
      return { data: alvos, error: null };
    }

    return { data: [], error: null };
  };

  const query = {
    select() {
      retornarLinhas = true;
      return query;
    },
    insert(itens) {
      operacao = { tipo: "insert", itens };
      return query;
    },
    upsert(itens, opcoes = {}) {
      operacao = {
        tipo: "insert",
        itens,
        ignorarDuplicadas: opcoes.ignoreDuplicates,
      };
      return query;
    },
    update(valores) {
      operacao = { tipo: "update", valores };
      return query;
    },
    delete() {
      operacao = { tipo: "delete" };
      return query;
    },
    eq(coluna, valor) {
      filtros.push({ tipo: "eq", coluna, valor });
      return query;
    },
    in(coluna, valor) {
      filtros.push({ tipo: "in", coluna, valor });
      return query;
    },
    or() {
      return query;
    },
    order() {
      return query;
    },
    maybeSingle() {
      const r = executar();
      return Promise.resolve({ data: r.data?.[0] || null, error: r.error });
    },
    single() {
      const r = executar();
      return Promise.resolve({ data: r.data?.[0] || null, error: r.error });
    },
    then(resolve, reject) {
      try {
        resolve(executar());
      } catch (e) {
        reject(e);
      }
    },
  };

  void retornarLinhas;
  return query;
};

const supabaseFalso = { from: (tabela) => criarQuery(tabela) };

// Intercepta o createClient antes do index.js carregar
const resolverOriginal = Module._resolveFilename;
const caminhoFalso = path.join(__dirname, "__supabase_falso.js");
require.cache[caminhoFalso] = {
  id: caminhoFalso,
  filename: caminhoFalso,
  loaded: true,
  exports: { createClient: () => supabaseFalso },
};
Module._resolveFilename = function (pedido, ...resto) {
  if (pedido === "@supabase/supabase-js") return caminhoFalso;
  return resolverOriginal.call(this, pedido, ...resto);
};

// ---------- Ambiente -------------------------------------------------------

process.env.SUPABASE_URL = "https://falso.supabase.co";
process.env.SUPABASE_KEY = "chave-falsa";
process.env.JWT_SECRET = "segredo-de-teste";
process.env.ADMIN_EMAIL = "admin@teste.com";
process.env.ADMIN_PASS = "2000-01-01";
process.env.CLASSROOM_LAT = "-3.7327";
process.env.CLASSROOM_LNG = "-38.5270";
process.env.CHECKIN_RADIUS_METERS = "120";

const app = require("./index.js");
const jwt = require("jsonwebtoken");
const http = require("http");

const tokenAdmin = jwt.sign(
  { email: "admin@teste.com", role: "admin" },
  process.env.JWT_SECRET,
);

// ---------- Utilitários de teste -------------------------------------------

let servidor;
let porta;

const chamar = (metodo, caminho, corpo, token = tokenAdmin) =>
  new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = http.request(
      {
        host: "127.0.0.1",
        port: porta,
        path: caminho,
        method: metodo,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(dados ? { "Content-Length": Buffer.byteLength(dados) } : {}),
        },
      },
      (res) => {
        let corpoResp = "";
        res.on("data", (c) => (corpoResp += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(corpoResp);
          } catch {
            json = corpoResp;
          }
          resolve({ status: res.statusCode, body: json });
        });
      },
    );
    req.on("error", reject);
    if (dados) req.write(dados);
    req.end();
  });

let falhas = 0;
const checar = (nome, condicao, extra) => {
  console.log((condicao ? "  OK  " : " FALHA") + " | " + nome);
  if (!condicao) {
    falhas++;
    if (extra !== undefined) console.log("        ->", JSON.stringify(extra));
  }
};

// ---------- Execução -------------------------------------------------------

(async () => {
  servidor = app.listen(0);
  await new Promise((r) => servidor.on("listening", r));
  porta = servidor.address().port;

  console.log("\n== Fallback: banco sem tabela de turmas ==");
  let r = await chamar("GET", "/api/admin/turmas");
  checar("lista turmas mesmo sem seed", r.status === 200, r.body);
  checar("origem = codigo (fallback)", r.body.origem === "codigo", r.body.origem);
  checar("8 turmas do código", r.body.turmas?.length === 8, r.body.turmas?.length);

  console.log("\n== Com o seed aplicado ==");
  banco.turmas = [
    {
      id: "fullstack_online",
      nome: "Full Stack — Online",
      curso: "fullstack",
      modalidade: "online",
      turno: "noite",
      dias_semana: [1],
      aula_inicio: "18:00:00",
      aula_fim: "22:00:00",
      checkin_inicio: "18:00:00",
      checkin_fim: "20:30:00",
      checkout_inicio: "21:30:00",
      checkout_fim: "22:30:00",
      ativa: true,
    },
    {
      id: "fullstack_pres_manha",
      nome: "Full Stack — Presencial manhã",
      curso: "fullstack",
      modalidade: "presencial",
      turno: "manha",
      dias_semana: [1, 2, 3, 4, 5],
      aula_inicio: "08:00:00",
      aula_fim: "12:00:00",
      checkin_inicio: "08:00:00",
      checkin_fim: "10:30:00",
      checkout_inicio: "11:30:00",
      checkout_fim: "12:30:00",
      ativa: true,
    },
  ];
  banco.calendario_aulas = [
    { id: proximoId++, turma_id: "fullstack_online", data: "2026-09-14", cancelada: false },
    { id: proximoId++, turma_id: "fullstack_online", data: "2026-09-21", cancelada: false },
  ];

  r = await chamar("GET", "/api/admin/turmas");
  checar("origem = banco depois do seed", r.body.origem === "banco", r.body.origem);
  checar("2 turmas do banco", r.body.turmas?.length === 2, r.body.turmas?.length);

  console.log("\n== Adicionar data de aula ==");
  r = await chamar("POST", "/api/admin/calendario", {
    turma_id: "fullstack_online",
    data: "2026-09-28",
    tema: "ReactJS",
  });
  checar("adiciona data nova", r.status === 200, r.body);

  r = await chamar("POST", "/api/admin/calendario", {
    turma_id: "fullstack_online",
    data: "2026-09-28",
  });
  checar("recusa data duplicada (409)", r.status === 409, r.body);

  r = await chamar("POST", "/api/admin/calendario", {
    turma_id: "fullstack_online",
    data: "28/09/2026",
  });
  checar("recusa data em formato errado", r.status === 400, r.body);

  r = await chamar("POST", "/api/admin/calendario", {
    turma_id: "turma_que_nao_existe",
    data: "2026-09-30",
  });
  checar("recusa turma inexistente", r.status === 400, r.body);

  console.log("\n== Editar e remover data ==");
  r = await chamar("GET", "/api/admin/calendario/fullstack_online");
  const aulas = r.body;
  checar("lista as 3 datas", aulas.length === 3, aulas.length);

  const alvo = aulas.find((a) => a.data === "2026-09-28");
  r = await chamar("PATCH", `/api/admin/calendario/${alvo.id}`, {
    data: "2026-09-29",
    tema: "ReactJS — hooks",
  });
  checar("edita a data", r.status === 200, r.body);

  r = await chamar("PATCH", `/api/admin/calendario/${alvo.id}`, {
    cancelada: true,
  });
  checar("marca como cancelada", r.status === 200, r.body);

  r = await chamar("GET", "/api/cronograma/fullstack_online");
  checar(
    "aula cancelada sai do calendário do aluno",
    !r.body.aulas.includes("2026-09-29"),
    r.body.aulas,
  );

  r = await chamar("DELETE", `/api/admin/calendario/${alvo.id}`);
  checar("remove a data", r.status === 200, r.body);

  r = await chamar("GET", "/api/admin/calendario/fullstack_online");
  checar("sobraram 2 datas", r.body.length === 2, r.body.length);

  console.log("\n== Editar dias e horários ==");
  r = await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    dias_semana: [2, 4],
    checkin_inicio: "19:00",
    checkin_fim: "21:00",
  });
  checar("salva dias e horários", r.status === 200, r.body);

  r = await chamar("GET", "/api/cronograma/fullstack_online");
  checar(
    "janela de check-in atualizada",
    r.body.janelas.checkIn.inicio === 19,
    r.body.janelas.checkIn,
  );
  checar("dias atualizados", String(r.body.turma.dias) === "2,4", r.body.turma.dias);

  r = await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    checkin_inicio: "22:00",
    checkin_fim: "19:00",
  });
  checar("recusa janela invertida", r.status === 400, r.body);

  r = await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    dias_semana: [9],
  });
  checar("recusa dia da semana inválido", r.status === 400, r.body);

  r = await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    checkin_inicio: "25:99",
  });
  checar("recusa horário inválido", r.status === 400, r.body);

  console.log("\n== Geração em lote ==");
  r = await chamar("POST", "/api/admin/calendario/gerar", {
    turma_id: "fullstack_pres_manha",
    inicio: "2026-09-09",
    fim: "2026-09-18",
  });
  checar("gera datas em lote", r.status === 200, r.body);
  checar("gerou 8 dias úteis", r.body.adicionadas === 8, r.body);

  r = await chamar("POST", "/api/admin/calendario/gerar", {
    turma_id: "fullstack_pres_manha",
    inicio: "2026-09-09",
    fim: "2026-09-18",
  });
  checar("segunda geração não duplica", r.body.adicionadas === 0, r.body);

  r = await chamar("POST", "/api/admin/calendario/gerar", {
    turma_id: "fullstack_pres_manha",
    inicio: "2026-11-19",
    fim: "2026-09-09",
  });
  checar("recusa período invertido", r.status === 400, r.body);

  console.log("\n== Segurança ==");
  const tokenAluno = jwt.sign(
    { email: "aluno@teste.com", role: "aluno" },
    process.env.JWT_SECRET,
  );
  r = await chamar("POST", "/api/admin/calendario", { turma_id: "x", data: "2026-01-01" }, tokenAluno);
  checar("aluno não gerencia cronograma (403)", r.status === 403, r.status);

  r = await chamar("GET", "/api/admin/turmas", null, null);
  checar("sem token é bloqueado (403)", r.status === 403, r.status);

  console.log("\n== Login valida a turma ==");
  r = await chamar("POST", "/api/login", {
    email: "novo@teste.com",
    dataNascimento: "2000-05-05",
    formacao: "turma_inexistente",
  }, null);
  checar("recusa turma inexistente no login", r.status === 400, r.body);

  console.log("\n== Check-in do aluno respeita o cronograma ==");

  // Aluno da turma online, cujas datas de aula são 14/09 e 21/09
  banco.alunos.push({
    id: "a1",
    nome: "Aluno Teste",
    email: "aluno@teste.com",
    formacao: "fullstack_online",
  });

  // Devolve a turma para segunda-feira e janela padrão
  await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    dias_semana: [1],
    checkin_inicio: "18:00",
    checkin_fim: "20:30",
  });

  r = await chamar("POST", "/api/ponto", { aluno_id: "aluno@teste.com" }, tokenAluno);
  checar(
    "check-in fora de dia de aula é recusado (403)",
    r.status === 403,
    r.body,
  );
  checar(
    "mensagem indica a próxima aula",
    typeof r.body.error === "string" && r.body.error.includes("não há aula"),
    r.body.error,
  );

  // Agora marca HOJE como dia de aula da turma
  const hojeISO = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  banco.calendario_aulas.push({
    id: proximoId++,
    turma_id: "fullstack_online",
    data: hojeISO,
    cancelada: false,
  });

  // Janela impossível: check-in só à meia-noite e um minuto
  await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    checkin_inicio: "00:00",
    checkin_fim: "00:01",
  });

  r = await chamar("POST", "/api/ponto", { aluno_id: "aluno@teste.com" }, tokenAluno);
  const foraDaJanela = r.status === 403 && String(r.body.error).includes("janela");
  const dentroPorAcaso = r.status === 200;
  checar(
    "check-in fora da janela é recusado",
    foraDaJanela || dentroPorAcaso,
    r.body,
  );

  // Janela aberta o dia inteiro: agora deve passar
  await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    checkin_inicio: "00:00",
    checkin_fim: "23:59",
  });

  r = await chamar("POST", "/api/ponto", { aluno_id: "aluno@teste.com" }, tokenAluno);
  checar("check-in dentro da janela é aceito", r.status === 200, r.body);
  checar(
    "turma online não exige localização",
    r.body.ponto?.checkin_local_valido === true,
    r.body,
  );

  console.log("\n== EXIGIR_LOCALIZACAO ==");

  // Aluno presencial, com aula hoje e janela aberta
  banco.alunos.push({
    id: "a2",
    nome: "Aluno Presencial",
    email: "presencial@teste.com",
    formacao: "fullstack_pres_manha",
  });
  banco.calendario_aulas.push({
    id: proximoId++,
    turma_id: "fullstack_pres_manha",
    data: hojeISO,
    cancelada: false,
  });
  await chamar("PUT", "/api/admin/turmas/fullstack_pres_manha", {
    checkin_inicio: "00:00",
    checkin_fim: "23:59",
  });

  const tokenPresencial = jwt.sign(
    { email: "presencial@teste.com", role: "aluno" },
    process.env.JWT_SECRET,
  );

  r = await chamar("GET", "/api/cronograma/fullstack_pres_manha");
  checar(
    "presencial NAO exige GPS por padrao (3 sedes)",
    r.body.exigeLocalizacao === false,
    r.body.exigeLocalizacao,
  );

  r = await chamar("GET", "/api/cronograma/fullstack_online");
  checar(
    "turma online nunca exige localização",
    r.body.exigeLocalizacao === false,
    r.body.exigeLocalizacao,
  );

  r = await chamar(
    "POST",
    "/api/ponto",
    { aluno_id: "presencial@teste.com" },
    tokenPresencial,
  );
  checar(
    "presencial bate ponto sem GPS",
    r.status === 200,
    r.body,
  );

  console.log("\n== WINDOW_CLOSE / WINDOW_OPEN ==");

  banco.alunos.push({
    id: "a3",
    nome: "Aluno Janela",
    email: "janela@teste.com",
    formacao: "fullstack_online",
  });
  const tokenJanela = jwt.sign(
    { email: "janela@teste.com", role: "aluno" },
    process.env.JWT_SECRET,
  );

  // Turma sem aula hoje e com janela impossivel
  await chamar("PUT", "/api/admin/turmas/fullstack_online", {
    dias_semana: [1],
    checkin_inicio: "00:00",
    checkin_fim: "00:01",
  });
  banco.calendario_aulas = banco.calendario_aulas.filter(
    (a) => !(a.turma_id === "fullstack_online" && a.data === hojeISO),
  );

  banco.configuracoes = [{ chave: "janela_ponto", valor: "WINDOW_CLOSE" }];
  r = await chamar("GET", "/api/cronograma/fullstack_online");
  checar("WINDOW_CLOSE reportado", r.body.janelaPonto === "WINDOW_CLOSE", r.body.janelaPonto);
  checar("WINDOW_CLOSE nao liga modo teste", r.body.modoTeste === false, r.body.modoTeste);

  r = await chamar("POST", "/api/ponto", { aluno_id: "janela@teste.com" }, tokenJanela);
  checar("WINDOW_CLOSE bloqueia fora do horario", r.status === 403, r.body);

  banco.configuracoes = [{ chave: "janela_ponto", valor: "WINDOW_OPEN" }];
  await new Promise((r) => setTimeout(r, 5100));
  r = await chamar("GET", "/api/cronograma/fullstack_online");
  checar("WINDOW_OPEN reportado", r.body.janelaPonto === "WINDOW_OPEN", r.body.janelaPonto);
  checar("WINDOW_OPEN libera a interface", r.body.modoTeste === true, r.body.modoTeste);

  r = await chamar("POST", "/api/ponto", { aluno_id: "janela@teste.com" }, tokenJanela);
  checar("WINDOW_OPEN aceita ponto sem dia nem hora", r.status === 200, r.body);

  banco.configuracoes = [{ chave: "janela_ponto", valor: "WINDOW_CLOSE" }];
  await new Promise((r) => setTimeout(r, 5100));
  r = await chamar("GET", "/api/cronograma/fullstack_online");
  checar("volta a fechar ao trocar de novo", r.body.janelaPonto === "WINDOW_CLOSE", r.body.janelaPonto);

  console.log(
    "\n" + (falhas === 0 ? "TODOS OS TESTES PASSARAM" : falhas + " FALHA(S)"),
  );
  servidor.close();
  process.exit(falhas ? 1 : 0);
})();
