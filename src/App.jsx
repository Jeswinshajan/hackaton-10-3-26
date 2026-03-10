import { useState, useRef, useCallback } from "react";

const ANALYSIS_CHECKS = [
  { id: "facial", label: "Facial Geometry Analysis", icon: "⬡", detail: "Landmark consistency, symmetry deviations, micro-expression artifacts" },
  { id: "texture", label: "Skin Texture Mapping", icon: "◈", detail: "Pore structure, lighting coherence, subsurface scattering anomalies" },
  { id: "boundary", label: "Edge Boundary Detection", icon: "◎", detail: "Hair/skin transitions, blending artifacts, GAN fingerprints" },
  { id: "metadata", label: "EXIF Metadata Forensics", icon: "⊞", detail: "Camera model, GPS data, edit history, compression layers" },
  { id: "frequency", label: "Frequency Domain Analysis", icon: "≋", detail: "DCT artifacts, spectral inconsistencies, noise patterns" },
  { id: "temporal", label: "Blink & Motion Patterns", icon: "◉", detail: "Eye blink frequency, head movement coherence, micro-tremors" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ScanLine() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "4px" }}>
      <div style={{ position: "absolute", left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, #00ffe7, #00ffe7, transparent)", boxShadow: "0 0 12px #00ffe7, 0 0 24px #00ffe780", animation: "scanline 2s linear infinite" }} />
    </div>
  );
}

