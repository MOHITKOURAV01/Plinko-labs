"use client";

import { useReducer, useMemo, useRef, useCallback, useEffect, useState } from "react";
import PlinkoBoard from "@/components/PlinkoBoard";
import { PAYOUT_TABLE, BIN_COLORS } from "@/lib/constants";

type GameStatus = "IDLE" | "COMMITTING" | "STARTING" | "DROPPING" | "REVEALING";

interface GameState {
  balance: number;
  betAmount: number;
  dropColumn: number;
  clientSeed: string;
  isMuted: boolean;
  reducedMotion: boolean;
  isTilt: boolean;
  isDebug: boolean;
  isDungeon: boolean;
  isRainMode: boolean;
  status: GameStatus;
  currentRound: {
    id: string;
    commitHex: string;
    nonce: string;
    path: ("L" | "R")[];
    binIndex: number;
    payoutMultiplier: number;
    pegMap: number[][];
  } | null;
  recentBins: number[];
  lastResult: { amount: number; multiplier: number; isWin: boolean } | null;
}

type GameAction =
  | { type: "SET_BET"; payload: number }
  | { type: "SET_COLUMN"; payload: number }
  | { type: "SET_CLIENT_SEED"; payload: string }
  | { type: "TOGGLE_MUTE" }
  | { type: "TOGGLE_REDUCED_MOTION" }
  | { type: "TOGGLE_TILT" }
  | { type: "TOGGLE_DEBUG" }
  | { type: "TOGGLE_DUNGEON" }
  | { type: "TOGGLE_RAIN" }
  | { type: "START_COMMIT" }
  | { type: "COMMIT_SUCCESS"; payload: { id: string; commitHex: string; nonce: string } }
  | { type: "START_ROUND"; payload: { path: ("L" | "R")[]; binIndex: number; payoutMultiplier: number; pegMap: number[][] } }
  | { type: "DROP_COMPLETE" }
  | { type: "REVEAL_SUCCESS"; payload: { balance: number; result: { amount: number; multiplier: number; isWin: boolean } } }
  | { type: "ERROR" };

const initialState: GameState = {
  balance: 1000,
  betAmount: 10,
  dropColumn: 6,
  clientSeed: "plinko-lab-v1",
  isMuted: false,
  reducedMotion: false,
  isTilt: false,
  isDebug: false,
  isDungeon: false,
  isRainMode: false,
  status: "IDLE",
  currentRound: null,
  recentBins: [],
  lastResult: null,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_BET":
      return { ...state, betAmount: Math.min(Math.max(1, action.payload), state.balance) };
    case "SET_COLUMN":
      return { ...state, dropColumn: Math.min(Math.max(0, action.payload), 12) };
    case "SET_CLIENT_SEED":
      return { ...state, clientSeed: action.payload };
    case "TOGGLE_MUTE":       return { ...state, isMuted: !state.isMuted };
    case "TOGGLE_REDUCED_MOTION": return { ...state, reducedMotion: !state.reducedMotion };
    case "TOGGLE_TILT":       return { ...state, isTilt: !state.isTilt };
    case "TOGGLE_DEBUG":      return { ...state, isDebug: !state.isDebug };
    case "TOGGLE_DUNGEON":    return { ...state, isDungeon: !state.isDungeon };
    case "TOGGLE_RAIN":       return { ...state, isRainMode: !state.isRainMode };
    case "START_COMMIT":
      return { ...state, status: "COMMITTING", lastResult: null };
    case "COMMIT_SUCCESS":
      return {
        ...state, status: "STARTING",
        currentRound: { ...action.payload, path: [], binIndex: 0, payoutMultiplier: 1, pegMap: [] },
      };
    case "START_ROUND":
      return {
        ...state, status: "DROPPING",
        balance: state.balance - state.betAmount,
        currentRound: state.currentRound ? { ...state.currentRound, ...action.payload } : null,
      };
    case "DROP_COMPLETE":
      return { ...state, status: "REVEALING" };
    case "REVEAL_SUCCESS":
      return {
        ...state, status: "IDLE",
        balance: action.payload.balance,
        lastResult: action.payload.result,
        recentBins: [state.currentRound!.binIndex, ...state.recentBins].slice(0, 5),
      };
    case "ERROR":
      return { ...state, status: "IDLE" };
    default:
      return state;
  }
}

