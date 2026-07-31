import React, { useState, useEffect, useCallback } from "react";
import { fetchComToken } from "./Api";
import { formatarDataBR, hojeBrasilia, PERIODO_LETIVO } from "./Constants";

const NOMES_DIAS = [
  { valor: 1, rotulo: "Seg" },
  { valor: 2, rotulo: "Ter" },
  { valor: 3, rotulo: "Qua" },
  { valor: 4, rotulo: "Qui" },
  { valor: 5, rotulo: "Sex" },
  { valor: 6, rotulo: "Sáb" },
  { valor: 0, rotulo: "Dom" },
];

const CAMPOS_HORARIO = [
  { campo: "aula_inicio", rotulo: "Aula começa" },
  { campo: "aula_fim", rotulo: "Aula termina" },
  { campo: "checkin_inicio", rotulo: "Check-in abre" },
  { campo: "checkin_fim", rotulo: "Check-in fecha" },
  { campo: "checkout_inicio", rotulo: "Check-out abre" },
  { campo: "checkout_fim", rotulo: "Check-out fecha" },
];

/** 18.5 -> "18:30" (para preencher <input type="time">) */
const decimalParaHora = (valor) => {
  const h = Math.floor(valor);
  const m = Math.round((valor - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export default function Cronograma({ setView }) {
  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState("");
  const [aulas, setAulas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [origem, setOrigem] = useState("banco");
  const [janelaPonto, setJanelaPonto] = useState("WINDOW_CLOSE");

  // Formulário de dias e horários
  const [horario, setHorario] = useState(null);

  // Formulário de nova aula
  const [novaAula, setNovaAula] = useState({ data: "", tema: "" });

  // Edição de uma aula existente
  const [editandoId, setEditandoId] = useState(null);
  const [edicaoAula, setEdicaoAula] = useState({ data: "", tema: "" });

  // Geração em lote
  const [lote, setLote] = useState({
    inicio: PERIODO_LETIVO.inicio,
    fim: PERIODO_LETIVO.fim,
  });

  const mostrarAviso = (texto, tipo = "sucesso") => {
    setAviso({ texto, tipo });
    setTimeout(() => setAviso(null), 5000);
  };

  const turmaAtual = turmas.find((t) => t.id === turmaId);

  // Sem as tabelas no banco não há o que salvar: o cronograma vem do código.
  const somenteLeitura = origem === "codigo";

  const carregarTurmas = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetchComToken("/admin/turmas");
      if (!res?.ok) throw new Error("Falha ao carregar turmas");

      const dados = await res.json();
      setTurmas(dados.turmas || []);
      setOrigem(dados.origem);
      setJanelaPonto(dados.janelaPonto || "WINDOW_CLOSE");
      setTurmaId((atual) => atual || dados.turmas?.[0]?.id || "");
    } catch {
      mostrarAviso("Não foi possível carregar as turmas.", "erro");
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarAulas = useCallback(async (id) => {
    if (!id) return;
    try {
      const res = await fetchComToken(`/admin/calendario/${id}`);
      if (!res?.ok) throw new Error("Falha");
      setAulas(await res.json());
    } catch {
      mostrarAviso("Não foi possível carregar as datas de aula.", "erro");
    }
  }, []);

  useEffect(() => {
    carregarTurmas();
  }, [carregarTurmas]);

  useEffect(() => {
    carregarAulas(turmaId);
  }, [turmaId, carregarAulas]);

  // Preenche o formulário sempre que a turma selecionada muda
  useEffect(() => {
    if (!turmaAtual) return;
    setHorario({
      dias_semana: [...(turmaAtual.dias || [])],
      aula_inicio: decimalParaHora(turmaAtual.janelas.aula.inicio),
      aula_fim: decimalParaHora(turmaAtual.janelas.aula.fim),
      checkin_inicio: decimalParaHora(turmaAtual.janelas.checkIn.inicio),
      checkin_fim: decimalParaHora(turmaAtual.janelas.checkIn.fim),
      checkout_inicio: decimalParaHora(turmaAtual.janelas.checkOut.inicio),
      checkout_fim: decimalParaHora(turmaAtual.janelas.checkOut.fim),
    });
  }, [turmaId, turmas]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternarDia = (valor) => {
    setHorario((atual) => {
      if (!atual) return atual;
      const dias = atual.dias_semana || [];
      const tem = dias.includes(valor);
      return {
        ...atual,
        dias_semana: tem
          ? dias.filter((d) => d !== valor)
          : [...dias, valor].sort((a, b) => a - b),
      };
    });
  };

  const salvarHorario = async () => {
    if (!horario?.dias_semana?.length) {
      mostrarAviso("Escolha pelo menos um dia da semana.", "erro");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetchComToken(
        `/admin/turmas/${turmaId}`,
        "PUT",
        horario,
      );
      const dados = await res.json();

      if (!res.ok) {
        mostrarAviso(dados.error || "Erro ao salvar.", "erro");
        return;
      }

      mostrarAviso("Dias e horários salvos.");
      await carregarTurmas();
    } catch {
      mostrarAviso("Erro de conexão ao salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  };

  const adicionarAula = async () => {
    if (!novaAula.data) {
      mostrarAviso("Escolha a data da aula.", "erro");
      return;
    }

    try {
      const res = await fetchComToken("/admin/calendario", "POST", {
        turma_id: turmaId,
        data: novaAula.data,
        tema: novaAula.tema,
      });
      const dados = await res.json();

      if (!res.ok) {
        mostrarAviso(dados.error || "Erro ao adicionar.", "erro");
        return;
      }

      setNovaAula({ data: "", tema: "" });
      mostrarAviso("Aula adicionada.");
      await Promise.all([carregarAulas(turmaId), carregarTurmas()]);
    } catch {
      mostrarAviso("Erro de conexão.", "erro");
    }
  };

  const salvarEdicaoAula = async (id) => {
    try {
      const res = await fetchComToken(`/admin/calendario/${id}`, "PATCH", {
        data: edicaoAula.data,
        tema: edicaoAula.tema,
      });
      const dados = await res.json();

      if (!res.ok) {
        mostrarAviso(dados.error || "Erro ao salvar.", "erro");
        return;
      }

      setEditandoId(null);
      mostrarAviso("Aula atualizada.");
      await Promise.all([carregarAulas(turmaId), carregarTurmas()]);
    } catch {
      mostrarAviso("Erro de conexão.", "erro");
    }
  };

  const alternarCancelada = async (aula) => {
    try {
      const res = await fetchComToken(`/admin/calendario/${aula.id}`, "PATCH", {
        cancelada: !aula.cancelada,
      });
      if (!res.ok) {
        const dados = await res.json();
        mostrarAviso(dados.error || "Erro ao atualizar.", "erro");
        return;
      }
      mostrarAviso(aula.cancelada ? "Aula reativada." : "Aula cancelada.");
      await Promise.all([carregarAulas(turmaId), carregarTurmas()]);
    } catch {
      mostrarAviso("Erro de conexão.", "erro");
    }
  };

  const removerAula = async (aula) => {
    const confirmado = window.confirm(
      `Remover a aula de ${formatarDataBR(aula.data)}?\n\n` +
        "As presenças já registradas nessa data continuam no banco, mas a " +
        "data deixa de contar no cálculo de frequência.\n\n" +
        "Se a aula foi cancelada e você quer manter o histórico, use " +
        '"Cancelar" no lugar de remover.',
    );
    if (!confirmado) return;

    try {
      const res = await fetchComToken(`/admin/calendario/${aula.id}`, "DELETE");
      if (!res.ok) {
        mostrarAviso("Erro ao remover a aula.", "erro");
        return;
      }
      mostrarAviso("Aula removida.");
      await Promise.all([carregarAulas(turmaId), carregarTurmas()]);
    } catch {
      mostrarAviso("Erro de conexão.", "erro");
    }
  };

  const gerarEmLote = async () => {
    const confirmado = window.confirm(
      `Gerar as datas de ${formatarDataBR(lote.inicio)} a ${formatarDataBR(lote.fim)} ` +
        "usando os dias da semana desta turma?\n\nNenhuma data existente é apagada.",
    );
    if (!confirmado) return;

    setSalvando(true);
    try {
      const res = await fetchComToken("/admin/calendario/gerar", "POST", {
        turma_id: turmaId,
        inicio: lote.inicio,
        fim: lote.fim,
      });
      const dados = await res.json();

      if (!res.ok) {
        mostrarAviso(dados.error || "Erro ao gerar.", "erro");
        return;
      }

      mostrarAviso(dados.msg);
      await Promise.all([carregarAulas(turmaId), carregarTurmas()]);
    } catch {
      mostrarAviso("Erro de conexão.", "erro");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <div className="app-wrapper">Carregando cronograma...</div>;
  }

  const hoje = hojeBrasilia();

  return (
    <div className="app-wrapper">
      {aviso && (
        <div className={`custom-popup-modern ${aviso.tipo}`}>{aviso.texto}</div>
      )}

      <div className="home-admin-header">
        <div>
          <h2 style={{ margin: 0 }}>Cronograma das turmas</h2>
          <p
            className="text-muted"
            style={{ margin: "5px 0 0", maxWidth: "62ch" }}
          >
            Defina os dias, os horários e as datas de aula de cada turma. As
            mudanças valem na hora para o check-in dos alunos.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setView("admin")}>
          Voltar
        </button>
      </div>

      {janelaPonto === "WINDOW_OPEN" && (
        <div
          className="shadow-card"
          style={{
            padding: "15px 20px",
            marginBottom: "20px",
            borderLeft: "5px solid var(--warning)",
          }}
        >
          <strong>Janela de ponto aberta (WINDOW_OPEN).</strong>
          <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
            Qualquer aluno consegue bater ponto em qualquer dia e horário. Para
            voltar ao normal, mude <code>janela_ponto</code> para{" "}
            <code>WINDOW_CLOSE</code> na tabela <code>configuracoes</code> do
            Supabase.
          </p>
        </div>
      )}

      {somenteLeitura && (
        <div
          className="shadow-card"
          style={{
            padding: "15px 20px",
            marginBottom: "20px",
            borderLeft: "5px solid var(--danger)",
          }}
        >
          <strong>O cronograma já está no banco.</strong>
          <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
            O sistema está usando o calendário a partir do banco de dados.
            Se preciso, pode acrescentar e editar abaixo.
          </p>
        </div>
      )}

      <div
        className="shadow-card"
        style={{ padding: "20px", marginBottom: "25px" }}
      >
        <label className="stat-label" style={{ textAlign: "left" }}>
          Turma
        </label>
        <select
          className="input-modern"
          style={{ margin: 0 }}
          value={turmaId}
          onChange={(e) => setTurmaId(e.target.value)}
        >
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
              {t.ativa === false ? " (desativada)" : ""}
            </option>
          ))}
        </select>

        {turmaAtual && (
          <p className="text-muted" style={{ marginTop: "10px" }}>
            {turmaAtual.aulasOcorridas} de {turmaAtual.totalAulas} aulas já
            ocorreram • modalidade {turmaAtual.modalidade} • turno{" "}
            {turmaAtual.turno}
          </p>
        )}
      </div>

      {horario && (
        <div
          className="shadow-card"
          style={{ padding: "25px", marginBottom: "25px" }}
        >
          <h4 style={{ marginTop: 0, color: "var(--accent-soft)" }}>
            Dias e horários
          </h4>

          <label
            className="stat-label"
            style={{ textAlign: "left", margin: "15px 0 8px" }}
          >
            Dias da semana
          </label>

          {/* Os botões usam .filter-pill/.active: o estado ativo vem do CSS,
              sem cor embutida que possa ser escrita errada. */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {NOMES_DIAS.map((dia) => {
              const ativo = horario.dias_semana.includes(dia.valor);
              return (
                <button
                  key={dia.valor}
                  type="button"
                  aria-pressed={ativo}
                  className={`filter-pill ${ativo ? "active" : ""}`}
                  onClick={() => alternarDia(dia.valor)}
                >
                  {dia.rotulo}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "15px",
              marginTop: "20px",
            }}
          >
            {CAMPOS_HORARIO.map(({ campo, rotulo }) => (
              <div key={campo}>
                <label
                  className="stat-label"
                  style={{ textAlign: "left", fontSize: "0.7rem" }}
                >
                  {rotulo}
                </label>
                <input
                  type="time"
                  className="input-modern"
                  style={{ margin: 0, width: "100%" }}
                  value={horario[campo]}
                  onChange={(e) =>
                    setHorario({ ...horario, [campo]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>

          <p className="text-muted" style={{ marginTop: "15px" }}>
            Mudar os dias da semana não mexe nas datas já cadastradas abaixo —
            passa a valer para as datas que você gerar em lote.
          </p>

          <button
            className="btn-ponto in"
            style={{ marginTop: "15px", marginLeft: 0 }}
            onClick={salvarHorario}
            disabled={salvando || somenteLeitura}
          >
            {salvando ? "Salvando..." : "Salvar dias e horários"}
          </button>
        </div>
      )}

      <div
        className="shadow-card"
        style={{ padding: "25px", marginBottom: "25px" }}
      >
        <h4 style={{ marginTop: 0, color: "var(--accent-soft)" }}>
          Adicionar uma aula
        </h4>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr auto",
            gap: "10px",
            alignItems: "end",
            marginTop: "15px",
          }}
        >
          <div>
            <label
              className="stat-label"
              style={{ textAlign: "left", fontSize: "0.7rem" }}
            >
              Data
            </label>
            <input
              type="date"
              className="input-modern"
              style={{ margin: 0, width: "100%" }}
              value={novaAula.data}
              onChange={(e) =>
                setNovaAula({ ...novaAula, data: e.target.value })
              }
            />
          </div>
          <div>
            <label
              className="stat-label"
              style={{ textAlign: "left", fontSize: "0.7rem" }}
            >
              Tema (opcional)
            </label>
            <input
              type="text"
              className="input-modern"
              style={{ margin: 0, width: "100%" }}
              placeholder="Ex.: HTML e CSS — estrutura e semântica"
              value={novaAula.tema}
              onChange={(e) =>
                setNovaAula({ ...novaAula, tema: e.target.value })
              }
            />
          </div>
          <button
            className="btn-ponto in"
            style={{ margin: 0 }}
            onClick={adicionarAula}
            disabled={somenteLeitura}
          >
            Adicionar
          </button>
        </div>

        <hr style={{ margin: "25px 0 20px" }} />

        <h5 style={{ margin: "0 0 10px" }}>Gerar várias datas de uma vez</h5>
        <p className="text-muted" style={{ margin: "0 0 15px" }}>
          Cria as datas do período usando os dias da semana da turma. Datas que
          já existem são mantidas.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 180px auto",
            gap: "10px",
            alignItems: "end",
          }}
        >
          <div>
            <label
              className="stat-label"
              style={{ textAlign: "left", fontSize: "0.7rem" }}
            >
              De
            </label>
            <input
              type="date"
              className="input-modern"
              style={{ margin: 0, width: "100%" }}
              value={lote.inicio}
              onChange={(e) => setLote({ ...lote, inicio: e.target.value })}
            />
          </div>
          <div>
            <label
              className="stat-label"
              style={{ textAlign: "left", fontSize: "0.7rem" }}
            >
              Até
            </label>
            <input
              type="date"
              className="input-modern"
              style={{ margin: 0, width: "100%" }}
              value={lote.fim}
              onChange={(e) => setLote({ ...lote, fim: e.target.value })}
            />
          </div>
          <button
            className="btn-secondary"
            onClick={gerarEmLote}
            disabled={salvando || somenteLeitura}
          >
            Gerar datas
          </button>
        </div>
      </div>

      <div className="shadow-card" style={{ padding: "25px" }}>
        <h4 style={{ margin: "0 0 15px", color: "var(--accent-soft)" }}>
          Datas de aula ({aulas.length})
        </h4>

        {aulas.length === 0 ? (
          <p
            className="text-muted"
            style={{ textAlign: "center", padding: "30px" }}
          >
            Nenhuma data cadastrada para esta turma. Adicione uma acima ou gere
            o período de uma vez.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="historico-table">
              <thead>
                <tr>
                  <th style={{ width: "130px" }}>DATA</th>
                  <th>TEMA</th>
                  <th style={{ width: "110px" }}>SITUAÇÃO</th>
                  <th style={{ width: "240px", textAlign: "right" }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {aulas.map((aula) => {
                  const emEdicao = editandoId === aula.id;
                  const passada = aula.data < hoje;

                  return (
                    <tr
                      key={aula.id}
                      style={{ opacity: aula.cancelada ? 0.55 : 1 }}
                    >
                      <td>
                        {emEdicao ? (
                          <input
                            type="date"
                            className="input-modern"
                            style={{
                              margin: 0,
                              padding: "6px",
                              fontSize: "0.8rem",
                            }}
                            value={edicaoAula.data}
                            onChange={(e) =>
                              setEdicaoAula({
                                ...edicaoAula,
                                data: e.target.value,
                              })
                            }
                          />
                        ) : (
                          <strong
                            style={{
                              textDecoration: aula.cancelada
                                ? "line-through"
                                : "none",
                            }}
                          >
                            {formatarDataBR(aula.data)}
                          </strong>
                        )}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {emEdicao ? (
                          <input
                            type="text"
                            className="input-modern"
                            style={{
                              margin: 0,
                              padding: "6px",
                              fontSize: "0.8rem",
                              width: "100%",
                            }}
                            placeholder="Tema da aula"
                            value={edicaoAula.tema}
                            onChange={(e) =>
                              setEdicaoAula({
                                ...edicaoAula,
                                tema: e.target.value,
                              })
                            }
                          />
                        ) : (
                          aula.tema || (
                            <span style={{ color: "var(--text-dim)" }}>—</span>
                          )
                        )}
                      </td>
                      <td>
                        {aula.cancelada ? (
                          <span className="status-badge erro">Cancelada</span>
                        ) : passada ? (
                          <span className="status-badge">Realizada</span>
                        ) : (
                          <span className="status-badge ok">Prevista</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {emEdicao ? (
                          <>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: "0.7rem", padding: "6px 10px" }}
                              onClick={() => salvarEdicaoAula(aula.id)}
                            >
                              Salvar
                            </button>{" "}
                            <button
                              className="btn-secondary"
                              style={{ fontSize: "0.7rem", padding: "6px 10px" }}
                              onClick={() => setEditandoId(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: "0.7rem", padding: "6px 10px" }}
                              onClick={() => {
                                setEditandoId(aula.id);
                                setEdicaoAula({
                                  data: aula.data,
                                  tema: aula.tema || "",
                                });
                              }}
                            >
                              Editar
                            </button>{" "}
                            <button
                              className="btn-secondary"
                              style={{ fontSize: "0.7rem", padding: "6px 10px" }}
                              onClick={() => alternarCancelada(aula)}
                            >
                              {aula.cancelada ? "Reativar" : "Cancelar"}
                            </button>{" "}
                            <button
                              className="btn-secondary"
                              style={{
                                fontSize: "0.7rem",
                                padding: "6px 10px",
                                borderColor: "var(--danger)",
                                color: "var(--danger)",
                              }}
                              onClick={() => removerAula(aula)}
                            >
                              Remover
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
