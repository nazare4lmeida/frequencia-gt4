import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { getNomeCurto, hojeBrasilia } from "./Constants";
import { fetchComToken } from "./Api";

// O banco guarda check_in/check_out como timestamp; a folha trabalha em "HH:MM".
const hhmm = (ts) => {
  if (!ts) return "";
  if (typeof ts === "string") {
    const m = ts.match(/T(\d{2}:\d{2})/);
    if (m) return m[1];
    if (/^\d{1,2}:\d{2}/.test(ts)) return ts.slice(0, 5);
  }
  const d = new Date(ts);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Fortaleza",
      });
};

const minutos = (hora) => {
  const m = String(hora || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const duracao = (entrada, saida) => {
  const ini = minutos(entrada);
  const fim = minutos(saida);
  if (ini == null || fim == null || fim <= ini) return null;
  return fim - ini;
};

const formatarDuracao = (min) =>
  min == null ? "—" : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

const dataBR = (iso) => String(iso || "").slice(0, 10).split("-").reverse().join("/");

const diasAtras = (n) => {
  const d = new Date(`${hojeBrasilia()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const FICHA_VAZIA = {
  professor_email: "",
  turma: "",
  data: hojeBrasilia(),
  check_in: "",
  check_out: "",
  observacao: "",
};

export default function FolhaPontoProfessores() {
  const [inicio, setInicio] = useState(diasAtras(30));
  const [fim, setFim] = useState(hojeBrasilia());
  const [turma, setTurma] = useState("todos");
  const [emailSel, setEmailSel] = useState("");
  const [pontos, setPontos] = useState([]);
  const [professores, setProfessores] = useState([]);
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(null);
  const [novo, setNovo] = useState(FICHA_VAZIA);

  const nomeTurma = useCallback(
    (id) => turmasDisponiveis.find((t) => t.id === id)?.nome || getNomeCurto(id) || "—",
    [turmasDisponiveis],
  );

  useEffect(() => {
    const carregarTurmas = async () => {
      try {
        const res = await fetchComToken("/admin/turmas");
        if (res?.ok) {
          const d = await res.json();
          setTurmasDisponiveis(d.turmas || []);
        }
      } catch (err) {
        console.error("Erro ao carregar turmas:", err);
      }
    };
    carregarTurmas();
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams({ inicio, fim, turma });
      if (emailSel) params.set("email", emailSel);
      const res = await fetchComToken(`/admin/professores/pontos?${params}`);
      const d = await res.json();
      if (res.ok) {
        setPontos(d.pontos || []);
        setProfessores(d.professores || []);
      } else {
        setErro(d.error || "Não foi possível carregar a folha de ponto.");
      }
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão ao carregar a folha de ponto.");
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim, turma, emailSel]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const linhas = useMemo(
    () =>
      pontos.map((p) => {
        const entrada = hhmm(p.check_in);
        const saida = hhmm(p.check_out);
        return { ...p, entrada, saida, minutos: duracao(entrada, saida) };
      }),
    [pontos],
  );

  // Resumo por professor: quantos dias lançados e quanto tempo somado no período.
  const resumo = useMemo(() => {
    const acc = {};
    linhas.forEach((l) => {
      const chave = l.professor_email;
      if (!acc[chave]) {
        acc[chave] = {
          email: chave,
          nome: l.professor_nome || chave,
          dias: 0,
          minutos: 0,
          semSaida: 0,
        };
      }
      acc[chave].dias += 1;
      acc[chave].minutos += l.minutos || 0;
      if (!l.saida) acc[chave].semSaida += 1;
    });
    return Object.values(acc).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  const salvarEdicao = async () => {
    const { id, data, turma: t, entrada, saida, engajamento, nivelamento, observacao } = editando;
    try {
      const res = await fetchComToken(`/admin/professor/ponto/${id}`, "PATCH", {
        data,
        turma: t || null,
        check_in: entrada,
        check_out: saida,
        engajamento: engajamento || null,
        nivelamento: nivelamento || null,
        observacao,
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditando(null);
        carregar();
      } else {
        alert(d.error || "Erro ao salvar a correção.");
      }
    } catch {
      alert("Erro de conexão.");
    }
  };

  const excluir = async (linha) => {
    if (
      !window.confirm(
        `Excluir o ponto de ${linha.professor_nome} em ${dataBR(linha.data)}?`,
      )
    )
      return;
    try {
      const res = await fetchComToken(`/admin/professor/ponto/${linha.id}`, "DELETE");
      if (res.ok) carregar();
      else alert("Erro ao excluir o registro.");
    } catch {
      alert("Erro de conexão.");
    }
  };

  const lancarManual = async () => {
    if (!novo.professor_email || !novo.data) {
      alert("Escolha o professor e a data.");
      return;
    }
    try {
      const res = await fetchComToken("/admin/professor/ponto", "POST", novo);
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(d.atualizado ? "Ponto atualizado." : "Ponto lançado.");
        setNovo({ ...FICHA_VAZIA, professor_email: novo.professor_email });
        carregar();
      } else {
        alert(d.error || "Erro ao lançar o ponto.");
      }
    } catch {
      alert("Erro de conexão.");
    }
  };

  const exportarExcel = () => {
    const dados = linhas.map((l) => ({
      Data: dataBR(l.data),
      Professor: l.professor_nome,
      "E-mail": l.professor_email,
      Turma: nomeTurma(l.turma),
      Entrada: l.entrada || "",
      Saída: l.saida || "",
      "Tempo em aula": formatarDuracao(l.minutos),
      Engajamento: l.engajamento || "",
      Nivelamento: l.nivelamento || "",
      Corrigido: l.corrigido ? "Sim" : "Não",
      Observação: l.observacao || "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ Data: "" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Folha de ponto");
    XLSX.writeFile(wb, `folha_ponto_professores_${inicio}_a_${fim}.xlsx`);
  };

  const campo = { display: "flex", flexDirection: "column", gap: "5px" };
  const rotulo = { fontSize: "0.7rem", color: "var(--text-dim)" };
  const celula = { padding: "10px 8px", fontSize: "0.8rem" };

  return (
    <div
      className="app-wrapper"
      style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}
    >
      <div className="shadow-card" style={{ padding: "25px", marginBottom: "20px" }}>
        <h3 style={{ marginTop: 0 }}>🧑‍🏫 Folha de ponto dos professores</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginTop: 0 }}>
          Os professores marcam presença em um clique e o ponto entra com o horário
          da aula da turma. Aqui a coordenação confere, corrige e lança dias que
          faltaram.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
            marginTop: "18px",
          }}
        >
          <div style={campo}>
            <label style={rotulo}>Início</label>
            <input
              type="date"
              className="input-modern"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div style={campo}>
            <label style={rotulo}>Fim</label>
            <input
              type="date"
              className="input-modern"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <div style={campo}>
            <label style={rotulo}>Turma</label>
            <select
              className="input-modern"
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
            >
              <option value="todos">Todas as turmas</option>
              {turmasDisponiveis.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div style={campo}>
            <label style={rotulo}>Professor</label>
            <select
              className="input-modern"
              value={emailSel}
              onChange={(e) => setEmailSel(e.target.value)}
            >
              <option value="">Todos</option>
              {professores.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.nome || p.email}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...campo, justifyContent: "flex-end" }}>
            <button className="btn-secondary" onClick={exportarExcel}>
              💾 Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {erro && (
        <div
          className="shadow-card"
          style={{ padding: "15px", marginBottom: "20px", borderLeft: "5px solid #ef4444" }}
        >
          {erro}
        </div>
      )}

      <div className="shadow-card" style={{ padding: "25px", marginBottom: "20px" }}>
        <h4 style={{ marginTop: 0 }}>Resumo do período</h4>
        {resumo.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            {carregando ? "Carregando..." : "Nenhum ponto de professor no período."}
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: "0.7rem", color: "var(--text-dim)" }}>
                <th style={celula}>PROFESSOR</th>
                <th style={celula}>DIAS LANÇADOS</th>
                <th style={celula}>TEMPO TOTAL</th>
                <th style={celula}>SEM SAÍDA</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => (
                <tr key={r.email} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td style={{ ...celula, fontWeight: "bold" }}>{r.nome}</td>
                  <td style={celula}>{r.dias}</td>
                  <td style={celula}>{formatarDuracao(r.minutos || null)}</td>
                  <td style={{ ...celula, color: r.semSaida ? "#f59e0b" : "inherit" }}>
                    {r.semSaida}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="shadow-card" style={{ padding: "25px", marginBottom: "20px" }}>
        <h4 style={{ marginTop: 0 }}>Registros ({linhas.length})</h4>
        {linhas.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            {carregando ? "Carregando..." : "Nada lançado no período escolhido."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: "0.7rem", color: "var(--text-dim)" }}>
                  <th style={celula}>DATA</th>
                  <th style={celula}>PROFESSOR</th>
                  <th style={celula}>TURMA</th>
                  <th style={celula}>ENTRADA</th>
                  <th style={celula}>SAÍDA</th>
                  <th style={celula}>TEMPO</th>
                  <th style={celula}>AVALIAÇÃO</th>
                  <th style={{ ...celula, textAlign: "right" }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={celula}>{dataBR(l.data)}</td>
                    <td style={celula}>
                      <div style={{ fontWeight: "bold" }}>{l.professor_nome}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                        {l.professor_tipo === "monitor" ? "Monitor" : "Professor"}
                        {l.corrigido ? " · corrigido" : ""}
                      </div>
                    </td>
                    <td style={celula}>{nomeTurma(l.turma)}</td>
                    <td style={celula}>{l.entrada || "—"}</td>
                    <td style={{ ...celula, color: l.saida ? "inherit" : "#f59e0b" }}>
                      {l.saida || "sem saída"}
                    </td>
                    <td style={celula}>{formatarDuracao(l.minutos)}</td>
                    <td style={celula}>
                      {l.engajamento ? `${l.engajamento}/5` : "—"}
                      {l.nivelamento ? ` · ${l.nivelamento}` : ""}
                    </td>
                    <td style={{ ...celula, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "0.7rem", padding: "5px 10px" }}
                        onClick={() =>
                          setEditando({
                            id: l.id,
                            data: String(l.data).slice(0, 10),
                            turma: l.turma || "",
                            entrada: l.entrada,
                            saida: l.saida,
                            engajamento: l.engajamento || "",
                            nivelamento: l.nivelamento || "",
                            observacao: l.observacao || "",
                            professor_nome: l.professor_nome,
                          })
                        }
                      >
                        Editar
                      </button>{" "}
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "0.7rem", padding: "5px 10px", color: "#ef4444" }}
                        onClick={() => excluir(l)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="shadow-card" style={{ padding: "25px" }}>
        <h4 style={{ marginTop: 0 }}>Lançar ponto manualmente</h4>
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: 0 }}>
          Para o dia em que o professor deu aula mas não conseguiu marcar. Se já
          existir registro na mesma data e turma, ele é atualizado.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
          }}
        >
          <div style={campo}>
            <label style={rotulo}>Professor</label>
            <select
              className="input-modern"
              value={novo.professor_email}
              onChange={(e) => setNovo({ ...novo, professor_email: e.target.value })}
            >
              <option value="">Selecione...</option>
              {professores.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.nome || p.email}
                </option>
              ))}
            </select>
          </div>
          <div style={campo}>
            <label style={rotulo}>Turma</label>
            <select
              className="input-modern"
              value={novo.turma}
              onChange={(e) => setNovo({ ...novo, turma: e.target.value })}
            >
              <option value="">Sem turma</option>
              {turmasDisponiveis.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div style={campo}>
            <label style={rotulo}>Data</label>
            <input
              type="date"
              className="input-modern"
              value={novo.data}
              onChange={(e) => setNovo({ ...novo, data: e.target.value })}
            />
          </div>
          <div style={campo}>
            <label style={rotulo}>Entrada</label>
            <input
              type="time"
              className="input-modern"
              value={novo.check_in}
              onChange={(e) => setNovo({ ...novo, check_in: e.target.value })}
            />
          </div>
          <div style={campo}>
            <label style={rotulo}>Saída</label>
            <input
              type="time"
              className="input-modern"
              value={novo.check_out}
              onChange={(e) => setNovo({ ...novo, check_out: e.target.value })}
            />
          </div>
          <div style={campo}>
            <label style={rotulo}>Observação</label>
            <input
              className="input-modern"
              placeholder="Ex.: reposição de aula"
              value={novo.observacao}
              onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
            />
          </div>
        </div>
        <button
          className="btn-secondary"
          style={{ marginTop: "15px" }}
          onClick={lancarManual}
        >
          ✔ Lançar ponto
        </button>
      </div>

      {editando && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 50,
          }}
        >
          <div
            className="shadow-card"
            style={{ padding: "25px", width: "100%", maxWidth: "460px" }}
          >
            <h4 style={{ marginTop: 0 }}>Corrigir ponto · {editando.professor_nome}</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={campo}>
                <label style={rotulo}>Data</label>
                <input
                  type="date"
                  className="input-modern"
                  value={editando.data}
                  onChange={(e) => setEditando({ ...editando, data: e.target.value })}
                />
              </div>
              <div style={campo}>
                <label style={rotulo}>Turma</label>
                <select
                  className="input-modern"
                  value={editando.turma}
                  onChange={(e) => setEditando({ ...editando, turma: e.target.value })}
                >
                  <option value="">Sem turma</option>
                  {turmasDisponiveis.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ ...campo, flex: 1 }}>
                  <label style={rotulo}>Entrada</label>
                  <input
                    type="time"
                    className="input-modern"
                    value={editando.entrada}
                    onChange={(e) => setEditando({ ...editando, entrada: e.target.value })}
                  />
                </div>
                <div style={{ ...campo, flex: 1 }}>
                  <label style={rotulo}>Saída</label>
                  <input
                    type="time"
                    className="input-modern"
                    value={editando.saida}
                    onChange={(e) => setEditando({ ...editando, saida: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ ...campo, flex: 1 }}>
                  <label style={rotulo}>Engajamento (1 a 5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    className="input-modern"
                    value={editando.engajamento}
                    onChange={(e) =>
                      setEditando({ ...editando, engajamento: e.target.value })
                    }
                  />
                </div>
                <div style={{ ...campo, flex: 1 }}>
                  <label style={rotulo}>Nivelamento</label>
                  <select
                    className="input-modern"
                    value={editando.nivelamento}
                    onChange={(e) =>
                      setEditando({ ...editando, nivelamento: e.target.value })
                    }
                  >
                    <option value="">—</option>
                    <option value="abaixo">Abaixo do esperado</option>
                    <option value="adequado">Adequado</option>
                    <option value="avancado">Avançado</option>
                  </select>
                </div>
              </div>
              <div style={campo}>
                <label style={rotulo}>Observação</label>
                <input
                  className="input-modern"
                  value={editando.observacao}
                  onChange={(e) => setEditando({ ...editando, observacao: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setEditando(null)}
              >
                Cancelar
              </button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={salvarEdicao}>
                Salvar correção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
