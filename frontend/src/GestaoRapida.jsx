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

/* =========================================================
   ESTILO DA PÁGINA — alinhado ao Dashboard / Home (tema escuro)
   ========================================================= */
const GR_CSS = `
.gr-page{
  --gr-bg:#0B1B33;
  --gr-card:#11274A;
  --gr-card-2:#0E2140;
  --gr-line:rgba(255,255,255,.09);
  --gr-line-strong:rgba(255,255,255,.16);
  --gr-title:#EAF1FF;
  --gr-text:#D3E0F5;
  --gr-muted:#8FA6C8;
  --gr-blue:#3B82F6;
  --gr-green:#10B981;
  --gr-red:#F04438;
  --gr-amber:#F59E0B;
  --gr-purple:#8B5CF6;
  color:var(--gr-text);
  display:flex;
  flex-direction:column;
  gap:18px;
}

/* ---------- Cartões ---------- */
.gr-card{
  background:linear-gradient(180deg,#12294D 0%,#0E2140 100%);
  border:1px solid var(--gr-line);
  border-radius:16px;
  box-shadow:0 10px 28px rgba(0,0,0,.28);
  overflow:hidden;
}
.gr-card--accent{ border-top:3px solid var(--gr-accent,#3B82F6); }
.gr-card-body{ padding:20px 22px; }

.gr-card-head{
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  margin-bottom:14px;
}
.gr-card-head h3{
  margin:0; font-size:1.05rem; font-weight:800; letter-spacing:.2px;
  color:var(--gr-title); display:flex; align-items:center; gap:8px;
}
.gr-sub{ margin:6px 0 16px; font-size:.8rem; color:var(--gr-muted); line-height:1.5; }
.gr-spacer{ margin-left:auto; }

/* ---------- Campos ---------- */
.gr-field{ display:flex; flex-direction:column; gap:6px; }
.gr-label{
  font-size:.68rem; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; color:var(--gr-muted);
}
.gr-page .gr-input{
  background:rgba(255,255,255,.05);
  border:1px solid var(--gr-line-strong);
  border-radius:10px;
  color:var(--gr-title);
  padding:10px 12px;
  font-size:.88rem;
  font-family:inherit;
  outline:none;
  margin:0;
  width:100%;
  transition:border-color .15s, box-shadow .15s, background .15s;
}
.gr-page .gr-input::placeholder{ color:#6E85A8; }
.gr-page .gr-input:focus{
  border-color:var(--gr-blue);
  background:rgba(59,130,246,.10);
  box-shadow:0 0 0 3px rgba(59,130,246,.18);
}
.gr-page select.gr-input{ cursor:pointer; }
.gr-page select.gr-input option{ background:#0E2140; color:#EAF1FF; }
.gr-page .gr-input[type="date"],
.gr-page .gr-input[type="time"]{ color-scheme:dark; }

/* ---------- Botões ---------- */
.gr-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:7px;
  padding:10px 16px; border-radius:10px; border:1px solid transparent;
  font-size:.82rem; font-weight:700; font-family:inherit;
  cursor:pointer; white-space:nowrap;
  transition:transform .12s, filter .15s, background .15s, border-color .15s;
}
.gr-btn:hover{ transform:translateY(-1px); filter:brightness(1.08); }
.gr-btn:active{ transform:translateY(0); }
.gr-btn:disabled{ opacity:.45; cursor:default; transform:none; filter:none; }

.gr-btn--primary{ background:linear-gradient(135deg,#2563EB,#3B82F6); color:#fff; box-shadow:0 6px 16px rgba(37,99,235,.35); }
.gr-btn--green{ background:linear-gradient(135deg,#059669,#10B981); color:#fff; box-shadow:0 6px 16px rgba(16,185,129,.28); }
.gr-btn--ghost{ background:rgba(255,255,255,.06); border-color:var(--gr-line-strong); color:var(--gr-text); }
.gr-btn--ghost:hover{ background:rgba(255,255,255,.12); }
.gr-btn--danger{ background:rgba(240,68,56,.12); border-color:rgba(240,68,56,.45); color:#FF8A80; }
.gr-btn--danger:hover{ background:rgba(240,68,56,.22); }
.gr-btn--sm{ padding:6px 12px; font-size:.72rem; border-radius:8px; }
.gr-btn--block{ width:100%; }

/* ---------- Abas / filtros ---------- */
.gr-tabs{ display:flex; gap:6px; flex-wrap:wrap; }
.gr-tab{
  padding:7px 14px; border-radius:999px; font-size:.75rem; font-weight:700;
  cursor:pointer; font-family:inherit;
  background:rgba(255,255,255,.05); border:1px solid var(--gr-line-strong); color:var(--gr-muted);
  transition:all .15s;
}
.gr-tab:hover{ color:var(--gr-title); border-color:var(--gr-blue); }
.gr-tab.is-active{
  background:linear-gradient(135deg,#2563EB,#3B82F6); border-color:transparent; color:#fff;
  box-shadow:0 4px 12px rgba(37,99,235,.35);
}

/* ---------- Badges ---------- */
.gr-badge{
  font-size:.68rem; font-weight:800; letter-spacing:.03em;
  padding:4px 11px; border-radius:999px; height:fit-content; white-space:nowrap;
  border:1px solid transparent;
}
.gr-badge--ok{ background:rgba(16,185,129,.14); color:#34D399; border-color:rgba(16,185,129,.35); }
.gr-badge--no{ background:rgba(240,68,56,.14); color:#FF8A80; border-color:rgba(240,68,56,.35); }
.gr-badge--wait{ background:rgba(245,158,11,.14); color:#FBBF24; border-color:rgba(245,158,11,.35); }

/* ---------- Item de lista (justificativas) ---------- */
.gr-item{
  background:rgba(255,255,255,.035);
  border:1px solid var(--gr-line);
  border-radius:12px;
  padding:14px 16px;
  transition:border-color .15s, background .15s;
}
.gr-item:hover{ border-color:var(--gr-line-strong); background:rgba(255,255,255,.055); }
.gr-item-title{ font-weight:700; font-size:.85rem; color:var(--gr-title); word-break:break-all; }
.gr-item-meta{ font-size:.72rem; color:var(--gr-muted); margin-top:2px; }
.gr-item-text{ font-size:.85rem; margin:10px 0 0; color:var(--gr-text); line-height:1.55; }
.gr-link{ font-size:.75rem; color:#7FB2FF; text-decoration:none; }
.gr-link:hover{ text-decoration:underline; }
.gr-reply{
  margin-top:10px; font-size:.78rem; color:var(--gr-muted);
  background:rgba(255,255,255,.05); border-left:3px solid var(--gr-blue);
  border-radius:8px; padding:8px 12px;
}

/* ---------- KPIs ---------- */
.gr-kpis{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:20px; }
.gr-kpi{
  padding:14px 16px; border-radius:12px;
  background:rgba(255,255,255,.04); border:1px solid var(--gr-line);
}
.gr-kpi-label{ font-size:.66rem; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--gr-muted); }
.gr-kpi-value{ font-size:1.7rem; font-weight:800; margin-top:4px; color:var(--gr-title); line-height:1.1; }
.gr-kpi--red{ background:rgba(240,68,56,.09); border-color:rgba(240,68,56,.28); }
.gr-kpi--red .gr-kpi-value{ color:#FF8A80; }
.gr-kpi--amber{ background:rgba(245,158,11,.09); border-color:rgba(245,158,11,.28); }
.gr-kpi--amber .gr-kpi-value{ color:#FBBF24; }

/* ---------- Tabela ---------- */
.gr-table-wrap{ overflow-x:auto; border:1px solid var(--gr-line); border-radius:12px; }
.gr-table{ width:100%; border-collapse:collapse; font-size:.85rem; min-width:720px; }
.gr-table thead th{
  background:rgba(255,255,255,.05);
  color:var(--gr-muted);
  font-size:.66rem; font-weight:800; letter-spacing:.09em; text-transform:uppercase;
  padding:12px 14px; text-align:left; white-space:nowrap;
  border-bottom:1px solid var(--gr-line);
}
.gr-table tbody td{ padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.055); vertical-align:middle; }
.gr-table tbody tr:last-child td{ border-bottom:none; }
.gr-table tbody tr{ transition:background .15s; }
.gr-table tbody tr:hover{ background:rgba(255,255,255,.045); }
.gr-table tbody tr.is-risk{ background:rgba(240,68,56,.07); }
.gr-table tbody tr.is-risk:hover{ background:rgba(240,68,56,.12); }
.gr-cell-main{ font-weight:600; color:var(--gr-title); word-break:break-all; }
.gr-cell-sub{ font-size:.66rem; color:var(--gr-muted); text-transform:uppercase; letter-spacing:.04em; margin-top:2px; }
.gr-num{ text-align:center; font-weight:800; font-size:.95rem; }
.gr-num--ok{ color:#60A5FA; }
.gr-num--bad{ color:#FF8A80; }
.gr-num--zero{ color:var(--gr-muted); }
.gr-empty{ text-align:center; padding:36px 0; color:var(--gr-muted); font-size:.85rem; }

/* ---------- Paginação ---------- */
.gr-pager{
  display:flex; align-items:center; justify-content:center; gap:14px;
  margin-top:16px; font-size:.78rem; color:var(--gr-muted); flex-wrap:wrap;
}

/* ---------- Modal ---------- */
.gr-modal-overlay{
  position:fixed; inset:0; z-index:9999;
  background:rgba(5,12,25,.72); backdrop-filter:blur(6px);
  display:flex; align-items:center; justify-content:center; padding:20px;
}
.gr-modal{
  background:linear-gradient(180deg,#12294D 0%,#0C1D38 100%);
  border:1px solid var(--gr-line-strong);
  border-radius:18px;
  box-shadow:0 24px 60px rgba(0,0,0,.55);
  width:100%; max-width:620px; max-height:88vh; overflow-y:auto;
  padding:22px;
}
.gr-modal h3{ margin:0; font-size:1.05rem; color:var(--gr-title); font-weight:800; }
.gr-modal h5{ margin:0 0 10px; font-size:.82rem; color:var(--gr-title); font-weight:800; }
.gr-panel{ background:rgba(0,0,0,.22); border:1px solid var(--gr-line); border-radius:12px; padding:16px; }
.gr-divider{ border-top:1px solid var(--gr-line); margin:16px 0 14px; }

@media (max-width:640px){
  .gr-card-body{ padding:16px; }
  .gr-grid-2,.gr-grid-3{ grid-template-columns:1fr !important; }
}
`;


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

  // ==== Justificativas (sem wp-admin) ====
  const [justs, setJusts] = useState([]);
  const [justStatus, setJustStatus] = useState("pendente");
  // Cada monitor cuida so das justificativas da(s) turma(s) dele.
  const [justTurma, setJustTurma] = useState("todos");
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
  useEffect(() => { setJustPag(1); }, [justTurma]);

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

  // Abre o anexo da justificativa. A rota exige o token no header
  // Authorization, então não dá pra usar um <a href> comum (o navegador
  // navega direto pra URL sem mandar o header). Por isso buscamos com
  // fetch, montamos um Blob a partir do base64 devolvido pela API e
  // abrimos esse Blob numa nova aba.
  const abrirDocumentoJust = async (id) => {
    try {
      const res = await fetch(`${API_URL}/admin/justificativa/${id}/documento`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const d = await res.json();
      if (!res.ok || !d.documento) { alert(d.error || "Não foi possível abrir o anexo."); return; }

      const byteChars = atob(d.documento);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: d.tipo || "application/octet-stream" });
      const url = URL.createObjectURL(blob);

      const win = window.open(url, "_blank");
      if (!win) {
        // Pop-up bloqueado: baixa o arquivo em vez de abrir em nova aba.
        const a = document.createElement("a");
        a.href = url;
        a.download = d.nome || "documento";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      alert("Erro de conexão ao abrir o anexo.");
    }
  };

  if (carregando && !modalAberto)
    return (
      <div className="app-wrapper gr-page">
        <style>{GR_CSS}</style>
        <div className="gr-card">
          <div className="gr-card-body" style={{ textAlign: "center", padding: "48px 22px", color: "var(--gr-muted)" }}>
            ⏳ Carregando base de dados...
          </div>
        </div>
      </div>
    );

  const justsFiltradas =
    justTurma === "todos"
      ? justs
      : justs.filter((j) => String(j.turma || "") === justTurma);
  const totalPagJust = Math.max(1, Math.ceil(justsFiltradas.length / JUST_POR));
  const totalPagAl = Math.max(1, Math.ceil(alunosFiltrados.length / AL_POR));

  return (
    <div className="app-wrapper gr-page">
      <style>{GR_CSS}</style>

      {/* ======================= JUSTIFICATIVAS ======================= */}
      <div className="gr-card gr-card--accent" style={{ "--gr-accent": "#8B5CF6" }}>
        <div className="gr-card-body">
          <div className="gr-card-head">
            <h3>📝 Justificativas de falta</h3>
            <div className="gr-tabs gr-spacer">
              {["pendente", "aceita", "recusada", "todas"].map((s) => (
                <button
                  key={s}
                  className={`gr-tab${justStatus === s ? " is-active" : ""}`}
                  onClick={() => setJustStatus(s)}
                >
                  {s === "pendente" ? "Pendentes" : s === "aceita" ? "Aceitas" : s === "recusada" ? "Recusadas" : "Todas"}
                </button>
              ))}
            </div>
          </div>

          <div className="gr-field" style={{ maxWidth: 260, marginBottom: 14 }}>
            <label className="gr-label">Turma</label>
            <select
              className="gr-input"
              value={justTurma}
              onChange={(e) => setJustTurma(e.target.value)}
            >
              <option value="todos">Todas as turmas</option>
              {(turmasDisponiveis.length ? turmasDisponiveis : FORMACOES).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          {justsFiltradas.length === 0 ? (
            <div className="gr-empty">
              Nenhuma justificativa {justStatus !== "todas" ? justStatus : ""}
              {justTurma !== "todos" ? ` em ${nomeTurma(justTurma)}` : ""}.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {justsFiltradas.slice((justPag - 1) * JUST_POR, justPag * JUST_POR).map((j) => (
                <div key={j.id} className="gr-item">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div className="gr-item-title">{j.aluno_email}</div>
                      <div className="gr-item-meta">
                        {String(j.data).slice(0, 10).split("-").reverse().join("/")}
                        {j.turma ? " · " + nomeTurma(j.turma) : ""}
                      </div>
                    </div>
                    <span
                      className={`gr-badge ${
                        j.status === "aceita" ? "gr-badge--ok" : j.status === "recusada" ? "gr-badge--no" : "gr-badge--wait"
                      }`}
                    >
                      {j.status === "aceita" ? "Aceita (abonada)" : j.status === "recusada" ? "Recusada" : "Pendente"}
                    </span>
                  </div>

                  <p className="gr-item-text">{j.motivo}</p>

                  {j.documento_nome && (
                    <button
                      type="button"
                      className="gr-link"
                      onClick={() => abrirDocumentoJust(j.id)}
                      style={{
                        display: "inline-block",
                        marginTop: 8,
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        font: "inherit",
                      }}
                    >
                      📎 {j.documento_nome}
                    </button>
                  )}

                  {j.status === "pendente" && (
                    <div style={{ marginTop: 12 }}>
                      <input
                        className="gr-input"
                        placeholder="Mensagem ao aluno (opcional)"
                        value={justResp[j.id] || ""}
                        onChange={(e) => setJustResp({ ...justResp, [j.id]: e.target.value })}
                        style={{ marginBottom: 10 }}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="gr-btn gr-btn--green gr-btn--sm" onClick={() => responderJust(j.id, "aceita")}>
                          Aceitar (abonar)
                        </button>
                        <button className="gr-btn gr-btn--danger gr-btn--sm" onClick={() => responderJust(j.id, "recusada")}>
                          Recusar
                        </button>
                      </div>
                    </div>
                  )}

                  {j.resposta && (
                    <div className="gr-reply">
                      <b style={{ color: "var(--gr-title)" }}>Resposta:</b> {j.resposta}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {justsFiltradas.length > JUST_POR && (
            <div className="gr-pager">
              <button
                className="gr-btn gr-btn--ghost gr-btn--sm"
                onClick={() => setJustPag((p) => Math.max(1, p - 1))}
                disabled={justPag <= 1}
              >
                ‹ anterior
              </button>
              <span>Página {justPag} de {totalPagJust}</span>
              <button
                className="gr-btn gr-btn--ghost gr-btn--sm"
                onClick={() => setJustPag((p) => Math.min(totalPagJust, p + 1))}
                disabled={justPag >= totalPagJust}
              >
                próxima ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ======================= AUDITORIA / CADASTROS ======================= */}
      <div className="gr-card gr-card--accent" style={{ "--gr-accent": "#3B82F6" }}>
        <div className="gr-card-body">
          <div className="gr-card-head" style={{ alignItems: "flex-start" }}>
            <div>
              <h3>📊 Auditoria e Edição de Cadastros</h3>
              <p className="gr-sub" style={{ margin: "6px 0 0" }}>
                {filtroTurma === "todos"
                  ? "Presenças e faltas são contadas pelo calendário de cada turma."
                  : turmaInfo(filtroTurma)
                    ? `${nomeTurma(filtroTurma)}: ${turmaInfo(filtroTurma).aulasOcorridas} de ${turmaInfo(filtroTurma).totalAulas} aulas já ocorreram.`
                    : `${nomeTurma(filtroTurma)}: ${getAulasOcorridas(filtroTurma).length} de ${getTotalAulas(filtroTurma)} aulas já ocorreram.`}
              </p>
            </div>

            <div className="gr-spacer" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="gr-btn gr-btn--danger" onClick={exportarFaltosos}>
                ⬇ Exportar Faltosos
              </button>
              <select
                className="gr-input"
                style={{ width: 210 }}
                value={filtroTurma}
                onChange={(e) => setFiltroTurma(e.target.value)}
              >
                <option value="todos">Todas as Formações</option>
                {(turmasDisponiveis.length ? turmasDisponiveis : FORMACOES).map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              {typeof setView === "function" && (
                <button className="gr-btn gr-btn--ghost" onClick={() => setView("home")}>
                  🏠 Início
                </button>
              )}
              <button className="gr-btn gr-btn--ghost" onClick={() => setView("admin")}>
                Voltar
              </button>
            </div>
          </div>

          {/* BUSCA E ORDENAÇÃO */}
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <input
              type="text"
              className="gr-input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="🔍  Buscar por nome ou e-mail..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              className="gr-input"
              style={{ width: 240 }}
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value)}
            >
              <option value="nome">Ordenar: Nome (A-Z)</option>
              <option value="faltas">Ordenar: Mais faltas primeiro</option>
              <option value="presencas">Ordenar: Mais presenças primeiro</option>
            </select>
          </div>

          {/* RESUMO RÁPIDO */}
          <div className="gr-kpis">
            <div className="gr-kpi">
              <div className="gr-kpi-label">Alunos na lista</div>
              <div className="gr-kpi-value">{resumo.total}</div>
            </div>
            <div className="gr-kpi gr-kpi--red">
              <div className="gr-kpi-label">Em risco (+2 faltas)</div>
              <div className="gr-kpi-value">{resumo.emRisco}</div>
            </div>
            <div className="gr-kpi gr-kpi--amber">
              <div className="gr-kpi-label">Cadastro sem nome</div>
              <div className="gr-kpi-value">{resumo.semNome}</div>
            </div>
            <div className="gr-kpi">
              <div className="gr-kpi-label">Média de presenças</div>
              <div className="gr-kpi-value">{resumo.mediaPresencas}</div>
            </div>
          </div>

          {/* TABELA */}
          <div className="gr-table-wrap">
            <table className="gr-table">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>Aluno (e-mail)</th>
                  <th style={{ textAlign: "center", width: 110 }}>Presenças</th>
                  <th style={{ textAlign: "center", width: 90 }}>Faltas</th>
                  <th>Nome para certificado</th>
                  <th style={{ width: 120, textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {alunosFiltrados.slice((alPag - 1) * AL_POR, alPag * AL_POR).map((aluno) => {
                  const numFaltas = aluno.total_faltas || 0;
                  const status = statusSalva[aluno.email];

                  return (
                    <tr key={aluno.email} className={numFaltas > 2 ? "is-risk" : ""}>
                      <td>
                        <div className="gr-cell-main">{aluno.email}</div>
                        <div className="gr-cell-sub">{aluno.turma_nome || nomeTurma(aluno.formacao)}</div>
                      </td>
                      <td className="gr-num gr-num--ok">{aluno.total_presencas || 0}</td>
                      <td className={`gr-num ${numFaltas > 0 ? "gr-num--bad" : "gr-num--zero"}`}>{numFaltas}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="text"
                            className="gr-input"
                            style={{
                              padding: "7px 10px",
                              fontSize: ".82rem",
                              flex: 1,
                              borderColor:
                                status === "ok" ? "#10B981" : status === "erro" ? "#F04438" : undefined,
                            }}
                            defaultValue={aluno.nome || ""}
                            onBlur={(e) => salvarNome(aluno.email, e.target.value)}
                            placeholder="Nome não preenchido..."
                          />
                          <span style={{ width: 18, fontSize: ".8rem" }}>
                            {status === "salvando" && "⏳"}
                            {status === "ok" && "✅"}
                            {status === "erro" && "❌"}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button className="gr-btn gr-btn--ghost gr-btn--sm" onClick={() => verDetalhes(aluno)}>
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {alunosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="gr-empty">
                      Nenhum aluno encontrado com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {alunosFiltrados.length > AL_POR && (
            <div className="gr-pager">
              <button
                className="gr-btn gr-btn--ghost gr-btn--sm"
                onClick={() => setAlPag((p) => Math.max(1, p - 1))}
                disabled={alPag <= 1}
              >
                ‹ anterior
              </button>
              <span>
                Mostrando {Math.min((alPag - 1) * AL_POR + 1, alunosFiltrados.length)}–
                {Math.min(alPag * AL_POR, alunosFiltrados.length)} de {alunosFiltrados.length} · Página {alPag}/{totalPagAl}
              </span>
              <button
                className="gr-btn gr-btn--ghost gr-btn--sm"
                onClick={() => setAlPag((p) => Math.min(totalPagAl, p + 1))}
                disabled={alPag >= totalPagAl}
              >
                próxima ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ======================= MODAL ======================= */}
      {modalAberto && alunoSelecionado && (
        <div className="gr-modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="gr-modal" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <h3>{alunoSelecionado.nome || "Sem nome"}</h3>
                <div className="gr-item-meta">{alunoSelecionado.email}</div>
              </div>
              <div className="gr-tabs">
                <button
                  className={`gr-tab${!editando ? " is-active" : ""}`}
                  onClick={() => setEditando(false)}
                >
                  Histórico
                </button>
                <button
                  className={`gr-tab${editando ? " is-active" : ""}`}
                  onClick={() => setEditando(true)}
                >
                  Editar/Manual
                </button>
              </div>
            </div>

            {!editando ? (
              <div className="gr-table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="gr-table" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Presença marcada às</th>
                      <th>Fim da aula</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoAluno.map((h, i) => (
                      <tr key={i}>
                        <td>{new Date(h.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                        <td>{h.check_in || "--:--"}</td>
                        <td>{h.check_out || "--:--"}</td>
                      </tr>
                    ))}
                    {historicoAluno.length === 0 && (
                      <tr>
                        <td colSpan={3} className="gr-empty">Sem registros de frequência.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Editar cadastro */}
                <div className="gr-panel">
                  <h5>✏️ Editar Cadastro</h5>
                  <div className="gr-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input
                      className="gr-input"
                      value={dadosEdicao.nome}
                      onChange={(e) => setDadosEdicao({ ...dadosEdicao, nome: e.target.value })}
                      placeholder="Nome"
                    />
                    <input
                      className="gr-input"
                      value={dadosEdicao.email}
                      onChange={(e) => setDadosEdicao({ ...dadosEdicao, email: e.target.value })}
                      placeholder="Email"
                    />
                    <input
                      type="date"
                      className="gr-input"
                      value={dadosEdicao.data_nascimento}
                      onChange={(e) => setDadosEdicao({ ...dadosEdicao, data_nascimento: e.target.value })}
                      placeholder="Data de Nascimento"
                    />
                  </div>
                  <button className="gr-btn gr-btn--primary gr-btn--block" style={{ marginTop: 12 }} onClick={salvarEdicao}>
                    Salvar Alterações
                  </button>
                  <button
                    className="gr-btn gr-btn--danger gr-btn--block"
                    style={{ marginTop: 8 }}
                    onClick={() => resetarSessao(alunoSelecionado.email)}
                  >
                    Forçar Deslogar Aluno
                  </button>
                </div>

                {/* Ponto manual */}
                <div className="gr-panel">
                  <h5>➕ Marcar Presença Manual</h5>
                  <p className="gr-sub" style={{ margin: "0 0 12px" }}>
                    Uma marcação só: escolha a data; os horários já vêm do horário da aula da turma.
                  </p>
                  <div className="gr-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <input
                      type="date"
                      className="gr-input"
                      value={manualPonto.data}
                      onChange={(e) => setManualPonto({ ...manualPonto, data: e.target.value })}
                    />
                    <input
                      type="time"
                      className="gr-input"
                      value={manualPonto.check_in}
                      onChange={(e) => setManualPonto({ ...manualPonto, check_in: e.target.value })}
                    />
                    <input
                      type="time"
                      className="gr-input"
                      value={manualPonto.check_out}
                      onChange={(e) => setManualPonto({ ...manualPonto, check_out: e.target.value })}
                    />
                  </div>
                  <button className="gr-btn gr-btn--green gr-btn--block" style={{ marginTop: 12 }} onClick={registrarManual}>
                    Registrar Presença Manual
                  </button>

                </div>

                <button
                  className="gr-btn gr-btn--danger gr-btn--block"
                  onClick={excluirAluno}
                  disabled={carregando}
                >
                  🗑️ Excluir Cadastro Permanente
                </button>
              </div>
            )}

            <button
              className="gr-btn gr-btn--ghost gr-btn--block"
              style={{ marginTop: 18 }}
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
