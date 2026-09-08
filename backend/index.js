const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Cronograma oficial do Geração Tech 4.0 (Edital nº 01/2026 – IEL-CE)
const {
  PERIODO_LETIVO,
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
} = require("./calendario");

const cronogramaDb = require("./cronogramaDb");

// Com MODO_TESTE=true o servidor aceita ponto em qualquer dia e horário.
// Use apenas em homologação/gravação de vídeo — nunca em produção.
const MODO_TESTE = process.env.MODO_TESTE === "true";

const app = express();
app.use(cors());
app.use(express.json());

// Verificação de segurança para as chaves do Supabase e JWT
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

// Conferência de GPS no check-in. Desligada por padrão: as aulas presenciais
// acontecem em 3 sedes diferentes, então não há um endereço único a validar.
// Quem quiser ligar usa EXIGIR_LOCALIZACAO=true no .env ou a linha
// `exigir_localizacao` da tabela `configuracoes`.
const EXIGIR_LOCALIZACAO = process.env.EXIGIR_LOCALIZACAO === "true";

const CLASSROOM_LAT = Number(process.env.CLASSROOM_LAT);
const CLASSROOM_LNG = Number(process.env.CLASSROOM_LNG);
const CHECKIN_RADIUS_METERS = Number(process.env.CHECKIN_RADIUS_METERS || 120);

if (!supabaseUrl || !supabaseKey || !JWT_SECRET) {
  console.error(
    "ERRO: Variáveis de ambiente (SUPABASE ou JWT_SECRET) não configuradas!",
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// MIDDLEWARES DE SEGURANÇA
// ==========================================

const verificarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(403)
      .json({ error: "Acesso negado. Faça login novamente." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuarioLogado = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Sua sessão expirou. Entre novamente." });
  }
};

const verificarAdmin = (req, res, next) => {
  if (req.usuarioLogado.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Acesso restrito a administradores." });
  }
  next();
};

// ==========================================
// HELPERS
// ==========================================

const getBrasiliaTime = () => {
  const agora = new Date();
  const data = agora.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const hora = agora.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
  });
  return { data, hora };
};

/**
 * Confere se o aluno pode bater ponto agora, segundo o cronograma da turma.
 * `tipo` é "check_in" ou "check_out".
 */
const validarJanelaPonto = (cronograma, formacao, tipo, dataISO, horaTexto) => {
  // WINDOW_OPEN na tabela `configuracoes` libera ponto em qualquer dia e hora.
  if (MODO_TESTE || cronogramaDb.janelaAberta(cronograma)) return { ok: true };

  const turma = cronogramaDb.getTurma(cronograma, formacao);
  if (!turma) {
    return {
      ok: false,
      motivo:
        "Sua formação não está definida no cadastro. Procure a monitoria da sua turma.",
    };
  }

  if (!cronogramaDb.isDiaDeAula(cronograma, formacao, dataISO)) {
    const proxima = cronogramaDb.getProximasAulas(
      cronograma,
      formacao,
      1,
      dataISO,
    )[0];

    return {
      ok: false,
      motivo: proxima
        ? `Hoje não há aula ao vivo da sua turma. A próxima é em ${proxima.split("-").reverse().join("/")}.`
        : "Hoje não há aula ao vivo da sua turma.",
    };
  }

  const janelas = turma.janelas;
  const janela = tipo === "check_in" ? janelas.checkIn : janelas.checkOut;
  const agora = horaParaDecimal(horaTexto);

  if (agora === null || agora < janela.inicio || agora > janela.fim) {
    const rotulo = tipo === "check_in" ? "check-in" : "check-out";
    return {
      ok: false,
      motivo: `A janela de ${rotulo} da sua turma é das ${formatarHoraDecimal(janela.inicio)} às ${formatarHoraDecimal(janela.fim)}.`,
    };
  }

  return { ok: true };
};

// ==========================================
// LOCALIZAÇÃO

const toRad = (value) => (value * Math.PI) / 180;

const calcularDistanciaMetros = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const TEST_LOCATION_LAT = Number(process.env.TEST_LOCATION_LAT);
const TEST_LOCATION_LNG = Number(process.env.TEST_LOCATION_LNG);

if (
  EXIGIR_LOCALIZACAO &&
  (!Number.isFinite(CLASSROOM_LAT) || !Number.isFinite(CLASSROOM_LNG))
) {  // eslint-disable-line
  console.warn(
    "AVISO: EXIGIR_LOCALIZACAO está ligado mas CLASSROOM_LAT/CLASSROOM_LNG " +
      "não estão configurados. O check-in presencial vai falhar. " +
      "Preencha as coordenadas ou defina EXIGIR_LOCALIZACAO=false no .env.",
  );
}

const validarLocalCheckin = (latitude, longitude, turma = null) => {
  // Coordenadas-alvo: as da SEDE da turma (se houver); senao, o antigo
  // CLASSROOM_LAT/LNG global (compatibilidade).
  const alvoLat = turma?.local?.latitude ?? CLASSROOM_LAT;
  const alvoLng = turma?.local?.longitude ?? CLASSROOM_LNG;
  const raio =
    Number.isFinite(Number(turma?.local?.raio)) && turma?.local?.raio > 0
      ? Number(turma.local.raio)
      : CHECKIN_RADIUS_METERS;

  if (!Number.isFinite(alvoLat) || !Number.isFinite(alvoLng)) {
    throw new Error(
      "Local da sede não configurado. Preencha as coordenadas da turma.",
    );
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      distancia: null,
      origem: "fora",
    };
  }

  const distanciaSala = calcularDistanciaMetros(
    latitude,
    longitude,
    alvoLat,
    alvoLng,
  );

  const dentroSala = distanciaSala <= raio;

  let distanciaTeste = null;
  let dentroTeste = false;

  if (
    Number.isFinite(TEST_LOCATION_LAT) &&
    Number.isFinite(TEST_LOCATION_LNG)
  ) {
    distanciaTeste = calcularDistanciaMetros(
      latitude,
      longitude,
      TEST_LOCATION_LAT,
      TEST_LOCATION_LNG,
    );

    dentroTeste = distanciaTeste <= raio;
  }

  return {
    ok: dentroSala || dentroTeste,
    distancia: dentroSala ? distanciaSala : distanciaTeste,
    origem: dentroSala ? "sala" : dentroTeste ? "teste" : "fora",
  };
};

// ==========================================
// LOGIN E PERFIL
// ==========================================

