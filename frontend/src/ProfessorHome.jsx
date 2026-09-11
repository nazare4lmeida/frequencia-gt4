import { useState, useEffect } from "react";
import { fetchComToken } from "./Api";
import * as XLSX from "xlsx";

export default function ProfessorHome({ user }) {
  const [carregando, setCarregando] = useState(true);
  const [hoje, setHoje] = useState(null);
  const [msg, setMsg] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarAval, setMostrarAval] = useState(false);
  const [aval, setAval] = useState({ engajamento: 0, nivelamento: "", observacao: "" });
  const [tab, setTab] = useState("ponto");
  const turmasProf = (user.turmas && user.turmas.length) ? user.turmas : (user.turma ? [user.turma] : []);
  const [selTurma, setSelTurma] = useState(turmasProf[0] || "");
  const qs = (extra) => "?turma=" + encodeURIComponent(selTurma || "") + (extra || "");

  const [rel, setRel] = useState(null);
  const [carregandoRel, setCarregandoRel] = useState(false);
  const [dataSel, setDataSel] = useState("");
  const [salvandoCpf, setSalvandoCpf] = useState("");
  const [hist, setHist] = useState(null);
  const [carregandoHist, setCarregandoHist] = useState(false);

  const carregarHist = async () => {
    setCarregandoHist(true);
    try {
      const res = await fetchComToken("/professor/meus-pontos", "GET");
      const d = await res.json();
      if (res.ok) setHist(d.pontos || []);
    } catch { /* silencioso */ }
    setCarregandoHist(false);
  };
  useEffect(() => { if (tab === "historico" && !hist) carregarHist(); }, [tab]);

  const hhmm = (ts) => (ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" }) : "--:--");
  const dLabel = (iso) => {
    if (!iso) return "";
    const [a, m, d] = iso.split("-");
    const dow = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(iso + "T12:00:00").getDay()];
    return d + "/" + m + "/" + a + " (" + dow + ")";
  };

  const carregar = async () => {
    try {
      const res = await fetchComToken("/professor/hoje" + qs(), "GET");
      const data = await res.json();
      if (res.ok) setHoje(data);
      else setMsg({ tipo: "erro", texto: data.error || "Erro ao carregar." });
    } catch { setMsg({ tipo: "erro", texto: "Falha de conexao." }); }
    finally { setCarregando(false); }
  };
  useEffect(() => { carregar(); }, []);
  useEffect(() => { if (selTurma) { setRel(null); carregar(); if (tab === "turma") carregarRel(); } }, [selTurma]);

  const carregarRel = async () => {
    setCarregandoRel(true);
    try {
      const res = await fetchComToken("/professor/relatorio" + qs(), "GET");
      const data = await res.json();
      if (res.ok) {
        setRel(data);
        const datas = [...new Set((data.registros || []).map((r) => String(r.data).slice(0, 10)))].sort().reverse();
        if (datas.length && !dataSel) setDataSel(datas[0]);
      }
    } catch { /* silencioso */ }
    setCarregandoRel(false);
  };
  useEffect(() => { if (tab === "turma" && !rel) carregarRel(); }, [tab]);

  const pegarLocal = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ latitude: null, longitude: null });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resolve({ latitude: null, longitude: null }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const fazerCheckin = async () => {
    setEnviando(true); setMsg(null);
    let loc = { latitude: null, longitude: null };
    if (hoje?.turma?.exigeLocalizacao) {
      loc = await pegarLocal();
      if (loc.latitude == null) {
        setEnviando(false);
        setMsg({ tipo: "erro", texto: "Ative a localizacao do celular e permita o acesso no navegador." });
        return;
      }
    }
    try {
      const res = await fetchComToken("/professor/ponto", "POST", { tipo: "checkin", turma: selTurma, ...loc });
      const data = await res.json();
      if (res.ok) { setMsg({ tipo: "ok", texto: "Check-in registrado as " + data.hora + "." }); await carregar(); }
      else setMsg({ tipo: "erro", texto: data.error || "Erro no check-in." });
    } catch { setMsg({ tipo: "erro", texto: "Falha de conexao." }); }
    setEnviando(false);
  };

  const fazerCheckout = async () => {
    if (!(aval.engajamento >= 1 && aval.engajamento <= 5) || !aval.nivelamento) {
      setMsg({ tipo: "erro", texto: "Preencha o engajamento e o nivelamento da turma." });
      return;
    }
    setEnviando(true); setMsg(null);
    try {
      const res = await fetchComToken("/professor/ponto", "POST", {
        tipo: "checkout", turma: selTurma, engajamento: aval.engajamento, nivelamento: aval.nivelamento, observacao: aval.observacao,
      });
      const data = await res.json();
      if (res.ok) { setMsg({ tipo: "ok", texto: "Check-out e avaliacao registrados as " + data.hora + "." }); setMostrarAval(false); await carregar(); }
      else setMsg({ tipo: "erro", texto: data.error || "Erro no check-out." });
    } catch { setMsg({ tipo: "erro", texto: "Falha de conexao." }); }
    setEnviando(false);
  };

  const togglePresenca = async (email, presenteAtual) => {
    setSalvandoCpf(email);
    try {
      const res = await fetchComToken("/professor/presenca", "POST", { aluno_email: email, data: dataSel, presente: !presenteAtual, turma: selTurma });
      if (res.ok) await carregarRel();
    } catch { /* silencioso */ }
    setSalvandoCpf("");
  };

  const exportarExcel = () => {
    if (!rel) return;
    const nomePorEmail = {};
    (rel.alunos || []).forEach((a) => { nomePorEmail[a.email] = a.nome || a.email; });
    const linhas = (rel.registros || [])
      .slice()
      .sort((x, y) => String(x.data).localeCompare(String(y.data)) || String(nomePorEmail[x.aluno_email]).localeCompare(String(nomePorEmail[y.aluno_email])))
      .map((r) => ({
        Data: String(r.data).slice(0, 10).split("-").reverse().join("/"),
        "Check-in": hhmm(r.check_in),
        "Check-out": hhmm(r.check_out),
        Aluno: nomePorEmail[r.aluno_email] || r.aluno_email,
        "E-mail": r.aluno_email,
        Presente: r.check_in ? "Sim" : "Nao",
      }));
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Data: "", "Check-in": "", "Check-out": "", Aluno: "", "E-mail": "", Presente: "" }]);
    ws["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 32 }, { wch: 30 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presencas");
    const nome = (rel.turma?.nome || "turma").replace(/[^a-zA-Z0-9-]/g, "_");
    XLSX.writeFile(wb, "presencas_" + nome + ".xlsx");
  };

  const reg = hoje?.registro;
  const temCheckin = !!reg?.check_in;
  const temCheckout = !!reg?.check_out;

  const datasDisp = rel ? [...new Set((rel.registros || []).map((r) => String(r.data).slice(0, 10)))].sort().reverse() : [];
  const regsDoDia = rel ? (rel.registros || []).filter((r) => String(r.data).slice(0, 10) === dataSel) : [];
  const statusDoDia = {};
  regsDoDia.forEach((r) => { statusDoDia[r.aluno_email] = r; });
  const presentesNoDia = regsDoDia.filter((r) => r.check_in).length;

  const CARD = { background: "#214d7d", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "14px 16px" };

  return (
    <main className="aluno-main-wrapper" style={{ maxWidth: "840px", margin: "0 auto", padding: "20px" }}>
      <div className="aula-card shadow-card" style={{ width: "100%", boxSizing: "border-box", marginBottom: "20px" }}>
        <div className="card-header-info" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h2 style={{ color: "var(--text-dim)", margin: 0 }}>Ola, {user.nome}!</h2>
          <span className="user-badge" style={{ fontSize: "0.8rem", padding: "2px 10px" }}>
            {user.tipo === "monitor" ? "Monitor" : "Professor"}{hoje?.turma?.nome ? " \u00b7 " + hoje.turma.nome : ""}
          </span>
        </div>

        <div style={{ display: "inline-flex", background: "rgba(255,255,255,.06)", borderRadius: 12, padding: 4, gap: 4, margin: "16px 0 6px" }}>
          {[["ponto", "Meu ponto"], ["turma", "Minha turma"], ["historico", "Historico"]].map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              style={{ padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", borderRadius: 9,
                background: tab === k ? "#2563EB" : "transparent", color: tab === k ? "#fff" : "var(--text-dim)" }}>
              {lbl}
            </button>
          ))}
        </div>

        {turmasProf.length > 1 && (
          <div style={{ margin: "12px 0 2px" }}>
            <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 6 }}>Turma que voce esta dando aula</label>
            <select value={selTurma} onChange={(e) => setSelTurma(e.target.value)}
              style={{ width: "100%", maxWidth: 380, padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.2)", background: "#0f2647", color: "#fff" }}>
              {turmasProf.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {msg && (
          <div className="info-banner" style={{ margin: "14px 0", borderLeft: "5px solid " + (msg.tipo === "ok" ? "#16A34A" : "#D4453F") }}>
            {msg.texto}
          </div>
        )}

        {tab === "ponto" && (<>
          {reg?.corrigido && (
            <div className="info-banner" style={{ margin: "14px 0", borderLeft: "5px solid #D98A1F" }}>
              &#9998; Este registro foi <b>corrigido pela coordena&ccedil;&atilde;o</b>.
            </div>
          )}
          {carregando ? (
            <p style={{ color: "var(--text-dim)", padding: "10px 0" }}>Carregando...</p>
          ) : temCheckout ? (
            <div className="info-banner" style={{ margin: "14px 0", borderLeft: "5px solid #16A34A" }}>
              <b>Presenca do dia concluida.</b>
              <p style={{ marginTop: 6 }}>Check-in {hhmm(reg.check_in)} &middot; Check-out {hhmm(reg.check_out)}. Avaliacao enviada. Bom trabalho!</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}>
                <div style={{ flex: 1, minWidth: 150, ...CARD }}>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Check-in</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{hhmm(reg?.check_in)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 150, ...CARD }}>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Check-out</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{hhmm(reg?.check_out)}</div>
                </div>
              </div>

              {hoje?.turma?.exigeLocalizacao && (
                <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>
                  &#128205; Voce precisa estar na sede da sua turma{hoje?.turma?.sede ? " (" + hoje.turma.sede + ")" : ""} para registrar.
                </p>
              )}

              {!temCheckin ? (
                <button className="btn-ponto in" onClick={fazerCheckin} disabled={enviando} style={{ width: "100%" }}>
                  {enviando ? "Registrando..." : "Fazer check-in da aula"}
                </button>
              ) : !mostrarAval ? (
                <button className="btn-ponto out" onClick={() => setMostrarAval(true)} disabled={enviando} style={{ width: "100%" }}>
                  Fazer check-out (avaliar a aula)
                </button>
              ) : (
                <div style={{ ...CARD, marginTop: 8 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#fff" }}>Avaliacao da aula</h3>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, color: "var(--text-dim)" }}>Engajamento da turma</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setAval({ ...aval, engajamento: n })}
                        style={{ flex: 1, padding: "12px 0", borderRadius: 8, cursor: "pointer", fontSize: 15, fontWeight: 800,
                          border: "1px solid " + (aval.engajamento === n ? "#2563EB" : "rgba(255,255,255,.2)"),
                          background: aval.engajamento === n ? "#2563EB" : "transparent",
                          color: aval.engajamento === n ? "#fff" : "var(--text-dim)" }}>{n}</button>
                    ))}
                  </div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, color: "var(--text-dim)" }}>Nivelamento da turma</label>
                  <select value={aval.nivelamento} onChange={(e) => setAval({ ...aval, nivelamento: e.target.value })}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 9, marginBottom: 14, border: "1px solid rgba(255,255,255,.2)", background: "#0f2647", color: "#fff" }}>
                    <option value="">Selecione...</option>
                    <option value="abaixo">Abaixo do esperado</option>
                    <option value="adequado">Adequado</option>
                    <option value="avancado">Avancado</option>
                  </select>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, color: "var(--text-dim)" }}>Observacoes (opcional)</label>
                  <textarea value={aval.observacao} onChange={(e) => setAval({ ...aval, observacao: e.target.value })} rows={3}
                    placeholder="Como foi a aula, dificuldades, destaques..."
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 9, marginBottom: 14, fontFamily: "inherit", border: "1px solid rgba(255,255,255,.2)", background: "#0f2647", color: "#fff" }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn-ponto" onClick={() => setMostrarAval(false)} disabled={enviando}
                      style={{ flex: 1, background: "transparent", color: "var(--text-dim)", border: "1px solid rgba(255,255,255,.25)" }}>Voltar</button>
                    <button className="btn-ponto out" onClick={fazerCheckout} disabled={enviando} style={{ flex: 2 }}>
                      {enviando ? "Enviando..." : "Confirmar check-out"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>)}

        {tab === "turma" && (
          <>
            {carregandoRel ? (
              <p style={{ color: "var(--text-dim)", padding: "10px 0" }}>Carregando turma...</p>
            ) : !rel ? (
              <p style={{ color: "var(--text-dim)", padding: "10px 0" }}>Nao foi possivel carregar.</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "16px 0" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 6 }}>Data da aula</label>
                    <select value={dataSel} onChange={(e) => setDataSel(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.2)", background: "#0f2647", color: "#fff" }}>
                      {datasDisp.length === 0 && <option value="">Sem datas com presenca</option>}
                      {datasDisp.map((d) => <option key={d} value={d}>{dLabel(d)}</option>)}
                    </select>
                  </div>
                  <button onClick={exportarExcel}
                    style={{ padding: "11px 18px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: "#0E7C57", color: "#fff" }}>
                    &#128190; Exportar Excel
                  </button>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 120, ...CARD }}>
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Alunos na turma</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{rel.alunos.length}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, ...CARD }}>
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Presentes nesta data</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#16A34A" }}>{presentesNoDia}</div>
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", background: "#0f2647", color: "#fff", fontSize: 12, fontWeight: 700, padding: "9px 12px" }}>
                    <span style={{ flex: 1 }}>Aluno</span>
                    <span style={{ width: 70, textAlign: "center" }}>Check-in</span>
                    <span style={{ width: 130, textAlign: "center" }}>Presenca</span>
                  </div>
                  {rel.alunos.map((a) => {
                    const r = statusDoDia[a.email];
                    const presente = !!r?.check_in;
                    return (
                      <div key={a.email} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 13, color: "#fff" }}>
                        <span style={{ flex: 1 }}>{a.nome}</span>
                        <span style={{ width: 70, textAlign: "center", color: "var(--text-dim)" }}>{presente ? hhmm(r.check_in) : "--:--"}</span>
                        <span style={{ width: 130, textAlign: "center" }}>
                          <button type="button" disabled={!dataSel || salvandoCpf === a.email}
                            onClick={() => togglePresenca(a.email, presente)}
                            style={{ padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, border: "1px solid",
                              borderColor: presente ? "#16A34A" : "#B3302F",
                              background: presente ? "rgba(22,163,74,.15)" : "rgba(179,48,47,.12)",
                              color: presente ? "#4ade80" : "#fca5a5" }}>
                            {salvandoCpf === a.email ? "..." : presente ? "Presente" : "Falta"}
                          </button>
                        </span>
                      </div>
                    );
                  })}
                  {rel.alunos.length === 0 && (
                    <div style={{ padding: 16, textAlign: "center", color: "var(--text-dim)" }}>Nenhum aluno vinculado a esta turma.</div>
                  )}
                </div>
                <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 10 }}>
                  Toque em <b>Presente/Falta</b> para editar a presenca do aluno nesta data. O botao <b>Exportar Excel</b> baixa todas as datas e alunos.
                </p>
              </>
            )}
          </>
        )}
        {tab === "historico" && (
          <>
            {carregandoHist ? (
              <p style={{ color: "var(--text-dim)", padding: "10px 0" }}>Carregando historico...</p>
            ) : (
              <div style={{ border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, overflow: "hidden", marginTop: 14 }}>
                <div style={{ display: "flex", background: "#0f2647", color: "#fff", fontSize: 12, fontWeight: 700, padding: "9px 12px" }}>
                  <span style={{ width: 96 }}>Dia</span>
                  <span style={{ flex: 1 }}>Turma</span>
                  <span style={{ width: 64, textAlign: "center" }}>Entrada</span>
                  <span style={{ width: 64, textAlign: "center" }}>Saida</span>
                  <span style={{ width: 92, textAlign: "center" }}>Origem</span>
                </div>
                {(hist || []).map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 13, color: "#fff" }}>
                    <span style={{ width: 96 }}>{dLabel(h.data)}</span>
                    <span style={{ flex: 1 }}>{h.turma || "\u2014"}</span>
                    <span style={{ width: 64, textAlign: "center", color: "var(--text-dim)" }}>{hhmm(h.check_in)}</span>
                    <span style={{ width: 64, textAlign: "center", color: "var(--text-dim)" }}>{hhmm(h.check_out)}</span>
                    <span style={{ width: 92, textAlign: "center" }}>
                      {h.corrigido
                        ? <span style={{ background: "rgba(217,138,31,.18)", color: "#fbbf24", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 100 }}>Corrigido</span>
                        : (h.origem === "manual"
                            ? <span style={{ background: "rgba(37,99,235,.18)", color: "#93c5fd", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 100 }}>Manual</span>
                            : <span style={{ color: "var(--text-dim)", fontSize: 11 }}>App</span>)}
                    </span>
                  </div>
                ))}
                {(!hist || hist.length === 0) && (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--text-dim)" }}>Nenhum registro ainda.</div>
                )}
              </div>
            )}
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 10 }}>
              Todos os seus check-ins, aulas extras e corre&ccedil;&otilde;es da coordena&ccedil;&atilde;o aparecem aqui. "Corrigido" indica ajuste feito pela coordena&ccedil;&atilde;o.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
