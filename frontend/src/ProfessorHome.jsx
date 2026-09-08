import { useState, useEffect } from "react";
import { fetchComToken } from "./Api";

// Tela do PROFESSOR / MONITOR: check-in / check-out da aula + avaliacao da turma.
export default function ProfessorHome({ user }) {
  const [carregando, setCarregando] = useState(true);
  const [hoje, setHoje] = useState(null);       // { data, registro, turma }
  const [msg, setMsg] = useState(null);         // { tipo:'ok'|'erro', texto }
  const [enviando, setEnviando] = useState(false);
  const [mostrarAval, setMostrarAval] = useState(false);
  const [aval, setAval] = useState({ engajamento: 0, nivelamento: "", observacao: "" });
  const [tab, setTab] = useState("ponto");      // 'ponto' | 'turma'
  const [turma, setTurma] = useState(null);     // { alunos, total, presentes_hoje }
  const [carregandoTurma, setCarregandoTurma] = useState(false);

  const carregarTurma = async () => {
    setCarregandoTurma(true);
    try {
      const res = await fetchComToken("/professor/turma", "GET");
      const data = await res.json();
      if (res.ok) setTurma(data);
    } catch { /* silencioso */ }
    setCarregandoTurma(false);
  };
  useEffect(() => { if (tab === "turma" && !turma) carregarTurma(); }, [tab]);

  const carregar = async () => {
    try {
      const res = await fetchComToken("/professor/hoje", "GET");
      const data = await res.json();
      if (res.ok) setHoje(data);
      else setMsg({ tipo: "erro", texto: data.error || "Erro ao carregar." });
    } catch {
      setMsg({ tipo: "erro", texto: "Falha de conexao." });
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []);

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
    const precisaGps = hoje?.turma?.exigeLocalizacao;
    let loc = { latitude: null, longitude: null };
    if (precisaGps) {
      loc = await pegarLocal();
      if (loc.latitude == null) {
        setEnviando(false);
        setMsg({ tipo: "erro", texto: "Ative a localizacao do celular e permita o acesso no navegador." });
        return;
      }
    }
    try {
      const res = await fetchComToken("/professor/ponto", "POST", { tipo: "checkin", ...loc });
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
        tipo: "checkout",
        engajamento: aval.engajamento,
        nivelamento: aval.nivelamento,
        observacao: aval.observacao,
      });
      const data = await res.json();
      if (res.ok) { setMsg({ tipo: "ok", texto: "Check-out e avaliacao registrados as " + data.hora + "." }); setMostrarAval(false); await carregar(); }
      else setMsg({ tipo: "erro", texto: data.error || "Erro no check-out." });
    } catch { setMsg({ tipo: "erro", texto: "Falha de conexao." }); }
    setEnviando(false);
  };

  const reg = hoje?.registro;
  const temCheckin = !!reg?.check_in;
  const temCheckout = !!reg?.check_out;
  const hhmm = (ts) => (ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--");

  return (
    <main className="aluno-main-wrapper" style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      <div className="aula-card shadow-card" style={{ width: "100%", boxSizing: "border-box", marginBottom: "20px" }}>
        <div className="card-header-info" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h2 style={{ color: "var(--text-dim)", margin: 0 }}>Ola, {user.nome}!</h2>
          <span className="user-badge" style={{ fontSize: "0.8rem", padding: "2px 10px" }}>
            {user.tipo === "monitor" ? "Monitor" : "Professor"}
            {hoje?.turma?.nome ? " \u00b7 " + hoje.turma.nome : ""}
          </span>
        </div>

        <div style={{ display: "inline-flex", border: "1px solid #E4EAF3", borderRadius: 10, overflow: "hidden", margin: "14px 0 4px" }}>
          <button type="button" onClick={() => setTab("ponto")}
            style={{ padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
              background: tab === "ponto" ? "#193A70" : "#fff", color: tab === "ponto" ? "#fff" : "#193A70" }}>
            Meu ponto
          </button>
          <button type="button" onClick={() => setTab("turma")}
            style={{ padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
              background: tab === "turma" ? "#193A70" : "#fff", color: tab === "turma" ? "#fff" : "#193A70" }}>
            Minha turma
          </button>
        </div>

        {msg && (
          <div className={msg.tipo === "ok" ? "info-banner" : "info-banner"}
               style={{ margin: "14px 0", borderLeft: "5px solid " + (msg.tipo === "ok" ? "#16A34A" : "#D4453F") }}>
            {msg.texto}
          </div>
        )}

        {tab === "ponto" && (<>
        {carregando ? (
          <p style={{ color: "var(--text-dim)", padding: "10px 0" }}>Carregando...</p>
        ) : temCheckout ? (
          <div className="info-banner" style={{ margin: "14px 0", borderLeft: "5px solid #16A34A" }}>
            <b>Presenca do dia concluida.</b>
            <p style={{ marginTop: 6 }}>Check-in {hhmm(reg.check_in)} \u00b7 Check-out {hhmm(reg.check_out)}. Avaliacao enviada. Bom trabalho!</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", margin: "16px 0" }}>
              <div style={{ flex: 1, minWidth: 150, background: "#214d7d", border: "1px solid var(--border,#DBE5FA)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Check-in</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{hhmm(reg?.check_in)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 150, background: "#214d7d", border: "1px solid var(--border,#DBE5FA)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Check-out</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{hhmm(reg?.check_out)}</div>
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
              <div style={{ border: "1px solid var(--border,#DBE5FA)", borderRadius: 12, padding: "16px", marginTop: 8 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Avaliacao da aula</h3>

                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Engajamento da turma</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setAval({ ...aval, engajamento: n })}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer",
                        border: "1px solid " + (aval.engajamento === n ? "#2563EB" : "#C9D4E5"),
                        background: aval.engajamento === n ? "#2563EB" : "#fff",
                        color: aval.engajamento === n ? "#fff" : "#334155", fontWeight: 700 }}>
                      {n}
                    </button>
                  ))}
                </div>

                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Nivelamento da turma</label>
                <select value={aval.nivelamento} onChange={(e) => setAval({ ...aval, nivelamento: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #C9D4E5", borderRadius: 9, marginBottom: 14 }}>
                  <option value="">Selecione...</option>
                  <option value="abaixo">Abaixo do esperado</option>
                  <option value="adequado">Adequado</option>
                  <option value="avancado">Avancado</option>
                </select>

                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Observacoes (opcional)</label>
                <textarea value={aval.observacao} onChange={(e) => setAval({ ...aval, observacao: e.target.value })}
                  rows={3} placeholder="Como foi a aula, dificuldades, destaques..."
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #C9D4E5", borderRadius: 9, marginBottom: 14, fontFamily: "inherit" }} />

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn-ponto" onClick={() => setMostrarAval(false)} disabled={enviando}
                    style={{ flex: 1, background: "#fff", color: "#334155", border: "1px solid #C9D4E5" }}>
                    Voltar
                  </button>
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
            {carregandoTurma ? (
              <p style={{ color: "var(--text-dim)", padding: "10px 0" }}>Carregando turma...</p>
            ) : !turma ? (
              <p style={{ color: "var(--text-dim)", padding: "10px 0" }}>Nao foi possivel carregar.</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, margin: "16px 0", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 120, background: "#214d7d", border: "1px solid #DBE5FA", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Alunos na turma</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{turma.total}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, background: "#214d7d", border: "1px solid #DBE5FA", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Presentes hoje</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#16A34A" }}>{turma.presentes_hoje}</div>
                  </div>
                </div>
                <div style={{ border: "1px solid #E4EAF3", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", background: "#193A70", color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 12px" }}>
                    <span style={{ flex: 1 }}>Aluno</span>
                    <span style={{ width: 90, textAlign: "center" }}>Presencas</span>
                    <span style={{ width: 70, textAlign: "center" }}>Hoje</span>
                  </div>
                  {turma.alunos.map((a) => (
                    <div key={a.email} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderTop: "1px solid #F0F3F9", fontSize: 13 }}>
                      <span style={{ flex: 1 }}>{a.nome}</span>
                      <span style={{ width: 90, textAlign: "center", fontWeight: 700 }}>{a.presencas}</span>
                      <span style={{ width: 70, textAlign: "center" }}>
                        {a.presente_hoje
                          ? <b style={{ color: "#16A34A" }}>&#10003;</b>
                          : <span style={{ color: "#B3302F" }}>&mdash;</span>}
                      </span>
                    </div>
                  ))}
                  {turma.alunos.length === 0 && (
                    <div style={{ padding: "16px", textAlign: "center", color: "var(--text-dim)" }}>Nenhum aluno vinculado a esta turma.</div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
