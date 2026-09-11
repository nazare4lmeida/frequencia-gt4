import { useState, useEffect } from "react";
import { fetchComToken } from "./Api";

// Aluno justifica uma falta: data + motivo + documento opcional (base64).
export default function JustificarFalta() {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [itens, setItens] = useState([]);

  const carregar = async () => {
    try {
      const res = await fetchComToken("/justificativas/minhas", "GET");
      const d = await res.json();
      if (res.ok) setItens(d.itens || []);
    } catch { /* silencioso */ }
  };
  useEffect(() => { if (aberto) carregar(); }, [aberto]);

  const lerArquivo = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]); // so o base64
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const enviar = async () => {
    if (!data || motivo.trim().length < 3) {
      setMsg({ tipo: "erro", texto: "Informe a data e o motivo." });
      return;
    }
    setEnviando(true); setMsg(null);
    try {
      let doc = null, nome = null, tipo = null;
      if (arquivo) {
        if (arquivo.size > 2 * 1024 * 1024) {
          setEnviando(false);
          setMsg({ tipo: "erro", texto: "Documento muito grande (limite de 2 MB)." });
          return;
        }
        doc = await lerArquivo(arquivo); nome = arquivo.name; tipo = arquivo.type;
      }
      const res = await fetchComToken("/justificativa", "POST", {
        data, motivo, documento: doc, documento_nome: nome, documento_tipo: tipo,
      });
      const d = await res.json();
      if (res.ok) {
        setMsg({ tipo: "ok", texto: "Justificativa enviada. A coordenacao vai analisar." });
        setData(""); setMotivo(""); setArquivo(null); carregar();
      } else setMsg({ tipo: "erro", texto: d.error || "Erro ao enviar." });
    } catch { setMsg({ tipo: "erro", texto: "Falha de conexao." }); }
    setEnviando(false);
  };

  const dLabel = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
  const pill = (s) => ({
    aceita: { bg: "rgba(22,163,74,.15)", cor: "#4ade80", txt: "Aceita" },
    recusada: { bg: "rgba(179,48,47,.15)", cor: "#fca5a5", txt: "Recusada" },
  }[s] || { bg: "rgba(255,255,255,.08)", cor: "#cbd5e1", txt: "Pendente" });

  return (
    <div className="aula-card shadow-card" style={{ width: "100%", boxSizing: "border-box", marginTop: 16 }}>
      <div onClick={() => setAberto(!aberto)}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <span style={{ fontSize: 20 }}>&#128221;</span>
        <div style={{ flex: 1 }}>
          <b style={{ color: "var(--text-dim)" }}>Justificar uma falta</b>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", opacity: .8 }}>Avise que vai faltar, com o motivo e um documento (opcional).</div>
        </div>
        <span style={{ color: "var(--text-dim)" }}>{aberto ? "\u25be" : "\u25b8"}</span>
      </div>

      {aberto && (
        <div style={{ marginTop: 16 }}>
          {msg && (
            <div className="info-banner" style={{ margin: "0 0 14px", borderLeft: "5px solid " + (msg.tipo === "ok" ? "#16A34A" : "#D4453F") }}>
              {msg.texto}
            </div>
          )}

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", display: "block", marginBottom: 6 }}>Data da falta</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.2)", background: "#0f2647", color: "#fff", marginBottom: 14 }} />

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", display: "block", marginBottom: 6 }}>Motivo</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
            placeholder="Descreva o motivo da falta..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.2)", background: "#0f2647", color: "#fff", marginBottom: 14, fontFamily: "inherit" }} />

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", display: "block", marginBottom: 6 }}>Documento (opcional &mdash; PDF ou imagem, ate 2 MB)</label>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setArquivo(e.target.files[0] || null)}
            style={{ width: "100%", color: "var(--text-dim)", marginBottom: 16 }} />

          <button className="btn-ponto in" onClick={enviar} disabled={enviando} style={{ width: "100%" }}>
            {enviando ? "Enviando..." : "Enviar justificativa"}
          </button>

          {itens.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>Minhas justificativas</div>
              {itens.map((j, i) => {
                const p = pill(j.status);
                return (
                  <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid rgba(255,255,255,.06)" : "none", fontSize: 13, color: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <b style={{ width: 90 }}>{dLabel(j.data)}</b>
                      <span style={{ flex: 1, color: "var(--text-dim)" }}>{j.motivo}{j.documento_nome ? " \u00b7 \u{1F4CE}" : ""}</span>
                      <span style={{ background: p.bg, color: p.cor, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 100 }}>{p.txt}</span>
                    </div>
                    {j.resposta ? (
                      <div style={{ marginTop: 6, marginLeft: 90, background: "rgba(255,255,255,.05)", borderLeft: "3px solid #2563EB", borderRadius: 6, padding: "7px 10px", fontSize: 12.5, color: "var(--text-dim)" }}>
                        <b style={{ color: "#93c5fd" }}>Coordena&ccedil;&atilde;o:</b> {j.resposta}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
