import React, { useState, useEffect, useCallback } from "react";
import {
  API_URL,
  FORMACOES,
  PERIODO_LETIVO,
  formatarDataBR,
  formatarHoraDecimal,
  getJanelasHorario,
  getNomeCurto,
  getProximasAulas,
  hojeBrasilia,
} from "./Constants";
import { fetchComToken } from "./Api";

export default function Admin({ user }) {
  const [busca, setBusca] = useState("");
  const [filtroTurma, setFiltroTurma] = useState("todos");
  const [proximasAulas, setProximasAulas] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [alunos, setAlunos] = useState([]);
  const [totalEncontrado, setTotalEncontrado] = useState(0);
  const [dataBusca, setDataBusca] = useState(hojeBrasilia());
  const [periodoExport, setPeriodoExport] = useState({ inicio: "", fim: "" });
  const [stats, setStats] = useState({
    totalPresencas: 0,
    sessoesAtivas: 0,
    concluidosHoje: 0, // Adicionado
    pendentesSaida: 0, // Adicionado
    totalAlunos: 0,
  });
  const [carregando, setCarregando] = useState(false);

  // Estados para o Modal de Detalhes
  const [alunoSelecionado, setAlunoSelecionado] = useState(null);
  const [historicoAluno, setHistoricoAluno] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);

  // Estados para Edição e Registro Manual
  const [editando, setEditando] = useState(false);
  const [dadosEdicao, setDadosEdicao] = useState({
    nome: "",
    email: "",
    data_nascimento: "",
  });
  // Os horários padrão seguem o turno da turma filtrada (noite como fallback).
  const [manualPonto, setManualPonto] = useState({
    data: hojeBrasilia(),
    check_in: "18:00",
    check_out: "22:00",
  });

  // 1. Carregar estatísticas gerais da turma
  useEffect(() => {
    const carregarStats = async () => {
      try {
        const res = await fetch(
          `${API_URL}/admin/stats/${filtroTurma}?dataFiltro=${dataBusca}`,
          {
            headers: { Authorization: `Bearer ${user.token}` },
          },
        );

        if (res.ok) {
          const data = await res.json();
          console.log("Dados recebidos da API:", data); // Verifique se concluidosHoje e sessoesAtivas estão vindo
          setStats(data);
        } else {
          console.error("Erro na resposta da API:", res.status);
        }
      } catch (err) {
        console.error("Erro de conexão ao buscar stats:", err);
      }
    };
    carregarStats();
  }, [filtroTurma, dataBusca, user.token]);

  // 2. Lógica de busca e filtros
  const buscarAlunos = useCallback(
    async (termo) => {
      setCarregando(true);
      try {
        const res = await fetchComToken(
          `/admin/busca?termo=${termo}&turma=${filtroTurma}&status=${filtroStatus}&dataFiltro=${dataBusca}`,
        );

        if (res.ok) {
          const data = await res.json();
          // Ajuste para o novo formato de objeto { total, alunos }
          setAlunos(data.alunos || []);
          setTotalEncontrado(data.total || 0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setCarregando(false);
      }
    },
    [filtroTurma, filtroStatus, dataBusca],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      // Adicionado dataBusca na verificação para disparar a busca
      if (
        busca ||
        filtroStatus !== "todos" ||
        filtroTurma !== "todos" ||
        dataBusca
      ) {
        buscarAlunos(busca);
      } else {
        setAlunos([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [busca, filtroStatus, filtroTurma, dataBusca, buscarAlunos]);
  // 3. Ver Detalhes
  const verDetalhes = async (aluno) => {
    setCarregando(true);
    setAlunoSelecionado(aluno);
    setEditando(false);
    setDadosEdicao({
      nome: aluno.nome,
      email: aluno.email,
      data_nascimento: aluno.data_nascimento || "",
    });
    try {
      const res = await fetch(`${API_URL}/historico/aluno/${aluno.email}`, {
        headers: { Authorization: `Bearer ${user.token}` }, // Adicionado
      });
      if (res.ok) {
        const data = await res.json();
        setHistoricoAluno(data);
        setModalAberto(true);
      }
    } catch {
      alert("Erro ao carregar histórico do aluno.");
    } finally {
      setCarregando(false);
    }
  };

  // 4. Salvar Edição
  const salvarEdicao = async () => {
    const emailOriginal = alunoSelecionado.email;

    if (!emailOriginal) {
      alert("Erro: Não foi possível identificar o aluno.");
      return;
    }

    setCarregando(true);
    try {
      const res = await fetch(
        `${API_URL}/admin/aluno/${encodeURIComponent(emailOriginal)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`, // Adicionado
          },
          body: JSON.stringify(dadosEdicao),
        },
      );

      if (res.ok) {
        alert("Dados atualizados com sucesso!");
        setModalAberto(false);
        buscarAlunos(busca);
      } else {
        const erro = await res.json();
        alert(`Erro: ${erro.error}`);
      }
    } catch {
      alert("Erro ao salvar alterações no servidor.");
    } finally {
      setCarregando(false);
    }
  };

  // 5. Registro Manual
  const registrarManual = async () => {
    if (!window.confirm("Deseja inserir este registro manualmente?")) return;
    try {
      const res = await fetch(`${API_URL}/admin/ponto-manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`, // Adicionado
        },
        body: JSON.stringify({ email: alunoSelecionado.email, ...manualPonto }),
      });
      if (res.ok) {
        alert("Presença registrada com sucesso!");
        verDetalhes(alunoSelecionado);
      }
    } catch {
      alert("Erro ao registrar ponto manual.");
    }
  };

  const excluirAluno = async () => {
    if (
      !window.confirm(
        `TEM CERTEZA? Isso excluirá permanentemente o cadastro e todo o histórico de ${alunoSelecionado.nome}. Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setCarregando(true);
    try {
      const res = await fetch(
        `${API_URL}/admin/aluno/${encodeURIComponent(alunoSelecionado.email)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.token}` }, // Adicionado
        },
      );

      if (res.ok) {
        alert("Cadastro removido com sucesso!");
        setModalAberto(false);
        buscarAlunos(busca);
      } else {
        const erro = await res.json();
        alert(`Erro: ${erro.error}`);
      }
    } catch {
      alert("Erro de conexão ao tentar excluir.");
    } finally {
      setCarregando(false);
    }
  };

  // 6. Reset de Sessão
  const resetarSessao = async (email) => {
    if (
      !window.confirm(
        "Isso forçará o aluno a fazer login novamente na próxima vez que abrir o site. Continuar?",
      )
    )
      return;
    try {
      await fetch(`${API_URL}/admin/reset-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`, // Adicionado
        },
        body: JSON.stringify({ email }),
      });
      alert("Solicitação de reset enviada.");
    } catch {
      alert("Erro ao resetar.");
    }
  };

  // Próximas aulas da turma selecionada no filtro.
  // Com "Todas as Turmas", mostra a próxima data em que qualquer turma tem aula.
  useEffect(() => {
    if (filtroTurma !== "todos") {
      setProximasAulas(getProximasAulas(filtroTurma, 5));
      return;
    }

    const unificadas = new Set();
    FORMACOES.forEach((f) =>
      getProximasAulas(f.id, 5).forEach((d) => unificadas.add(d)),
    );
    setProximasAulas([...unificadas].sort().slice(0, 5));
  }, [filtroTurma]);

  // Preenche o ponto manual com a janela de aula da turma selecionada
  useEffect(() => {
    if (filtroTurma === "todos") return;
    const aula = getJanelasHorario(filtroTurma).aula;
    setManualPonto((atual) => ({
      ...atual,
      check_in: formatarHoraDecimal(aula.inicio),
      check_out: formatarHoraDecimal(aula.fim),
    }));
  }, [filtroTurma]);

  const exportarRelatorio = async () => {
    // Validação básica para garantir que as datas foram preenchidas
    if (!periodoExport.inicio || !periodoExport.fim) {
      alert("Por favor, selecione as datas de início e fim para exportar.");
      return;
    }

    try {
      // CORREÇÃO AQUI: Enviando os parâmetros de data na URL (Query Strings)
      const res = await fetch(
        `${API_URL}/admin/relatorio/${filtroTurma}?inicio=${periodoExport.inicio}&fim=${periodoExport.fim}`,
        {
          headers: { Authorization: `Bearer ${user.token}` },
        },
      );

      const dados = await res.json();

      if (!dados || dados.length === 0) {
        alert("Nenhum dado encontrado para este período.");
        return;
      }

      // Montagem do cabeçalho (Nota e Feedback incluídos)
      const cabecalho =
        "Nome;Email;Formação;Data;Entrada;Saída;Nota;Feedback\n";

      const linhas = dados
        .map(
          (item) =>
            `${item.Nome};${item.Email};${item.Formacao};${item.Data};${item.Entrada};${item.Saida};${item.Nota};"${item.Feedback ? item.Feedback.replace(/"/g, '""') : ""}"`,
        )
        .join("\n");

      const conteudoCSV = cabecalho + linhas;

      // O "\ufeff" resolve o problema de acentuação no Excel brasileiro
      const blob = new Blob(["\ufeff" + conteudoCSV], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Nome do arquivo dinâmico com o período selecionado
      link.setAttribute(
        "download",
        `frequencia_${filtroTurma}_${periodoExport.inicio}_a_${periodoExport.fim}.csv`,
      );

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Limpa a URL da memória
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro na exportação:", err);
      alert("Erro ao exportar planilha.");
    }
  };

  return (
    <div
      className="app-wrapper"
      style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px" }}
    >
      {/* --- INÍCIO DO NOVO ACRÉSCIMO: HOME DE GESTÃO RÁPIDA --- */}
      <div className="home-admin-header" style={{ marginBottom: "40px" }}>
        <div
          className="shadow-card"
          style={{
            padding: "30px",
            background:
              "linear-gradient(135deg, var(--card-bg) 0%, rgba(0, 128, 128, 0.08) 100%)",
            borderLeft: "8px solid #052768;",
            borderRadius: "15px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr",
              gap: "40px",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "#f4f8ff",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Central de Comando Geração Tech 4.0
              </span>
              <h2 style={{ margin: "10px 0", fontSize: "1.8rem" }}>
                {!proximasAulas[0]
                  ? "Sem aulas futuras no calendário"
                  : proximasAulas[0] === PERIODO_LETIVO.aulaInaugural
                    ? "🚀 Aula inaugural em " +
                      formatarDataBR(PERIODO_LETIVO.aulaInaugural)
                    : proximasAulas[0] === hojeBrasilia()
                      ? "Aula hoje"
                      : `Próxima aula: ${formatarDataBR(proximasAulas[0])}`}
              </h2>
              <p style={{ fontSize: "1.1rem", color: "var(--text-normal)" }}>
                <strong>Turma:</strong>{" "}
                {filtroTurma === "todos"
                  ? "Todas as formações do Geração Tech 4.0"
                  : getNomeCurto(filtroTurma)}
              </p>
              <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                <div
                  style={{
                    padding: "10px 15px",
                    background: "rgba(0,0,0,0.1)",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                  }}
                >
                  🔔 <strong>Lembrete:</strong> conferir a lista de presença
                  após o fim da janela de check-out
                  {filtroTurma !== "todos"
                    ? ` (${formatarHoraDecimal(getJanelasHorario(filtroTurma).checkOut.fim)})`
                    : ""}
                  .
                </div>
              </div>
            </div>

            <div
              style={{
                borderLeft: "1px solid var(--border-subtle)",
                paddingLeft: "30px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                ENGAJAMENTO DA TURMA
              </span>
              <h1
                style={{
                  margin: "5px 0",
                  color: "#f4f8ff",
                  fontSize: "2.5rem",
                }}
              >
                {(
                  (stats.sessoesAtivas / (stats.totalAlunos || 1)) *
                  100
                ).toFixed(0)}
                %
              </h1>
              <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                Alunos presentes em tempo real
              </p>
              <div
                style={{
                  background: "var(--border-subtle)",
                  height: "8px",
                  borderRadius: "4px",
                  marginTop: "10px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(stats.sessoesAtivas / (stats.totalAlunos || 1)) * 100}%`,
                    background: "#0b1730",
                    height: "100%",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--border-subtle)",
          marginBottom: "40px",
        }}
      />
      {/* --- FIM DO NOVO ACRÉSCIMO --- */}

      {/* INÍCIO DO SEU DASHBOARD ORIGINAL (MANTIDO) */}
      <div style={{ marginBottom: "30px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Dashboard Administrativo</h2>
            <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
              Gestão em Tempo Real • Horário de Brasília • Geração Tech 4.0
            </p>
          </div>
          <select
            className="input-modern"
            style={{ width: "250px" }}
            value={filtroTurma}
            onChange={(e) => setFiltroTurma(e.target.value)}
          >
            <option value="todos">Todas as Turmas</option>
            {FORMACOES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            marginTop: "20px",
            background: "var(--border-subtle)",
            height: "10px",
            borderRadius: "5px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(stats.sessoesAtivas / (stats.totalAlunos || 1)) * 100}%`,
              background: "#0b1730",
              height: "100%",
              transition: "width 0.5s ease",
            }}
          />
        </div>
        <p
          style={{
            fontSize: "0.75rem",
            marginTop: "5px",
            color: "var(--text-dim)",
          }}
        >
          Adesão da Aula: <strong>{stats.sessoesAtivas || 0} alunos</strong>{" "}
          fizeram check-in hoje.
        </p>
      </div>

      {/* --- INÍCIO DO ACRESCIMO: PAINEL DE CONTROLE OPERACIONAL --- */}
      <div
        className="shadow-card"
        style={{
          padding: "25px",
          marginBottom: "30px",
          background:
            "linear-gradient(135deg, var(--card-bg) 0%, rgba(0, 128, 128, 0.05) 100%)",
          borderLeft: "6px solid #052768;",
          borderRadius: "12px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "30px",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-dim)",
                fontWeight: "bold",
                textTransform: "uppercase",
              }}
            >
              Status da Próxima Aula
            </span>
            <h3
              style={{
                margin: "10px 0",
                color: "#f4f8ff",
                fontSize: "1.5rem",
              }}
            >
              {proximasAulas[0]
                ? formatarDataBR(proximasAulas[0])
                : "Sem aulas futuras"}
            </h3>
            <p style={{ margin: 0, fontSize: "1.1rem" }}>
              <strong>Horário:</strong>{" "}
              {proximasAulas[0] === PERIODO_LETIVO.aulaInaugural
                ? "Aula inaugural — presencial e online"
                : filtroTurma !== "todos"
                  ? getJanelasHorario(filtroTurma).label
                  : "Conforme o turno de cada turma"}
            </p>
          </div>
          <div
            style={{
              borderLeft: "1px solid var(--border-subtle)",
              paddingLeft: "30px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              SESSÕES ATIVAS
            </span>
            <h2 style={{ margin: "5px 0", color: "#052768;" }}>
              {stats.sessoesAtivas || 0}
            </h2>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-dim)",
                margin: 0,
              }}
            >
              Alunos em aula agora
            </p>
          </div>
        </div>
      </div>
      {/* --- FIM DO ACRESCIMO --- */}

      <div className="admin-stat-card card-destaque-hoje">
        <span className="admin-stat-label">CONCLUÍRAM HOJE (SAÍDA OK)</span>
        <h2 className="admin-stat-number" style={{ color: "#0a6547" }}>
          {stats.concluidosHoje || 0}
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "15px",
          marginBottom: "25px",
        }}
      >
        <div
          className="stat-card"
          style={{
            padding: "20px",
            textAlign: "center",
            background: "var(--card-bg)",
            borderRadius: "12px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            CHECK-INS HOJE
          </span>
          <h2 style={{ color: "#f4f8ff", margin: "5px 0" }}>
            {stats.sessoesAtivas || 0}
          </h2>
        </div>
        <div
          className="stat-card"
          style={{
            padding: "20px",
            textAlign: "center",
            background: "var(--card-bg)",
            borderRadius: "12px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            TOTAL HISTÓRICO
          </span>
          <h2 style={{ margin: "5px 0" }}>{stats.totalPresencas || 0}</h2>
        </div>
        <div
          className="stat-card"
          style={{
            padding: "20px",
            textAlign: "center",
            background: "var(--card-bg)",
            borderRadius: "12px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            PENDENTES SAÍDA
          </span>
          <h2 style={{ color: "#f59e0b", margin: "5px 0" }}>
            {stats.pendentesSaida || 0}
          </h2>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: "20px",
        }}
      >
        <div className="shadow-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
            <input
              type="text"
              className="input-modern"
              placeholder="Nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <input
              type="date"
              className="input-modern"
              style={{ width: "160px" }}
              value={dataBusca}
              onChange={(e) => setDataBusca(e.target.value)}
            />
            <select
              className="input-modern"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              style={{ width: "180px" }}
            >
              <option value="todos">Todos Alunos</option>
              <option value="presentes_no_dia">Presentes no Dia</option>
              <option value="pendente_saida">Esqueceram Saída</option>
              <option value="checkout_antecipado">Saída Antecipada</option>
              <option value="incompleto">Cadastro Incompleto</option>
            </select>
          </div>

          <div className="historico-container" style={{ minHeight: "300px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "15px",
                padding: "10px 15px",
                background: "rgba(0, 128, 128, 0.1)",
                borderRadius: "8px",
                borderLeft: "4px solid #152548",
              }}
            >
              <span
                style={{
                  fontSize: "0.9rem",
                  fontWeight: "bold",
                  color: "#f4f8ff",
                }}
              >
                LISTAGEM DE ALUNOS
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#f4f8ff" }}>
                {totalEncontrado} registros encontrados
              </span>
            </div>

            {alunos.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      fontSize: "0.8rem",
                      color: "var(--text-dim)",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <th>ALUNO</th>
                    <th>CONTATO</th>
                    <th style={{ textAlign: "right" }}>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Aqui usamos o .map direto, pois a lógica de faltas agora é na outra tela */}
                  {alunos.map((aluno) => (
                    <tr
                      key={aluno.email}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td style={{ padding: "12px 0" }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: "bold" }}>
                          {aluno.nome}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-dim)",
                          }}
                        >
                          {getNomeCurto(aluno.formacao)}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>{aluno.email}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          onClick={() => verDetalhes(aluno)}
                          className="btn-secondary"
                          style={{ fontSize: "0.7rem", padding: "5px 10px" }}
                        >
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--text-dim)",
                  marginTop: "50px",
                }}
              >
                {carregando
                  ? "Processando..."
                  : "Use a busca para gerenciar alunos."}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="shadow-card" style={{ padding: "20px" }}>
            <h4>Relatórios</h4>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                margin: "15px 0",
              }}
            >
              <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                Início do período:
              </label>
              <input
                type="date"
                className="input-modern"
                value={periodoExport.inicio}
                onChange={(e) =>
                  setPeriodoExport({ ...periodoExport, inicio: e.target.value })
                }
              />
              <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                Fim do período:
              </label>
              <input
                type="date"
                className="input-modern"
                value={periodoExport.fim}
                onChange={(e) =>
                  setPeriodoExport({ ...periodoExport, fim: e.target.value })
                }
              />
            </div>
            <button
              className="btn-ponto in"
              style={{ width: "100%" }}
              onClick={exportarRelatorio}
            >
              Exportar CSV
            </button>
          </div>
          <div
            className="shadow-card"
            style={{ padding: "20px", borderLeft: "4px solid #052768;" }}
          >
            <h4 style={{ color: "#f4f8ff", marginBottom: "15px" }}>
              📅 Próximas Aulas
            </h4>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {proximasAulas.map((data, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: "0.85rem",
                    padding: "8px",
                    background: "rgba(0, 128, 128, 0.05)",
                    borderRadius: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Aula {idx + 1}</span>
                  <strong>{formatarDataBR(data)}</strong>
                </div>
              ))}
              {proximasAulas.length === 0 && (
                <p style={{ fontSize: "0.8rem" }}>
                  Nenhuma aula futura encontrada.
                </p>
              )}
            </div>
          </div>
          <div
            className="shadow-card"
            style={{ padding: "20px", borderLeft: "4px solid #f59e0b" }}
          >
            <h4 style={{ color: "#f59e0b" }}>Lembrete Rápido</h4>
            <p style={{ fontSize: "0.75rem" }}>
              Use o filtro "Esqueceram Saída" para identificar quem não fechou o
              ponto na última aula.
            </p>
          </div>
        </div>
      </div>

      {modalAberto && alunoSelecionado && (
        <div className="modal-overlay">
          <div
            className="modal-content shadow-card"
            style={{ maxWidth: "600px", width: "95%" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h3>{alunoSelecionado.nome}</h3>
              <div style={{ display: "flex", gap: "5px" }}>
                <button
                  onClick={() => setEditando(false)}
                  style={{
                    background: !editando ? "#052768;" : "transparent",
                    color: !editando ? "white" : "var(--text-normal)",
                    border: "1px solid #052768;",
                    padding: "5px 10px",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Histórico
                </button>
                <button
                  onClick={() => setEditando(true)}
                  style={{
                    background: editando ? "#052768;" : "transparent",
                    color: editando ? "white" : "var(--text-normal)",
                    border: "1px solid #052768;",
                    padding: "5px 10px",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Editar/Manual
                </button>
              </div>
            </div>

            {!editando ? (
              <div
                style={{
                  maxHeight: "300px",
                  overflowY: "auto",
                  marginBottom: "20px",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "2px solid var(--border-subtle)",
                        textAlign: "left",
                      }}
                    >
                      <th style={{ padding: "8px" }}>Data</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoAluno.map((h, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <td style={{ padding: "8px" }}>
                          {new Date(h.data).toLocaleDateString("pt-BR", {
                            timeZone: "UTC",
                          })}
                        </td>
                        <td>{h.check_in || "--:--"}</td>
                        <td>{h.check_out || "--:--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <div
                  style={{
                    padding: "15px",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: "8px",
                  }}
                >
                  <h5 style={{ marginTop: 0 }}>Editar Cadastro</h5>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <input
                      className="input-modern"
                      value={dadosEdicao.nome}
                      onChange={(e) =>
                        setDadosEdicao({ ...dadosEdicao, nome: e.target.value })
                      }
                      placeholder="Nome"
                    />
                    <input
                      className="input-modern"
                      value={dadosEdicao.email}
                      onChange={(e) =>
                        setDadosEdicao({
                          ...dadosEdicao,
                          email: e.target.value,
                        })
                      }
                      placeholder="Email"
                    />
                    <input
                      type="date"
                      className="input-modern"
                      value={dadosEdicao.data_nascimento}
                      onChange={(e) =>
                        setDadosEdicao({
                          ...dadosEdicao,
                          data_nascimento: e.target.value,
                        })
                      }
                      placeholder="Data de Nascimento"
                    />
                  </div>
                  <button
                    className="btn-secondary"
                    style={{ marginTop: "10px", width: "100%" }}
                    onClick={salvarEdicao}
                  >
                    Salvar Alterações
                  </button>
                  <button
                    className="btn-secondary"
                    style={{
                      marginTop: "5px",
                      width: "100%",
                      border: "1px solid #ef4444",
                      color: "#ef4444",
                    }}
                    onClick={() => resetarSessao(alunoSelecionado.email)}
                  >
                    Forçar Deslogar Aluno
                  </button>
                </div>

                <button
                  className="btn-danger-outline"
                  style={{
                    marginTop: "10px",
                    width: "100%",
                    border: "1px solid #9d3131",
                    color: "#9d3131",
                  }}
                  onClick={excluirAluno}
                  disabled={carregando}
                >
                  🗑️ Excluir Cadastro Permanente
                </button>

                <button
                  onClick={() => (window.location.href = "/admin/limpeza")}
                  className="btn-secondary"
                >
                  Limpar Nomes
                </button>

                <div
                  style={{
                    padding: "15px",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: "8px",
                  }}
                >
                  <h5 style={{ marginTop: 0 }}>➕ Inserir Ponto Manual</h5>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <input
                      type="date"
                      className="input-modern"
                      value={manualPonto.data}
                      onChange={(e) =>
                        setManualPonto({ ...manualPonto, data: e.target.value })
                      }
                    />
                    <input
                      type="time"
                      className="input-modern"
                      value={manualPonto.check_in}
                      onChange={(e) =>
                        setManualPonto({
                          ...manualPonto,
                          check_in: e.target.value,
                        })
                      }
                    />
                    <input
                      type="time"
                      className="input-modern"
                      value={manualPonto.check_out}
                      onChange={(e) =>
                        setManualPonto({
                          ...manualPonto,
                          check_out: e.target.value,
                        })
                      }
                    />
                  </div>
                  <button
                    className="btn-ponto in"
                    style={{ marginTop: "10px", width: "100%" }}
                    onClick={registrarManual}
                  >
                    Registrar Presença Manual
                  </button>
                </div>
              </div>
            )}
            <button
              className="btn-secondary"
              style={{ width: "100%", marginTop: "20px" }}
              onClick={() => setModalAberto(false)}
            >
              Fechar Janela
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
