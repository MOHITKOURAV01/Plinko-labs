"use client";

import { useReducer, useMemo, useRef, useCallback, useEffect } from "react";
import PlinkoBoard from "@/components/PlinkoBoard";
import { PAYOUT_TABLE, BIN_COLORS } from "@/lib/constants";

// --- Types ---

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
  lastResult: {
    amount: number;
    multiplier: number;
  } | null;
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
  | { type: "START_COMMIT" }
  | { type: "COMMIT_SUCCESS"; payload: { id: string; commitHex: string; nonce: string } }
  | { type: "START_ROUND"; payload: { path: ("L" | "R")[]; binIndex: number; payoutMultiplier: number; pegMap: number[][] } }
  | { type: "DROP_COMPLETE" }
  | { type: "REVEAL_SUCCESS"; payload: { balance: number; result: { amount: number; multiplier: number } } }
  | { type: "ERROR"; payload: string };

// --- Reducer ---

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
    case "TOGGLE_MUTE":
      return { ...state, isMuted: !state.isMuted };
    case "TOGGLE_REDUCED_MOTION":
      return { ...state, reducedMotion: !state.reducedMotion };
    case "TOGGLE_TILT":
      return { ...state, isTilt: !state.isTilt };
    case "TOGGLE_DEBUG":
      return { ...state, isDebug: !state.isDebug };
    case "TOGGLE_DUNGEON":
      return { ...state, isDungeon: !state.isDungeon };
    case "START_COMMIT":
      return { ...state, status: "COMMITTING", lastResult: null };
    case "COMMIT_SUCCESS":
      return {
        ...state,
        status: "STARTING",
        currentRound: {
          ...action.payload,
          path: [],
          binIndex: 0,
          payoutMultiplier: 1,
          pegMap: [],
        },
      };
    case "START_ROUND":
      return {
        ...state,
        status: "DROPPING",
        balance: state.balance - state.betAmount,
        currentRound: state.currentRound ? { ...state.currentRound, ...action.payload } : null,
      };
    case "DROP_COMPLETE":
      return { ...state, status: "REVEALING" };
    case "REVEAL_SUCCESS":
      return {
        ...state,
        status: "IDLE",
        balance: action.payload.balance,
        lastResult: action.payload.result,
        recentBins: [state.currentRound!.binIndex, ...state.recentBins].slice(0, 5),
      };
    case "ERROR":
      alert(action.payload);
      return { ...state, status: "IDLE" };
    default:
      return state;
  }
}

// --- Component ---

