import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  API_URL,
  FORMACOES,
  PERIODO_LETIVO,
  formatarDataBR,
  getFormacao,
  getNomeCurto,
  getProximasAulas,
  hojeBrasilia,
} from "./Constants";
import { fetchComToken } from "./Api";

const CHAVE_FILTRO_RAPIDO = "gt_admin_quickfilter";

// Ícones em SVG (em vez de emoji) para não depender da fonte de emoji do
// sistema, que renderiza cada glifo com sua própria cor/fundo e destoa do
// tema do painel. currentColor herda a cor definida no badge que o envolve.
const IconeSvg = ({ path }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={path} />
  </svg>
);

const ICONES = {
  buscar: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  saida: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  auditoria:
    "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v0Zm0 9 2 2 4-4",
  exportar: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
};

// Círculo colorido atrás do ícone: mantém contraste consistente em qualquer
// tema, sem depender de como cada sistema desenha o emoji.
const IconeBadge = ({ path, cor }) => (
  <div
    style={{
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      background: cor,
      color: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    <IconeSvg path={path} />
  </div>
);

export default function HomeAdmin({ user, setView }) {
  const [stats, setStats] = useState({
    totalAlunos: 0,
    sessoesAtivas: 0,
    concluidosHoje: 0,
    pendentesSaida: 0,
  });

  const [presentesHoje, setPresentesHoje] = useState([]);
  const [loading, setLoading] = useState(true);
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  // Curso (fullstack/ia/fullcycle) a partir da turma real, com fallback
  // pela lista estática e, na falta dela, por palavras-chave no nome.
  const inferirCurso = (nome = "") => {
    const n = nome.toLowerCase();
    if (n.includes("ia generativa") || n.includes("inteligência artificial"))
      return "ia";
    if (n.includes("fullcycle") || n.includes("full cycle")) return "fullcycle";
    if (n.includes("full stack") || n.includes("fullstack")) return "fullstack";
    return null;
  };
  const cursoDoAluno = (aluno) =>
    getFormacao(aluno.formacao)?.curso || inferirCurso(aluno.turma_nome);

  // Carrega a lista real de turmas (sincronizada do Geração Tech)
  useEffect(() => {
    const carregarTurmas = async () => {
      try {
        const res = await fetchComToken("/admin/turmas");
        if (res.ok) {
          const data = await res.json();
          setTurmasDisponiveis(data.turmas || []);
        }
      } catch (err) {
        console.error("Erro ao carregar turmas:", err);
      }
    };
    carregarTurmas();
  }, []);

  // Próxima aula considerando todas as turmas ativas do Geração Tech 4.0
  const proximaISO = FORMACOES.map((f) => getProximasAulas(f.id, 1)[0])
    .filter(Boolean)
    .sort()[0];

  const proximaData = proximaISO
    ? formatarDataBR(proximaISO)
    : "Sem aulas futuras";

  const turmasDaProximaAula = proximaISO
    ? FORMACOES.filter((f) => getProximasAulas(f.id, 1)[0] === proximaISO)
    : [];

  const pautaHoje =
    proximaISO === PERIODO_LETIVO.aulaInaugural
      ? "Aula inaugural: boas-vindas, metodologia e tour pela plataforma."
      : turmasDaProximaAula.length
        ? `Turmas em aula: ${turmasDaProximaAula.map((f) => getNomeCurto(f.id)).join(", ")}.`
        : "Conteúdo conforme o cronograma oficial da formação.";

  const carregarDashboard = useCallback(async () => {
    if (!user?.token) return;

    try {
      setLoading(true);
      const hoje = hojeBrasilia();

      const resStats = await fetch(
        `${API_URL}/admin/stats/todos?dataFiltro=${hoje}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${user.token}` },
        },
      );

      const resLista = await fetch(
        `${API_URL}/admin/busca?termo=&turma=todos&status=presentes_no_dia&dataFiltro=${hoje}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${user.token}` },
        },
      );

      if (resStats.ok && resLista.ok) {
        const dataStats = await resStats.json();
        const dataLista = await resLista.json();

        setStats({
          totalAlunos: dataStats.totalAlunos || 0,
          sessoesAtivas: dataStats.sessoesAtivas || 0,
          concluidosHoje: dataStats.concluidosHoje || 0,
          pendentesSaida: dataStats.pendentesSaida || 0,
        });

        setPresentesHoje(dataLista.alunos || []);
      }
      setUltimaAtualizacao(new Date());
    } catch (err) {
      console.error("Erro ao carregar dashboard admin:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    carregarDashboard();
    const interval = setInterval(carregarDashboard, 60000);
    return () => clearInterval(interval);
  }, [carregarDashboard]);

  // Contagem por formação (Full Stack / IA Generativa / FullCycle)
  const contagemPorCurso = useMemo(
    () =>
      [
        { curso: "fullstack", rotulo: "Full Stack", cor: "#22d3ee" },
        { curso: "ia", rotulo: "IA Generativa", cor: "#f59e0b" },
        { curso: "fullcycle", rotulo: "FullCycle", cor: "#6366f1" },
      ].map((item) => ({
        ...item,
        total: presentesHoje.filter((a) => cursoDoAluno(a) === item.curso)
          .length,
      })),
    [presentesHoje],
  );

  const maiorContagemCurso = Math.max(
    1,
    ...contagemPorCurso.map((c) => c.total),
  );

  // Leva para o Admin já com um filtro pré-aplicado (lido lá via localStorage)
  // e rola a tela até a seção correspondente.
  const irParaAdmin = (filtro = {}, anchor = "adm-buscar") => {
    try {
      localStorage.setItem(CHAVE_FILTRO_RAPIDO, JSON.stringify(filtro));
    } catch (err) {
      console.error("Não foi possível preparar o filtro rápido:", err);
    }
    if (typeof setView === "function") {
      setView("admin");
      setTimeout(() => {
        document
          .getElementById(anchor)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  };

  const irParaGestaoRapida = () => {
    // No App.jsx, a tela da Gestão Rápida é registrada com a chave "limpeza".
    if (typeof setView === "function") setView("limpeza");
  };

  const acoesRapidas = [
    {
      titulo: "Buscar & Gerenciar",
      icone: ICONES.buscar,
      cor: "var(--accent)",
      descricao: "Abrir o painel de busca de alunos",
      onClick: () => irParaAdmin({ status: "todos" }, "adm-buscar"),
    },
    {
      titulo: "Registros sem saída",
      icone: ICONES.saida,
      cor: "#f59e0b",
      descricao: `${stats.pendentesSaida} registro(s) antigo(s) a fechar`,
      destaque: stats.pendentesSaida > 0,
      onClick: () => irParaAdmin({ status: "pendente_saida" }, "adm-buscar"),
    },
    {
      titulo: "Auditoria de Faltas",
      icone: ICONES.auditoria,
      cor: "#14b8a6",
      descricao: "Gestão Rápida: nomes e faltas",
      onClick: irParaGestaoRapida,
    },
    {
      titulo: "Exportar Relatório",
      icone: ICONES.exportar,
      cor: "#6366f1",
      descricao: "Planilha CSV por período",
      onClick: () => irParaAdmin({}, "adm-painel"),
    },
  ];

  return (
    <div
      className="app-wrapper"
      style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}
    >
      {/* CABEÇALHO COM MÉTRICAS GERAIS */}
      <div
        className="shadow-card"
        style={{
          padding: "40px",
          marginBottom: "30px",
          background:
            "linear-gradient(135deg, var(--card-bg) 0%, rgba(0, 128, 128, 0.1) 100%)",
          borderLeft: "8px solid var(--accent)",
          borderRadius: "15px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "15px",
          }}
        >
          <div>
            <span
              style={{
                color: "#f4f8ff",
                fontWeight: "bold",
                textTransform: "uppercase",
                fontSize: "0.85rem",
              }}
            >
              Central de Comando • Geração Tech 4.0
            </span>
            <h1 style={{ margin: "10px 0", fontSize: "2.5rem" }}>
              Olá, {user?.nome?.split(" ")[0] || "Nazaré"}! 👋
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <button
              onClick={carregarDashboard}
              disabled={loading}
              style={{
                background: "var(--accent)",
                color: "white",
                border: "none",
                padding: "8px 15px",
                borderRadius: "6px",
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "..." : "🔄 Atualizar"}
            </button>
            {ultimaAtualizacao && (
              <p
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-dim)",
                  margin: "6px 0 0",
                }}
              >
                Atualizado às{" "}
                {ultimaAtualizacao.toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: "35px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "20px",
          }}
        >
          <div
            style={{
              background: "rgba(0,128,128,0.1)",
              padding: "20px",
              borderRadius: "12px",
              textAlign: "center",
              border: "1px solid rgba(0,128,128,0.2)",
            }}
          >
            <h4
              style={{
                marginTop: 0,
                fontSize: "0.75rem",
                color: "var(--text-dim)",
              }}
            >
              PRESENÇAS HOJE
            </h4>
            <h2 style={{ fontSize: "2.5rem", margin: 0, color: "var(--accent)" }}>
              {stats.sessoesAtivas}
            </h2>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
              Alunos que marcaram presença
            </p>
          </div>

          <div
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              padding: "20px",
              borderRadius: "12px",
              textAlign: "center",
              border: "1px solid rgba(245, 158, 11, 0.2)",
            }}
          >
            <h4
              style={{
                marginTop: 0,
                fontSize: "0.75rem",
                color: "var(--text-dim)",
              }}
            >
              REGISTROS SEM SAÍDA
            </h4>
            <h2 style={{ fontSize: "2.5rem", margin: 0, color: "#f59e0b" }}>
              {stats.pendentesSaida}
            </h2>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
              Registros antigos a fechar
            </p>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              padding: "20px",
              borderRadius: "12px",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <h4
              style={{
                marginTop: 0,
                fontSize: "0.75rem",
                color: "var(--text-dim)",
              }}
            >
              TOTAL DA ESCOLA
            </h4>
            <h2 style={{ fontSize: "2.5rem", margin: 0 }}>
              {stats.totalAlunos}
            </h2>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Alunos na base</p>
          </div>
        </div>
      </div>

      {/* ATALHOS RÁPIDOS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "15px",
          marginBottom: "25px",
        }}
      >
        {acoesRapidas.map((acao) => (
          <button
            key={acao.titulo}
            onClick={acao.onClick}
            className="shadow-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px 18px",
              textAlign: "left",
              cursor: "pointer",
              color: "var(--text-main)",
              font: "inherit",
              border: acao.destaque
                ? "1px solid var(--warning)"
                : "1px solid var(--border-subtle)",
              background: acao.destaque
                ? "var(--warning-dim)"
                : "var(--card-bg)",
            }}
          >
            <IconeBadge path={acao.icone} cor={acao.cor} />
            <span>
              <div style={{ fontWeight: "bold", fontSize: "0.9rem" }}>
                {acao.titulo}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                {acao.descricao}
              </div>
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: "25px",
        }}
      >
        {/* COLUNA ESQUERDA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
          <div className="shadow-card" style={{ padding: "25px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "15px",
              }}
            >
              <h4 style={{ margin: 0 }}>🏫 Presenças de Hoje</h4>
              <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                {presentesHoje.length} no total
              </span>
            </div>

            {presentesHoje.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--text-dim)",
                  padding: "30px 0",
                  fontSize: "0.85rem",
                }}
              >
                {loading
                  ? "Carregando..."
                  : "Ninguém marcou presença hoje ainda."}
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  maxHeight: "340px",
                  overflowY: "auto",
                }}
              >
                {presentesHoje.map((aluno) => (
                  <div
                    key={aluno.email}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "rgba(0,128,128,0.05)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: "bold" }}>
                        {aluno.nome || aluno.email}
                      </div>
                      <div
                        style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}
                      >
                        {aluno.turma_nome || getNomeCurto(aluno.formacao)}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: "bold",
                        color: "var(--accent)",
                      }}
                    >
                      ✔ Presença registrada
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shadow-card" style={{ padding: "25px" }}>
            <h4 style={{ marginTop: 0, marginBottom: "18px" }}>
              📊 Distribuição por Formação
            </h4>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              {contagemPorCurso.map((item) => (
                <div key={item.curso}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8rem",
                      marginBottom: "5px",
                    }}
                  >
                    <span>{item.rotulo}</span>
                    <strong>{item.total}</strong>
                  </div>
                  <div
                    style={{
                      background: "var(--border-subtle)",
                      height: "8px",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${(item.total / maiorContagemCurso) * 100}%`,
                        background: item.cor,
                        height: "100%",
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
          <div
            className="shadow-card"
            style={{ padding: "25px", borderTop: "4px solid #f59e0b" }}
          >
            <h4>⚡ Engajamento Hoje</h4>
            <div style={{ marginTop: "15px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "5px",
                  fontSize: "0.85rem",
                }}
              >
                <span>Presença Real</span>
                <span>
                  {(
                    (stats.sessoesAtivas / (stats.totalAlunos || 1)) *
                    100
                  ).toFixed(0)}
                  %
                </span>
              </div>
              <div
                style={{
                  background: "var(--border-subtle)",
                  height: "8px",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(stats.sessoesAtivas / (stats.totalAlunos || 1)) * 100}%`,
                    background: "var(--accent)",
                    height: "100%",
                    transition: "width 1s",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="shadow-card" style={{ padding: "25px" }}>
            <h4 style={{ marginBottom: "15px", color: "var(--accent)" }}>
              📅 Próxima Aula
            </h4>
            <div
              style={{
                padding: "15px",
                background: "rgba(0,128,128,0.05)",
                borderRadius: "8px",
              }}
            >
              <h3 style={{ margin: "0 0 10px 0" }}>{proximaData}</h3>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                <strong>Pauta:</strong> {pautaHoje}
              </p>
            </div>
          </div>

          <div
            className="shadow-card"
            style={{ padding: "25px", borderTop: "4px solid #ef4444" }}
          >
            <h4 style={{ marginTop: 0 }}>🔔 Presenças Fechadas Hoje</h4>
            <p
              style={{
                fontSize: "2rem",
                margin: "5px 0",
                fontWeight: "bold",
              }}
            >
              {stats.concluidosHoje}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Marcações com entrada e saída já preenchidas (a saída entra
              sozinha no fim da aula).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