app.post("/api/login", async (req, res) => {
  const { email, dataNascimento, formacao } = req.body;

  if (!email || !dataNascimento) {
    return res.status(400).json({ error: "Dados obrigatórios ausentes." });
  }

  const emailFormatado = email.trim().toLowerCase();

  // A formação precisa ser uma turma cadastrada e ativa
  if (formacao) {
    const cronogramaLogin = await cronogramaDb.carregarCronograma(supabase);
    const turmaEscolhida = cronogramaDb.getTurma(cronogramaLogin, formacao);

    if (!turmaEscolhida || !turmaEscolhida.ativa) {
      return res.status(400).json({
        error: "Turma inválida ou desativada. Escolha uma turma disponível.",
      });
    }
  }

  // ==========================================
  // LOGIN ADMIN
  // ==========================================
  if (
    emailFormatado === process.env.ADMIN_EMAIL &&
    dataNascimento === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign(
      { email: emailFormatado, role: "admin" },
      JWT_SECRET,
      { expiresIn: "720h" },
    );
    return res.json({
      nome: "Administrador",
      role: "admin",
      email: emailFormatado,
      token,
    });
  }

  // ==========================================
  // LOGIN PROFESSOR / MONITOR (tabela professores)
  // ==========================================
  try {
    const { data: profs } = await supabase
      .from("professores")
      .select("*")
      .eq("email", emailFormatado);
    if (profs && profs.length > 0) {
      const prof = profs[0];
      if (prof.ativo === false) {
        return res.status(403).json({ error: "Cadastro inativo. Fale com a coordenação." });
      }
      if (prof.data_nascimento) {
        const dbNasc = new Date(prof.data_nascimento).toISOString().split("T")[0];
        if (dbNasc !== dataNascimento) {
          return res.status(401).json({ error: "Data de nascimento incorreta." });
        }
      }
      const turmasArr = prof.turmas
        ? String(prof.turmas).split(",").map((s) => s.trim()).filter(Boolean)
        : (prof.turma ? [prof.turma] : []);
      const turmaPrincipal = prof.turma || turmasArr[0] || null;
      const token = jwt.sign(
        { email: emailFormatado, role: "professor", tipo: prof.tipo || "professor", turma: turmaPrincipal, turmas: turmasArr },
        JWT_SECRET,
        { expiresIn: "720h" },
      );
      return res.json({
        nome: prof.nome || emailFormatado,
        role: "professor",
        tipo: prof.tipo || "professor",
        turma: turmaPrincipal,
        turmas: turmasArr,
        email: emailFormatado,
        token,
      });
    }
  } catch (e) {
    console.error("ERRO login professor:", e);
  }

  try {
    const { data: alunos, error } = await supabase
      .from("alunos")
      .select("*")
      .eq("email", emailFormatado);

    if (error) throw error;

    let aluno;

    if (!alunos || alunos.length === 0) {
      const { data: novoAluno, error: insertError } = await supabase
        .from("alunos")
        .insert([
          {
            email: emailFormatado,
            data_nascimento: dataNascimento,
            formacao: formacao,
          },
        ])
        .select();

      if (insertError) throw insertError;
      aluno = novoAluno[0];
    } else {
      aluno = alunos[0];

      if (aluno.data_nascimento) {
        const dataBancoSrt = new Date(aluno.data_nascimento)
          .toISOString()
          .split("T")[0];

        if (dataBancoSrt !== dataNascimento) {
          return res
            .status(401)
            .json({ error: "Data de nascimento incorreta." });
        }
      }

      if (aluno.formacao && formacao && aluno.formacao !== formacao) {
        return res.status(403).json({
          error: `Você já está registrado na formação ${aluno.formacao}. Não é permitido acesso duplicado em outra turma.`,
        });
      }

      if (formacao && !aluno.formacao) {
        await supabase
          .from("alunos")
          .update({ formacao })
          .eq("email", emailFormatado);
        aluno.formacao = formacao;
      }
    }

    // GERA TOKEN PARA ALUNO
    const token = jwt.sign(
      { id: aluno.id, email: aluno.email, role: "aluno" },
      JWT_SECRET,
      { expiresIn: "720h" },
    );

    res.json({ ...aluno, role: "aluno", token });
  } catch (err) {
    console.error("ERRO NO LOGIN:", err);
    res.status(500).json({ error: "Erro interno no servidor de login." });
  }
});

app.get("/api/aluno/perfil/:email", verificarToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("alunos")
      .select("*")
      .eq("email", req.params.email.trim().toLowerCase())
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("ERRO AO BUSCAR PERFIL:", err);
    res.status(500).json({ error: "Erro ao carregar dados do perfil." });
  }
});

app.put("/api/aluno/perfil", verificarToken, async (req, res) => {
  const { email, nome, avatar } = req.body;
  try {
    const { error } = await supabase
      .from("alunos")
      .update({ nome, avatar })
      .eq("email", email.trim().toLowerCase());

    if (error) throw error;
    res.json({ msg: "Dados atualizados com sucesso!" });
  } catch (err) {
    console.error("ERRO PERFIL:", err);
    res.status(500).json({ error: "Erro interno ao salvar perfil." });
  }
});

