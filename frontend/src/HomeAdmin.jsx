import React, { useState, useEffect, useCallback } from "react";
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

export default function HomeAdmin({ user }) {
  const [stats, setStats] = useState({
    totalAlunos: 0,
    sessoesAtivas: 0,
    concluidosHoje: 0,
    pendentesSaida: 0,
  });

  const [alunosNoPredio, setAlunosNoPredio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);

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

        const noPredio = (dataLista.alunos || []).filter(
          (aluno) => !aluno.check_out,
        );
        setAlunosNoPredio(noPredio);
      }
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
  const contagemPorCurso = [
    { curso: "fullstack", rotulo: "Full Stack", cor: "#ffffff;" },
    { curso: "ia", rotulo: "IA Generativa", cor: "#f59e0b" },
    { curso: "fullcycle", rotulo: "FullCycle", cor: "#6366f1" },
  ].map((item) => ({
    ...item,
    total: alunosNoPredio.filter((a) => cursoDoAluno(a) === item.curso).length,
  }));

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
          borderLeft: "8px solid #052768;",
          borderRadius: "15px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
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
          <button
            onClick={carregarDashboard}
            disabled={loading}
            style={{
              background: "#0b1730",
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
              CHECK-INS HOJE
            </h4>
            <h2 style={{ fontSize: "2.5rem", margin: 0, color: "#052768;" }}>
              {stats.sessoesAtivas}
            </h2>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Alunos presentes</p>
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
              PRESENTES AGORA
            </h4>
            <h2 style={{ fontSize: "2.5rem", margin: 0, color: "#f59e0b" }}>
              {stats.pendentesSaida}
            </h2>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
              Aguardando Check-out
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: "25px",
        }}
      >
        {/* MONITOR DE PRESENÇA COM CONTADORES POR TURMA */}
        <div
          className="shadow-card"
          style={{ padding: "25px", minHeight: "300px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h4 style={{ margin: 0, color: "#052768;" }}>
              🟢 Monitor de Presença
            </h4>

            {/* Etiquetas de contagem por formação */}
            <div style={{ display: "flex", gap: "8px" }}>
              {contagemPorCurso.map((item) => (
                <span
                  key={item.curso}
                  style={{
                    fontSize: "0.7rem",
                    background: `${item.cor}26`,
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: `1px solid ${item.cor}`,
                  }}
                >
                  {item.rotulo}: <strong>{item.total}</strong>
                </span>
              ))}
            </div>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {alunosNoPredio.length > 0 ? (
              alunosNoPredio.map((aluno, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "8px",
                    borderLeft: `4px solid ${getFormacao(aluno.formacao)?.cor || "#64748b"}`,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "bold", fontSize: "0.9rem" }}>
                      {aluno.nome}
                    </div>
                    <div
                      style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}
                    >
                      {aluno.turma_nome || getNomeCurto(aluno.formacao)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        color: "#f4f8ff",
                        fontSize: "0.85rem",
                        fontWeight: "bold",
                      }}
                    >
                      {aluno.check_in}
                    </span>
                    <div
                      style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}
                    >
                      Entrada
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <p style={{ color: "var(--text-dim)" }}>
                  Nenhum aluno presente no momento.
                </p>
              </div>
            )}
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
                    background: "#0b1730",
                    height: "100%",
                    transition: "width 1s",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="shadow-card" style={{ padding: "25px" }}>
            <h4 style={{ marginBottom: "15px", color: "#052768;" }}>
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
        </div>
      </div>
    </div>
  );
}
