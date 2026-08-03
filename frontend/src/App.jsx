import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import {
  API_URL,
  PERIODO_LETIVO,
  avaliarJanelaPonto,
  formatarDataBR,
  formatarHoraDecimal,
  gerarCalendario,
  getDiasAulaLegivel,
  horaAtualBrasilia,
  getFormacao,
  getJanelasHorario,
  getNomeCurto,
  getProximasAulas,
  hojeBrasilia,
  isDiaDeAula,
} from "./Constants";
import Login from "./Login";
import Admin from "./Admin";
import Perfil from "./Perfil";
import { fetchComToken } from "./Api";
import GestaoRapida from "./GestaoRapida";
import HomeAdmin from "./HomeAdmin";
import Cronograma from "./Cronograma";

// Libera check-in/check-out em qualquer dia e horário para gravação de vídeo
// ou teste interno. Mantenha `false` em produção — o servidor também valida.
const MODO_TESTE = false;

export default function App() {
  const [user, setUser] = useState(() => {
    const s = localStorage.getItem("geracaotech_session");
    if (!s) return null;
    try {
      const { userData, timestamp } = JSON.parse(s);
      if (Date.now() - timestamp < 12 * 60 * 60 * 1000) return userData;
    } catch (err) {
      console.error(err);
    }
    return null;
  });

  const [dadosSalvos, setDadosSalvos] = useState(() => {
    const salvo = localStorage.getItem("geracaotech_remember");
    return salvo ? JSON.parse(salvo) : null;
  });

  const [view, setView] = useState("home");
  const [form, setForm] = useState(dadosSalvos || { email: "", dataNasc: "" });
  const [historico, setHistorico] = useState([]);
  const [popup, setPopup] = useState({ show: false, msg: "", tipo: "" });
  const [feedback, setFeedback] = useState({
    nota: 0,
    revisao: "",
    modal: false,
  });
  const [loadingCheckIn, setLoadingCheckIn] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const salvo = localStorage.getItem("geracaotech_theme");
    return salvo ? JSON.parse(salvo) : true;
  });

  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const [stats] = useState({
    totalAlunos: 0,
    sessoesAtivas: 0,
    totalPresencas: 0,
  });

  const [alarmeAtivo] = useState(true);

  // Cronograma da turma vindo do banco. O admin pode alterar dias, horários e
  // datas pelo painel, então a interface do aluno segue o servidor.
  // Se a chamada falhar, caímos no calendário padrão de Constants.js.
  const [cronogramaTurma, setCronogramaTurma] = useState(null);
  const cronogramaRef = useRef(null);

  useEffect(() => {
    if (!user?.formacao || user.role === "admin") return;

    let cancelado = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/cronograma/${user.formacao}`);
        if (!res.ok) return;
        const dados = await res.json();
        if (!cancelado) {
          setCronogramaTurma(dados);
          cronogramaRef.current = dados;
        }
      } catch (err) {
        console.error("Erro ao carregar cronograma da turma:", err);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [user?.formacao, user?.role]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const t = setTimeout(() => {
      setView((v) => (v === "home" ? "admin" : v));
    }, 0);
    return () => clearTimeout(t);
  }, [user?.role]);

  const popupStyles = {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: "#f4f8ff",
    color: "#ffffff",
    padding: "15px 25px",
    borderRadius: "8px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
    borderLeft: "5px solid #000000",
    zIndex: 9999,
    fontWeight: "bold",
    animation: "slideIn 0.5s ease-out",
  };

  const exibirPopup = (msg, tipo) => {
    setPopup({ show: true, msg, tipo });
    setTimeout(() => setPopup({ show: false, msg: "", tipo: "" }), 5000);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const agora = new Date();
      const horaFormatada = agora.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
      setCurrentTime(horaFormatada);

      if (!alarmeAtivo || !user?.formacao || user.role === "admin") return;

      // Avisa 30 minutos após a abertura do check-in, em dia de aula.
      const janelas =
        cronogramaRef.current?.janelas || getJanelasHorario(user.formacao);
      const temAula = cronogramaRef.current
        ? cronogramaRef.current.temAulaHoje
        : isDiaDeAula(user.formacao);
      const horaAviso = formatarHoraDecimal(janelas.checkIn.inicio + 0.5);

      if (temAula && horaFormatada === horaAviso) {
        exibirPopup("A aula começou. Faça seu check-in.", "aviso");
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [alarmeAtivo, user?.formacao, user?.role]);

  // --- Trecho Completo: Validação de Horário + Login ---

  // Janelas e datas da turma: o servidor manda, o código é o plano B.
  const janelasTurma =
    cronogramaTurma?.janelas || getJanelasHorario(user?.formacao);

  const aulasTurma = cronogramaTurma?.aulas || gerarCalendario(user?.formacao);

  // Regras do Edital nº 01/2026 – Projeto Geração Tech 4.0
  const validarHorarioPonto = () => {
    if (MODO_TESTE || cronogramaTurma?.modoTeste) {
      return {
        isDiaDeAula: true,
        podeCheckIn: true,
        podeCheckOut: true,
        diasCorretos: "Todos os dias (modo teste)",
        rotuloCheckIn: "liberado",
        rotuloCheckOut: "liberado",
      };
    }

    if (!cronogramaTurma) {
      return avaliarJanelaPonto(user?.formacao, { modoTeste: MODO_TESTE });
    }

    const agora = horaAtualBrasilia();
    const dias = cronogramaTurma.turma?.dias || [];
    const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    return {
      isDiaDeAula: Boolean(cronogramaTurma.temAulaHoje),
      podeCheckIn:
        agora >= janelasTurma.checkIn.inicio &&
        agora <= janelasTurma.checkIn.fim,
      podeCheckOut:
        agora >= janelasTurma.checkOut.inicio &&
        agora <= janelasTurma.checkOut.fim,
      diasCorretos: dias.length
        ? dias.map((d) => nomes[d]).join(", ")
        : getDiasAulaLegivel(user?.formacao),
      rotuloCheckIn: `${formatarHoraDecimal(janelasTurma.checkIn.inicio)} às ${formatarHoraDecimal(janelasTurma.checkIn.fim)}`,
      rotuloCheckOut: `${formatarHoraDecimal(janelasTurma.checkOut.inicio)} às ${formatarHoraDecimal(janelasTurma.checkOut.fim)}`,
    };
  };

  const handleLogin = async () => {
    try {
      const partes = form.dataNasc.split("/");
      if (partes.length !== 3 || form.dataNasc.length < 10) {
        exibirPopup("Digite a data completa: DD/MM/AAAA", "erro");
        return;
      }
      const dataParaEnvio = `${partes[2]}-${partes[1]}-${partes[0]}`;

      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          dataNascimento: dataParaEnvio,
          formacao: form.formacao,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        exibirPopup(data.error || "Erro no login.", "erro");
        return;
      }

      localStorage.removeItem("geracaotech_session");
      setUser(data);

      localStorage.setItem(
        "geracaotech_remember",
        JSON.stringify({
          email: data.email,
          dataNasc: form.dataNasc,
          nome: data.nome || "",
          formacao: data.formacao,
        }),
      );

      localStorage.setItem(
        "geracaotech_session",
        JSON.stringify({ userData: data, timestamp: Date.now() }),
      );
    } catch (err) {
      console.error("Erro no fetch de login:", err);
      exibirPopup("Erro de conexão.", "erro");
    }
  };
  const carregarHistorico = useCallback(async () => {
    const emailParaBusca =
      user?.email ||
      JSON.parse(localStorage.getItem("geracaotech_session"))?.userData?.email;

    const token =
      user?.token ||
      JSON.parse(localStorage.getItem("geracaotech_session"))?.userData?.token;

    if (!emailParaBusca || user?.role === "admin" || !token) return;

    try {
      const res = await fetch(
        `${API_URL}/historico/aluno/${emailParaBusca.trim().toLowerCase()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setHistorico(data);
      }
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  }, [user]);

  useEffect(() => {
    if (user?.email) {
      const timer = setTimeout(() => carregarHistorico(), 0);
      return () => clearTimeout(timer);
    }
  }, [user?.email, carregarHistorico]);
  const obterLocalizacaoAtual = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalização não suportada neste dispositivo."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          reject(
            new Error(
              "Não foi possível obter sua localização. Ative a localização do dispositivo.",
            ),
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        },
      );
    });

  const baterPonto = async (extra = {}) => {
    if (!user || !user.email || !user.token) {
      return exibirPopup("Sessão expirada. Faça login novamente.", "erro");
    }

    try {
      let payload = {
        aluno_id: user.email.trim().toLowerCase(),
        ...extra,
      };

      const ehCheckin = !extra.nota;

      // O servidor manda: se a conferência de local estiver desligada, nem
      // pedimos permissão de GPS. Sem resposta do servidor, caímos na
      // modalidade da turma definida no código.
      const precisaLocalizacao =
        cronogramaTurma !== null
          ? Boolean(cronogramaTurma.exigeLocalizacao)
          : getFormacao(user.formacao)?.modalidade === "presencial";

      if (ehCheckin && precisaLocalizacao) {
        const localizacao = await obterLocalizacaoAtual();
        payload = {
          ...payload,
          latitude: localizacao.latitude,
          longitude: localizacao.longitude,
        };
      }

      const res = await fetchComToken("/ponto", "POST", payload);

      const data = await res.json();

      if (!res.ok) {
        return exibirPopup(data.error || "Erro ao registrar ponto.", "erro");
      }

      exibirPopup(data.msg, "sucesso");
      await carregarHistorico();

      if (!extra.nota) {
        setTimeout(() => {
          exibirPopup(
            "📌 Lembrete: Realize o Check-out dentro da janela de saída da sua turma.",
            "aviso",
          );
        }, 1000);
      }

      setFeedback({ nota: 0, revisao: "", modal: false });
    } catch (err) {
      console.error("Erro bater ponto:", err);
      exibirPopup(err.message || "Erro de comunicação com o servidor.", "erro");
    }
  };

  useEffect(() => {
    document.body.classList.toggle("dark", isDarkMode);
    localStorage.setItem("geracaotech_theme", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  if (!user) {
    return (
      <Login
        form={form}
        setForm={setForm}
        handleLogin={handleLogin}
        dadosSalvos={dadosSalvos}
        setDadosSalvos={setDadosSalvos}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />
    );
  }

  // Presenças e faltas contam apenas aulas do calendário que já ocorreram.
  const aulasOcorridas = aulasTurma.filter((d) => d <= hojeBrasilia());
  const datasComPresenca = new Set(
    historico.map((h) => h.data?.slice(0, 10)).filter(Boolean),
  );
  const totalPresencas = aulasOcorridas.filter((d) =>
    datasComPresenca.has(d),
  ).length;
  const totalFaltas = Math.max(0, aulasOcorridas.length - totalPresencas);
  const proximasAulas =
    cronogramaTurma?.proximasAulas || getProximasAulas(user.formacao);
  const nomeExibicao = user.nome || user.email.split("@")[0];
  return (
    <div className="app-wrapper">
      {popup.show && (
        <div className={`custom-popup-modern ${popup.tipo}`}>{popup.msg}</div>
      )}

      <header className="glass-header">
        <div
          className="brand-logo"
          onClick={() => setView("home")}
          style={{ cursor: "pointer" }}
        >
          <img
            src="/logo-gt4.png" /* Certifique-se que a extensão é .png ou .jpg */
            alt="Logo Geração Tech 4.0"
            className="brand-logo-img"
          />
          <div className="brand-text">
            Registro de Frequência
            <span>Geração Tech 4.0</span>
          </div>
          <div className="user-badge">
            {user.role === "admin" ? "Admin" : "Aluno"}
          </div>
        </div>
        <div className="header-right">
          <span className="clock">🕒 {currentTime}</span>
          <div className="nav-actions">
            {user.role === "admin" ? (
              // Links exclusivos do Admin
              <>
                <button
                  className="btn-secondary"
                  onClick={() => setView("home")}
                >
                  Home
                </button>
                <button
                  className="btn-secondary"
                  style={{
                    border: view === "admin" ? "2px solid #052768;" : "none",
                  }}
                  onClick={() => setView("admin")}
                >
                  Dashboard
                </button>
                <button
                  className="btn-secondary"
                  style={{
                    border:
                      view === "cronograma" ? "2px solid #052768;" : "none",
                  }}
                  onClick={() => setView("cronograma")}
                >
                  Cronograma
                </button>
                <button
                  className="btn-secondary"
                  style={{
                    border: view === "limpeza" ? "2px solid #052768;" : "none",
                  }}
                  onClick={() => setView("limpeza")}
                >
                  Edição
                </button>
              </>
            ) : (
              // Links exclusivos do Aluno
              <>
                <button
                  className="btn-action-circle"
                  title="Meu Perfil"
                  onClick={() => setView("perfil")}
                >
                  👤
                </button>
              </>
            )}

            <button
              className="btn-action-circle"
              title="Alternar Tema"
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              {isDarkMode ? "○" : "●"}
            </button>

            <button
              className="btn-secondary"
              onClick={() => {
                localStorage.removeItem("geracaotech_session");
                setUser(null);
              }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* 1. SE FOR ADMIN E ESTIVER NA HOME OU NA VIEW ADMIN */}
      {view === "home" && user.role === "admin" ? (
        <HomeAdmin
          stats={stats} // Agora 'stats' está definido e virá do banco de dados
          user={user}
        />
      ) : view === "admin" && user.role === "admin" ? (
        <Admin user={user} setView={setView} />
      ) : view === "perfil" && user.role !== "admin" ? (
        <Perfil
          user={user}
          setUser={setUser}
          onVoltar={() => setView("home")}
        />
      ) : view === "cronograma" && user.role === "admin" ? (
        <Cronograma setView={setView} />
      ) : view === "limpeza" && user.role === "admin" ? (
        <GestaoRapida user={user} setView={setView} />
      ) : (
        /* 4. LAYOUT EXCLUSIVO DO ALUNO (SÓ APARECE SE NÃO FOR ADMIN) */
        <main
          className="aluno-main-wrapper"
          style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}
        >
          {/* CARD PRINCIPAL DE PONTO - LARGURA TOTAL DO WRAPPER */}
          <div
            className="aula-card shadow-card"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: "25px",
            }}
          >
            <div className="card-header-info">
              <p style={{ color: "var(--text-dim)" }}>
                {new Date().toLocaleDateString("pt-BR")}
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ color: "var(--text-dim)", margin: 0 }}>
                  Olá, {nomeExibicao}!
                </h2>
                <span
                  className="user-badge"
                  style={{ fontSize: "0.8rem", padding: "2px 10px" }}
                >
                  {getNomeCurto(user.formacao)}
                </span>
              </div>
            </div>

            {cronogramaTurma?.janelaPonto === "WINDOW_OPEN" ? (
              <div
                className="info-banner"
                style={{
                  margin: "15px 0",
                  borderLeft: "5px solid #f59e0b",
                  background: "rgba(245, 158, 11, 0.12)",
                }}
              >
                MODO TESTE — janela de ponto aberta. Check-in e check-out estão
                liberados em qualquer dia e horário.
              </div>
            ) : (
              <div className="info-banner" style={{ margin: "15px 0" }}>
                ℹ Check-in e check-out ficam liberados nos dias de aula ao vivo
                da sua turma, dentro das janelas abaixo.
              </div>
            )}

            <div style={{ margin: "20px 0", textAlign: "center" }}>
              {(() => {
                const {
                  isDiaDeAula: hojeTemAula,
                  podeCheckIn,
                  podeCheckOut,
                  diasCorretos,
                  rotuloCheckIn,
                  rotuloCheckOut,
                } = validarHorarioPonto();
                const hojeISO = hojeBrasilia();
                const registroHoje = historico.find(
                  (h) => h.data?.substring(0, 10) === hojeISO,
                );
                const jaFezIn = !!registroHoje?.check_in;
                const jaFezOut = !!registroHoje?.check_out;

                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        gap: "15px",
                        justifyContent: "center",
                        marginBottom: "25px",
                      }}
                    >
                      <button
                        className={`btn-ponto in ${jaFezIn ? "concluido" : ""}`}
                        disabled={jaFezIn || loadingCheckIn}
                        onClick={async () => {
                          if (loadingCheckIn) return;

                          if (!hojeTemAula) {
                            exibirPopup(
                              `Hoje não há aula ao vivo da sua turma (${diasCorretos}).`,
                              "erro",
                            );
                            return;
                          }

                          if (!podeCheckIn) {
                            exibirPopup(
                              `Check-in liberado das ${rotuloCheckIn}.`,
                              "erro",
                            );
                            return;
                          }

                          try {
                            setLoadingCheckIn(true);
                            await baterPonto();
                          } finally {
                            setLoadingCheckIn(false);
                          }
                        }}
                        style={
                          jaFezIn || loadingCheckIn
                            ? {
                                backgroundColor: "#2d3748",
                                cursor: "default",
                                opacity: 0.8,
                                flex: 1,
                              }
                            : { flex: 1 }
                        }
                      >
                        {jaFezIn
                          ? "✔ CHECK-IN FEITO"
                          : loadingCheckIn
                            ? "PROCESSANDO..."
                            : "FAZER CHECK-IN"}
                      </button>

                      <button
                        className={`btn-ponto out ${jaFezOut ? "concluido" : ""}`}
                        disabled={jaFezOut || !jaFezIn}
                        onClick={() => {
                          if (!jaFezIn) {
                            exibirPopup("Faça o check-in primeiro!", "erro");
                            return;
                          }
                          if (!hojeTemAula || !podeCheckOut) {
                            exibirPopup(
                              `Check-out liberado das ${rotuloCheckOut}.`,
                              "erro",
                            );
                            return;
                          }
                          setFeedback({ ...feedback, modal: true });
                        }}
                        style={
                          jaFezOut || !jaFezIn
                            ? {
                                backgroundColor: "#2d3748",
                                cursor: "default",
                                opacity: 0.6,
                                flex: 1,
                              }
                            : { flex: 1 }
                        }
                      >
                        {jaFezOut ? "✔ CHECK-OUT FEITO" : "CHECK-OUT"}
                      </button>
                    </div>

                    <div
                      style={{
                        background: "rgba(0, 128, 128, 0.05)",
                        padding: "20px",
                        borderRadius: "12px",
                        border: "1px solid rgba(0, 128, 128, 0.1)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <h5
                        style={{
                          margin: "0 0 15px 0",
                          color: "#f4f8ff",
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        🕒 Janelas Oficiais de Registro
                      </h5>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-around",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ textAlign: "center" }}>
                          <span
                            style={{
                              display: "block",
                              color: "var(--text-dim)",
                              fontSize: "0.65rem",
                              marginBottom: "5px",
                            }}
                          >
                            ENTRADA
                          </span>
                          <strong style={{ fontSize: "1.1rem" }}>
                            {(() => {
                              const j = janelasTurma.checkIn;
                              return `${formatarHoraDecimal(j.inicio)} — ${formatarHoraDecimal(j.fim)}`;
                            })()}
                          </strong>
                        </div>
                        <div
                          style={{
                            width: "1px",
                            height: "30px",
                            background: "rgba(0,128,128,0.2)",
                          }}
                        ></div>
                        <div style={{ textAlign: "center" }}>
                          <span
                            style={{
                              display: "block",
                              color: "var(--text-dim)",
                              fontSize: "0.65rem",
                              marginBottom: "5px",
                            }}
                          >
                            SAÍDA
                          </span>
                          <strong style={{ fontSize: "1.1rem" }}>
                            {(() => {
                              const j = janelasTurma.checkOut;
                              return `${formatarHoraDecimal(j.inicio)} — ${formatarHoraDecimal(j.fim)}`;
                            })()}
                          </strong>
                        </div>
                      </div>
                      <p
                        style={{
                          margin: "15px 0 0 0",
                          fontSize: "0.75rem",
                          color: "var(--text-dim)",
                          fontStyle: "italic",
                        }}
                      >
                        * Dias de aula: {diasCorretos} • Regras: Edital Geração
                        Tech 4.0
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="stats-grid" style={{ marginTop: "30px" }}>
              <div className="stat-card">
                <span className="stat-label">Total de Presenças</span>
                <div className="stat-value">{totalPresencas}</div>
              </div>

              <div className="stat-card" style={{ textAlign: "left" }}>
                <span className="stat-label">📅 Próximas Aulas</span>
                <ul style={{ paddingLeft: "15px", margin: "10px 0" }}>
                  {proximasAulas.map((data) => (
                    <li
                      key={data}
                      style={{
                        marginBottom: "5px",
                        color:
                          data === PERIODO_LETIVO.aulaInaugural
                            ? "#142b69;"
                            : "inherit",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>
                        {formatarDataBR(data)}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          opacity: 0.8,
                          marginLeft: "8px",
                        }}
                      >
                        {data === PERIODO_LETIVO.aulaInaugural
                          ? "Aula inaugural"
                          : `${formatarHoraDecimal(janelasTurma.aula.inicio)}h`}
                      </span>
                    </li>
                  ))}
                  {proximasAulas.length === 0 && (
                    <li style={{ color: "var(--text-dim)" }}>
                      Nenhuma aula futura no calendário.
                    </li>
                  )}
                </ul>
              </div>

              <div className="stat-card">
                <span className="stat-label">Total de Faltas</span>
                <div className="stat-value faltas">{totalFaltas}</div>
              </div>

              <div className="stat-card">
                <span className="stat-label">Status da Sessão</span>
                <div
                  className="stat-value text-success"
                  style={{ fontSize: "1.2rem" }}
                >
                  Ativa
                </div>
              </div>
            </div>
          </div>

          {/* HISTÓRICO COMPLETO - AGORA ALINHADO PERFEITAMENTE */}
          <div
            id="historico-section"
            className="historico-container shadow-card"
            style={{ width: "100%", boxSizing: "border-box", padding: "20px" }}
          >
            <h3>Meu Histórico Completo</h3>
            <div className="table-responsive">
              <table className="historico-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Entrada</th>
                    <th>Saída</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.length === 0 ? (
                    <tr>
                      <td
                        colSpan="3"
                        style={{
                          textAlign: "center",
                          color: "var(--text-dim)",
                        }}
                      >
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  ) : (
                    historico.map((h, i) => (
                      <tr key={i}>
                        <td>
                          {new Date(h.data).toLocaleDateString("pt-BR", {
                            timeZone: "UTC",
                          })}
                        </td>
                        <td>
                          {h.check_in
                            ? h.check_in.includes("T")
                              ? h.check_in.split("T")[1].substring(0, 5)
                              : h.check_in.substring(0, 5)
                            : "--:--"}
                        </td>
                        <td>
                          {h.check_out
                            ? h.check_out.includes("T")
                              ? h.check_out.split("T")[1].substring(0, 5)
                              : h.check_out.substring(0, 5)
                            : "--:--"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* MODAL DE FEEDBACK (FORA DO WRAPPER DE LARGURA) */}
      {feedback.modal && (
        <div className="modal-overlay">
          <div className="modal-content shadow-xl">
            <h3>Finalizar Check-out</h3>
            <p className="text-muted" style={{ marginBottom: "15px" }}>
              Como foi sua experiência na aula de hoje?
            </p>
            <div
              className="rating-group"
              style={{
                display: "flex",
                gap: "10px",
                margin: "15px 0",
                justifyContent: "center",
                alignItems: "center",
                color: "var(--text-dim)",
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`btn-rating ${feedback.nota === n ? "active" : ""}`}
                  onClick={() => setFeedback({ ...feedback, nota: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            <textarea
              className="input-notes"
              placeholder="Algum comentário ou dúvida?"
              value={feedback.revisao}
              onChange={(e) =>
                setFeedback({ ...feedback, revisao: e.target.value })
              }
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
              <button
                className="btn-ponto in"
                onClick={() =>
                  baterPonto({ nota: feedback.nota, revisao: feedback.revisao })
                }
              >
                Confirmar Saída
              </button>
              <button
                className="btn-secondary"
                onClick={() => setFeedback({ ...feedback, modal: false })}
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