// ==========================================
// REGISTRAR PONTO - PROTEGIDA
// ==========================================
app.post("/api/ponto", verificarToken, async (req, res) => {

  try {
    const { aluno_id, nota, revisao, latitude, longitude } = req.body;

    if (!aluno_id || typeof aluno_id !== "string") {
      return res.status(400).json({
        error: "aluno_id não enviado ou inválido.",
      });
    }

    const { data: hoje, hora: agora } = getBrasiliaTime();
    const timestampCompleto = `${hoje}T${agora}`;
    const emailBusca = aluno_id.trim().toLowerCase();

    // Precisamos da formação para saber os dias e as janelas de horário
    const { data: alunoDono, error: erroAluno } = await supabase
      .from("alunos")
      .select("email, formacao")
      .eq("email", emailBusca)
      .maybeSingle();

    if (erroAluno) {
      console.error("ERRO fetch aluno:", erroAluno);
      return res
        .status(500)
        .json({ error: "Erro ao carregar seu cadastro. Tente novamente." });
    }

    if (!alunoDono) {
      return res
        .status(404)
        .json({ error: "Cadastro não encontrado. Faça login novamente." });
    }

    const formacaoAluno = alunoDono.formacao;
    const cronograma = await cronogramaDb.carregarCronograma(supabase);

    const { data: pontoExistente, error: fetchError } = await supabase
      .from("presencas")
      .select("*")
      .eq("aluno_email", emailBusca)
      .eq("data", hoje)
      .maybeSingle();

    if (fetchError) {
      console.error("ERRO fetch presencas:", fetchError);
      return res.status(500).json({
        error: fetchError.message || "Erro ao buscar presença do dia.",
        details: fetchError,
      });
    }

    if (!pontoExistente) {
      const janelaCheckIn = validarJanelaPonto(
        cronograma,
        formacaoAluno,
        "check_in",
        hoje,
        agora,
      );

      if (!janelaCheckIn.ok) {
        return res.status(403).json({ error: janelaCheckIn.motivo });
      }

      // CHAMADA POR QR: se a turma exige QR, o aluno precisa enviar um qr_token
      // valido (o token atual, nao expirado) da sessao de hoje daquela turma.
      const turmaQr = await supabase
        .from("turmas").select("exige_qr").eq("id", formacaoAluno).maybeSingle();
      if (turmaQr?.data?.exige_qr) {
        const qrToken = (req.body.qr_token || "").toString().trim();
        if (!qrToken) {
          return res.status(403).json({ error: "Escaneie o QR code da chamada para marcar presenca." });
        }
        const { data: sessQr } = await supabase
          .from("qr_sessoes").select("token, token_expira")
          .eq("turma_id", formacaoAluno).eq("data", hoje).maybeSingle();
        const valido = sessQr && sessQr.token === qrToken &&
          new Date(sessQr.token_expira).getTime() + 10000 >= Date.now(); // 10s de folga
        if (!valido) {
          return res.status(403).json({ error: "QR code expirado. Escaneie o QR atual mostrado pelo professor." });
        }
      }

      // Turmas online não têm endereço de aula. Para presenciais, o GPS é
      // exigido quando a turma tem coordenadas de sede E está com exige_local
      // ligado (por turma). Mantém o override global antigo por compatibilidade.
      const turmaAluno = cronogramaDb.getTurma(cronograma, formacaoAluno);
      const temCoordSede =
        Number.isFinite(turmaAluno?.local?.latitude) &&
        Number.isFinite(turmaAluno?.local?.longitude);
      const exigeLocalizacao =
        turmaAluno?.modalidade === "presencial" &&
        temCoordSede &&
        (turmaAluno?.local?.exige === true);

      if (!exigeLocalizacao) {
        const { data: novoPontoOnline, error: insErroOnline } = await supabase
          .from("presencas")
          .insert([
            {
              aluno_email: emailBusca,
              data: hoje,
              check_in: timestampCompleto,
              checkin_local_valido: true,
            },
          ])
          .select();

        if (insErroOnline) {
          console.error("ERRO insert presencas (online):", insErroOnline);
          return res.status(500).json({
            error: insErroOnline.message || "Erro ao inserir check-in.",
          });
        }

        return res.json({
          msg: "Check-in realizado com sucesso!",
          ponto: novoPontoOnline[0],
        });
      }

      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          error:
            "Localização não recebida. Ative a localização e tente novamente.",
        });
      }

      const latitudeNum = Number(latitude);
      const longitudeNum = Number(longitude);

      if (!Number.isFinite(latitudeNum) || !Number.isFinite(longitudeNum)) {
        return res.status(400).json({
          error: "Localização inválida.",
        });
      }

      const validacaoLocal = validarLocalCheckin(
        latitudeNum,
        longitudeNum,
        turmaAluno,
      );

      if (!validacaoLocal.ok) {
        return res.status(403).json({
          error:
            "Check-in permitido somente na sede da sua turma" +
            (turmaAluno?.sede ? " (" + turmaAluno.sede + ")." : "."),
          distancia: validacaoLocal.distancia,
        });
      }

      const payloadInsert = {
        aluno_email: emailBusca,
        data: hoje,
        check_in: timestampCompleto,
        checkin_latitude: latitudeNum,
        checkin_longitude: longitudeNum,
        checkin_distancia_metros: validacaoLocal.distancia,
        checkin_local_valido: true,
      };

      const { data: novoPonto, error: insError } = await supabase
        .from("presencas")
        .insert([payloadInsert])
        .select();

      if (insError) {
        console.error("ERRO insert presencas:", insError);
        return res.status(500).json({
          error: insError.message || "Erro ao inserir check-in.",
          details: insError,
        });
      }

      return res.json({
        msg: "Check-in realizado com sucesso!",
        ponto: novoPonto[0],
      });
    }

    if (pontoExistente.check_out) {
      return res.json({ msg: "Você já concluiu sua presença de hoje." });
    }

    const janelaCheckOut = validarJanelaPonto(
      cronograma,
      formacaoAluno,
      "check_out",
      hoje,
      agora,
    );

    if (!janelaCheckOut.ok) {
      return res.status(403).json({ error: janelaCheckOut.motivo });
    }

    const { data: pontoAtualizado, error: updError } = await supabase
      .from("presencas")
      .update({
        check_out: timestampCompleto,
        feedback_nota: nota || null,
        feedback_texto: revisao || "",
      })
      .eq("id", pontoExistente.id)
      .select();

    if (updError) {
      console.error("ERRO update presencas:", updError);
      return res.status(500).json({
        error: updError.message || "Erro ao registrar check-out.",
        details: updError,
      });
    }

    return res.json({
      msg: "Check-out realizado com sucesso!",
      ponto: pontoAtualizado[0],
    });
  } catch (err) {
    console.error("ERRO NO PONTO:", err);
    return res.status(500).json({
      error: err.message || "Erro ao processar presença.",
      details: err,
    });
  }
});

// ==========================================
// ADMIN (TODAS PROTEGIDAS POR TOKEN + ADMIN)
// ==========================================

