"use client";

import { useState, useEffect, useCallback } from "react";
import { PAYOUT_TABLE, BIN_COLORS } from "@/lib/constants";

interface Round {
  id: string;
  createdAt: string;
  clientSeed: string;
  serverSeed?: string;
  nonce: string;
  binIndex: number;
  dropColumn: number;
  payoutMultiplier: number;
  status: string;
  commitHex: string;
}

interface VerificationResult {
  commitHex: string;
  combinedSeed: string;
  pegMapHash: string;
  binIndex: number;
  path: ("L" | "R")[];
  valid: boolean;
}

// The exact test vectors from the spec
const SPEC_VECTORS = {
  serverSeed: "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc",
  clientSeed: "candidate-hello",
  nonce: "42",
  dropColumn: "6",
  roundId: "",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white/60 transition-colors shrink-0"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// SVG path replay with golden trail
const PlinkoSVG = ({ path, binIndex }: { path: ("L" | "R")[]; binIndex: number }) => {
  const ROWS = 12;
  const width = 380;
  const height = 380;
  const spacing = width / 18;
  const rowHeight = (height * 0.8) / ROWS;
  const centerX = width / 2;
  const startY = height * 0.09;

  const getPos = (r: number, i: number) => {
    const rowPegCount = r + 2;
    const x = centerX + (i - (rowPegCount - 1) / 2) * spacing;
    const y = startY + r * rowHeight;
    return { x, y };
  };

  let currentPos = 0;
  const pathCoords: { x: number; y: number }[] = [];
  // Start: midpoint above row 0
  const r0p0 = getPos(0, 0);
  const r0p1 = getPos(0, 1);
  pathCoords.push({ x: (r0p0.x + r0p1.x) / 2, y: startY - rowHeight * 0.5 });

  for (let r = 0; r < ROWS; r++) {
    const p1 = getPos(r, currentPos);
    const p2 = getPos(r, currentPos + 1);
    pathCoords.push({ x: (p1.x + p2.x) / 2, y: p1.y });
    if (path[r] === "R") currentPos++;
    const p3 = getPos(r + 1 < ROWS ? r + 1 : r, currentPos);
    const p4 = getPos(r + 1 < ROWS ? r + 1 : r, currentPos + 1);
    pathCoords.push({ x: (p3.x + p4.x) / 2, y: p3.y });
  }

  const polylinePoints = pathCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const finalX = centerX + (binIndex - 6) * spacing;

  return (
    <svg width="100%" height="auto" viewBox={`0 0 ${width} ${height}`} className="max-w-sm mx-auto" aria-label="Ball path replay">
      {/* Pegs */}
      {Array.from({ length: ROWS }).map((_, r) => (
        <g key={r}>
          {Array.from({ length: r + 2 }).map((_, i) => {
            const { x, y } = getPos(r, i);
            // highlight pegs on the path
            let currentP = 0;
            for (let rr = 0; rr < r; rr++) if (path[rr] === "R") currentP++;
            const isOnPath = (i === currentP || i === currentP + 1);
            return (
              <circle key={i} cx={x} cy={y} r={isOnPath && path.length > 0 ? "3.5" : "2"}
                fill={isOnPath && path.length > 0 ? "#facc15" : "rgba(255,255,255,0.12)"} />
            );
          })}
        </g>
      ))}

      {/* Path trail — glowing golden gradient */}
      {path.length > 0 && (
        <>
          {/* Thick glow */}
          <polyline points={polylinePoints} fill="none" stroke="#facc15" strokeWidth="6" strokeOpacity="0.15"
            strokeLinecap="round" strokeLinejoin="round" />
          {/* Main line */}
          <polyline points={polylinePoints} fill="none" stroke="#facc15" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray="none" />
        </>
      )}

      {/* Bins */}
      {Array.from({ length: 13 }).map((_, i) => {
        const x = centerX + (i - 6) * spacing;
        const y = height * 0.905;
        const isActive = i === binIndex && path.length > 0;
        return (
          <g key={i}>
            <rect x={x - spacing / 2.2} y={y} width={spacing / 1.1} height={12}
              fill={isActive ? BIN_COLORS[i] : `${BIN_COLORS[i]}22`} rx="2" />
            {isActive && (
              <text x={x} y={y + 9} textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">
                {PAYOUT_TABLE[i]}x
              </text>
            )}
          </g>
        );
      })}

      {/* Landing ball */}
      {path.length > 0 && (
        <>
          <circle cx={finalX} cy={height * 0.895} r="6" fill="#facc15" fillOpacity="0.25" />
          <circle cx={finalX} cy={height * 0.895} r="4" fill="#facc15" />
        </>
      )}

      {/* Bin label */}
      {path.length > 0 && (
        <text x={finalX} y={height * 0.895 - 14} textAnchor="middle" fontSize="9" fill="#facc15" fontWeight="bold">
          Bin {binIndex}
        </text>
      )}
    </svg>
  );
};

export default function VerifierPage() {
  const [formData, setFormData] = useState({ serverSeed: "", clientSeed: "", nonce: "", dropColumn: "6", roundId: "" });
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [storedRound, setStoredRound] = useState<Round | null>(null);
  const [recentRounds, setRecentRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(false);
  const [specLoaded, setSpecLoaded] = useState(false);

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/rounds?limit=20");
      const data = await res.json();
      if (Array.isArray(data)) setRecentRounds(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setResult(null);
    setStoredRound(null);
    try {
      const query = new URLSearchParams({
        serverSeed: formData.serverSeed,
        clientSeed: formData.clientSeed,
        nonce: formData.nonce,
        dropColumn: formData.dropColumn,
      });
      const res = await fetch(`/api/verify?${query}`);
      const data = await res.json();
      setResult(data);
      if (formData.roundId) {
        const roundRes = await fetch(`/api/rounds/${formData.roundId}`);
        if (roundRes.ok) setStoredRound(await roundRes.json());
      }
    } catch (err) {
      console.error(err);
      alert("Verification failed. Check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  const loadSpecVectors = () => {
    setFormData(SPEC_VECTORS);
    setSpecLoaded(true);
    setTimeout(() => setSpecLoaded(false), 3000);
  };

  const preFill = (round: Round) => {
    setFormData({
      serverSeed: round.serverSeed || "",
      clientSeed: round.clientSeed,
      nonce: round.nonce,
      dropColumn: String(round.dropColumn ?? 6),
      roundId: round.id,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exportCSV = () => {
    const headers = ["Round ID", "Created At", "Client Seed", "Nonce", "Drop Column", "Bin", "Multiplier", "Status"];
    const rows = recentRounds.map((r) => [r.id, new Date(r.createdAt).toLocaleString(), r.clientSeed, r.nonce, r.dropColumn ?? "", r.binIndex, r.payoutMultiplier, r.status]);
    const csv = [headers, ...rows].map((row) => row.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `plinko-rounds-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hashField = (label: string, value: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-white/20 uppercase tracking-widest text-[9px] font-bold">{label}</span>
      <div className="flex items-center bg-black/40 px-3 py-2 rounded-lg border border-white/5 gap-2 min-w-0">
        <span className="truncate font-mono text-[11px] text-white/70 flex-1">{value}</span>
        <CopyButton text={value} />
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#070707] text-white p-6 lg:p-12">
      <div className="max-w-6xl mx-auto space-y-12">

        <header className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 className="text-4xl font-black italic tracking-tighter" style={{ textShadow: "0 0 20px rgba(250,204,21,0.3)" }}>
              VERIFIER
            </h1>
            <a href="/" className="text-sm text-white/30 hover:text-white transition-colors border border-white/10 px-4 py-2 rounded-xl">
              ← Back to game
            </a>
          </div>
          <p className="text-white/40 text-sm max-w-2xl leading-relaxed">
            Independently audit any round using the seeds revealed after play. Every result can be reproduced deterministically — the server cannot lie.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

          {/* Form */}
          <section className="space-y-6">
            <form onSubmit={handleVerify} className="p-8 rounded-3xl bg-white/[0.03] border border-white/10 space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Audit Inputs</h2>
                <button
                  type="button"
                  onClick={loadSpecVectors}
                  className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all border ${specLoaded ? "bg-yellow-500 text-black border-yellow-400" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20"}`}
                >
                  {specLoaded ? "✓ Loaded!" : "Load Spec Test Vectors"}
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Server Seed (Revealed after round)</label>
                <input type="text" value={formData.serverSeed}
                  onChange={(e) => setFormData({ ...formData, serverSeed: e.target.value })}
                  placeholder="64-char hex seed revealed post-round…"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm font-mono transition-colors" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Client Seed</label>
                  <input type="text" value={formData.clientSeed}
                    onChange={(e) => setFormData({ ...formData, clientSeed: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm transition-colors" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Nonce</label>
                  <input type="text" value={formData.nonce}
                    onChange={(e) => setFormData({ ...formData, nonce: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm transition-colors" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Drop Column (0–12)</label>
                  <select value={formData.dropColumn}
                    onChange={(e) => setFormData({ ...formData, dropColumn: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm appearance-none">
                    {Array.from({ length: 13 }).map((_, i) => (
                      <option key={i} value={i}>Column {i}{i === 6 ? " (center)" : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Round ID (optional)</label>
                  <input type="text" value={formData.roundId}
                    onChange={(e) => setFormData({ ...formData, roundId: e.target.value })}
                    placeholder="Cross-reference stored round"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm font-mono transition-colors" />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? "Recomputing…" : "Verify Round"}
              </button>
            </form>

            {/* Result card */}
            {result && (
              <div className="p-8 rounded-3xl bg-yellow-500/5 border border-yellow-500/20 space-y-5">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-yellow-500 italic">Audit Result</h3>
                  <div className="flex gap-2 items-center">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${result.valid ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
                      {result.valid ? "✓ VALID" : "✗ INVALID"}
                    </span>
                    <span className="px-3 py-1 bg-yellow-500 text-black text-[10px] font-black rounded-full">
                      Bin #{result.binIndex} · {PAYOUT_TABLE[result.binIndex]}x
                    </span>
                  </div>
                </div>
                <div className="space-y-3 text-xs">
                  {hashField("Commit Hex (SHA256 of serverSeed:nonce)", result.commitHex)}
                  {hashField("Combined Seed (SHA256 of serverSeed:clientSeed:nonce)", result.combinedSeed)}
                  {hashField("Peg Map Hash (SHA256 of JSON.stringify(pegMap))", result.pegMapHash)}
                </div>

                {storedRound && (
                  <div className={`p-4 rounded-2xl border ${storedRound.binIndex === result.binIndex ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                    <div className={`flex items-center gap-2 font-bold mb-1 text-sm ${storedRound.binIndex === result.binIndex ? "text-green-400" : "text-red-400"}`}>
                      {storedRound.binIndex === result.binIndex ? "✅ Database Match" : "❌ Database Mismatch"}
                    </div>
                    <p className="text-[11px] text-white/50">
                      Round <code className="text-white/70">{storedRound.id.slice(0, 12)}…</code> — DB stored bin <strong>{storedRound.binIndex}</strong>, recomputed bin <strong>{result.binIndex}</strong>.
                      {storedRound.binIndex === result.binIndex ? " The outcome is cryptographically confirmed." : " Values differ — data may be corrupted."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Visual replay */}
          <section className="flex flex-col gap-6">
            <div className="p-8 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col items-center min-h-[420px] justify-center">
              <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em] mb-6">Path Visualizer</h3>
              {result ? (
                <>
                  <PlinkoSVG path={result.path} binIndex={result.binIndex} />
                  <p className="text-[10px] text-white/20 mt-4 text-center">
                    {result.path.join(" → ")} → <span className="text-yellow-400">Bin {result.binIndex}</span>
                  </p>
                </>
              ) : (
                <div className="text-white/10 italic text-sm text-center space-y-2">
                  <div className="text-3xl opacity-20">🎯</div>
                  <p>Verify a round to replay its path</p>
                  <p className="text-[10px]">or click &quot;Load Spec Test Vectors&quot; for a quick demo</p>
                </div>
              )}
            </div>

            {/* Spec vectors info box */}
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
              <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Reference Test Vectors</h3>
              <div className="space-y-2 font-mono text-[10px] text-white/40">
                <p><span className="text-white/20">serverSeed:</span> b2a5f3f3…ffeeddcc</p>
                <p><span className="text-white/20">nonce:</span> 42</p>
                <p><span className="text-white/20">clientSeed:</span> candidate-hello</p>
                <p><span className="text-white/20">Expected binIndex:</span> <span className="text-yellow-400">6</span></p>
                <p><span className="text-white/20">commitHex:</span> bb9acdc6…</p>
              </div>
            </div>
          </section>
        </div>

        {/* History table */}
        <section className="space-y-5">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold italic tracking-tight">Recent Rounds Audit Log</h2>
            <button onClick={exportCSV}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all">
              ↓ Export CSV
            </button>
          </div>

          {recentRounds.length === 0 ? (
            <div className="text-center py-16 text-white/20 italic text-sm border border-white/5 rounded-2xl bg-white/[0.01]">
              No rounds played yet. Go drop some balls!
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-white/[0.02]">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-white/5 uppercase text-[10px] font-bold text-white/40 tracking-widest">
                    <th className="px-5 py-4">Round ID</th>
                    <th className="px-5 py-4">Time</th>
                    <th className="px-5 py-4">Client Seed</th>
                    <th className="px-5 py-4">Result</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Verify</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentRounds.map((round) => (
                    <tr key={round.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 font-mono text-[10px] text-white/50">{round.id.slice(0, 10)}…</td>
                      <td className="px-5 py-4 text-white/40 text-xs">{new Date(round.createdAt).toLocaleTimeString()}</td>
                      <td className="px-5 py-4 text-xs text-white/60 max-w-[110px] truncate">{round.clientSeed}</td>
                      <td className="px-5 py-4">
                        <span className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{ backgroundColor: `${BIN_COLORS[round.binIndex]}22`, color: BIN_COLORS[round.binIndex] }}>
                          Bin {round.binIndex} · {round.payoutMultiplier}x
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${round.status === "REVEALED" ? "text-green-500" : "text-yellow-500/50"}`}>
                          {round.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => preFill(round)}
                          disabled={round.status !== "REVEALED"}
                          className="text-yellow-500 hover:text-yellow-300 text-xs font-bold disabled:text-white/20 disabled:cursor-not-allowed transition-colors">
                          {round.status === "REVEALED" ? "Audit →" : "Pending"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