export default function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const payoutTable = useMemo(() => PAYOUT_TABLE, []);
  const binColors = useMemo(() => BIN_COLORS, []);

  // --- Refs for Tracking ---
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
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.current.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.current.currentTime + 0.03);
    osc.start();
    osc.stop(audioCtx.current.currentTime + 0.03);
  }, [state.isMuted]);

  const landingSound = useCallback((multiplier: number) => {
    if (state.isMuted || !audioCtx.current) return;
    const freq = 200 + multiplier * 50; // Higher multiplier = higher pitch
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq / 2, audioCtx.current.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, audioCtx.current.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.current.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.current.currentTime + 0.3);
  }, [state.isMuted]);

  // --- Actions ---

  const handleDrop = async () => {
    if (state.status !== "IDLE") return;
    initAudio();
    dispatch({ type: "START_COMMIT" });

    try {
      // 1. Commit
      const commitRes = await fetch("/api/rounds/commit", { method: "POST" });
      const commitData = await commitRes.json();
      if (!commitRes.ok) throw new Error(commitData.error);
      
      dispatch({ 
        type: "COMMIT_SUCCESS", 
        payload: { id: commitData.roundId, commitHex: commitData.commitHex, nonce: commitData.nonce } 
      });

      // 2. Start
      const startRes = await fetch(`/api/rounds/${commitData.roundId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSeed: state.clientSeed,
          betCents: state.betAmount * 100,
          dropColumn: state.dropColumn,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error);

      dispatch({
        type: "START_ROUND",
        payload: {
          path: startData.path,
          binIndex: startData.binIndex,
          payoutMultiplier: startData.payoutMultiplier,
          pegMap: startData.pegMap,
        },
      });

    } catch (err: any) {
      dispatch({ type: "ERROR", payload: err.message });
    }
  };

  const onAnimationComplete = useCallback(async () => {
    if (state.status !== "DROPPING") return;
    dispatch({ type: "DROP_COMPLETE" });

    try {
      const revealRes = await fetch(`/api/rounds/${state.currentRound?.id}/reveal`, { method: "POST" });
      const revealData = await revealRes.json();
      
      const payout = state.betAmount * state.currentRound!.payoutMultiplier;
      
      landingSound(state.currentRound!.payoutMultiplier);

      dispatch({
        type: "REVEAL_SUCCESS",
        payload: {
          balance: state.balance + payout,
          result: { amount: payout, multiplier: state.currentRound!.payoutMultiplier }
        }
      });

      // Update Golden Tracker
      lastBins.current = [state.currentRound!.binIndex, ...lastBins.current].slice(0, 3);
      isGoldenNext.current = lastBins.current.length === 3 && lastBins.current.every(b => b === 6);

      // Auto-revert Dungeon after one round
      if (state.isDungeon) {
        dispatch({ type: "TOGGLE_DUNGEON" });
      }
    } catch (err) {
      console.error(err);
    }
  }, [state.status, state.currentRound, state.betAmount, state.balance, landingSound]);

  // --- Keyboard ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Easter Egg: Open Sesame
      keyHistory.current = (keyHistory.current + e.key.toLowerCase()).slice(-11);
      if (keyHistory.current === "open sesame") {
        dispatch({ type: "TOGGLE_DUNGEON" });
        keyHistory.current = "";
      }

      // TILT
      if (e.key.toLowerCase() === "t") dispatch({ type: "TOGGLE_TILT" });
      // DEBUG
      if (e.key.toLowerCase() === "g") dispatch({ type: "TOGGLE_DEBUG" });

      if (state.status !== "IDLE") return;
      if (e.code === "ArrowLeft") dispatch({ type: "SET_COLUMN", payload: state.dropColumn - 1 });
      if (e.code === "ArrowRight") dispatch({ type: "SET_COLUMN", payload: state.dropColumn + 1 });
      if (e.code === "Space") {
        e.preventDefault();
        handleDrop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.status, state.dropColumn, handleDrop, state.isDungeon]);

  return (
    <main className="min-h-screen bg-[#070707] text-[#e0e0e0] p-4 lg:p-8 flex flex-col items-center">
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Sidebar */}
        <aside className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">
          <div className="glass p-8 rounded-[2rem] bg-white/[0.03] space-y-8 border border-white/5 shadow-2xl">
            
            {/* Balance */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Total Balance</span>
              <div className="text-4xl font-black text-green-400 tabular-nums">
                ${state.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Bet Input */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Bet Amount</label>
              <div className="flex gap-2">
                <button onClick={() => dispatch({ type: "SET_BET", payload: state.betAmount / 2 })} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/5">½</button>
                <button onClick={() => dispatch({ type: "SET_BET", payload: state.betAmount * 2 })} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/5">2×</button>
                <button onClick={() => dispatch({ type: "SET_BET", payload: state.balance })} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold transition-all border border-white/5 uppercase">Max</button>
              </div>
              <div className="relative group">
                <input 
                  type="number"
                  value={state.betAmount}
                  onChange={(e) => dispatch({ type: "SET_BET", payload: Number(e.target.value) })}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-green-500/50 text-xl font-bold transition-all peer"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 font-bold pointer-events-none group-focus-within:text-green-500/50">$</span>
              </div>
            </div>

            {/* Column Selector */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Entry Column</label>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 13 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => dispatch({ type: "SET_COLUMN", payload: i })}
                    className={`h-8 rounded-lg text-[10px] font-bold transition-all border ${
                      state.dropColumn === i 
                        ? "bg-green-500 border-green-400 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]" 
                        : "bg-white/5 border-white/5 text-white/40 hover:border-white/20"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop Button */}
            <div className="space-y-4">
              <button
                onClick={handleDrop}
                disabled={state.status !== "IDLE"}
                className={`w-full py-6 rounded-2xl text-2xl font-black uppercase tracking-tighter italic transition-all shadow-2xl relative overflow-hidden group ${
                  state.status === "IDLE"
                    ? "bg-[#00f576] hover:bg-[#00ff7b] text-black shadow-green-500/20 active:scale-[0.98]"
                    : "bg-white/5 text-white/20 cursor-not-allowed"
                }`}
              >
                <span className="relative z-10">{state.status === "IDLE" ? "Drop Ball" : "In Progress..."}</span>
              </button>
              
              {state.currentRound?.commitHex && (
                <div className="text-[9px] font-mono text-white/20 truncate px-2 text-center">
                  Server Commited: {state.currentRound.commitHex}
                </div>
              )}
            </div>

            {/* Mute & Seeds */}
            <div className="flex items-center gap-2 pt-4 border-t border-white/5">
              <button 
                onClick={() => dispatch({ type: "TOGGLE_MUTE" })}
                className={`p-3 bg-white/5 rounded-xl transition-colors ${state.isMuted ? "text-red-500" : "text-white/40 hover:text-white"}`}
                title="Toggle Mute"
              >
                {state.isMuted ? "🔇" : "🔊"}
              </button>
              <button 
                onClick={() => dispatch({ type: "TOGGLE_REDUCED_MOTION" })}
                className={`p-3 bg-white/5 rounded-xl transition-colors ${state.reducedMotion ? "text-blue-500" : "text-white/40 hover:text-white"}`}
                title="Toggle Reduced Motion"
              >
                {state.reducedMotion ? "🏃" : "⚡"}
              </button>
              <div className="flex-1 flex flex-col items-end">
                <span className="text-[9px] text-white/20 uppercase tracking-widest font-bold mb-1">Client Seed</span>
                <input 
                  type="text" 
                  value={state.clientSeed}
                  onChange={(e) => dispatch({ type: "SET_CLIENT_SEED", payload: e.target.value })}
                  className="bg-transparent text-[11px] text-white/60 text-right outline-none focus:text-white font-mono border-b border-white/10 focus:border-white/30 pb-1"
                />
              </div>
            </div>

          </div>

          {/* Last Result Display */}
          {state.lastResult && (
            <div className="glass p-6 rounded-3xl bg-green-500/10 border border-green-500/20 flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-green-500/60">Last Win</span>
                <div className="text-2xl font-black text-green-500">+${state.lastResult.amount.toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black bg-green-500 text-black px-3 py-1 rounded-full">{state.lastResult.multiplier}x</div>
              </div>
            </div>
          )}
        </aside>

        {/* Board View */}
        <section className="lg:col-span-8 order-1 lg:order-2 flex flex-col gap-8">
          <div className={`relative group transition-all duration-1000 ${state.isTilt ? 'crt-filter animate-tilt' : ''}`}>
            <div className="absolute -inset-4 bg-green-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            
            {/* TILT Overlay */}
            {state.isTilt && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none">
                <span className="text-8xl font-black italic text-red-600 tracking-tighter shadow-glow uppercase opacity-70">TILT!</span>
              </div>
            )}

            {/* Dungeon Badge */}
            {state.isDungeon && (
              <div className="absolute top-4 right-4 z-[100] bg-orange-600 text-black px-4 py-1 rounded-full text-xs font-black animate-pulse">
                🔥 Dungeon Mode
              </div>
            )}

            {/* Golden Indicator */}
            {isGoldenNext.current && state.status === "IDLE" && (
              <div style={{ left: `calc(${(((state.dropColumn - 6) * (100/18)) + 50)}%)` }} className="absolute -top-12 transition-all duration-300">
                <span className="text-4xl">👑</span>
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

          {/* Recent Results Dots */}
          <div className="flex items-center justify-center gap-4 bg-white/[0.02] p-6 rounded-full border border-white/5 self-center">
            <span className="text-[10px] uppercase tracking-widest text-white/20 font-bold mr-2">Recent</span>
            <div className="flex gap-3">
              {state.recentBins.length === 0 && <span className="text-xs text-white/10 italic">No drops yet</span>}
              {state.recentBins.map((bin, i) => (
                <div 
                  key={i} 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black border border-white/10 shadow-lg animate-in zoom-in"
                  style={{ backgroundColor: `${binColors[bin]}22`, color: binColors[bin], borderColor: `${binColors[bin]}44` }}
                >
                  {payoutTable[bin]}x
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
      
      <footer className="mt-12 text-[10px] font-bold text-white/10 uppercase tracking-[0.4em]">
        Plinko Lab • Provably Fair Infrastructure
      </footer>
    </main>
  );
}
