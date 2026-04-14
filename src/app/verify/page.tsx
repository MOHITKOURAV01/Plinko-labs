"use client";

import { useState, useEffect, Suspense, useCallback } from 'react';
import { PAYOUT_TABLE } from '@/lib/constants';

// --- Types ---

interface Round {
  id: string;
  createdAt: string;
  clientSeed: string;
  serverSeed?: string;
  nonce: string;
  binIndex: number;
  payoutMultiplier: number;
  status: string;
  commitHex: string;
}

interface VerificationResult {
  commitHex: string;
  combinedSeed: string;
  pegMapHash: string;
  binIndex: number;
  path: ('L' | 'R')[];
  valid: boolean;
}

// --- Components ---

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white/60 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

const PlinkoSVG = ({ path, binIndex }: { path: ('L' | 'R')[], binIndex: number }) => {
  const ROWS = 12;
  const width = 400;
  const height = 400;
  const spacing = width / 18;
  const rowHeight = (height * 0.8) / ROWS;
  const centerX = width / 2;
  const startY = height * 0.1;

  const getPos = (r: number, i: number) => {
    const rowPegCount = r + 2;
    const x = centerX + (i - (rowPegCount - 1) / 2) * spacing;
    const y = startY + r * rowHeight;
    return { x, y };
  };

  // Generate path coordinates
  let currentPos = 0;
  const pathCoords = [{ x: centerX, y: startY }];
  for (let r = 0; r < ROWS; r++) {
    const p1 = getPos(r, currentPos);
    const p2 = getPos(r, currentPos + 1);
    pathCoords.push({ x: (p1.x + p2.x) / 2, y: p1.y });
    
    if (path[r] === 'R') currentPos++;
    
    const p3 = getPos(r + 1, currentPos);
    const p4 = getPos(r + 1, currentPos + 1);
    pathCoords.push({ x: (p3.x + p4.x) / 2, y: p3.y });
  }

  const polylinePoints = pathCoords.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width="100%" height="auto" viewBox={`0 0 ${width} ${height}`} className="max-w-md mx-auto">
      {/* Pegs */}
      {Array.from({ length: ROWS }).map((_, r) => (
        <g key={r}>
          {Array.from({ length: r + 2 }).map((_, i) => {
            const { x, y } = getPos(r, i);
            return <circle key={i} cx={x} cy={y} r="2" fill="rgba(255,255,255,0.1)" />;
          })}
        </g>
      ))}
      {/* Path */}
      {path.length > 0 && (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#facc15"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse"
        />
      )}
      {/* Bins */}
      {Array.from({ length: 13 }).map((_, i) => {
        const x = centerX + (i - 6) * spacing;
        const y = height * 0.9;
        return (
          <rect
            key={i}
            x={x - spacing / 2.5}
            y={y}
            width={spacing / 1.25}
            height="10"
            fill={i === binIndex && path.length > 0 ? '#facc15' : 'rgba(255,255,255,0.05)'}
            rx="2"
          />
        );
      })}
    </svg>
  );
};