// Commit tooltip — shows what the hash means, lets user copy it
function CommitTooltip({ commitHex }: { commitHex: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-white/30 truncate flex-1">
          🔒 {commitHex.slice(0, 18)}…
        </span>
        <button
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          onClick={() => { navigator.clipboard.writeText(commitHex); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-[9px] text-white/30 hover:text-yellow-400 transition-colors px-1.5 py-0.5 rounded border border-white/10 hover:border-yellow-400/30 shrink-0"
        >
          {copied ? "✓" : "copy"}
        </button>
        <button
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className="text-[10px] text-white/20 hover:text-yellow-400 transition-colors shrink-0"
          aria-label="What is this commit hash?"
        >?</button>
      </div>
      {show && (
        <div className="absolute bottom-full left-0 mb-2 z-[200] bg-[#141414] border border-yellow-500/30 rounded-xl p-4 w-80 shadow-2xl pointer-events-none">
          <p className="text-[10px] font-bold text-yellow-400 mb-2 uppercase tracking-widest">What is this?</p>
          <p className="text-[11px] text-white/60 leading-relaxed mb-2">
            Before you play, the server locked in its secret seed by publishing this <strong className="text-white/80">SHA256 hash</strong>. It cannot be changed retroactively. After the round, compare this hash with the revealed seed to confirm you were never cheated.
          </p>
          <p className="text-[9px] text-white/20 font-mono break-all">{commitHex}</p>
        </div>
      )}
    </div>
  );
}

// Rain mode — golden coins falling from the sky
function RainOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    type Coin = { x: number; y: number; vy: number; size: number; alpha: number; rot: number; rotV: number };
    const coins: Coin[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vy: 1.5 + Math.random() * 3,
      size: 8 + Math.random() * 14,
      alpha: 0.4 + Math.random() * 0.5,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.12,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const c of coins) {
        ctx.save();
        ctx.globalAlpha = c.alpha;
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, c.size, c.size * 0.38, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#facc15";
        ctx.fill();
        ctx.strokeStyle = "#a16207";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = "#78350f";
        ctx.font = `bold ${Math.round(c.size * 0.55)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("$", 0, 0);
        ctx.restore();
        c.y += c.vy;
        c.rot += c.rotV;
        if (c.y > canvas.height + 30) { c.y = -30; c.x = Math.random() * canvas.width; }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />;
}

export default function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const payoutTable = useMemo(() => PAYOUT_TABLE, []);
  const binColors = useMemo(() => BIN_COLORS, []);

  const lastBins = useRef<number[]>([]);
  const keyHistory = useRef<string>("");
  const isGoldenNext = useRef<boolean>(false);
  const audioCtx = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const pegTick = useCallback(() => {
    if (state.isMuted || !audioCtx.current) return;
    const ctx = audioCtx.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(550 + Math.random() * 350, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(); osc.stop(ctx.currentTime + 0.04);
  }, [state.isMuted]);

  const landingSound = useCallback((multiplier: number) => {
    if (state.isMuted || !audioCtx.current) return;
    const ctx = audioCtx.current;
    [1, 1.5, 2].forEach((ratio, i) => {
      const freq = (150 + multiplier * 40) * ratio;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.10, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime + i * 0.05);
      osc.stop(ctx.currentTime + 0.55);
    });
  }, [state.isMuted]);

  const handleDrop = useCallback(async () => {
    if (state.status !== "IDLE") return;
    initAudio();
    setErrorMsg(null);
    dispatch({ type: "START_COMMIT" });
    try {
      const commitRes = await fetch("/api/rounds/commit", { method: "POST" });
      const commitData = await commitRes.json();
      if (!commitRes.ok) throw new Error(commitData.error || "Commit failed");

      dispatch({ type: "COMMIT_SUCCESS", payload: { id: commitData.roundId, commitHex: commitData.commitHex, nonce: commitData.nonce } });

      const startRes = await fetch(`/api/rounds/${commitData.roundId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSeed: state.clientSeed, betCents: state.betAmount * 100, dropColumn: state.dropColumn }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Start failed");

      dispatch({ type: "START_ROUND", payload: { path: startData.path, binIndex: startData.binIndex, payoutMultiplier: startData.payoutMultiplier, pegMap: startData.pegMap } });
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong. Is the server running?");
      dispatch({ type: "ERROR" });
    }
  }, [state.status, state.clientSeed, state.betAmount, state.dropColumn]);

  const onAnimationComplete = useCallback(async () => {
    if (state.status !== "DROPPING") return;
    dispatch({ type: "DROP_COMPLETE" });
    try {
      await fetch(`/api/rounds/${state.currentRound?.id}/reveal`, { method: "POST" });
      const multiplier = state.currentRound!.payoutMultiplier;
      const payout = state.betAmount * multiplier;
      const isWin = multiplier >= 1;
      landingSound(multiplier);
      dispatch({ type: "REVEAL_SUCCESS", payload: { balance: state.balance + payout, result: { amount: payout, multiplier, isWin } } });
      lastBins.current = [state.currentRound!.binIndex, ...lastBins.current].slice(0, 3);
      isGoldenNext.current = lastBins.current.length === 3 && lastBins.current.every((b) => b === 6);
      if (state.isDungeon) dispatch({ type: "TOGGLE_DUNGEON" });
    } catch (err) { console.error(err); }
  }, [state.status, state.currentRound, state.betAmount, state.balance, landingSound, state.isDungeon]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      keyHistory.current = (keyHistory.current + e.key.toLowerCase()).slice(-12);
      if (keyHistory.current.endsWith("open sesame")) { dispatch({ type: "TOGGLE_DUNGEON" }); keyHistory.current = ""; }
      if (keyHistory.current.endsWith("makeitrain")) { dispatch({ type: "TOGGLE_RAIN" }); keyHistory.current = ""; }
      if (e.key.toLowerCase() === "t") dispatch({ type: "TOGGLE_TILT" });
      if (e.key.toLowerCase() === "g") dispatch({ type: "TOGGLE_DEBUG" });
      if (state.status !== "IDLE") return;
      if (e.code === "ArrowLeft") { e.preventDefault(); dispatch({ type: "SET_COLUMN", payload: state.dropColumn - 1 }); }
      if (e.code === "ArrowRight") { e.preventDefault(); dispatch({ type: "SET_COLUMN", payload: state.dropColumn + 1 }); }
      if (e.code === "Space") { e.preventDefault(); handleDrop(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.status, state.dropColumn, handleDrop]);

  const isIdle = state.status === "IDLE";
  const statusLabel: Record<GameStatus, string> = {
    IDLE: "Drop Ball", COMMITTING: "Committing…", STARTING: "Starting…", DROPPING: "Dropping…", REVEALING: "Revealing…"
  };

  return (
    <main className="min-h-screen bg-[#070707] text-[#e0e0e0] p-4 lg:p-8 flex flex-col items-center">
      {state.isRainMode && <RainOverlay />}
      {state.isRainMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-yellow-400 text-black px-6 py-2 rounded-full text-sm font-black shadow-lg shadow-yellow-500/30 animate-bounce">
          💰 MAKE IT RAIN!
        </div>
      )}

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Sidebar */}
        <aside className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">
          <div className="p-8 rounded-[2rem] bg-white/[0.03] space-y-8 border border-white/5 shadow-2xl">

            {/* Balance */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Total Balance</span>
              <div className="text-4xl font-black text-green-400 tabular-nums">
                ${state.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Bet */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Bet Amount</label>
              <div className="flex gap-2">
                <button onClick={() => dispatch({ type: "SET_BET", payload: Math.floor(state.betAmount / 2) })} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/5">½</button>
                <button onClick={() => dispatch({ type: "SET_BET", payload: state.betAmount * 2 })} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/5">2×</button>
                <button onClick={() => dispatch({ type: "SET_BET", payload: state.balance })} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold transition-all border border-white/5 uppercase">Max</button>
              </div>
              <div className="relative group">
                <input type="number" value={state.betAmount} min={1} max={state.balance}
                  onChange={(e) => dispatch({ type: "SET_BET", payload: Number(e.target.value) })}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-green-500/50 text-xl font-bold transition-all"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 font-bold pointer-events-none">$</span>
              </div>
            </div>

            {/* Column */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                Entry Column <span className="text-white/20 normal-case font-normal">(← →)</span>
              </label>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 13 }).map((_, i) => (
                  <button key={i} onClick={() => dispatch({ type: "SET_COLUMN", payload: i })}
                    aria-label={`Drop column ${i}`} aria-pressed={state.dropColumn === i}
                    className={`h-8 rounded-lg text-[10px] font-bold transition-all border ${state.dropColumn === i ? "bg-green-500 border-green-400 text-black shadow-[0_0_12px_rgba(34,197,94,0.25)]" : "bg-white/5 border-white/5 text-white/40 hover:border-white/20"}`}
                  >{i}</button>
                ))}
              </div>
            </div>

            {/* Drop */}
            <div className="space-y-3">
              <button onClick={handleDrop} disabled={!isIdle} aria-label="Drop ball (Space)"
                className={`w-full py-6 rounded-2xl text-2xl font-black uppercase tracking-tighter italic transition-all shadow-2xl ${isIdle ? "bg-[#00f576] hover:bg-[#00ff7b] text-black shadow-green-500/20 active:scale-[0.98] cursor-pointer" : "bg-white/5 text-white/20 cursor-not-allowed"}`}
              >
                {statusLabel[state.status]}
              </button>

              {/* Commit hash — prominent + explained */}
              {state.currentRound?.commitHex && (
                <div className="bg-black/40 rounded-xl px-3 py-2 border border-white/[0.06]">
                  <CommitTooltip commitHex={state.currentRound.commitHex} />
                </div>
              )}

              {errorMsg && (
                <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-xl px-3 py-2 border border-red-500/20">⚠ {errorMsg}</p>
              )}
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2 pt-4 border-t border-white/5">
              <button onClick={() => dispatch({ type: "TOGGLE_MUTE" })} title={state.isMuted ? "Unmute" : "Mute"}
                className={`p-3 bg-white/5 rounded-xl transition-colors ${state.isMuted ? "text-red-500" : "text-white/40 hover:text-white"}`}>
                {state.isMuted ? "🔇" : "🔊"}
              </button>
              <button onClick={() => dispatch({ type: "TOGGLE_REDUCED_MOTION" })} title="Toggle reduced motion"
                className={`p-3 bg-white/5 rounded-xl transition-colors ${state.reducedMotion ? "text-blue-500" : "text-white/40 hover:text-white"}`}>
                {state.reducedMotion ? "🏃" : "⚡"}
              </button>
              <div className="flex-1 flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-white/20 uppercase tracking-widest font-bold">Client Seed</span>
                <input type="text" value={state.clientSeed}
                  onChange={(e) => dispatch({ type: "SET_CLIENT_SEED", payload: e.target.value })}
                  aria-label="Client seed"
                  className="bg-transparent text-[11px] text-white/60 text-right outline-none focus:text-white font-mono border-b border-white/10 focus:border-white/30 pb-1 w-full" />
              </div>
            </div>

            {/* Paytable */}
            <div className="pt-2 border-t border-white/5">
              <span className="text-[9px] text-white/20 uppercase tracking-widest font-bold block mb-2">Paytable</span>
              <div className="flex gap-0.5">
                {payoutTable.map((mult, i) => (
                  <div key={i} className="flex-1 text-center py-1.5 rounded text-[8px] font-black"
                    style={{ backgroundColor: `${binColors[i]}30`, color: binColors[i] }}>
                    {mult}x
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Last result */}
          {state.lastResult && (
            <div className={`p-6 rounded-3xl border flex items-center justify-between ${state.lastResult.isWin ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
              <div className="space-y-0.5">
                <span className={`text-[10px] uppercase font-bold ${state.lastResult.isWin ? "text-green-500/60" : "text-red-500/60"}`}>{state.lastResult.isWin ? "Won" : "Lost"}</span>
                <div className={`text-2xl font-black ${state.lastResult.isWin ? "text-green-500" : "text-red-400"}`}>
                  {state.lastResult.isWin ? "+" : ""}${state.lastResult.amount.toFixed(2)}
                </div>
              </div>
              <div className={`text-sm font-black px-3 py-1 rounded-full ${state.lastResult.isWin ? "bg-green-500 text-black" : "bg-red-500 text-white"}`}>
                {state.lastResult.multiplier}x
              </div>
            </div>
          )}

          {/* Easter egg hint */}
          <p className="text-[9px] text-white/10 text-center font-mono tracking-wide">
            T · G · &quot;open sesame&quot; · &quot;makeitrain&quot;
          </p>
        </aside>

        {/* Board */}
        <section className="lg:col-span-8 order-1 lg:order-2 flex flex-col gap-8">
          <div className={`relative transition-all duration-700 ${state.isTilt ? "crt-filter animate-tilt" : ""}`}>
            {state.isTilt && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none select-none">
                <span className="text-8xl font-black italic text-red-600 tracking-tighter uppercase opacity-60">TILT!</span>
              </div>
            )}
            {state.isDungeon && (
              <div className="absolute top-4 right-4 z-[100] bg-orange-600 text-black px-4 py-1 rounded-full text-xs font-black animate-pulse">
                🔥 Dungeon Mode
              </div>
            )}
            {isGoldenNext.current && isIdle && (
              <div style={{ left: `calc(${((state.dropColumn - 6) * (100 / 18)) + 50}%)` }}
                className="absolute -top-10 transition-all duration-300 pointer-events-none" aria-hidden="true">
                <span className="text-3xl">👑</span>
              </div>
            )}
            <PlinkoBoard
              path={state.currentRound?.path || []}
              pegMap={state.currentRound?.pegMap || []}
              dropColumn={state.dropColumn}
              binIndex={state.currentRound?.binIndex ?? 0}
              isDropping={state.status === "DROPPING"}
              reducedMotion={state.reducedMotion}
              isGolden={isGoldenNext.current}
              isDungeon={state.isDungeon}
              isDebug={state.isDebug}
              onPegHit={pegTick}
              onAnimationComplete={onAnimationComplete}
            />
          </div>

          {/* Recent results */}
          <div className="flex items-center justify-center gap-4 bg-white/[0.02] px-8 py-5 rounded-full border border-white/5 self-center">
            <span className="text-[10px] uppercase tracking-widest text-white/20 font-bold">Recent</span>
            <div className="flex gap-3">
              {state.recentBins.length === 0
                ? <span className="text-xs text-white/10 italic">No drops yet</span>
                : state.recentBins.map((bin, i) => (
                  <div key={i} className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black border"
                    style={{ backgroundColor: `${binColors[bin]}22`, color: binColors[bin], borderColor: `${binColors[bin]}44` }}>
                    {payoutTable[bin]}x
                  </div>
                ))}
            </div>
          </div>

          <div className="text-center">
            <a href="/verify" className="text-[11px] text-white/50 hover:text-yellow-400 transition-colors underline underline-offset-4 font-mono">
              🔍 Independently audit any round →
            </a>
          </div>
        </section>
      </div>

      <footer className="mt-12 text-[10px] font-bold text-white/20 uppercase tracking-[0.4em]">
        Plinko Lab · Provably Fair · Space to drop
      </footer>
    </main>
  );
}