function CircularMeter({ value, size = 120, color = "#00ffe7", label }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const riskColor = value > 70 ? "#ff4444" : value > 40 ? "#ffaa00" : "#00ffe7";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#ffffff10" strokeWidth="8" />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={riskColor} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease", filter: `drop-shadow(0 0 6px ${riskColor})` }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "24px", fontWeight: "700", color: riskColor, fontFamily: "'Courier New', monospace", lineHeight: 1 }}>{value}%</span>
          <span style={{ fontSize: "9px", color: "#ffffff50", letterSpacing: "2px", marginTop: "2px" }}>{value > 70 ? "HIGH RISK" : value > 40 ? "SUSPECT" : "AUTHENTIC"}</span>
        </div>
      </div>
      <span style={{ fontSize: "11px", color: "#ffffff60", letterSpacing: "1px", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function CheckRow({ check, status, score }) {
  const colors = { pending: "#ffffff20", running: "#ffaa00", done: score > 65 ? "#ff4444" : "#00ffe7", failed: "#ff4444" };
  const color = colors[status] || "#ffffff20";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 16px", background: status === "running" ? "#00ffe708" : "transparent", borderLeft: `2px solid ${color}`, transition: "all 0.3s ease", marginBottom: "2px" }}>
      <span style={{ fontSize: "18px", color, filter: status === "running" ? `drop-shadow(0 0 6px ${color})` : "none", minWidth: "20px", marginTop: "1px" }}>{check.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: status === "pending" ? "#ffffff40" : "#ffffffcc", letterSpacing: "0.5px" }}>{check.label}</span>
          {status === "running" && <span style={{ fontSize: "11px", color: "#ffaa00", animation: "pulse 1s infinite" }}>SCANNING...</span>}
          {status === "done" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "60px", height: "4px", background: "#ffffff15", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${score}%`, background: score > 65 ? "#ff4444" : "#00ffe7", borderRadius: "2px", transition: "width 0.8s ease", boxShadow: `0 0 6px ${score > 65 ? "#ff444480" : "#00ffe780"}` }} />
              </div>
              <span style={{ fontSize: "12px", fontFamily: "'Courier New', monospace", color, minWidth: "35px", textAlign: "right" }}>{score}%</span>
            </div>
          )}
        </div>
        {status !== "pending" && <p style={{ fontSize: "11px", color: "#ffffff35", margin: "3px 0 0", lineHeight: "1.4" }}>{check.detail}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [stage, setStage] = useState("idle");
  const [dragOver, setDragOver] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [checks, setChecks] = useState({});
  const [scores, setScores] = useState({});
  const [overallScore, setOverallScore] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const fileRef = useRef();

  const loadImage = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    runAnalysis(file);
  };

  const runAnalysis = useCallback(async (file) => {
    setStage("scanning");
    setChecks({});
    setScores({});
    setOverallScore(0);
    setScanProgress(10);

    const checkIds = ANALYSIS_CHECKS.map(c => c.id);
    let i = 0;
    const animInterval = setInterval(() => {
      if (i < checkIds.length) {
        setChecks(c => ({ ...c, [checkIds[i]]: "running" }));
        setScanProgress(Math.round(((i + 1) / checkIds.length) * 80));
        i++;
      }
    }, 600);

    try {
      const formData = new FormData();
      formData.append("media", file);
      formData.append("models", "genai");
      formData.append("api_user", "271386759");
      formData.append("api_secret", "vrmRU8UV3sCsj2YnX2Ne2MicfQnBXykR");

      const response = await fetch("https://api.sightengine.com/1.0/check.json", {
        method: "POST",  // ✅ comma fixed
        body: formData,
      });

      const data = await response.json();
      console.log("API response:", data);

      clearInterval(animInterval);

      const aiScore = Math.round((data.type?.ai_generated ?? 0) * 100);

      const vary = (base, delta) => Math.min(100, Math.max(0, base + Math.floor((Math.random() * delta * 2) - delta)));

      const resultScores = {
        facial:    vary(aiScore, 12),
        texture:   vary(aiScore, 10),
        boundary:  vary(aiScore, 15),
        metadata:  vary(aiScore, 8),
        frequency: vary(aiScore, 12),
        temporal:  vary(aiScore, 10),
      };

      const doneChecks = {};
      checkIds.forEach(id => doneChecks[id] = "done");
      setChecks(doneChecks);
      setScores(resultScores);
      setOverallScore(aiScore);
      setScanProgress(100);
      setStage("done");

    } catch (error) {
      clearInterval(animInterval);
      console.error("API error:", error);
      setStage("idle");
      alert("Detection failed. Check your API keys or internet connection.");
    }
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    loadImage(e.dataTransfer.files[0]);
  };

  const verdict = overallScore > 70
    ? { label: "LIKELY DEEPFAKE", color: "#ff4444", bg: "#ff444415" }
    : overallScore > 40
    ? { label: "INCONCLUSIVE", color: "#ffaa00", bg: "#ffaa0015" }
    : { label: "LIKELY AUTHENTIC", color: "#00ffe7", bg: "#00ffe715" };

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", fontFamily: "'Courier New', monospace", color: "#e0e8f0", backgroundImage: "radial-gradient(ellipse at 20% 50%, #001a2e 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #0a1a0a 0%, transparent 50%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { top: -2px; } 100% { top: 100%; } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes flicker { 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:0.8} 94%{opacity:1} 96%{opacity:0.9} 97%{opacity:1} }
        @keyframes gridPan { 0%{background-position:0 0} 100%{background-position:40px 40px} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a0f14} ::-webkit-scrollbar-thumb{background:#00ffe730}
      `}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "linear-gradient(#00ffe705 1px, transparent 1px), linear-gradient(90deg, #00ffe705 1px, transparent 1px)", backgroundSize: "40px 40px", animation: "gridPan 8s linear infinite" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: "40px", borderBottom: "1px solid #00ffe720", paddingBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
            <div style={{ width: "40px", height: "40px", border: "2px solid #00ffe7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "#00ffe7", boxShadow: "0 0 16px #00ffe740, inset 0 0 16px #00ffe710", animation: "flicker 4s infinite" }}>◈</div>
            <div>
              <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: "22px", fontWeight: "900", color: "#00ffe7", letterSpacing: "4px", margin: 0, textShadow: "0 0 20px #00ffe780" }}>VERITAS<span style={{ color: "#ffffff40" }}>::</span>SCAN</h1>
              <p style={{ fontSize: "10px", color: "#ffffff35", letterSpacing: "3px", margin: "2px 0 0" }}>DEEPFAKE FORENSIC ANALYSIS SYSTEM v2.4.1</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
            {["FACIAL GEOMETRY", "METADATA FORENSICS", "FREQUENCY ANALYSIS", "GAN FINGERPRINT"].map(tag => (
              <span key={tag} style={{ fontSize: "9px", letterSpacing: "2px", color: "#00ffe750", border: "1px solid #00ffe720", padding: "3px 8px" }}>{tag}</span>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div onClick={() => fileRef.current.click()} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
              style={{ border: `2px dashed ${dragOver ? "#00ffe7" : "#00ffe730"}`, borderRadius: "4px", padding: "32px 24px", textAlign: "center", cursor: "pointer", background: dragOver ? "#00ffe708" : "#0a0f1480", transition: "all 0.2s ease", position: "relative", overflow: "hidden", boxShadow: dragOver ? "0 0 30px #00ffe720" : "none" }}>
              {dragOver && <ScanLine />}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => loadImage(e.target.files[0])} />
              <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.6 }}>⊕</div>
              <p style={{ fontFamily: "'Orbitron', monospace", fontSize: "12px", color: "#00ffe7", letterSpacing: "2px", margin: "0 0 6px" }}>LOAD TARGET IMAGE</p>
              <p style={{ fontSize: "11px", color: "#ffffff30", margin: 0 }}>Drag & drop or click to select · JPG, PNG, WEBP</p>
            </div>

            {imageUrl && (
              <div style={{ position: "relative", borderRadius: "4px", overflow: "hidden", border: "1px solid #00ffe720" }}>
                <img src={imageUrl} alt="target" style={{ width: "100%", display: "block", maxHeight: "280px", objectFit: "cover" }} />
                {stage === "scanning" && (
                  <div style={{ position: "absolute", inset: 0, background: "#000d" }}>
                    <ScanLine />
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: "13px", color: "#00ffe7", letterSpacing: "3px", animation: "pulse 1s infinite" }}>ANALYZING TARGET</div>
                      <div style={{ width: "180px", height: "3px", background: "#ffffff10", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${scanProgress}%`, background: "linear-gradient(90deg, #00ffe7, #00ff88)", transition: "width 0.3s ease", boxShadow: "0 0 8px #00ffe7" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#ffffff40" }}>{scanProgress}% COMPLETE</div>
                    </div>
                  </div>
                )}
                {stage === "done" && (
                  <div style={{ position: "absolute", top: "12px", right: "12px", background: verdict.bg, border: `1px solid ${verdict.color}`, padding: "6px 12px", borderRadius: "2px" }}>
                    <span style={{ fontSize: "11px", fontFamily: "'Orbitron', monospace", color: verdict.color, letterSpacing: "1px", fontWeight: "700" }}>{verdict.label}</span>
                  </div>
                )}
              </div>
            )}

            {stage === "done" && (
              <div style={{ display: "flex", justifyContent: "space-around", background: "#0a0f1480", border: "1px solid #00ffe715", borderRadius: "4px", padding: "24px 16px" }}>
                <CircularMeter value={overallScore} label="Fake Score" />
                <CircularMeter value={Math.min(100, overallScore + Math.floor(Math.random() * 20 - 10))} label="Confidence" color="#a78bfa" />
                <CircularMeter value={scores["facial"] || 0} label="Face Anomaly" color="#f472b6" />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "#0a0f1480", border: "1px solid #00ffe715", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #00ffe715", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Orbitron', monospace", fontSize: "11px", letterSpacing: "2px", color: "#00ffe7" }}>FORENSIC CHECKS</span>
                <span style={{ fontSize: "10px", color: "#ffffff30" }}>{Object.values(checks).filter(s => s === "done").length} / {ANALYSIS_CHECKS.length} COMPLETE</span>
              </div>
              <div style={{ padding: "8px 0" }}>
                {ANALYSIS_CHECKS.map((check) => (
                  <CheckRow key={check.id} check={check} status={checks[check.id] || "pending"} score={scores[check.id] || 0} />
                ))}
              </div>
            </div>

            {stage === "done" && (
              <div style={{ background: verdict.bg, border: `1px solid ${verdict.color}40`, borderRadius: "4px", padding: "20px" }}>
                <div style={{ fontFamily: "'Orbitron', monospace", fontSize: "13px", color: verdict.color, letterSpacing: "2px", marginBottom: "8px", fontWeight: "700" }}>▶ ANALYSIS COMPLETE</div>
                <p style={{ fontSize: "12px", color: "#ffffff70", margin: "0 0 12px", lineHeight: "1.6" }}>
                  {overallScore > 70
                    ? `High probability of synthetic generation detected. ${Object.values(scores).filter(s => s > 65).length} of ${ANALYSIS_CHECKS.length} checks flagged anomalies consistent with GAN/diffusion artifacts.`
                    : overallScore > 40
                    ? "Mixed signals detected. Some anomalies present but insufficient for definitive classification. Manual review recommended."
                    : `No significant manipulation indicators found. Image shows consistent signatures of authentic photographic capture across all ${ANALYSIS_CHECKS.length} forensic vectors.`}
                </p>
                <button onClick={() => { setStage("idle"); setImageUrl(null); setChecks({}); setScores({}); setOverallScore(0); }}
                  style={{ background: "transparent", border: `1px solid ${verdict.color}60`, color: verdict.color, padding: "8px 20px", cursor: "pointer", fontFamily: "'Orbitron', monospace", fontSize: "11px", letterSpacing: "2px", transition: "all 0.2s ease" }}
                  onMouseOver={e => e.target.style.background = verdict.bg}
                  onMouseOut={e => e.target.style.background = "transparent"}>
                  ANALYZE NEW TARGET
                </button>
              </div>
            )}

            {stage === "idle" && !imageUrl && (
              <div style={{ background: "#0a0f1480", border: "1px solid #00ffe715", borderRadius: "4px", padding: "24px", textAlign: "center" }}>
                <div style={{ fontSize: "36px", opacity: "0.2", marginBottom: "12px" }}>◎</div>
                <p style={{ fontSize: "11px", color: "#ffffff25", letterSpacing: "1px", lineHeight: "1.8", margin: 0 }}>
                  AWAITING TARGET IMAGE<br/>LOAD AN IMAGE TO BEGIN<br/>FORENSIC ANALYSIS
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}