export default function VerifierPage() {
  const [formData, setFormData] = useState({
    serverSeed: '',
    clientSeed: '',
    nonce: '',
    dropColumn: '6',
    roundId: ''
  });
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [storedRound, setStoredRound] = useState<Round | null>(null);
  const [recentRounds, setRecentRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/rounds?limit=10');
      const data = await res.json();
      setRecentRounds(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setResult(null);
    setStoredRound(null);

    try {
      // 1. Recompute logic
      const query = new URLSearchParams({
        serverSeed: formData.serverSeed,
        clientSeed: formData.clientSeed,
        nonce: formData.nonce,
        dropColumn: formData.dropColumn
      });
      const res = await fetch(`/api/verify?${query.toString()}`);
      const data = await res.json();
      setResult(data);

      // 2. Fetch stored round if ID provided
      if (formData.roundId) {
        const roundRes = await fetch(`/api/rounds/${formData.roundId}`);
        const roundData = await roundRes.json();
        setStoredRound(roundData);
      }
    } catch (err) {
      console.error(err);
      alert('Verification failed. Check inputs.');
    } finally {
      setLoading(false);
    }
  };

  const preFill = (round: Round & { dropColumn: number }) => {
    setFormData({
      serverSeed: round.serverSeed || '',
      clientSeed: round.clientSeed,
      nonce: round.nonce,
      dropColumn: String(round.dropColumn),
      roundId: round.id
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportCSV = () => {
    const headers = ['Round ID', 'Created At', 'Client Seed', 'Nonce', 'Bin', 'Multiplier', 'Status'];
    const rows = recentRounds.map(r => [
      r.id,
      new Date(r.createdAt).toLocaleString(),
      r.clientSeed,
      r.nonce,
      r.binIndex,
      r.payoutMultiplier,
      r.status
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'rounds.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-[#070707] text-white p-6 lg:p-12">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-4xl font-black italic tracking-tighter text-glow">VERIFIER</h1>
          <p className="text-white/40 text-sm max-w-lg">
            Independently audit any game result using the seeds provided at the end of your round. 
            Cryptographic transparency at your fingertips.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Section 1: Form */}
          <section className="space-y-8">
            <form onSubmit={handleVerify} className="glass p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Server Seed (Revealed)</label>
                  <input
                    type="text"
                    value={formData.serverSeed}
                    onChange={e => setFormData({...formData, serverSeed: e.target.value})}
                    placeholder="Revealed after round ends..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm font-mono"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Client Seed</label>
                    <input
                      type="text"
                      value={formData.clientSeed}
                      onChange={e => setFormData({...formData, clientSeed: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Nonce</label>
                    <input
                      type="text"
                      value={formData.nonce}
                      onChange={e => setFormData({...formData, nonce: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Drop Column (0-12)</label>
                    <select
                      value={formData.dropColumn}
                      onChange={e => setFormData({...formData, dropColumn: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm appearance-none"
                    >
                      {Array.from({ length: 13 }).map((_, i) => (
                        <option key={i} value={i}>Column {i}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Round ID (Optional)</label>
                    <input
                      type="text"
                      value={formData.roundId}
                      onChange={e => setFormData({...formData, roundId: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-yellow-500/50 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Recomputing...' : 'Verify Round'}
              </button>
            </form>

            {result && (
              <div className="glass p-8 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 space-y-6 animate-in slide-in-from-bottom-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-yellow-500 italic">Audit Result</h3>
                  <div className="px-3 py-1 bg-yellow-500 text-black text-[10px] font-black rounded-full">
                    BIN #{result.binIndex}
                  </div>
                </div>
                <div className="space-y-4 text-xs font-mono">
                  <div className="flex flex-col gap-1">
                    <span className="text-white/20 uppercase tracking-widest text-[8px]">Commit Hex</span>
                    <div className="flex items-center justify-between bg-black/40 p-2 rounded truncate max-w-full">
                      <span className="truncate">{result.commitHex}</span>
                      <CopyButton text={result.commitHex} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-white/20 uppercase tracking-widest text-[8px]">Combined Seed</span>
                    <div className="flex items-center justify-between bg-black/40 p-2 rounded truncate max-w-full">
                      <span className="truncate">{result.combinedSeed}</span>
                      <CopyButton text={result.combinedSeed} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-white/20 uppercase tracking-widest text-[8px]">Peg Map Hash</span>
                    <div className="flex items-center justify-between bg-black/40 p-2 rounded truncate max-w-full">
                      <span className="truncate">{result.pegMapHash}</span>
                      <CopyButton text={result.pegMapHash} />
                    </div>
                  </div>
                </div>

                {storedRound && (
                  <div className={`mt-6 p-4 rounded-2xl border ${storedRound.binIndex === result.binIndex ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                    <div className="flex items-center gap-2 font-bold mb-2">
                      {storedRound.binIndex === result.binIndex ? (
                        <><span>✅</span> Database Match</>
                      ) : (
                        <><span>❌</span> Database Mismatch</>
                      )}
                    </div>
                    <p className="text-[10px] opacity-80">
                      Comparison with round <strong>{storedRound.id.slice(0, 8)}</strong>: 
                      {storedRound.binIndex === result.binIndex 
                        ? ' The recomputed path matches the stored outcome perfectly.' 
                        : ` DB says bin ${storedRound.binIndex}, recomputed bin ${result.binIndex}.`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 2: Visual Path */}
          <section className="flex flex-col items-center justify-center gap-8">
            <div className="glass p-8 rounded-3xl bg-white/5 border border-white/10 w-full min-h-[450px] flex flex-col items-center justify-center">
              <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em] mb-8">Path Visualizer</h3>
              {result ? (
                <PlinkoSVG path={result.path} binIndex={result.binIndex} />
              ) : (
                <div className="text-white/10 italic text-sm text-center">
                  Verification data will appear here...
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Section 3: History */}
        <section className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold italic tracking-tight">Recent Rounds Audit Log</h2>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-[2rem] border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-white/5 uppercase text-[10px] font-bold text-white/40 tracking-widest">
                  <th className="px-6 py-4">Round ID</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Client Seed</th>
                  <th className="px-6 py-4">Result</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentRounds.map(round => (
                  <tr key={round.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-[10px] text-white/60">{round.id.slice(0, 8)}...</td>
                    <td className="px-6 py-4 text-white/40">{new Date(round.createdAt).toLocaleTimeString()}</td>
                    <td className="px-6 py-4 truncate max-w-[120px]">{round.clientSeed}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold">
                        Bin {round.binIndex} ({round.payoutMultiplier}x)
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${round.status === 'REVEALED' ? 'text-green-500' : 'text-yellow-500/50'}`}>
                        {round.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => preFill(round)}
                        className="text-yellow-500 hover:text-yellow-400 text-xs font-bold underline underline-offset-4"
                      >
                        Verify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
