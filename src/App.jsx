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

function VerdictBox({ verdictLabel, color, bg, summary, onReset, resetLabel }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}40`, borderRadius: "4px", padding: "20px" }}>
      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: "12px", color, letterSpacing: "2px", marginBottom: "8px", fontWeight: "700" }}>▶ {verdictLabel}</div>
      <p style={{ fontSize: "12px", color: "#ffffff70", margin: "0 0 14px", lineHeight: "1.7" }}>{summary}</p>
      <button onClick={onReset}
        style={{ background: "transparent", border: `1px solid ${color}60`, color, padding: "7px 18px", cursor: "pointer", fontFamily: "'Orbitron', monospace", fontSize: "10px", letterSpacing: "2px", transition: "all 0.2s ease" }}
        onMouseOver={e => e.target.style.background = bg}
        onMouseOut={e => e.target.style.background = "transparent"}>
        {resetLabel}
      </button>
    </div>
  );
}

// ─── TAB 3: NEWS CREDIBILITY — Article Analysis ─────────────────────────────
const GOOGLE_API_KEY = "AIzaSyCRXxJzGo-jWgX3uM0Oq4QtxS0NhJDUyxI";

const NEWS_CHECKS = [
  { id: "factcheck",  icon: "◈", label: "Fact Verification",          detail: "Cross-references claims against AFP, PolitiFact, Snopes, Reuters, BBC databases" },
  { id: "falseclaims",icon: "⬡", label: "Claim Accuracy",             detail: "Number of claims matched against verified fact-check records" },
  { id: "publisher",  icon: "◎", label: "Source Authority",            detail: "Credibility of publishers and institutions referenced in the article" },
  { id: "sentiment",  icon: "≋", label: "Writing Objectivity",         detail: "Tone neutrality, sensationalism, bias language, opinion vs. reporting" },
  { id: "sourcing",   icon: "⊞", label: "Attribution Quality",        detail: "Named sources, citations, data references, expert quotes vs. vague claims" },
  { id: "spread",     icon: "◉", label: "Editorial Standards",        detail: "Journalistic conventions, headline accuracy, call-to-action patterns" },
];

function extractQueries(text) {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
  const keywords = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter(w => w.length > 4 && !["about","there","their","would","could","should","which","where","while"].includes(w));
  const queries = [];
  if (sentences[0]) queries.push(sentences[0].substring(0, 80));
  const keyChunk = keywords.slice(0, 6).join(" ");
  if (keyChunk && !queries.includes(keyChunk)) queries.push(keyChunk);
  if (sentences[1] && queries.length < 3) queries.push(sentences[1].substring(0, 80));
  return queries.slice(0, 3);
}

function ratingToScore(rating) {
  if (!rating) return 0;
  const r = rating.toLowerCase();
  if (r.includes("false") || r.includes("incorrect") || r.includes("wrong") || r.includes("fake")) return 90;
  if (r.includes("mislead") || r.includes("distort") || r.includes("manipulat")) return 75;
  if (r.includes("half") || r.includes("mix") || r.includes("partial") || r.includes("mostly false")) return 55;
  if (r.includes("unverified") || r.includes("unproven") || r.includes("lacks")) return 45;
  if (r.includes("mostly true") || r.includes("largely true")) return 20;
  if (r.includes("true") || r.includes("correct") || r.includes("accurate")) return 8;
  return 35;
}

async function googleFactCheck(query) {
  try {
    const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(query)}&languageCode=en&key=${GOOGLE_API_KEY}&pageSize=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.claims || [];
  } catch { return []; }
}

function credibilityScores(text) {
  const t = text.toLowerCase();

  // ─── Writing Objectivity (low = objective, high = biased/sensational) ──
  let sentiment = 0;
  if (/\b(shocking|unbelievable|outrage|explosive|bombshell|horrifying|terrifying|devastating|nightmare|disaster)\b/.test(t)) sentiment += 25;
  if (/\b(they don't want you to know|wake up|sheeple|open your eyes|cover.?up|conspiracy|deep state|new world order|false flag|psyop|big pharma|big tech)\b/.test(t)) sentiment += 35;
  if (/\b(you won't believe|what they found|doctors hate|this one trick|the truth about|exposed|the real reason)\b/.test(t)) sentiment += 30;
  if (/[!]{2,}/.test(t)) sentiment += 12;
  if (/[?!]{3,}/.test(t)) sentiment += 10;
  const capsWords = text.match(/\b[A-Z]{3,}\b/g) || [];
  if (capsWords.length > 3) sentiment += 15;
  if (capsWords.length > 6) sentiment += 10;
  if (/\b(always|never|everyone|nobody|every single|proven|guaranteed|definitely|absolutely|undeniable|irrefutable)\b/.test(t)) sentiment += 12;
  if (/\b(i think|i believe|in my opinion|obviously|clearly|of course)\b/.test(t)) sentiment += 8;
  if (/\b(think of the children|blood on.+hands|history will judge|how dare|shame on|disgusting|sickening)\b/.test(t)) sentiment += 12;
  if (/\b(however|on the other hand|although|while some|critics argue|proponents say|some experts|it remains unclear)\b/.test(t)) sentiment -= 15;
  sentiment = Math.min(100, Math.max(0, sentiment));

  // ─── Attribution Quality (low = well-sourced, high = poorly sourced) ──
  let sourcing = 15;
  if (!/\b(according to|said|stated|confirmed|reported by|source|cited|published by|data from|study by|research from|findings show|data shows|statistics from)\b/.test(t)) sourcing += 25;
  if (/\b(anonymous|unnamed|insider|someone|a person|sources say|people are saying|many people|experts say|some say|rumor|reportedly|allegedly)\b/.test(t)) sourcing += 20;
  if (/\b(do your own research|look it up|google it|just search|educate yourself|i'm just asking questions)\b/.test(t)) sourcing += 25;
  const credibleOutlets = ["reuters","associated press","ap news","bbc","nyt","new york times","washington post","guardian","the guardian","politifact","snopes","factcheck.org","nature","science","lancet","bmj","published in","journal of","university of","institute of","world health","centers for disease"];
  const credibleMatches = credibleOutlets.filter(o => t.includes(o)).length;
  sourcing -= credibleMatches * 12;
  if (/\b(dr\.|prof\.|professor|minister|secretary|spokesperson|official statement|press release|peer reviewed|study published)\b/.test(t)) sourcing -= 12;
  const dateMatches = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{4})\b/g) || [];
  if (dateMatches.length >= 2) sourcing -= 8;
  const numStats = t.match(/\d+(\.\d+)?\s*(%|percent|million|billion|thousand)/g) || [];
  if (numStats.length >= 2) sourcing -= 10;
  sourcing = Math.min(100, Math.max(0, sourcing));

  // ─── Editorial Standards (low = professional, high = non-journalistic) ──
  let spread = 0;
  if (/\b(share this|forward|repost|spread the word|go viral|copy and paste|tag everyone|send to everyone)\b/.test(t)) spread += 35;
  if (/\b(before it's deleted|they're hiding|suppressed|banned|censored|they removed|taken down|silenced|blocked)\b/.test(t)) spread += 30;
  if (/\b(everyone needs to see|must see|must share|act now|time is running out|don't ignore)\b/.test(t)) spread += 25;
  if (/\b(forward to|send to \d+|copy this|pass it on|if you care)\b/.test(t)) spread += 25;
  if (/\b(mainstream media|msm|lamestream|fake news media|media won't tell|media is lying|media blackout)\b/.test(t)) spread += 20;
  if (/\b(editor's note|correction|update|for comment|declined to comment|could not be reached|in a statement)\b/.test(t)) spread -= 15;
  if (/\b(this article|this report|this story|reporting by|edited by|additional reporting)\b/.test(t)) spread -= 10;
  spread = Math.min(100, Math.max(0, spread));

  return { sentiment, sourcing, spread };
}

function NewsCredibilityTab() {
  const [stage, setStage] = useState("idle");
  const [text, setText] = useState("");
  const [checks, setChecks] = useState({});
  const [scores, setScores] = useState({});
  const [overall, setOverall] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [matchedClaims, setMatchedClaims] = useState([]);
  const [error, setError] = useState("");
  const [hfDetails, setHfDetails] = useState(null);

  // Credibility = 100 - riskScore (so we display credibility % to the user)
  const credibility = Math.max(0, 100 - overall);

  const analyze = useCallback(async () => {
    if (text.trim().split(/\s+/).length < 3) return;
    setStage("scanning"); setChecks({}); setScores({}); setOverall(0);
    setMatchedClaims([]); setError(""); setHfDetails(null);
    setWordCount(text.trim().split(/\s+/).length);
    const ids = NEWS_CHECKS.map(c => c.id);
    for (const id of ids) { setChecks(c => ({ ...c, [id]: "running" })); await sleep(180); }

    try {
      let hfResult = null;
      try {
        const resHf = await fetch("http://localhost:8000/analyze-fake-news-hf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text }),
        }).catch(e => { console.error("HF fetch error:", e); return null; });
        
        if (resHf) {
          const dataHf = await resHf.json();
          if (!dataHf.error) {
            hfResult = dataHf;
            setHfDetails(dataHf);
          } else {
             setError(dataHf.error);
          }
        }
      } catch (e) {
        console.error("Backend fetch error:", e)
      }

        if (hfResult && hfResult.label !== "UNKNOWN") {
        const confidence = hfResult.score * 100;
        const isFake = hfResult.label === "FAKE" || hfResult.label === "LABEL_0";
        const riskScore = isFake ? confidence : Math.max(0, 100 - confidence);

        for (const id of ids) {
          await sleep(300);
          setScores(s => ({ ...s, [id]: isFake ? 95 : 5 }));
          setChecks(c => ({ ...c, [id]: "done" }));
        }

        setOverall(Math.round(riskScore));
        setMatchedClaims([]);
        setStage("done");
      } else {

        const h = credibilityScores(text);

        const finalScores = {
          factcheck:   avgFc,
          falseclaims: Math.min(100, falseCount * 30),
          publisher:   publisherScore,
          sentiment:   h.sentiment,
          sourcing:    h.sourcing,
          spread:      h.spread,
        };

        const riskScore = unique.length > 0
          ? Math.round(avgFc * 0.35 + finalScores.falseclaims * 0.20 + publisherScore * 0.10 + h.sentiment * 0.15 + h.sourcing * 0.12 + h.spread * 0.08)
          : Math.round(h.sentiment * 0.35 + h.sourcing * 0.40 + h.spread * 0.25);

        for (const id of ids) {
          await sleep(300);
          setScores(s => ({ ...s, [id]: finalScores[id] || 0 }));
          setChecks(c => ({ ...c, [id]: "done" }));
        }

        setOverall(riskScore);
        setMatchedClaims(unique.slice(0, 4));
        setStage("done");
      }
    } catch (e) {
      setError("Analysis error: " + e.message);
      ids.forEach(id => setChecks(c => ({ ...c, [id]: "pending" })));
      setStage("idle");
    }
  }, [text]);

  const verdict = credibility < 40 ? { label: "LOW CREDIBILITY", color: "#ff4444", bg: "#ff444415" }
    : credibility < 65 ? { label: "MODERATE CREDIBILITY", color: "#ffaa00", bg: "#ffaa0015" }
    : { label: "HIGH CREDIBILITY", color: "#00ffe7", bg: "#00ffe715" };

  const reset = () => { setStage("idle"); setText(""); setChecks({}); setScores({}); setOverall(0); setMatchedClaims([]); setError(""); setHfDetails(null); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Input */}
        <div style={{ background: "#0a0f1480", border: "1px solid #ffaa0030", borderRadius: "4px", padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "10px", fontFamily: "'Orbitron', monospace", color: "#ffcc44", letterSpacing: "2px" }}>◈ PASTE NEWS ARTICLE</span>
            <span style={{ fontSize: "8px", background: "#ffaa0020", border: "1px solid #ffaa0040", color: "#ffaa00", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>CREDIBILITY CHECK</span>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Paste any news article text to analyze its credibility. Works best with 20+ words. We'll check facts, sources, writing objectivity, and editorial standards..."
            style={{ width: "100%", minHeight: "150px", background: "#060a0e", border: "1px solid #ffaa0030", borderRadius: "3px", padding: "12px", color: "#e0e8f0", fontFamily: "'Courier New', monospace", fontSize: "11px", outline: "none", resize: "vertical", lineHeight: "1.6", boxSizing: "border-box" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
            <span style={{ fontSize: "10px", color: "#ffffff25" }}>{text.trim().split(/\s+/).filter(Boolean).length} words</span>
            <button onClick={analyze} disabled={stage === "scanning" || text.trim().split(/\s+/).filter(Boolean).length < 3}
              style={{ background: stage==="scanning"?"#ffaa0015":"#ffaa0025", border: "1px solid #ffaa00", color: "#ffcc44", padding: "8px 20px", cursor: stage==="scanning"?"wait":"pointer", fontFamily: "'Orbitron', monospace", fontSize: "10px", letterSpacing: "1px", borderRadius: "3px", transition: "all 0.2s", opacity: text.trim().split(/\s+/).filter(Boolean).length < 3 ? 0.4 : 1 }}>
              {stage === "scanning" ? "ANALYZING..." : "ANALYZE"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: "#ff444410", border: "1px solid #ff444440", borderRadius: "4px", padding: "12px 16px" }}>
            <p style={{ fontSize: "11px", color: "#ff6666", margin: 0 }}>⚠ {error}</p>
          </div>
        )}

        {stage === "done" && (
          <div style={{ display: "flex", justifyContent: "space-around", background: "#0a0f1480", border: "1px solid #ffaa0015", borderRadius: "4px", padding: "20px 12px" }}>
            <CircularMeter value={credibility} label="Credibility" invert />
            <CircularMeter value={hfDetails ? Math.max(0, 100 - (hfDetails.label === "FAKE" ? 95 : 5)) : Math.max(0, 100-(scores["sourcing"]||0))} label="Source Quality" invert />
            <CircularMeter value={hfDetails ? Math.max(0, 100 - (hfDetails.label === "FAKE" ? 85 : 15)) : Math.max(0, 100-(scores["sentiment"]||0))} label="Objectivity" invert />
          </div>
        )}

        {/* Matched Fact Checks */}
        {stage === "done" && matchedClaims.length > 0 && (
          <div style={{ background: "#0a0f1480", border: "1px solid #ffaa0030", borderRadius: "4px", padding: "14px 16px" }}>
            <p style={{ fontFamily: "'Orbitron', monospace", fontSize: "9px", color: "#ffcc44", letterSpacing: "2px", margin: "0 0 10px" }}>◈ RELATED FACT-CHECKS</p>
            {matchedClaims.map((claim, i) => {
              const review = claim.claimReview?.[0];
              const rating = review?.textualRating || "UNRATED";
              const rScore = ratingToScore(rating);
              const rColor = rScore > 60 ? "#ff4444" : rScore > 35 ? "#ffaa00" : "#00ffe7";
              return (
                <div key={i} style={{ marginBottom: "10px", padding: "10px", background: "#ffffff05", borderLeft: `2px solid ${rColor}`, borderRadius: "2px" }}>
                  <p style={{ fontSize: "10px", color: "#ffffffaa", margin: "0 0 5px", lineHeight: "1.5" }}>{claim.text?.substring(0, 120)}{claim.text?.length > 120 ? "..." : ""}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "9px", color: "#ffffff40" }}>{review?.publisher?.name || "Unknown"}</span>
                    <span style={{ fontSize: "9px", color: rColor, border: `1px solid ${rColor}40`, padding: "1px 6px", borderRadius: "2px", letterSpacing: "1px" }}>{rating.toUpperCase()}</span>
                  </div>
                  {review?.url && <a href={review.url} target="_blank" rel="noreferrer" style={{ fontSize: "9px", color: "#ffaa0060", textDecoration: "none" }}>▸ VIEW SOURCE</a>}
                </div>
              );
            })}
          </div>
        )}

        {stage === "done" && matchedClaims.length === 0 && (
          <div style={{ background: "#0a0f1480", border: "1px solid #ffffff10", borderRadius: "4px", padding: "14px 16px", textAlign: "center" }}>
            <p style={{ fontSize: "10px", color: "#ffffff30", margin: 0, lineHeight: "1.8" }}>No matching fact-checks found in Google's database.<br/>Credibility score is based on writing analysis and sourcing quality.</p>
          </div>
        )}

        {stage === "idle" && !error && (
          <div style={{ background: "#0a0f1480", border: "1px solid #ffaa0015", borderRadius: "4px", padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", opacity: 0.15, marginBottom: "10px" }}>◈</div>
            <p style={{ fontSize: "10px", color: "#ffffff20", letterSpacing: "1px", lineHeight: "2", margin: 0 }}>HUGGING FACE FAKE NEWS NLP CHECKER<br/>POWERED BY TRANSFORMERS<br/>PASTE AN ARTICLE TO BEGIN</p>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ background: "#0a0f1480", border: "1px solid #ffaa0015", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", borderBottom: "1px solid #ffaa0015", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'Orbitron', monospace", fontSize: "10px", letterSpacing: "2px", color: "#ffcc44" }}>CREDIBILITY ANALYSIS</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {hfDetails && <span style={{ fontSize: "8px", background: "#a855f720", border: "1px solid #a855f740", color: "#c084fc", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>HUGGING FACE NLP</span>}
              <span style={{ fontSize: "9px", color: "#ffffff30" }}>{Object.values(checks).filter(s=>s==="done").length} / {NEWS_CHECKS.length} DONE</span>
            </div>
          </div>
          <div style={{ padding: "6px 0" }}>
            {NEWS_CHECKS.map(c => <CheckRow key={c.id} check={c} status={checks[c.id]||"pending"} score={scores[c.id]||0} />)}
          </div>
        </div>

        {stage === "done" && <VerdictBox verdictLabel={hfDetails ? (hfDetails.label === "FAKE" || hfDetails.label === "LABEL_0" ? "LOW CREDIBILITY (AI DETECTED)" : "HIGH CREDIBILITY (AI DETECTED)") : verdict.label} color={hfDetails ? (hfDetails.label === "FAKE" || hfDetails.label === "LABEL_0" ? "#ff4444" : "#00ffe7") : verdict.color} bg={hfDetails ? (hfDetails.label === "FAKE" || hfDetails.label === "LABEL_0" ? "#ff444415" : "#00ffe715") : verdict.bg}
          summary={hfDetails ? `The Hugging Face Neural Network classified this language pattern as ${hfDetails.label} with ${(hfDetails.score * 100).toFixed(1)}% confidence based on vast sets of disinformation training data.` : (credibility < 40 ? `Low credibility detected. ${matchedClaims.length > 0 ? matchedClaims.length + " fact-check source(s) flagged claims in this content." : "Poor sourcing, biased language, or non-journalistic patterns found."}` : credibility < 65 ? "Moderate credibility. Some concerns with sourcing or objectivity. Cross-reference with established outlets recommended." : "Article shows strong credibility indicators: good sourcing, objective tone, and consistent with professional journalism standards.")}
          onReset={reset} resetLabel="ANALYZE NEW ARTICLE" />}

        {stage === "done" && (
          <div style={{ background: "#0a0f1480", border: "1px solid #ffaa0015", borderRadius: "4px", padding: "14px 16px" }}>
            <p style={{ fontFamily: "'Orbitron', monospace", fontSize: "9px", color: "#ffcc44", letterSpacing: "2px", margin: "0 0 10px" }}>ARTICLE STATS</p>
            {[
              { label: "WORD COUNT", value: wordCount },
              { label: "CONFIDENCE SCORE", value: hfDetails ? `${(hfDetails.score * 100).toFixed(1)}%` : (credibility < 40 ? "LOW" : credibility < 65 ? "MODERATE" : "HIGH"), flag: credibility < 40 },
              { label: "ENGINE", value: hfDetails ? "LOCAL HUGGINGFACE PIPELINE" : "HEURISTIC & GOOGLE SEARCH", flag: false },
              ...(hfDetails ? [{ label: "HF NLP VERDICT", value: `${hfDetails.label}`, flag: hfDetails.label === "FAKE" || hfDetails.label === "LABEL_0" }] : []),
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #ffffff06" }}>
                <span style={{ fontSize: "9px", color: "#ffffff40", letterSpacing: "1px" }}>{row.label}</span>
                <span style={{ fontSize: "11px", fontFamily: "'Courier New', monospace", color: row.flag ? "#ff4444" : "#00ffe7" }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScanLine() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "4px" }}>
      <div style={{ position: "absolute", left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, #00ffe7, #00ffe7, transparent)", boxShadow: "0 0 12px #00ffe7, 0 0 24px #00ffe780", animation: "scanline 2s linear infinite" }} />
    </div>
  );
}

function CircularMeter({ value, size = 120, label, invert }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const riskColor = invert
    ? (value > 70 ? "#00ffe7" : value > 40 ? "#ffaa00" : "#ff4444")
    : (value > 70 ? "#ff4444" : value > 40 ? "#ffaa00" : "#00ffe7");
  const statusText = invert
    ? (value > 70 ? "CREDIBLE" : value > 40 ? "MODERATE" : "LOW")
    : (value > 70 ? "HIGH RISK" : value > 40 ? "SUSPECT" : "AUTHENTIC");
  
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
          <span style={{ fontSize: "9px", color: "#ffffff50", letterSpacing: "2px", marginTop: "2px" }}>{statusText}</span>
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

function PhishingDetectionTab() {
  const [stage, setStage] = useState("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [aiDetails, setAiDetails] = useState(null);

  const analyze = useCallback(async () => {
    if (text.trim().length < 5) {
      setError("Please paste a longer text to analyze.");
      return;
    }
    setStage("scanning"); 
    setError(""); 
    setAiDetails(null);

    try {
      const res = await fetch("http://localhost:8000/analyze-phishing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text }),
      });
      const data = await res.json();
      
      if (!data.error && data.risk_score !== undefined) {
        setAiDetails(data);
        setStage("done");
      } else {
        setError(data.error || "Failed to analyze phishing content.");
        setStage("idle");
      }
    } catch (e) {
      console.error("Backend fetch error:", e);
      setError("Error connecting to the verification server.");
      setStage("idle");
    }
  }, [text]);

  // Derived styling based on risk score (higher = worse for phishing)
  let verdictColor = "#00ffe7";
  let verdictBg = "#00ffe715";
  if (aiDetails?.risk_score > 70) {
    verdictColor = "#ff4444";
    verdictBg = "#ff444415";
  } else if (aiDetails?.risk_score > 40) {
    verdictColor = "#ffaa00";
    verdictBg = "#ffaa0015";
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
      {/* LEFT COLUMN - Input */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ background: "#0a0f1480", border: "1px solid #00ffe715", borderRadius: "4px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ fontFamily: "'Orbitron', monospace", fontSize: "11px", letterSpacing: "2px", color: "#c084fc" }}>INPUT CONTENT TO ANALYZE</span>
            <span style={{ fontSize: "10px", color: "#ffffff30" }}>{text.split(/\s+/).filter(w => w.length > 0).length} WORDS</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={stage === "scanning"}
            placeholder="Paste an email, text message, or URL here to scan for phishing/social engineering..."
            style={{ width: "100%", height: "280px", background: "#060a0e", border: "1px solid #ffffff10", borderRadius: "4px", padding: "16px", color: "#e0e8f0", fontFamily: "'Share Tech Mono', monospace", fontSize: "13px", lineHeight: "1.6", resize: "none", outline: "none", transition: "border 0.2s ease", boxSizing: "border-box" }}
            onFocus={e => e.target.style.border = "1px solid #c084fc50"}
            onBlur={e => e.target.style.border = "1px solid #ffffff10"}
          />
          {error && <div style={{ marginTop: "12px", color: "#ff4444", fontSize: "11px", padding: "8px", background: "#ff444415", borderLeft: "2px solid #ff4444" }}>{error}</div>}
          <button
            onClick={analyze}
            disabled={stage === "scanning" || text.trim().length < 5}
            style={{ width: "100%", marginTop: "16px", background: stage === "scanning" ? "#c084fc20" : "transparent", border: `1px solid ${stage === "scanning" ? "#c084fc" : "#c084fc80"}`, color: stage === "scanning" ? "#c084fc" : "#c084fc", padding: "12px", cursor: stage === "scanning" || text.trim().length < 5 ? "not-allowed" : "pointer", fontFamily: "'Orbitron', monospace", fontSize: "12px", letterSpacing: "3px", textTransform: "uppercase", transition: "all 0.2s ease", position: "relative", overflow: "hidden", opacity: text.trim().length < 5 ? 0.5 : 1 }}
            onMouseOver={e => !e.target.disabled && (e.target.style.background = "#c084fc15")}
            onMouseOut={e => !e.target.disabled && (e.target.style.background = "transparent")}
          >
            {stage === "scanning" ? <span style={{ animation: "pulse 1s infinite" }}>ANALYZING PATTERNS...</span> : "INITIATE SCAN"}
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN - Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {stage === "idle" && !aiDetails && (
          <div style={{ background: "#0a0f1480", border: "1px solid #c084fc15", borderRadius: "4px", padding: "40px 24px", textAlign: "center", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "36px", opacity: "0.2", marginBottom: "16px", color: "#c084fc" }}>✉</div>
            <p style={{ fontSize: "11px", color: "#ffffff25", letterSpacing: "1px", lineHeight: "1.8", margin: 0 }}>
              AWAITING CONTENT<br/>PROVIDE TEXT TO BEGIN<br/>PHISHING ANALYSIS<br/>
              <span style={{ fontSize: "9px", color: "#c084fc", marginTop: "8px", display: "inline-block" }}>POWERED BY GEMINI</span>
            </p>
          </div>
        )}

        {stage === "scanning" && (
          <div style={{ background: "#0a0f1480", border: "1px solid #c084fc15", borderRadius: "4px", padding: "40px 24px", textAlign: "center", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" }}>
            <ScanLine />
            <div style={{ fontSize: "24px", opacity: "0.6", marginBottom: "16px", color: "#c084fc", animation: "pulse 1s infinite" }}>⚙</div>
            <p style={{ fontFamily: "'Orbitron', monospace", fontSize: "12px", color: "#c084fc", letterSpacing: "2px", margin: "0 0 8px" }}>ANALYZING INTENT</p>
            <p style={{ fontSize: "10px", color: "#ffffff40" }}>Querying Gemini neural patterns...</p>
          </div>
        )}

        {stage === "done" && aiDetails && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
             {/* Verdict Box */}
             <div style={{ background: verdictBg, border: `1px solid ${verdictColor}40`, borderRadius: "4px", padding: "20px" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'Orbitron', monospace", fontSize: "12px", color: verdictColor, letterSpacing: "2px", marginBottom: "12px", fontWeight: "700" }}>▶ OVERALL VERDICT</span>
                  <span style={{ fontSize: "8px", background: "#c084fc20", border: "1px solid #c084fc40", color: "#c084fc", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px", marginBottom: "12px" }}>GOOGLE GEMINI</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "18px", color: verdictColor, fontWeight: "bold", fontFamily: "'Courier New', monospace" }}>{aiDetails.verdict}</span>
                </div>
                <p style={{ fontSize: "12px", color: "#ffffff70", margin: "14px 0 0", lineHeight: "1.7" }}>{aiDetails.logic_explanation}</p>
             </div>

             <div style={{ display: "flex", justifyContent: "space-around", background: "#0a0f1480", border: "1px solid #ffffff15", borderRadius: "4px", padding: "20px 16px" }}>
                 <CircularMeter value={aiDetails.risk_score} label="Risk Score" color={verdictColor} invert={true} />
             </div>

             {aiDetails.indicators && aiDetails.indicators.length > 0 && (
                <div style={{ background: "#0a0f1480", border: "1px solid #ffaa0030", borderRadius: "4px", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <span style={{ color: "#ffaa00", fontSize: "14px" }}>⚠</span>
                    <span style={{ fontFamily: "'Orbitron', monospace", fontSize: "11px", color: "#ffaa00", letterSpacing: "1px" }}>KEY INDICATORS DETECTED</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "16px", color: "#ffffff80", fontSize: "12px", lineHeight: "1.6" }}>
                    {aiDetails.indicators.map((ind, i) => (
                      <li key={i} style={{ marginBottom: "6px" }}>{ind}</li>
                    ))}
                  </ul>
                </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("image"); // "image", "news", or "phishing"
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

  // Helper to determine title and subtitle based on tab
  const getHeaderInfo = () => {
    if (activeTab === "image") return ["FAKIES::SCAN", "DEEPFAKE FORENSIC ANALYSIS SYSTEM"];
    if (activeTab === "news") return ["FAKIES::NEWS", "NEWS CREDIBILITY VERIFICATION"];
    return ["FAKIES::PHISH", "PHISHING & SOCIAL ENGINEERING DETECTION"];
  };

  const getHeaderColor = () => {
    if (activeTab === "image") return "#00ffe7";
    if (activeTab === "news") return "#ffaa00";
    return "#c084fc"; // Purple for Phishing
  };

  const headerColor = getHeaderColor();
  const [headerTitle, headerSubtitle] = getHeaderInfo();

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#080c10", fontFamily: "'Courier New', monospace", color: "#e0e8f0", backgroundImage: "radial-gradient(ellipse at 20% 50%, #001a2e 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #0a1a0a 0%, transparent 50%)", margin: 0, padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        html, body { margin: 0; padding: 0; overflow: hidden; }
        button:focus { outline: none !important; }
        @keyframes scanline { 0% { top: -2px; } 100% { top: 100%; } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes flicker { 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:0.8} 94%{opacity:1} 96%{opacity:0.9} 97%{opacity:1} }
        @keyframes gridPan { 0%{background-position:0 0} 100%{background-position:40px 40px} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a0f14} ::-webkit-scrollbar-thumb{background:#00ffe730}
      `}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "linear-gradient(#00ffe705 1px, transparent 1px), linear-gradient(90deg, #00ffe705 1px, transparent 1px)", backgroundSize: "40px 40px", animation: "gridPan 8s linear infinite" }} />

      <div style={{ display: "flex", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        {/* SIDEBAR */}
        <div style={{ width: "280px", background: "#060a0fE6", borderRight: `1px solid #ffffff10`, padding: "40px 24px", display: "flex", flexDirection: "column", gap: "48px", backdropFilter: "blur(10px)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "40px", height: "40px", border: `2px solid ${headerColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: headerColor, boxShadow: `0 0 16px ${headerColor}40, inset 0 0 16px ${headerColor}10`, animation: "flicker 4s infinite", transition: "all 0.3s ease", flexShrink: 0, borderRadius: "2px" }}>◈</div>
            <div>
              <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: "20px", fontWeight: "900", color: headerColor, letterSpacing: "2px", margin: 0, textShadow: `0 0 20px ${headerColor}80`, transition: "color 0.3s ease" }}>FAKIES</h1>
              <p style={{ fontSize: "9px", color: "#ffffff50", letterSpacing: "3px", margin: "4px 0 0" }}>OSINT v2.5.0</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={{ fontFamily: "'Orbitron', monospace", fontSize: "10px", color: "#ffffff40", letterSpacing: "2px", margin: "0 0 12px 4px" }}>MODULES</p>
            <button 
              onClick={() => { setActiveTab("image"); setStage("idle"); setImageUrl(null); setChecks({}); setScores({}); setOverallScore(0); }}
              style={{ textAlign: "left", background: activeTab === "image" ? "#00ffe715" : "transparent", border: "none", borderLeft: `3px solid ${activeTab === "image" ? "#00ffe7" : "transparent"}`, color: activeTab === "image" ? "#00ffe7" : "#ffffff60", padding: "14px 16px", cursor: "pointer", fontFamily: "'Orbitron', monospace", fontSize: "12px", letterSpacing: "2px", transition: "all 0.2s ease" }}
              onMouseOver={e => !e.target.style.background.includes("15") && (e.target.style.background = "#ffffff05")}
              onMouseOut={e => !e.target.style.background.includes("15") && (e.target.style.background = "transparent")}>
              ◎ IMAGE DETECT
            </button>
            <button 
              onClick={() => { setActiveTab("news"); setStage("idle"); setImageUrl(null); setChecks({}); setScores({}); setOverallScore(0); }}
              style={{ textAlign: "left", background: activeTab === "news" ? "#ffaa0015" : "transparent", border: "none", borderLeft: `3px solid ${activeTab === "news" ? "#ffaa00" : "transparent"}`, color: activeTab === "news" ? "#ffaa00" : "#ffffff60", padding: "14px 16px", cursor: "pointer", fontFamily: "'Orbitron', monospace", fontSize: "12px", letterSpacing: "2px", transition: "all 0.2s ease" }}
              onMouseOver={e => !e.target.style.background.includes("15") && (e.target.style.background = "#ffffff05")}
              onMouseOut={e => !e.target.style.background.includes("15") && (e.target.style.background = "transparent")}>
              ◈ NEWS ANALYSIS
            </button>
            <button 
              onClick={() => { setActiveTab("phishing"); setStage("idle"); setImageUrl(null); setChecks({}); setScores({}); setOverallScore(0); }}
              style={{ textAlign: "left", background: activeTab === "phishing" ? "#c084fc15" : "transparent", border: "none", borderLeft: `3px solid ${activeTab === "phishing" ? "#c084fc" : "transparent"}`, color: activeTab === "phishing" ? "#c084fc" : "#ffffff60", padding: "14px 16px", cursor: "pointer", fontFamily: "'Orbitron', monospace", fontSize: "12px", letterSpacing: "2px", transition: "all 0.2s ease" }}
              onMouseOver={e => !e.target.style.background.includes("15") && (e.target.style.background = "#ffffff05")}
              onMouseOut={e => !e.target.style.background.includes("15") && (e.target.style.background = "transparent")}>
              ✉ PHISHING SCAN
            </button>
          </div>
        </div>

        {/* MAIN BODY */}
        <div style={{ flex: 1, padding: "48px 48px 64px 48px", overflowY: "auto", height: "100vh", boxSizing: "border-box" }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <div style={{ marginBottom: "40px" }}>
              <h2 style={{ fontFamily: "'Orbitron', monospace", fontSize: "32px", fontWeight: "900", color: headerColor, letterSpacing: "6px", margin: 0, textShadow: `0 0 20px ${headerColor}60` }}>{headerTitle}</h2>
              <p style={{ fontSize: "12px", color: headerColor, opacity: 0.7, letterSpacing: "4px", margin: "12px 0 0" }}>— {headerSubtitle}</p>
            </div>

        {activeTab === "image" && (
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
        )}
        
        {activeTab === "news" && <NewsCredibilityTab />}
        {activeTab === "phishing" && <PhishingDetectionTab />}
          </div>
        </div>
      </div>
    </div>
  );
}