app.get(
  "/api/admin/busca",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { termo, turma, status, dataFiltro } = req.query;
    const { data: hoje } = getBrasiliaTime();
    const dataAlvo = dataFiltro || hoje;

    // Calendário oficial de cada turma do Geração Tech 4.0.
    // Gerado a partir de backend/calendario.js — não há mais datas soltas aqui.
    const cronograma = await cronogramaDb.carregarCronograma(supabase);

    try {
      let query = supabase.from("alunos").select("*");

      if (turma && turma !== "todos") query = query.eq("formacao", turma);
      if (termo)
        query = query.or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`);
      if (status === "incompleto") query = query.or("nome.is.null");

      const { data: alunos, error } = await query;
      if (error) throw error;

      let resultadoFinal = alunos || [];

      if (
        status === "pendente_saida" ||
        status === "checkout_antecipado" ||
        status === "presentes_no_dia"
      ) {
        const { data: presencas, error: erroPresencasDia } = await supabase
          .from("presencas")
          .select("aluno_email, data, check_out")
          .eq("data", dataAlvo);

        if (erroPresencasDia) throw erroPresencasDia;

        let emailsFiltrados = [];

        if (status === "pendente_saida") {
          emailsFiltrados = (presencas || [])
            .filter((p) => !p.check_out)
            .map((p) => p.aluno_email?.trim().toLowerCase());
        } else if (status === "checkout_antecipado") {
          // Saída antecipada = check-out antes do fim da aula do turno da turma.
          const formacaoPorEmail = new Map(
            (alunos || []).map((a) => [
              a.email?.trim().toLowerCase(),
              a.formacao,
            ]),
          );

          emailsFiltrados = (presencas || [])
            .filter((p) => {
              if (!p.check_out) return false;

              const email = p.aluno_email?.trim().toLowerCase();
              const janelas = cronogramaDb.getJanelas(
                cronograma,
                formacaoPorEmail.get(email),
              );
              const saida = horaParaDecimal(p.check_out);

              return saida !== null && saida < janelas.aula.fim;
            })
            .map((p) => p.aluno_email?.trim().toLowerCase());
        } else if (status === "presentes_no_dia") {
          emailsFiltrados = (presencas || []).map((p) =>
            p.aluno_email?.trim().toLowerCase(),
          );
        }

        resultadoFinal = resultadoFinal.filter((a) =>
          emailsFiltrados.includes(a.email?.trim().toLowerCase()),
        );
      }

      const { data: todasPresencas, error: erroP } = await supabase
        .from("presencas")
        .select("aluno_email, data");

      if (erroP) throw erroP;

      const resultadoFinalComCalculos = resultadoFinal.map((aluno) => {
        const emailAlu = aluno.email?.trim().toLowerCase();
        const turmaAluno = aluno.formacao;
        const calendarioTurma = cronogramaDb.getAulas(cronograma, turmaAluno);

        const aulasOcorridas = calendarioTurma.filter(
          (dataAula) => dataAula <= hoje,
        ).length;

        const datasComPresenca = new Set(
          (todasPresencas || [])
            .filter((p) => p.aluno_email?.trim().toLowerCase() === emailAlu)
            .map((p) => {
              if (!p.data) return null;
              return p.data.includes("T") ? p.data.split("T")[0] : p.data;
            })
            .filter(Boolean),
        );

        const presencasConfirmadas = calendarioTurma.filter((dataAula) =>
          datasComPresenca.has(dataAula),
        ).length;

        const faltasReais = Math.max(0, aulasOcorridas - presencasConfirmadas);

        return {
          ...aluno,
          total_presencas: presencasConfirmadas,
          total_faltas: faltasReais,
        };
      });

      res.json({
        total: resultadoFinalComCalculos.length,
        alunos: resultadoFinalComCalculos,
      });
    } catch (err) {
      console.error("ERRO NA BUSCA ADMIN:", err);
      res.status(500).json({ error: "Erro na busca administrativa." });
    }
  },
);

app.put(
  "/api/admin/aluno/:email",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { nome, email, data_nascimento } = req.body;
    const emailOriginal = decodeURIComponent(req.params.email);
    try {
      const { error } = await supabase
        .from("alunos")
        .update({ nome, email, data_nascimento })
        .eq("email", emailOriginal);
      if (error) throw error;
      res.json({ msg: "Dados atualizados com sucesso" });
    } catch (err) {
      res.status(500).json({ error: "Erro ao atualizar aluno." });
    }
  },
);

app.delete(
  "/api/admin/aluno/:email",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const emailOriginal = decodeURIComponent(req.params.email);
    try {
      await supabase
        .from("presencas")
        .delete()
        .eq("aluno_email", emailOriginal);
      const { error } = await supabase
        .from("alunos")
        .delete()
        .eq("email", emailOriginal);
      if (error) throw error;
      res.json({ msg: "Cadastro excluído com sucesso!" });
    } catch (err) {
      res.status(500).json({ error: "Erro ao excluir cadastro." });
    }
  },
);

app.post(
  "/api/admin/ponto-manual",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { email, data, check_in, check_out, nota, revisao } = req.body;

    const montarTimestamp = (valorHora) => {
      if (!valorHora) return null;
      if (valorHora.includes("T")) return valorHora;
      return `${data}T${valorHora}:00`;
    };

    try {
      const { data: novoPonto, error } = await supabase
        .from("presencas")
        .insert([
          {
            aluno_email: email.trim().toLowerCase(),
            data: data,
            check_in: montarTimestamp(check_in),
            check_out: montarTimestamp(check_out),
            feedback_nota: nota || null,
            feedback_texto: revisao || "",
          },
        ])
        .select();

      if (error) {
        console.error("ERRO SUPABASE:", error);
        return res.status(400).json({ error: error.message });
      }

      res.json({ msg: "Ponto manual registrado!", ponto: novoPonto[0] });
    } catch (err) {
      console.error("ERRO SERVIDOR:", err);
      res.status(500).json({ error: "Erro interno no servidor." });
    }
  },
);

app.post(
  "/api/admin/reset-session",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    res.json({ msg: "Reset solicitado." });
  },
);

app.patch(
  "/api/admin/limpeza-nome",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { email, nome } = req.body;

    if (!email || nome === undefined) {
      return res.status(400).json({ error: "E-mail e nome são obrigatórios." });
    }

    try {
      const { error } = await supabase
        .from("alunos")
        .update({ nome: nome.trim() })
        .eq("email", email.trim().toLowerCase());

      if (error) throw error;

      res.json({ msg: "Nome atualizado com sucesso!" });
    } catch (err) {
      console.error("ERRO LIMPEZA:", err);
      res.status(500).json({ error: "Erro ao atualizar nome no banco." });
    }
  },
);

app.get("/api/historico/aluno/:email", verificarToken, async (req, res) => {
  try {
    const emailFormatado = req.params.email.trim().toLowerCase();
    const { data, error } = await supabase
      .from("presencas")
      .select("*")
      .eq("aluno_email", emailFormatado)
      .order("data", { ascending: false });

    if (error) throw error;

    const historicoFormatado = data.map((item) => ({
      ...item,
      data: item.data.includes("T") ? item.data.split("T")[0] : item.data,
    }));

    res.json(historicoFormatado);
  } catch (err) {
    console.error("ERRO HISTORICO:", err);
    res.status(500).json({ error: "Erro ao carregar histórico." });
  }
});

app.get(
  "/api/admin/stats/:turma",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { turma } = req.params;
    const { dataFiltro } = req.query;
    const { data: hoje } = getBrasiliaTime();
    const dataAlvo = dataFiltro || hoje;

    try {
      // 1. Lista de emails da turma (para saber quem pertence a onde)
      let queryAlunos = supabase.from("alunos").select("email");
      if (turma !== "todos") queryAlunos = queryAlunos.eq("formacao", turma);

      const { data: listaAlunos, error: errA } = await queryAlunos;
      if (errA) throw errA;

      const emailsTurma = (listaAlunos || []).map((a) => a.email);

      // 2. Total Histórico (Geral da turma ou do sistema)
      let queryTotal = supabase
        .from("presencas")
        .select("*", { count: "exact", head: true });
      if (turma !== "todos") {
        queryTotal = queryTotal.in("aluno_email", emailsTurma);
      }
      const { count: totalPresencas } = await queryTotal;

      // 3. Dados dos Círculos (Baseados na dataAlvo)
      let queryHoje = supabase
        .from("presencas")
        .select("check_in, check_out")
        .eq("data", dataAlvo);
      if (turma !== "todos") {
        queryHoje = queryHoje.in("aluno_email", emailsTurma);
      }

      const { data: presencasDia, error: errH } = await queryHoje;
      if (errH) throw errH;

      const dados = presencasDia || [];

      // AQUI ESTAVA O ERRO: Use listaAlunos.length em vez de totalAlunos
      res.json({
        totalPresencas: totalPresencas || 0,
        totalAlunos: (listaAlunos || []).length, // Corrigido aqui
        sessoesAtivas: dados.length,
        concluidosHoje: dados.filter((p) => p.check_out).length,
        pendentesSaida: dados.filter((p) => !p.check_out).length,
      });
    } catch (err) {
      console.error("ERRO NO STATS:", err);
      res.status(500).json({ error: "Erro ao carregar estatísticas." });
    }
  },
);
app.get(
  "/api/admin/relatorio/:turma",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { turma } = req.params;
    const { inicio, fim } = req.query;
    try {
      let query = supabase
        .from("alunos")
        .select(
          "nome, email, formacao, presencas(data, check_in, check_out, feedback_nota, feedback_texto)",
        );

      if (turma !== "todos") query = query.eq("formacao", turma);

      const { data, error } = await query;
      if (error) throw error;

      const relatorioFormatado = [];

      data.forEach((aluno) => {
        const nomeAluno = aluno.nome || "Não cadastrado";
        const formacaoAluno = aluno.formacao || "Não informada";

        if (aluno.presencas && aluno.presencas.length > 0) {
          aluno.presencas.forEach((p) => {
            if (inicio && p.data < inicio) return;
            if (fim && p.data > fim) return;
            const formatarHoraBruta = (valor) => {
              if (!valor) return "-";
              return valor.includes("T")
                ? valor.split("T")[1].substring(0, 5)
                : valor.substring(0, 5);
            };

            relatorioFormatado.push({
              Nome: nomeAluno,
              Email: aluno.email,
              Formacao: formacaoAluno,
              Data: p.data,
              Entrada: formatarHoraBruta(p.check_in),
              Saida: formatarHoraBruta(p.check_out),
              Nota: p.feedback_nota || "N/A",
              Feedback: p.feedback_texto || "",
            });
          });
        }
      });

      res.json(relatorioFormatado);
    } catch (err) {
      res.status(500).json({ error: "Erro ao gerar relatório." });
    }
  },
);

// ==========================================
// CRONOGRAMA (público — alimenta a interface)
// ==========================================

// ==========================================
// ADMIN — GESTÃO DO CRONOGRAMA
// Turmas (dias e horários) e calendário (datas de aula)
// ==========================================

const ehDataISO = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""));
const ehHora = (valor) => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(valor || ""));

const normalizarHora = (valor) =>
  String(valor).length === 5 ? `${valor}:00` : String(valor);

// --- Turmas -------------------------------------------------------------

app.get(
  "/api/admin/turmas",
  verificarToken,
  verificarAdmin,
  async (_, res) => {
    try {
      const cronograma = await cronogramaDb.carregarCronograma(supabase, {
        forcar: true,
      });
      const { data: hoje } = getBrasiliaTime();

      const turmas = [...cronograma.turmas.values()].map((t) => ({
        ...t,
        totalAulas: cronogramaDb.getAulas(cronograma, t.id).length,
        aulasOcorridas: cronogramaDb.getAulasOcorridas(cronograma, t.id, hoje)
          .length,
      }));

      res.json({
        origem: cronograma.origem,
        janelaPonto: cronograma.config?.janela_ponto || "WINDOW_CLOSE",
        turmas,
      });
    } catch (err) {
      console.error("ERRO LISTAR TURMAS:", err);
      res.status(500).json({ error: "Erro ao carregar as turmas." });
    }
  },
);

app.put(
  "/api/admin/turmas/:id",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { id } = req.params;
    const {
      nome,
      dias_semana,
      aula_inicio,
      aula_fim,
      checkin_inicio,
      checkin_fim,
      checkout_inicio,
      checkout_fim,
      ativa,
    } = req.body;

    const atualizacao = {};

    if (nome !== undefined) {
      if (!String(nome).trim()) {
        return res.status(400).json({ error: "O nome da turma é obrigatório." });
      }
      atualizacao.nome = String(nome).trim();
    }

    if (dias_semana !== undefined) {
      if (
        !Array.isArray(dias_semana) ||
        dias_semana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      ) {
        return res.status(400).json({
          error: "Dias da semana inválidos. Use números de 0 (domingo) a 6 (sábado).",
        });
      }
      atualizacao.dias_semana = [...new Set(dias_semana)].sort();
    }

    const horarios = {
      aula_inicio,
      aula_fim,
      checkin_inicio,
      checkin_fim,
      checkout_inicio,
      checkout_fim,
    };

    for (const [campo, valor] of Object.entries(horarios)) {
      if (valor === undefined) continue;
      if (!ehHora(valor)) {
        return res
          .status(400)
          .json({ error: `Horário inválido em ${campo}. Use HH:MM.` });
      }
      atualizacao[campo] = normalizarHora(valor);
    }

    if (ativa !== undefined) atualizacao.ativa = Boolean(ativa);

    if (Object.keys(atualizacao).length === 0) {
      return res.status(400).json({ error: "Nada para atualizar." });
    }

    // Coerência: check-in começa junto ou depois da aula; check-out termina depois.
    const decimal = (v) => cronogramaDb.timeParaDecimal(v, null);
    const atual = await supabase.from("turmas").select("*").eq("id", id).maybeSingle();

    if (atual.error) {
      console.error("ERRO BUSCAR TURMA:", atual.error);
      return res.status(500).json({ error: "Erro ao carregar a turma." });
    }
    if (!atual.data) {
      return res.status(404).json({ error: "Turma não encontrada." });
    }

    const final = { ...atual.data, ...atualizacao };

    if (decimal(final.checkin_inicio) > decimal(final.checkin_fim)) {
      return res
        .status(400)
        .json({ error: "A janela de check-in termina antes de começar." });
    }
    if (decimal(final.checkout_inicio) > decimal(final.checkout_fim)) {
      return res
        .status(400)
        .json({ error: "A janela de check-out termina antes de começar." });
    }
    if (decimal(final.aula_inicio) > decimal(final.aula_fim)) {
      return res
        .status(400)
        .json({ error: "A aula termina antes de começar." });
    }

    try {
      const { data, error } = await supabase
        .from("turmas")
        .update(atualizacao)
        .eq("id", id)
        .select();

      if (error) throw error;

      cronogramaDb.invalidarCache();
      res.json({ msg: "Turma atualizada.", turma: data[0] });
    } catch (err) {
      console.error("ERRO ATUALIZAR TURMA:", err);
      res.status(500).json({ error: "Erro ao atualizar a turma." });
    }
  },
);

// --- Calendário de aulas ------------------------------------------------

app.get(
  "/api/admin/calendario/:turmaId",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("calendario_aulas")
        .select("*")
        .eq("turma_id", req.params.turmaId)
        .order("data", { ascending: true });

      if (error) throw error;

      res.json(
        (data || []).map((a) => ({ ...a, data: String(a.data).slice(0, 10) })),
      );
    } catch (err) {
      console.error("ERRO LISTAR CALENDARIO:", err);
      res.status(500).json({ error: "Erro ao carregar o calendário." });
    }
  },
);

app.post(
  "/api/admin/calendario",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { turma_id, data, tema } = req.body;

    if (!turma_id) {
      return res.status(400).json({ error: "Informe a turma." });
    }
    if (!ehDataISO(data)) {
      return res.status(400).json({ error: "Data inválida. Use AAAA-MM-DD." });
    }

    try {
      const { data: criada, error } = await supabase
        .from("calendario_aulas")
        .insert([{ turma_id, data, tema: tema || null }])
        .select();

      if (error) {
        if (error.code === "23505") {
          return res
            .status(409)
            .json({ error: "Essa turma já tem aula nessa data." });
        }
        if (error.code === "23503") {
          return res.status(400).json({ error: "Turma não encontrada." });
        }
        throw error;
      }

      cronogramaDb.invalidarCache();
      res.json({ msg: "Aula adicionada.", aula: criada[0] });
    } catch (err) {
      console.error("ERRO ADICIONAR AULA:", err);
      res.status(500).json({ error: "Erro ao adicionar a aula." });
    }
  },
);

app.patch(
  "/api/admin/calendario/:id",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { data, tema, cancelada } = req.body;
    const atualizacao = {};

    if (data !== undefined) {
      if (!ehDataISO(data)) {
        return res.status(400).json({ error: "Data inválida. Use AAAA-MM-DD." });
      }
      atualizacao.data = data;
    }
    if (tema !== undefined) atualizacao.tema = tema || null;
    if (cancelada !== undefined) atualizacao.cancelada = Boolean(cancelada);

    if (Object.keys(atualizacao).length === 0) {
      return res.status(400).json({ error: "Nada para atualizar." });
    }

    try {
      const { data: atualizada, error } = await supabase
        .from("calendario_aulas")
        .update(atualizacao)
        .eq("id", req.params.id)
        .select();

      if (error) {
        if (error.code === "23505") {
          return res
            .status(409)
            .json({ error: "Essa turma já tem aula nessa data." });
        }
        throw error;
      }

      if (!atualizada || atualizada.length === 0) {
        return res.status(404).json({ error: "Aula não encontrada." });
      }

      cronogramaDb.invalidarCache();
      res.json({ msg: "Aula atualizada.", aula: atualizada[0] });
    } catch (err) {
      console.error("ERRO EDITAR AULA:", err);
      res.status(500).json({ error: "Erro ao editar a aula." });
    }
  },
);

app.delete(
  "/api/admin/calendario/:id",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    try {
      const { error } = await supabase
        .from("calendario_aulas")
        .delete()
        .eq("id", req.params.id);

      if (error) throw error;

      cronogramaDb.invalidarCache();
      res.json({ msg: "Aula removida." });
    } catch (err) {
      console.error("ERRO REMOVER AULA:", err);
      res.status(500).json({ error: "Erro ao remover a aula." });
    }
  },
);

/**
 * Gera em lote as datas de uma turma a partir dos dias da semana dela.
 * Não apaga nada: só acrescenta as datas que ainda não existem.
 */
app.post(
  "/api/admin/calendario/gerar",
  verificarToken,
  verificarAdmin,
  async (req, res) => {
    const { turma_id, inicio, fim, feriados } = req.body;

    if (!turma_id) return res.status(400).json({ error: "Informe a turma." });
    if (!ehDataISO(inicio) || !ehDataISO(fim)) {
      return res.status(400).json({ error: "Período inválido. Use AAAA-MM-DD." });
    }
    if (inicio > fim) {
      return res
        .status(400)
        .json({ error: "A data final é anterior à data inicial." });
    }

    try {
      const { data: turma, error: erroTurma } = await supabase
        .from("turmas")
        .select("*")
        .eq("id", turma_id)
        .maybeSingle();

      if (erroTurma) throw erroTurma;
      if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

      const excluir = new Set(
        (Array.isArray(feriados) ? feriados : []).filter(ehDataISO),
      );

      const datas = cronogramaDb
        .gerarDatasPorDiasSemana(
          (turma.dias_semana || []).map(Number),
          inicio,
          fim,
        )
        .filter((d) => !excluir.has(d));

      if (datas.length === 0) {
        return res.json({ msg: "Nenhuma data no período.", adicionadas: 0 });
      }

      const { data: inseridas, error } = await supabase
        .from("calendario_aulas")
        .upsert(
          datas.map((d) => ({ turma_id, data: d })),
          { onConflict: "turma_id,data", ignoreDuplicates: true },
        )
        .select();

      if (error) throw error;

      cronogramaDb.invalidarCache();
      res.json({
        msg: `${(inseridas || []).length} aula(s) adicionada(s).`,
        adicionadas: (inseridas || []).length,
        previstas: datas.length,
      });
    } catch (err) {
      console.error("ERRO GERAR CALENDARIO:", err);
      res.status(500).json({ error: "Erro ao gerar o calendário." });
    }
  },
);

app.get("/api/cronograma", async (_, res) => {
  try {
    const cronograma = await cronogramaDb.carregarCronograma(supabase);
    const { data: hoje } = getBrasiliaTime();

    res.json({
      periodo: PERIODO_LETIVO,
      modoTeste: MODO_TESTE,
      janelaPonto: cronograma.config?.janela_ponto || "WINDOW_CLOSE",
      exigeLocalizacao:
        (turma?.local?.exige === true),
      origem: cronograma.origem,
      turmas: [...cronograma.turmas.values()]
        .filter((t) => t.ativa)
        .map((t) => ({
          ...t,
          totalAulas: cronogramaDb.getAulas(cronograma, t.id).length,
          proximasAulas: cronogramaDb.getProximasAulas(cronograma, t.id, 5, hoje),
        })),
    });
  } catch (err) {
    console.error("ERRO CRONOGRAMA:", err);
    res.status(500).json({ error: "Erro ao carregar o cronograma." });
  }
});

app.get("/api/cronograma/:formacao", async (req, res) => {
  try {
    const { formacao } = req.params;
    const cronograma = await cronogramaDb.carregarCronograma(supabase);
    const turma = cronogramaDb.getTurma(cronograma, formacao);

    if (!turma) {
      return res.status(404).json({ error: "Turma não encontrada." });
    }

    const { data: hoje } = getBrasiliaTime();

    res.json({
      turma,
      janelas: turma.janelas,
      origem: cronograma.origem,
      modoTeste: MODO_TESTE || cronogramaDb.janelaAberta(cronograma),
      janelaPonto: cronograma.config?.janela_ponto || "WINDOW_CLOSE",
      // O aluno so precisa liberar GPS se a turma for presencial, tiver
      // coordenadas de sede E estiver com a conferencia de local ligada (por turma).
      exigeLocalizacao:
        turma.modalidade === "presencial" &&
        Number.isFinite(turma?.local?.latitude) &&
        Number.isFinite(turma?.local?.longitude) &&
        (turma?.local?.exige === true),
      aulas: cronogramaDb.getAulas(cronograma, formacao),
      aulasOcorridas: cronogramaDb.getAulasOcorridas(cronograma, formacao, hoje)
        .length,
      proximasAulas: cronogramaDb.getProximasAulas(cronograma, formacao, 5, hoje),
      temAulaHoje: cronogramaDb.isDiaDeAula(cronograma, formacao, hoje),
    });
  } catch (err) {
    console.error("ERRO CRONOGRAMA TURMA:", err);
    res.status(500).json({ error: "Erro ao carregar o cronograma da turma." });
  }
});

// ============================================================
//  CHAMADA POR QR (presencial) - endpoints do PROFESSOR (protegidos por PIN)
// ============================================================

// gera um token aleatorio curto para o QR
const gerarQrToken = () =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

// valida o PIN da turma e devolve a turma (ou null)
async function validarPinTurma(turmaId, pin) {
  if (!turmaId || !pin) return null;
  const { data } = await supabase
    .from("turmas")
    .select("id, nome, qr_pin, exige_qr")
    .eq("id", turmaId)
    .maybeSingle();
  if (!data || !data.qr_pin) return null;
  return String(data.qr_pin) === String(pin).trim() ? data : null;
}

// Professor: pega o token ATUAL do QR (rotaciona sozinho a cada ~25s).
app.get("/api/chamada/token", async (req, res) => {
  try {
    const turmaId = req.query.turma;
    const pin = req.query.pin;
    const turma = await validarPinTurma(turmaId, pin);
    if (!turma) return res.status(403).json({ error: "Turma ou PIN incorretos." });

    const { data: hoje } = getBrasiliaTime();
    const agora = new Date();

    let { data: sess } = await supabase
      .from("qr_sessoes")
      .select("*")
      .eq("turma_id", turmaId)
      .eq("data", hoje)
      .maybeSingle();

    const expirado = !sess || new Date(sess.token_expira) <= agora;
    if (expirado) {
      const novo = gerarQrToken();
      const expira = new Date(agora.getTime() + 25000).toISOString(); // 25s
      if (sess) {
        await supabase.from("qr_sessoes")
          .update({ token: novo, token_expira: expira })
          .eq("id", sess.id);
      } else {
        await supabase.from("qr_sessoes")
          .insert([{ turma_id: turmaId, data: hoje, token: novo, token_expira: expira }]);
      }
      sess = { token: novo, token_expira: expira };
    }

    res.json({
      ok: true,
      turma: turma.nome,
      token: sess.token,
      expira: sess.token_expira,
      // conteudo que vai DENTRO do QR (a app le e extrai o token)
      payload: JSON.stringify({ t: turmaId, k: sess.token }),
    });
  } catch (err) {
    console.error("ERRO chamada/token:", err);
    res.status(500).json({ error: "Erro ao gerar o QR." });
  }
});

// Professor: lista quem ja marcou presenca hoje (para acompanhar ao vivo).
app.get("/api/chamada/lista", async (req, res) => {
  try {
    const turmaId = req.query.turma;
    const turma = await validarPinTurma(turmaId, req.query.pin);
    if (!turma) return res.status(403).json({ error: "Turma ou PIN incorretos." });

    const { data: hoje } = getBrasiliaTime();
    const { data: alunos } = await supabase
      .from("alunos").select("email, nome").eq("formacao", turmaId);
    const emails = (alunos || []).map((a) => a.email);
    let presentes = [];
    if (emails.length) {
      const { data: pres } = await supabase
        .from("presencas")
        .select("aluno_email, check_in")
        .eq("data", hoje)
        .in("aluno_email", emails);
      presentes = pres || [];
    }
    const nomePorEmail = {};
    (alunos || []).forEach((a) => { nomePorEmail[a.email] = a.nome; });
    const lista = presentes
      .map((p) => ({ nome: nomePorEmail[p.aluno_email] || p.aluno_email, check_in: p.check_in }))
      .sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)));

    res.json({ ok: true, total_turma: emails.length, presentes: lista.length, lista });
  } catch (err) {
    console.error("ERRO chamada/lista:", err);
    res.status(500).json({ error: "Erro ao carregar a lista." });
  }
});

// ============================================================
//  PONTO DO PROFESSOR / MONITOR (check-in/out + avaliacao) - P2
// ============================================================

// resolve a turma que o professor esta operando (query/body) e valida que e uma das dele
function turmaDoProfessor(req) {
  const lista = (req.usuarioLogado.turmas && req.usuarioLogado.turmas.length)
    ? req.usuarioLogado.turmas
    : (req.usuarioLogado.turma ? [req.usuarioLogado.turma] : []);
  const pedida = (req.query && req.query.turma) || (req.body && req.body.turma) || null;
  if (pedida && lista.includes(pedida)) return { turma: pedida, lista, ok: true };
  if (pedida && !lista.includes(pedida)) return { turma: null, lista, ok: false };
  return { turma: lista[0] || null, lista, ok: true };
}

// registro de hoje do professor (para saber se ja fez check-in/out)
app.get("/api/professor/hoje", verificarToken, async (req, res) => {
  try {
    if (req.usuarioLogado.role !== "professor") return res.status(403).json({ error: "Acesso restrito." });
    const email = String(req.usuarioLogado.email).toLowerCase();
    const sel = turmaDoProfessor(req);
    if (!sel.ok) return res.status(403).json({ error: "Turma nao pertence a voce." });
    const { data: hoje } = getBrasiliaTime();
    let reg = null;
    try {
      let q = supabase.from("presencas_professor").select("*")
        .eq("professor_email", email).eq("data", hoje);
      if (sel.turma) q = q.eq("turma", sel.turma);
      const r = await q.maybeSingle();
      reg = r.data || null;
    } catch (e) {
      console.error("presencas_professor indisponivel (rode o SQL 12):", e?.message || e);
    }
    const cronograma = await cronogramaDb.carregarCronograma(supabase);
    const turma = sel.turma ? cronogramaDb.getTurma(cronograma, sel.turma) : null;
    res.json({
      data: hoje,
      registro: reg || null,
      turmas: sel.lista,
      turmaSel: sel.turma,
      turma: turma ? { id: turma.id, nome: turma.nome, sede: turma.sede,
        exigeLocalizacao: turma.modalidade === "presencial" &&
          Number.isFinite(turma?.local?.latitude) && Number.isFinite(turma?.local?.longitude) &&
          (turma?.local?.exige === true) } : null,
    });
  } catch (err) {
    console.error("ERRO professor/hoje:", err);
    res.status(500).json({ error: "Erro ao carregar." });
  }
});

// check-in / check-out do professor
app.post("/api/professor/ponto", verificarToken, async (req, res) => {
  try {
    if (req.usuarioLogado.role !== "professor") return res.status(403).json({ error: "Acesso restrito." });
    const email = String(req.usuarioLogado.email).toLowerCase();
    const selp = turmaDoProfessor(req);
    if (!selp.ok) return res.status(403).json({ error: "Turma nao pertence a voce." });
    const turmaId = selp.turma;
    const { tipo, latitude, longitude, engajamento, nivelamento, observacao } = req.body;
    if (!["checkin", "checkout"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo invalido." });
    }
    const { data: hoje, hora: agora } = getBrasiliaTime();
    const ts = `${hoje}T${agora}`;

    // GPS: mesma regra dos alunos (valida contra a sede da turma, se exigir)
    const cronograma = await cronogramaDb.carregarCronograma(supabase);
    const turma = turmaId ? cronogramaDb.getTurma(cronograma, turmaId) : null;
    const exigeLoc = turma && turma.modalidade === "presencial" &&
      Number.isFinite(turma?.local?.latitude) && Number.isFinite(turma?.local?.longitude) &&
      (turma?.local?.exige === true);

    let lat = null, lng = null;
    if (tipo === "checkin" && exigeLoc) {
      lat = parseFloat(latitude); lng = parseFloat(longitude);
      const val = validarLocalCheckin(lat, lng, turma);
      if (!val.ok) {
        return res.status(403).json({
          error: "Check-in permitido somente na sede da sua turma" + (turma?.sede ? " (" + turma.sede + ")." : "."),
          distancia: val.distancia,
        });
      }
    }

    // registro de hoje (por turma)
    let rq = supabase.from("presencas_professor").select("*")
      .eq("professor_email", email).eq("data", hoje);
    if (turmaId) rq = rq.eq("turma", turmaId);
    const { data: reg } = await rq.maybeSingle();

    if (tipo === "checkin") {
      if (reg && reg.check_in) return res.status(400).json({ error: "Voce ja fez check-in nesta turma hoje." });
      const linha = { professor_email: email, turma: turmaId, data: hoje, check_in: ts,
        checkin_latitude: lat, checkin_longitude: lng };
      if (reg) await supabase.from("presencas_professor").update(linha).eq("id", reg.id);
      else await supabase.from("presencas_professor").insert([linha]);
      return res.json({ ok: true, tipo: "checkin", hora: agora });
    }

    // checkout: exige avaliacao
    if (!reg || !reg.check_in) return res.status(400).json({ error: "Faca o check-in antes do check-out." });
    if (reg.check_out) return res.status(400).json({ error: "Voce ja fez check-out hoje." });
    const eng = parseInt(engajamento, 10);
    if (!(eng >= 1 && eng <= 5) || !nivelamento) {
      return res.status(400).json({ error: "Preencha a avaliacao da aula (engajamento e nivelamento)." });
    }
    await supabase.from("presencas_professor").update({
      check_out: ts, engajamento: eng, nivelamento: String(nivelamento),
      observacao: observacao ? String(observacao).slice(0, 1000) : null,
    }).eq("id", reg.id);
    return res.json({ ok: true, tipo: "checkout", hora: agora });
  } catch (err) {
    console.error("ERRO professor/ponto:", err);
    res.status(500).json({ error: "Erro ao registrar o ponto." });
  }
});

// frequencia dos alunos da turma do professor - P3
app.get("/api/professor/turma", verificarToken, async (req, res) => {
  try {
    if (req.usuarioLogado.role !== "professor") return res.status(403).json({ error: "Acesso restrito." });
    const _s = turmaDoProfessor(req); if(!_s.ok) return res.status(403).json({ error: "Turma nao pertence a voce." }); const turmaId = _s.turma;
    if (!turmaId) return res.json({ turma: null, alunos: [], presentes_hoje: 0, total: 0 });

    const { data: hoje } = getBrasiliaTime();
    const cronograma = await cronogramaDb.carregarCronograma(supabase);
    const turma = cronogramaDb.getTurma(cronograma, turmaId);

    const { data: alunos } = await supabase
      .from("alunos").select("email, nome").eq("formacao", turmaId);
    const emails = (alunos || []).map((a) => a.email);

    let presencas = [];
    if (emails.length) {
      const { data: pres } = await supabase
        .from("presencas").select("aluno_email, data, check_in, check_out").in("aluno_email", emails);
      presencas = pres || [];
    }

    // agrega por aluno: dias distintos com check-in + se presente hoje
    const porAluno = {};
    for (const p of presencas) {
      if (!p.check_in) continue;
      const e = p.aluno_email;
      if (!porAluno[e]) porAluno[e] = { dias: new Set(), hoje: false };
      porAluno[e].dias.add(String(p.data).slice(0, 10));
      if (String(p.data).slice(0, 10) === hoje) porAluno[e].hoje = true;
    }

    const lista = (alunos || [])
      .map((a) => ({
        nome: a.nome || a.email,
        email: a.email,
        presencas: porAluno[a.email] ? porAluno[a.email].dias.size : 0,
        presente_hoje: porAluno[a.email] ? porAluno[a.email].hoje : false,
      }))
      .sort((x, y) => String(x.nome).localeCompare(String(y.nome)));

    res.json({
      turma: turma ? { id: turma.id, nome: turma.nome, sede: turma.sede } : { id: turmaId, nome: turmaId },
      data: hoje,
      total: lista.length,
      presentes_hoje: lista.filter((a) => a.presente_hoje).length,
      alunos: lista,
    });
  } catch (err) {
    console.error("ERRO professor/turma:", err);
    res.status(500).json({ error: "Erro ao carregar a turma." });
  }
});

// relatorio completo da turma (todas as datas/alunos) - para navegacao por data + export
app.get("/api/professor/relatorio", verificarToken, async (req, res) => {
  try {
    if (req.usuarioLogado.role !== "professor") return res.status(403).json({ error: "Acesso restrito." });
    const _sr = turmaDoProfessor(req); if(!_sr.ok) return res.status(403).json({ error: "Turma nao pertence a voce." }); const turmaId = _sr.turma;
    if (!turmaId) return res.json({ turma: null, alunos: [], registros: [] });
    const cronograma = await cronogramaDb.carregarCronograma(supabase);
    const turma = cronogramaDb.getTurma(cronograma, turmaId);
    const { data: alunos } = await supabase
      .from("alunos").select("email, nome").eq("formacao", turmaId);
    const emails = (alunos || []).map((a) => a.email);
    let registros = [];
    if (emails.length) {
      const { data: pres } = await supabase
        .from("presencas").select("aluno_email, data, check_in, check_out").in("aluno_email", emails);
      registros = pres || [];
    }
    res.json({
      turma: turma ? { id: turma.id, nome: turma.nome, sede: turma.sede } : { id: turmaId, nome: turmaId },
      alunos: (alunos || []).sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))),
      registros,
    });
  } catch (err) {
    console.error("ERRO professor/relatorio:", err);
    res.status(500).json({ error: "Erro ao carregar o relatorio." });
  }
});

// professor edita a presenca de um aluno num dia (marcar/desmarcar)
app.post("/api/professor/presenca", verificarToken, async (req, res) => {
  try {
    if (req.usuarioLogado.role !== "professor") return res.status(403).json({ error: "Acesso restrito." });
    const turmaId = req.usuarioLogado.turma || null;
    const { aluno_email, data, presente } = req.body;
    if (!aluno_email || !data) return res.status(400).json({ error: "Dados incompletos." });
    const email = String(aluno_email).toLowerCase();
    const dia = String(data).slice(0, 10);

    // seguranca: o aluno tem que ser da turma do professor
    const { data: dono } = await supabase
      .from("alunos").select("email").eq("email", email).eq("formacao", turmaId).maybeSingle();
    if (!dono) return res.status(403).json({ error: "Aluno nao pertence a sua turma." });

    if (presente) {
      // garante um registro de presenca no dia (marca presente)
      const { data: existe } = await supabase
        .from("presencas").select("id, check_in").eq("aluno_email", email).eq("data", dia).maybeSingle();
      if (!existe) {
        await supabase.from("presencas").insert([{ aluno_email: email, data: dia, check_in: `${dia}T12:00:00` }]);
      } else if (!existe.check_in) {
        await supabase.from("presencas").update({ check_in: `${dia}T12:00:00` }).eq("id", existe.id);
      }
    } else {
      // desmarca: remove o registro do dia
      await supabase.from("presencas").delete().eq("aluno_email", email).eq("data", dia);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("ERRO professor/presenca:", err);
    res.status(500).json({ error: "Erro ao salvar a presenca." });
  }
});

app.get("/api/health", (_, res) =>
  res.json({ status: "online", modoTeste: MODO_TESTE }),
);

if (process.env.NODE_ENV !== "production") {
  app.listen(3001, () =>
    console.log("🚀 Backend rodando em http://localhost:3001"),
  );
}

module.exports = app;