import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FORMACOES,
  formatarDataBR,
  formatarHoraDecimal,
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
  justificativa:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6",
  professor:
    "M22 10 12 5 2 10l10 5 10-5ZM6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5",
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

const Cartao = ({ rotulo, valor, detalhe, cor }) => (
  <div
    style={{
      background: "rgba(255,255,255,0.05)",
      padding: "20px",
      borderRadius: "12px",
      textAlign: "center",
      border: "1px solid var(--border-subtle)",
    }}
  >
    <h4 style={{ marginTop: 0, fontSize: "0.75rem", color: "var(--text-dim)" }}>
      {rotulo}
    </h4>
    <h2 style={{ fontSize: "2.4rem", margin: 0, color: cor }}>{valor}</h2>
    <p style={{ fontSize: "0.78rem", opacity: 0.7, margin: "4px 0 0" }}>
      {detalhe}
    </p>
  </div>
);

const hhmm = (ts) => {
  if (!ts) return "";
  const m = String(ts).match(/T(\d{2}:\d{2})/);
  if (m) return m[1];
  const d = new Date(ts);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Fortaleza",
      });
};

export default function HomeAdmin({ user, setView }) {
  const [stats, setStats] = useState({ totalAlunos: 0, sessoesAtivas: 0 });
  const [presentesHoje, setPresentesHoje] = useState([]);
  const [baseAlunos, setBaseAlunos] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [pontosProf, setPontosProf] = useState([]);
  const [justPendentes, setJustPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  const hoje = hojeBrasilia();
  const diaSemana = new Date(`${hoje}T12:00:00`).getDay();

  // Base de alunos e turmas mudam pouco: carregam uma vez, fora do ciclo de
  // atualização de 60s que acompanha as presenças do dia.
  useEffect(() => {
    const carregarBase = async () => {
      try {
        const [resTurmas, resAlunos] = await Promise.all([
          fetchComToken("/admin/turmas"),
          fetchComToken("/admin/busca?termo=&turma=todos&status=todos"),
        ]);
        if (resTurmas?.ok) setTurmas((await resTurmas.json()).turmas || []);
        if (resAlunos?.ok) setBaseAlunos((await resAlunos.json()).alunos || []);
      } catch (err) {
        console.error("Erro ao carregar turmas/alunos:", err);
      }
    };
    carregarBase();
  }, []);

  const carregarDashboard = useCallback(async () => {
    if (!user?.token) return;
    try {
      setLoading(true);
      const [resStats, resLista, resPontos, resJusts] = await Promise.all([
        fetchComToken(`/admin/stats/todos?dataFiltro=${hoje}`),
        fetchComToken(
          `/admin/busca?termo=&turma=todos&status=presentes_no_dia&dataFiltro=${hoje}`,
        ),
        fetchComToken(`/admin/professores/pontos?inicio=${hoje}&fim=${hoje}`),
        fetchComToken("/admin/justificativas?status=pendente"),
      ]);

      if (resStats?.ok) {
        const d = await resStats.json();
        setStats({
          totalAlunos: d.totalAlunos || 0,
          sessoesAtivas: d.sessoesAtivas || 0,
        });
      }
      if (resLista?.ok) setPresentesHoje((await resLista.json()).alunos || []);
      if (resPontos?.ok) setPontosProf((await resPontos.json()).pontos || []);
      if (resJusts?.ok)
        setJustPendentes((await resJusts.json()).justificativas || []);

      setUltimaAtualizacao(new Date());
    } catch (err) {
      console.error("Erro ao carregar dashboard admin:", err);
    } finally {
      setLoading(false);
    }
  }, [user, hoje]);

  useEffect(() => {
    carregarDashboard();
    const interval = setInterval(carregarDashboard, 60000);
    return () => clearInterval(interval);
  }, [carregarDashboard]);

  // Turmas que têm aula hoje, pelo dia da semana cadastrado no cronograma.
  const turmasHoje = useMemo(
    () =>
      turmas.filter(
        (t) => t.ativa !== false && (t.dias || []).includes(diaSemana),
      ),
    [turmas, diaSemana],
  );

  const nomeTurma = useCallback(
    (id) => turmas.find((t) => t.id === id)?.nome || getNomeCurto(id) || id,
    [turmas],
  );

  // Presença de hoje turma a turma: quem era esperado x quem marcou.
  const presencaPorTurma = useMemo(
    () =>
      turmasHoje
        .map((t) => {
          const total = baseAlunos.filter((a) => a.formacao === t.id).length;
          const presentes = presentesHoje.filter(
            (a) => a.formacao === t.id,
          ).length;
          return {
            id: t.id,
            nome: t.nome,
            horario: t.janelas?.label || "",
            total,
            presentes,
            pct: total ? Math.round((presentes / total) * 100) : 0,
          };
        })
        .sort((a, b) => a.pct - b.pct),
    [turmasHoje, baseAlunos, presentesHoje],
  );

  const esperadosHoje = presencaPorTurma.reduce((s, t) => s + t.total, 0);
  const presentesEsperados = presencaPorTurma.reduce(
    (s, t) => s + t.presentes,
    0,
  );
  const taxaHoje = esperadosHoje
    ? Math.round((presentesEsperados / esperadosHoje) * 100)
    : null;

  // Cobertura docente: cada turma com aula hoje já teve ponto de professor?
  const coberturaProfessores = useMemo(
    () =>
      turmasHoje.map((t) => {
        const ponto = pontosProf.find((p) => p.turma === t.id);
        return {
          id: t.id,
          nome: t.nome,
          professor: ponto?.professor_nome || null,
          entrada: hhmm(ponto?.check_in),
        };
      }),
    [turmasHoje, pontosProf],
  );

  const turmasComProfessor = coberturaProfessores.filter(
    (t) => t.professor,
  ).length;

  const proximaISO = FORMACOES.map((f) => getProximasAulas(f.id, 1)[0])
    .filter(Boolean)
    .sort()[0];

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

  const ir = (tela) => {
    if (typeof setView === "function") setView(tela);
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
      titulo: "Justificativas",
      icone: ICONES.justificativa,
      cor: "#8b5cf6",
      descricao: justPendentes.length
        ? `${justPendentes.length} aguardando resposta`
        : "Nenhuma pendente",
      destaque: justPendentes.length > 0,
      onClick: () => ir("limpeza"),
    },
    {
      titulo: "Folha de ponto",
      icone: ICONES.professor,
      cor: "#0ea5e9",
      descricao: "Registros dos professores",
      onClick: () => ir("professores"),
    },
    {
      titulo: "Auditoria de Faltas",
      icone: ICONES.auditoria,
      cor: "#14b8a6",
      descricao: "Gestão Rápida: nomes e faltas",
      onClick: () => ir("limpeza"),
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
      {/* CABEÇALHO COM MÉTRICAS DO DIA */}
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
              Central de Comando • {formatarDataBR(hoje)}
            </span>
            <h1 style={{ margin: "10px 0", fontSize: "2.5rem" }}>
              Olá, {user?.nome?.split(" ")[0] || "Nazaré"}! 👋
            </h1>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-dim)" }}>
              {turmasHoje.length
                ? `${turmasHoje.length} turma(s) com aula hoje: ${turmasHoje
                    .map((t) => t.nome)
                    .join(", ")}.`
                : "Nenhuma turma tem aula hoje pelo cronograma."}
            </p>
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
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "20px",
          }}
        >
          <Cartao
            rotulo="PRESENÇAS HOJE"
            valor={stats.sessoesAtivas}
            detalhe={
              esperadosHoje
                ? `de ${esperadosHoje} alunos com aula hoje`
                : "sem aula prevista hoje"
            }
            cor="var(--accent)"
          />
          <Cartao
            rotulo="TAXA DO DIA"
            valor={taxaHoje == null ? "—" : `${taxaHoje}%`}
            detalhe={
              taxaHoje == null
                ? "nenhuma turma em aula"
                : `${presentesEsperados} de ${esperadosHoje} presentes`
            }
            cor={taxaHoje != null && taxaHoje < 60 ? "#f59e0b" : "#22c55e"}
          />
          <Cartao
            rotulo="PROFESSORES"
            valor={`${turmasComProfessor}/${turmasHoje.length}`}
            detalhe="turmas com ponto do professor"
            cor={
              turmasHoje.length && turmasComProfessor < turmasHoje.length
                ? "#f59e0b"
                : "#22c55e"
            }
          />
          <Cartao
            rotulo="JUSTIFICATIVAS"
            valor={justPendentes.length}
            detalhe="aguardando resposta"
            cor={justPendentes.length ? "#8b5cf6" : "var(--text-dim)"}
          />
          <Cartao
            rotulo="TOTAL DA ESCOLA"
            valor={stats.totalAlunos}
            detalhe="alunos na base"
            cor="var(--text-main)"
          />
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
            <h4 style={{ marginTop: 0, marginBottom: "18px" }}>
              📊 Presença por turma (hoje)
            </h4>
            {presencaPorTurma.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                Nenhuma turma com aula hoje. A próxima aula prevista é{" "}
                {proximaISO ? formatarDataBR(proximaISO) : "—"}.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "14px" }}
              >
                {presencaPorTurma.map((t) => (
                  <button
                    key={t.id}
                    onClick={() =>
                      irParaAdmin(
                        { turma: t.id, status: "presentes_no_dia" },
                        "adm-buscar",
                      )
                    }
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      color: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.8rem",
                        marginBottom: "5px",
                      }}
                    >
                      <span>
                        {t.nome}{" "}
                        <span style={{ color: "var(--text-dim)" }}>
                          {t.horario}
                        </span>
                      </span>
                      <strong>
                        {t.presentes}/{t.total} · {t.pct}%
                      </strong>
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
                          width: `${t.pct}%`,
                          background: t.pct < 60 ? "#f59e0b" : "var(--accent)",
                          height: "100%",
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

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
                        {aluno.turma_nome || nomeTurma(aluno.formacao)}
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
        </div>

        {/* COLUNA DIREITA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
          <div
            className="shadow-card"
            style={{ padding: "25px", borderTop: "4px solid #0ea5e9" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h4 style={{ margin: 0 }}>🧑‍🏫 Professores hoje</h4>
              <button
                className="btn-secondary"
                style={{ fontSize: "0.7rem", padding: "5px 10px" }}
                onClick={() => ir("professores")}
              >
                Folha de ponto
              </button>
            </div>
            {coberturaProfessores.length === 0 ? (
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-dim)",
                  marginBottom: 0,
                }}
              >
                Sem aula hoje.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginTop: "15px",
                }}
              >
                {coberturaProfessores.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.8rem",
                    }}
                  >
                    <span>{t.nome}</span>
                    <span
                      style={{
                        color: t.professor ? "var(--accent)" : "#f59e0b",
                        fontWeight: "bold",
                      }}
                    >
                      {t.professor
                        ? `${t.professor}${t.entrada ? ` · ${t.entrada}` : ""}`
                        : "sem ponto"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="shadow-card"
            style={{ padding: "25px", borderTop: "4px solid #8b5cf6" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h4 style={{ margin: 0 }}>📄 Justificativas pendentes</h4>
              <button
                className="btn-secondary"
                style={{ fontSize: "0.7rem", padding: "5px 10px" }}
                onClick={() => ir("limpeza")}
              >
                Responder
              </button>
            </div>
            {justPendentes.length === 0 ? (
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-dim)",
                  marginBottom: 0,
                }}
              >
                Nada aguardando resposta.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginTop: "15px",
                }}
              >
                {justPendentes.slice(0, 5).map((j) => (
                  <div key={j.id} style={{ fontSize: "0.8rem" }}>
                    <div style={{ fontWeight: "bold" }}>{j.aluno_email}</div>
                    <div style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>
                      {formatarDataBR(j.data)} · {nomeTurma(j.turma)}
                    </div>
                  </div>
                ))}
                {justPendentes.length > 5 && (
                  <span
                    style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}
                  >
                    +{justPendentes.length - 5} na Gestão Rápida
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="shadow-card" style={{ padding: "25px" }}>
            <h4 style={{ marginBottom: "15px", color: "var(--accent)" }}>
              📅 Agenda
            </h4>
            <div
              style={{
                padding: "15px",
                background: "rgba(0,128,128,0.05)",
                borderRadius: "8px",
              }}
            >
              {turmasHoje.length ? (
                turmasHoje.map((t) => (
                  <p key={t.id} style={{ margin: "0 0 8px", fontSize: "0.85rem" }}>
                    <strong>{t.nome}</strong> ·{" "}
                    {t.janelas?.label ||
                      `${formatarHoraDecimal(t.janelas?.aula?.inicio || 0)}`}
                  </p>
                ))
              ) : (
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  Próxima aula prevista:{" "}
                  <strong>
                    {proximaISO ? formatarDataBR(proximaISO) : "sem aulas futuras"}
                  </strong>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
