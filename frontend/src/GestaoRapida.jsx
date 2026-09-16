import React, { useState, useEffect, useMemo } from "react";
import { fetchComToken } from "./Api";
import {
  API_URL,
  FORMACOES,
  getAulasOcorridas,
  getNomeCurto,
  getTotalAulas,
  hojeBrasilia,
} from "./Constants";

const horaAgoraBrasilia = () =>
  new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function GestaoRapida({ user, setView }) {
  const [alunos, setAlunos] = useState([]);
  const [filtroTurma, setFiltroTurma] = useState("todos");
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState("nome");
  const [carregando, setCarregando] = useState(true);
  const [statusSalva, setStatusSalva] = useState({});
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);

  // Nome/estatísticas reais da turma, resolvidos pelo cronograma do
  // backend (Geração Tech). Cai na lista estática só como reserva.
  const turmaInfo = (id) => turmasDisponiveis.find((t) => t.id === id);
  const nomeTurma = (id) => turmaInfo(id)?.nome || getNomeCurto(id);

  // --- ESTADOS PARA O MODAL DE GERENCIAMENTO ---
  const [alunoSelecionado, setAlunoSelecionado] = useState(null);
  const [historicoAluno, setHistoricoAluno] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [dadosEdicao, setDadosEdicao] = useState({
    nome: "",
    email: "",
    data_nascimento: "",
  });
  const [manualPonto, setManualPonto] = useState({
    data: hojeBrasilia(),
    check_in: "18:30",
    check_out: "22:30",
  });

  useEffect(() => {
    carregarTodos();
    carregarTurmas();
  }, []);

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

  const carregarTodos = async () => {
    setCarregando(true);
    try {
      const res = await fetchComToken(
        `/admin/busca?termo=&turma=todos&status=todos`,
      );
      if (res.ok) {
        const data = await res.json();
        setAlunos(data.alunos || []);
      }
    } finally {
      setCarregando(false);
    }
  };

  const salvarNome = async (email, novoNome) => {
    const alunoOriginal = alunos.find((a) => a.email === email);
    if (!novoNome || alunoOriginal.nome === novoNome) return;

    setStatusSalva((prev) => ({ ...prev, [email]: "salvando" }));

    try {
      const res = await fetch(`${API_URL}/admin/limpeza-nome`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ email, nome: novoNome }),
      });

      if (res.ok) {
        setStatusSalva((prev) => ({ ...prev, [email]: "ok" }));
        setAlunos((prev) =>
          prev.map((a) => (a.email === email ? { ...a, nome: novoNome } : a)),
        );
      } else {
        setStatusSalva((prev) => ({ ...prev, [email]: "erro" }));
      }
    } catch {
      setStatusSalva((prev) => ({ ...prev, [email]: "erro" }));
    }
  };

  // --- FUNÇÕES DO MODAL (DETALHES, EDIÇÃO E PONTO MANUAL) ---
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
        headers: { Authorization: `Bearer ${user.token}` },
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

  const salvarEdicao = async () => {
    setCarregando(true);
    try {
      const res = await fetch(
        `${API_URL}/admin/aluno/${encodeURIComponent(alunoSelecionado.email)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify(dadosEdicao),
        },
      );

      if (res.ok) {
        alert("Dados atualizados com sucesso!");
        setModalAberto(false);
        carregarTodos();
      } else {
        const erro = await res.json().catch(() => ({}));
        alert(`Erro: ${erro.error || "não foi possível salvar."}`);
      }
    } catch {
      alert("Erro ao salvar alterações.");
    } finally {
      setCarregando(false);
    }
  };

  const registrarManual = async () => {
    if (!window.confirm("Deseja inserir este registro manualmente?")) return;
    try {
      const res = await fetch(`${API_URL}/admin/ponto-manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
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

  // Preenche o check-out com o horário atual e envia — mesmo endpoint do Admin.
  const adicionarCheckoutAgora = async () => {
    if (
      !window.confirm(
        `Registrar check-out agora (${horaAgoraBrasilia()}) para ${alunoSelecionado.nome}?`,
      )
    )
      return;
    try {
      const res = await fetch(`${API_URL}/admin/checkout-manual`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          email: alunoSelecionado.email,
          data: manualPonto.data || hojeBrasilia(),
          check_out: horaAgoraBrasilia(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(d.msg || "Check-out adicionado!");
        verDetalhes(alunoSelecionado);
      } else {
        alert(d.error || "Erro ao adicionar check-out.");
      }
    } catch {
      alert("Erro de conexão.");
    }
  };

  // Mesma ação de reset de sessão que existe no Admin.
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
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ email }),
      });
      alert("Solicitação de reset enviada.");
    } catch {
      alert("Erro ao resetar.");
    }
  };

  // Mesma exclusão permanente de cadastro que existe no Admin.
  const excluirAluno = async () => {
    if (
      !window.confirm(
        `TEM CERTEZA? Isso excluirá permanentemente o cadastro e todo o histórico de ${alunoSelecionado.nome}. Esta ação não pode ser desfeita.`,
      )
    )
      return;

    setCarregando(true);
    try {
      const res = await fetch(
        `${API_URL}/admin/aluno/${encodeURIComponent(alunoSelecionado.email)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.token}` },
        },
      );

      if (res.ok) {
        alert("Cadastro removido com sucesso!");
        setModalAberto(false);
        carregarTodos();
      } else {
        const erro = await res.json().catch(() => ({}));
        alert(`Erro: ${erro.error || "não foi possível excluir."}`);
      }
    } catch {
      alert("Erro de conexão ao tentar excluir.");
    } finally {
      setCarregando(false);
    }
  };

  const exportarFaltosos = () => {
    const faltosos = alunosFiltrados.filter((a) => {
      return (a.total_faltas || 0) > 0;
    });

    if (faltosos.length === 0) return alert("Nenhum faltoso na lista atual.");

    const cabecalho = "Nome;Email;Turma;Presencas;Faltas\n";
    const linhas = faltosos
      .map((a) => {
        const faltas = a.total_faltas || 0;
        return `${a.nome};${a.email};${a.turma_nome || nomeTurma(a.formacao)};${a.total_presencas || 0};${faltas}`;
      })
      .join("\n");

    const blob = new Blob(["\ufeff" + cabecalho + linhas], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `auditoria_faltas_${filtroTurma}_${new Date().toLocaleDateString()}.csv`,
    );
    link.click();
  };

  const alunosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return alunos
      .filter((a) => (filtroTurma === "todos" ? true : a.formacao === filtroTurma))
      .filter((a) =>
        termo
          ? (a.nome || "").toLowerCase().includes(termo) ||
            (a.email || "").toLowerCase().includes(termo)
          : true,
      )
      .sort((a, b) => {
        if (ordenacao === "faltas")
          return (b.total_faltas || 0) - (a.total_faltas || 0);
        if (ordenacao === "presencas")
          return (b.total_presencas || 0) - (a.total_presencas || 0);
        return (a.nome || a.email || "").localeCompare(b.nome || b.email || "");
      });
  }, [alunos, filtroTurma, busca, ordenacao]);

  // Resumo de risco para dar contexto rápido de auditoria.
  const resumo = useMemo(() => {
    const base =
      filtroTurma === "todos"
        ? alunos
        : alunos.filter((a) => a.formacao === filtroTurma);
    const total = base.length;
    const emRisco = base.filter((a) => (a.total_faltas || 0) > 2).length;
    const semNome = base.filter((a) => !a.nome || !a.nome.trim()).length;
    const mediaPresencas = total
      ? (
          base.reduce((s, a) => s + (a.total_presencas || 0), 0) / total
        ).toFixed(1)
      : "0";
    return { total, emRisco, semNome, mediaPresencas };
  }, [alunos, filtroTurma]);
  useEffect(() => { setAlPag(1); }, [busca, filtroTurma, ordenacao]);

  // ==== Check-out em massa + Justificativas (para monitores, sem wp-admin) ====
  const [coData, setCoData] = useState(new Date().toISOString().split("T")[0]);
  const [coTurma, setCoTurma] = useState("todos");
  const [justs, setJusts] = useState([]);
  const [justStatus, setJustStatus] = useState("pendente");
  const [justResp, setJustResp] = useState({});
  const [justPag, setJustPag] = useState(1);
  const JUST_POR = 10;
  const [alPag, setAlPag] = useState(1);
  const AL_POR = 25;

  const carregarJusts = async (st = justStatus) => {
    try {
      const res = await fetch(`${API_URL}/admin/justificativas?status=${st}`, { headers: { Authorization: `Bearer ${user.token}` } });
      const d = await res.json();
      if (res.ok) setJusts(d.justificativas || []);
    } catch {}
  };
  useEffect(() => { carregarJusts(justStatus); setJustPag(1); /* eslint-disable-next-line */ }, [justStatus]);

  const responderJust = async (id, status) => {
    try {
      const res = await fetch(`${API_URL}/admin/justificativa/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ status, resposta: justResp[id] || "" }),
      });
      if (res.ok) { alert(status === "aceita" ? "Justificativa aceita (falta abonada)." : "Justificativa recusada."); carregarJusts(); }
      else { const e = await res.json(); alert(e.error || "Erro."); }
    } catch { alert("Erro de conexao."); }
  };

  const checkoutMassa = async () => {
    if (!window.confirm("Completar o check-out de todos que bateram entrada mas nao saida nesta data?")) return;
    try {
      const res = await fetch(`${API_URL}/admin/checkout-massa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ data: coData, turma: coTurma === "todos" ? null : coTurma }),
      });
      const d = await res.json();
      if (res.ok) alert("Check-out em massa concluido.");
      else alert(d.error || "Erro.");
    } catch { alert("Erro de conexao."); }
  };

  if (carregando && !modalAberto)
    return <div className="app-wrapper">Carregando base de dados...</div>;

  return (
    <div className="app-wrapper">
      {/* CHECK-OUT EM MASSA */}
      <div className="shadow-card" style={{ marginBottom: 16, borderLeft: "4px solid #0E7C57", background: "#fff", border: "1px solid #E7ECF4", borderLeftWidth: "4px", borderRadius: 12 }}>
        <div style={{ padding: "14px 18px" }}>
          <h3 style={{ margin: "0 0 4px", color: "#193A70" }}>&#9203; Check-out em massa</h3>
          <p style={{ fontSize: 12.5, color: "var(--text-muted, #667)", margin: "0 0 12px" }}>Completa a sa&iacute;da de quem bateu entrada mas esqueceu o check-out, no hor&aacute;rio de fim da aula.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Data</label>
              <input type="date" className="input-modern" value={coData} onChange={(e) => setCoData(e.target.value)} /></div>
            <div><label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Turma</label>
              <select className="input-modern" value={coTurma} onChange={(e) => setCoTurma(e.target.value)} style={{ minWidth: 180 }}>
                <option value="todos">Todas</option>
                {(turmasDisponiveis || []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select></div>
            <button className="btn-accent" onClick={checkoutMassa}>Completar check-outs</button>
          </div>
        </div>
      </div>

      {/* JUSTIFICATIVAS */}
      <div className="shadow-card" style={{ marginBottom: 16, borderLeft: "4px solid #7C3AED", background: "#fff", border: "1px solid #E7ECF4", borderLeftWidth: "4px", borderRadius: 12 }}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <h3 style={{ margin: 0, color: "#193A70" }}>&#128221; Justificativas de falta</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {["pendente", "aceita", "recusada", "todas"].map((s) => (
                <button key={s} onClick={() => setJustStatus(s)}
                  style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid #DCE4F0",
                    background: justStatus === s ? "#193A70" : "#fff", color: justStatus === s ? "#fff" : "#193A70" }}>
                  {s === "pendente" ? "Pendentes" : s === "aceita" ? "Aceitas" : s === "recusada" ? "Recusadas" : "Todas"}
                </button>
              ))}
            </div>
          </div>
          {justs.length === 0 ? (
            <p style={{ fontSize: 13, color: "#667", padding: "10px 0" }}>Nenhuma justificativa {justStatus !== "todas" ? justStatus : ""}.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {justs.slice((justPag-1)*JUST_POR, justPag*JUST_POR).map((j) => (
                <div key={j.id} style={{ border: "1px solid #E7ECF4", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{j.aluno_email}</div>
                      <div style={{ fontSize: 12, color: "#667" }}>{String(j.data).slice(0,10).split("-").reverse().join("/")}{j.turma ? " · " + j.turma : ""}</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, height: "fit-content",
                      background: j.status === "aceita" ? "#E3F5EC" : j.status === "recusada" ? "#FBE7E6" : "#FBF0DC",
                      color: j.status === "aceita" ? "#0B7B4F" : j.status === "recusada" ? "#B3302F" : "#8A5810" }}>
                      {j.status === "aceita" ? "Aceita (abonada)" : j.status === "recusada" ? "Recusada" : "Pendente"}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, margin: "8px 0", color: "#334" }}>{j.motivo}</p>
                  {j.documento_nome && (
                    <a href={`${API_URL}/admin/justificativa/${j.id}/documento`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0B5A94" }}>&#128206; {j.documento_nome}</a>
                  )}
                  {j.status === "pendente" && (
                    <div style={{ marginTop: 10 }}>
                      <input className="input-modern" placeholder="Mensagem ao aluno (opcional)" value={justResp[j.id] || ""}
                        onChange={(e) => setJustResp({ ...justResp, [j.id]: e.target.value })} style={{ marginBottom: 8 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => responderJust(j.id, "aceita")} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#0E7C57", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Aceitar (abonar)</button>
                        <button onClick={() => responderJust(j.id, "recusada")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #B3302F", background: "#fff", color: "#B3302F", fontWeight: 700, cursor: "pointer" }}>Recusar</button>
                      </div>
                    </div>
                  )}
                  {j.resposta && <div style={{ marginTop: 8, fontSize: 12.5, color: "#667", background: "#F4F7FC", borderRadius: 6, padding: "6px 10px" }}><b>Resposta:</b> {j.resposta}</div>}
                </div>
              ))}
            </div>
          )}
          {justs.length > JUST_POR && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 12, fontSize: 13, color: "#586B88" }}>
              <button onClick={() => setJustPag((p) => Math.max(1, p - 1))} disabled={justPag <= 1}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #DCE4F0", background: "#fff", color: "#193A70", cursor: justPag<=1?"default":"pointer", opacity: justPag<=1?.5:1 }}>&lsaquo; anterior</button>
              <span>Página {justPag} de {Math.ceil(justs.length / JUST_POR)}</span>
              <button onClick={() => setJustPag((p) => Math.min(Math.ceil(justs.length / JUST_POR), p + 1))} disabled={justPag >= Math.ceil(justs.length / JUST_POR)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #DCE4F0", background: "#fff", color: "#193A70", cursor: "pointer", opacity: justPag>=Math.ceil(justs.length/JUST_POR)?.5:1 }}>próxima &rsaquo;</button>
            </div>
          )}
        </div>
      </div>

      <div className="shadow-card" style={{ background: "#fff", border: "1px solid #E7ECF4", borderRadius: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h3 style={{ color: "#a9a9a9" }}>
              📊 Auditoria e Edição de Cadastros
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
              {filtroTurma === "todos"
                ? "Presenças e faltas são contadas pelo calendário de cada turma."
                : turmaInfo(filtroTurma)
                  ? `${nomeTurma(filtroTurma)}: ${turmaInfo(filtroTurma).aulasOcorridas} de ${turmaInfo(filtroTurma).totalAulas} aulas já ocorreram.`
                  : `${nomeTurma(filtroTurma)}: ${getAulasOcorridas(filtroTurma).length} de ${getTotalAulas(filtroTurma)} aulas já ocorreram.`}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={exportarFaltosos}
              className="btn-secondary"
              style={{ border: "1px solid #ef4444", color: "#ef4444" }}
            >
              Exportar Faltosos
            </button>
            <select
              className="input-modern"
              style={{ width: "200px", margin: 0 }}
              value={filtroTurma}
              onChange={(e) => setFiltroTurma(e.target.value)}
            >
              <option value="todos">Todas as Formações</option>
              {(turmasDisponiveis.length ? turmasDisponiveis : FORMACOES).map(
                (t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ),
              )}
            </select>
            {typeof setView === "function" && (
              <button onClick={() => setView("home")} className="btn-secondary">
                🏠 Início
              </button>
            )}
            <button onClick={() => setView("admin")} className="btn-secondary">
              Voltar
            </button>
          </div>
        </div>

        {/* BUSCA E ORDENAÇÃO */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "15px",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            className="input-modern"
            style={{ flex: 1, minWidth: "220px", margin: 0 }}
            placeholder="Buscar por nome ou e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select
            className="input-modern"
            style={{ width: "200px", margin: 0 }}
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value)}
          >
            <option value="nome">Ordenar: Nome (A-Z)</option>
            <option value="faltas">Ordenar: Mais faltas primeiro</option>
            <option value="presencas">Ordenar: Mais presenças primeiro</option>
          </select>
        </div>

        {/* RESUMO RÁPIDO */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              ALUNOS NA LISTA
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: "bold" }}>
              {resumo.total}
            </div>
          </div>
          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              EM RISCO (+2 faltas)
            </div>
            <div
              style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#ef4444" }}
            >
              {resumo.emRisco}
            </div>
          </div>
          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              CADASTRO SEM NOME
            </div>
            <div
              style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#f59e0b" }}
            >
              {resumo.semNome}
            </div>
          </div>
          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              MÉDIA DE PRESENÇAS
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: "bold" }}>
              {resumo.mediaPresencas}
            </div>
          </div>
        </div>

        <table className="historico-table">
          <thead>
            <tr>
              <th style={{ width: "25%" }}>ALUNO (E-MAIL)</th>
              <th style={{ textAlign: "center" }}>PRESENÇAS</th>
              <th style={{ textAlign: "center" }}>FALTAS</th>
              <th style={{ textAlign: "center" }}>NOME PARA CERTIFICADO</th>
              <th style={{ width: "120px", textAlign: "right" }}>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {alunosFiltrados.slice((alPag-1)*AL_POR, alPag*AL_POR).map((aluno) => {
              const numFaltas = aluno.total_faltas || 0;
              const status = statusSalva[aluno.email];

              return (
                <tr
                  key={aluno.email}
                  style={{
                    background:
                      numFaltas > 2 ? "rgba(239, 68, 68, 0.05)" : "transparent",
                  }}
                >
                  <td style={{ fontSize: "0.8rem" }}>
                    <div style={{ fontWeight: "600" }}>{aluno.email}</div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                      }}
                    >
                      {aluno.turma_nome || nomeTurma(aluno.formacao)}
                    </div>
                  </td>
                  <td
                    style={{
                      textAlign: "center",
                      fontWeight: "bold",
                      color: "#152548",
                    }}
                  >
                    {aluno.total_presencas || 0}
                  </td>
                  <td
                    style={{
                      textAlign: "center",
                      color: numFaltas > 0 ? "#ef4444" : "var(--text-dim)",
                      fontWeight: "bold",
                    }}
                  >
                    {numFaltas}
                  </td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <input
                        type="text"
                        className="input-modern"
                        style={{
                          margin: 0,
                          padding: "5px 10px",
                          fontSize: "0.85rem",
                          borderColor:
                            status === "ok"
                              ? "#10b981"
                              : status === "erro"
                                ? "#ef4444"
                                : "var(--border-subtle)",
                          flex: 1,
                        }}
                        defaultValue={aluno.nome || ""}
                        onBlur={(e) => salvarNome(aluno.email, e.target.value)}
                        placeholder="Nome não preenchido..."
                      />
                      <span style={{ width: "20px" }}>
                        {status === "salvando" && "⏳"}
                        {status === "ok" && "✅"}
                        {status === "erro" && "❌"}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      onClick={() => verDetalhes(aluno)}
                      className="btn-secondary"
                      style={{ fontSize: "0.65rem", padding: "5px 8px" }}
                    >
                      Gerenciar
                    </button>
                  </td>
                </tr>
              );
            })}
            {alunosFiltrados.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: "center",
                    padding: "30px 0",
                    color: "var(--text-dim)",
                  }}
                >
                  Nenhum aluno encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {alunosFiltrados.length > AL_POR && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "14px 0 4px", fontSize: 13, color: "#586B88" }}>
            <button onClick={() => setAlPag((p) => Math.max(1, p - 1))} disabled={alPag <= 1}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #DCE4F0", background: "#fff", color: "#193A70", cursor: alPag<=1?"default":"pointer", opacity: alPag<=1?.5:1 }}>&lsaquo; anterior</button>
            <span>Mostrando {Math.min((alPag-1)*AL_POR+1, alunosFiltrados.length)}–{Math.min(alPag*AL_POR, alunosFiltrados.length)} de {alunosFiltrados.length} · Página {alPag}/{Math.ceil(alunosFiltrados.length / AL_POR)}</span>
            <button onClick={() => setAlPag((p) => Math.min(Math.ceil(alunosFiltrados.length / AL_POR), p + 1))} disabled={alPag >= Math.ceil(alunosFiltrados.length / AL_POR)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #DCE4F0", background: "#fff", color: "#193A70", cursor: "pointer", opacity: alPag>=Math.ceil(alunosFiltrados.length/AL_POR)?.5:1 }}>próxima &rsaquo;</button>
          </div>
        )}
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
                  className="btn-secondary"
                  style={{
                    background: !editando ? "#152548" : "transparent",
                    color: !editando ? "white" : "inherit",
                  }}
                >
                  Histórico
                </button>
                <button
                  onClick={() => setEditando(true)}
                  className="btn-secondary"
                  style={{
                    background: editando ? "#152548" : "transparent",
                    color: editando ? "white" : "inherit",
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
                      marginTop: "10px",
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
                      marginTop: "10px",
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

                  <div
                    style={{
                      borderTop: "1px solid rgba(255,255,255,.1)",
                      margin: "16px 0 12px",
                    }}
                  ></div>
                  <h5 style={{ margin: "0 0 8px", color: "#e8eefc" }}>
                    &#9203; Adicionar check-out em registro existente
                  </h5>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-dim)",
                      margin: "0 0 10px",
                    }}
                  >
                    Use quando o aluno marcou a entrada mas{" "}
                    <b>esqueceu de bater a saída</b>. Preenche automaticamente
                    com o horário atual.
                  </p>
                  <button
                    className="btn-ponto"
                    style={{
                      width: "100%",
                      background: "#193A70",
                      color: "#fff",
                      border: "none",
                      padding: "10px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                    onClick={adicionarCheckoutAgora}
                  >
                    &#9989; Adicionar Check-out Agora
                  </button>
                </div>

                <button
                  className="btn-danger-outline"
                  style={{
                    width: "100%",
                    border: "1px solid #9d3131",
                    color: "#9d3131",
                  }}
                  onClick={excluirAluno}
                  disabled={carregando}
                >
                  🗑️ Excluir Cadastro Permanente
                </button>
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
