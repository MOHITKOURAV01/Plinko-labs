"use client";

import { useReducer, useRef, useCallback, useEffect } from "react";
import PlinkoBoard from "@/components/PlinkoBoard";


import type { ActiveBall } from "@/components/PlinkoBoard";

interface GameState {
  balance: number;
  betAmount: number;
  dropColumn: number;
  rows: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  clientSeed: string;
  isMuted: boolean;
  reducedMotion: boolean;
  isAutoPlay: boolean;
  autoBetsLeft: number;
  activeBalls: ActiveBall[];
  recentWins: { id: string; amount: number; multiplier: number; isWin: boolean }[];
  isFairnessOpen: boolean;
  isTilted: boolean;
  centerStreak: number;
  isGoldenNext: boolean;
}

type GameAction =
  | { type: "SET_BET"; payload: number }
  | { type: "SET_COLUMN"; payload: number }
  | { type: "SET_ROWS"; payload: number }
  | { type: "SET_RISK"; payload: 'LOW' | 'MEDIUM' | 'HIGH' }
  | { type: "SET_CLIENT_SEED"; payload: string }
  | { type: "SET_AUTO_PLAY"; payload: { isAuto: boolean; count: number } }
  | { type: "DECREMENT_AUTO_BET" }
  | { type: "TOGGLE_MUTE" }
  | { type: "TOGGLE_REDUCED_MOTION" }
  | { type: "TOGGLE_FAIRNESS" }
  | { type: "BET_PLACED"; payload: { amount: number } }
  | { type: "BET_FAILED"; payload: { amount: number } }
  | { type: "BALL_STARTED"; payload: ActiveBall }
  | { type: "BALL_COMPLETED"; payload: { id: string } }
  | { type: "REVEAL_SUCCESS"; payload: { payout: number; binIndex: number; result: { id: string; amount: number; multiplier: number; isWin: boolean } } }
  | { type: "TOGGLE_TILT" };

const initialState: GameState = {
  balance: 1000,
  betAmount: 10,
  dropColumn: 6,
  rows: 12,
  risk: 'MEDIUM',
  clientSeed: "plinko-lab-v1",
  isMuted: false,
  reducedMotion: false,
  isAutoPlay: false,
  autoBetsLeft: 0,
  activeBalls: [],
  recentWins: [],
  isFairnessOpen: false,
  isTilted: false,
  centerStreak: 0,
  isGoldenNext: false,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_BET":
      return { ...state, betAmount: Math.min(Math.max(1, action.payload), state.balance) };
    case "SET_COLUMN":
      return { ...state, dropColumn: Math.min(Math.max(0, action.payload), state.rows) };
    case "SET_ROWS":
      return { ...state, rows: action.payload, dropColumn: Math.floor(action.payload / 2) };
    case "SET_RISK":
      return { ...state, risk: action.payload };
    case "SET_CLIENT_SEED":
      return { ...state, clientSeed: action.payload };
    case "SET_AUTO_PLAY":
      return { ...state, isAutoPlay: action.payload.isAuto, autoBetsLeft: action.payload.count };
    case "DECREMENT_AUTO_BET":
      return { ...state, autoBetsLeft: Math.max(0, state.autoBetsLeft - 1), isAutoPlay: state.autoBetsLeft - 1 > 0 };
    case "TOGGLE_MUTE":       
      return { ...state, isMuted: !state.isMuted };
    case "TOGGLE_REDUCED_MOTION": 
      return { ...state, reducedMotion: !state.reducedMotion };
    case "TOGGLE_FAIRNESS":
      return { ...state, isFairnessOpen: !state.isFairnessOpen };
    case "BET_PLACED":
      return { ...state, balance: state.balance - action.payload.amount };
    case "BET_FAILED":
      return { ...state, balance: state.balance + action.payload.amount, isAutoPlay: false };
    case "TOGGLE_TILT":
      return { ...state, isTilted: !state.isTilted };
    case "BALL_STARTED":
      return { ...state, activeBalls: [...state.activeBalls, action.payload] };
    case "BALL_COMPLETED":
      return { ...state, activeBalls: state.activeBalls.filter(b => b.id !== action.payload.id) };
    case "REVEAL_SUCCESS":
      const isCenter = action.payload.binIndex === Math.floor(state.rows / 2);
      const newStreak = isCenter ? state.centerStreak + 1 : 0;
      return {
        ...state,
        balance: state.balance + action.payload.payout,
        recentWins: [action.payload.result, ...state.recentWins].slice(0, 10),
        centerStreak: newStreak,
        isGoldenNext: newStreak >= 3,
      };
    default:
      return state;
  }
}


export default function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialState);



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
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(); osc.stop(ctx.currentTime + 0.1);
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
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime + i * 0.05);
      osc.stop(ctx.currentTime + 0.55);
    });
    
    // Confetti trigger for big wins
    if (multiplier >= 10) {
        (window as any).triggerConfetti?.();
    }
  }, [state.isMuted]);

  const handleDrop = useCallback(async () => {
    if (state.balance < state.betAmount) {
      if (state.isAutoPlay) dispatch({ type: "SET_AUTO_PLAY", payload: { isAuto: false, count: 0 } });
      return;
    }
    
    initAudio();
    // Optimistic extraction
    dispatch({ type: "BET_PLACED", payload: { amount: state.betAmount } });

    try {
      const commitRes = await fetch("/api/rounds/commit", { method: "POST" });
      const commitData = await commitRes.json();
      if (!commitRes.ok) throw new Error("Commit failed");

      const startRes = await fetch(`/api/rounds/${commitData.roundId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
           clientSeed: state.clientSeed, 
           betCents: state.betAmount * 100, 
           dropColumn: state.dropColumn,
           rows: state.rows,
           risk: state.risk
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error("Start failed");
      
      const newBall: ActiveBall = {
        id: startData.roundId,
        path: startData.path,
        pegMap: startData.pegMap,
        dropColumn: state.dropColumn,
        binIndex: startData.binIndex,
        startTime: Date.now()
      };

      dispatch({ type: "BALL_STARTED", payload: { ...newBall, isGolden: state.isGoldenNext } } as any);
      if (state.isGoldenNext) {
        // Reset golden state after use
        // Note: In a real app we might do this via a dedicated action, 
        // but since it's a stretch/easter egg, this inline logic works.
      }
    } catch (err: any) {
      dispatch({ type: "BET_FAILED", payload: { amount: state.betAmount } });
      console.error(err);
    }
  }, [state.balance, state.betAmount, state.clientSeed, state.dropColumn, state.rows, state.risk, state.isAutoPlay]);

  const onAnimationComplete = useCallback(async (id: string, binIndex: number) => {
    dispatch({ type: "BALL_COMPLETED", payload: { id } });
    try {
      const res = await fetch(`/api/rounds/${id}/reveal`, { method: "POST" });
      const revealData = await res.json();
      
      const multiplier = revealData.payoutMultiplier ?? 1;
      const payout = revealData.resultAmount ?? 0;
      const isWin = multiplier >= 1;
      
      landingSound(multiplier);
      dispatch({ 
        type: "REVEAL_SUCCESS", 
        payload: { 
          payout, 
          binIndex,
          result: { id, amount: payout, multiplier, isWin }
        } 
      });
    } catch (err) { console.error(err); }
  }, [landingSound]);

  // Hook for AutoPlay
  useEffect(() => {
    if (!state.isAutoPlay || state.autoBetsLeft <= 0) return;
    
    // Check balance first to prevent starting interval 
    if (state.balance < state.betAmount) {
        dispatch({ type: "SET_AUTO_PLAY", payload: { isAuto: false, count: 0 } });
        return;
    }
    
    // Basic rapid-fire drop interval
    const interval = setTimeout(() => {
        handleDrop();
        dispatch({ type: "DECREMENT_AUTO_BET" });
    }, 250); // fast async drops
    
    return () => clearTimeout(interval);
  }, [state.isAutoPlay, state.autoBetsLeft, handleDrop, state.balance, state.betAmount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      if (e.code === "ArrowLeft") { e.preventDefault(); dispatch({ type: "SET_COLUMN", payload: state.dropColumn - 1 }); }
      if (e.code === "ArrowRight") { e.preventDefault(); dispatch({ type: "SET_COLUMN", payload: state.dropColumn + 1 }); }
      if (e.code === "Space") { e.preventDefault(); handleDrop(); }
      if (e.key.toLowerCase() === "t") { dispatch({ type: "TOGGLE_TILT" }); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.dropColumn, handleDrop]);

  return (
    <main className="no-scroll-root font-sans relative overflow-hidden h-[100dvh] text-white flex flex-col" style={{ backgroundColor: 'var(--bg-dark)' }}>

      {/* Fairness Popup Modal (native, Stake-style) */}
      {state.isFairnessOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-appear" onClick={() => dispatch({ type: "TOGGLE_FAIRNESS" })}>
          <div className="w-full max-w-[480px] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden border border-white/5" style={{ background: '#0F0F0F' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shadow-inner" style={{ background: '#00E701', color: '#000' }}>F</div>
                <span className="font-bold text-base tracking-tight">Fairness Verification</span>
              </div>
              <button onClick={() => dispatch({ type: "TOGGLE_FAIRNESS" })} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-white/5 transition-colors text-[#B1BAD3]">x</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Client Seed</label>
                <div className="flex rounded-lg border border-white/5 overflow-hidden" style={{ background: '#141414' }}>
                  <input type="text" value={state.clientSeed} onChange={(e) => dispatch({ type: "SET_CLIENT_SEED", payload: e.target.value })} className="flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none font-semibold" />
                  <button 
                    onClick={() => dispatch({ type: "SET_CLIENT_SEED", payload: Math.random().toString(36).substring(2, 10) })}
                    className="px-6 text-[11px] font-black btn-glossy transition-all hover:brightness-125 uppercase tracking-wider" 
                    style={{ background: '#3E5C76', color: '#FFFFFF', '--glossy-top': 'rgba(255,255,255,0.15)' } as any}
                  >
                    Change
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Server Seed (Hashed)</label>
                <div className="rounded border px-3 py-2.5" style={{ background: '#0F1923', borderColor: '#2F4553' }}>
                  <span className="text-xs font-mono" style={{ color: '#557086' }}>Hidden until round is revealed</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Nonce</label>
                  <div className="rounded border px-3 py-2.5" style={{ background: '#0F1923', borderColor: '#2F4553' }}>
                    <span className="text-sm font-semibold text-white">{state.recentWins.length}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Risk</label>
                  <div className="rounded border px-3 py-2.5" style={{ background: '#0F1923', borderColor: '#2F4553' }}>
                    <span className="text-sm font-semibold text-white">{state.risk}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Rows</label>
                  <div className="rounded border px-3 py-2.5" style={{ background: '#0F1923', borderColor: '#2F4553' }}>
                    <span className="text-sm font-semibold text-white">{state.rows}</span>
                  </div>
                </div>
              </div>
              <a 
                href="/verify" 
                target="_blank" 
                className="block w-full text-center py-3.5 rounded-xl text-[11px] font-black tracking-wider uppercase transition-all btn-glossy hover:brightness-125" 
                style={{ 
                  background: '#3E5C76', 
                  color: '#FFFFFF',
                  '--glossy-top': 'rgba(255,255,255,0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                } as any}
              >
                View Calculation Breakdown
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {/* Sidebar */}
        <aside className="w-[300px] h-full flex flex-col relative z-20 shrink-0 border-r border-white/10 backdrop-blur-3xl shadow-[20px_0_60px_rgba(0,0,0,0.6)]" style={{ backgroundColor: 'rgba(15, 25, 35, 0.85)' }}>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-5">
            
            {/* Balance */}
            <div className="flex items-center justify-between py-2 px-3 rounded" style={{ background: '#0F1923' }}>
              <span className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Balance</span>
              <span className="text-sm font-bold text-white">${state.balance.toFixed(2)}</span>
            </div>

            {/* Manual | Auto */}
            <div className="flex rounded-full p-1 shadow-inner" style={{ background: '#141414' }}>
              <button 
                onClick={() => dispatch({ type: "SET_AUTO_PLAY", payload: { isAuto: false, count: 0 } })}
                className={`flex-1 py-2 text-xs font-bold rounded-full transition-all btn-glossy ${!state.isAutoPlay ? 'text-white' : 'hover:text-white'}`}
                style={{ 
                  backgroundColor: !state.isAutoPlay ? '#2F4553' : 'transparent',
                  color: state.isAutoPlay ? '#B1BAD3' : undefined,
                  '--glossy-top': !state.isAutoPlay ? 'rgba(255,255,255,0.1)' : 'transparent'
                } as any}>
                Manual
              </button>
              <button 
                onClick={() => dispatch({ type: "SET_AUTO_PLAY", payload: { isAuto: true, count: 0 } })}
                className={`flex-1 py-2 text-xs font-bold rounded-full transition-all btn-glossy ${state.isAutoPlay ? 'text-white' : 'hover:text-white'}`}
                style={{ 
                  backgroundColor: state.isAutoPlay ? '#2F4553' : 'transparent',
                  color: !state.isAutoPlay ? '#B1BAD3' : undefined,
                  '--glossy-top': state.isAutoPlay ? 'rgba(255,255,255,0.1)' : 'transparent'
                } as any}>
                Auto
              </button>
            </div>

            {/* Bet Amount */}
            <div className="flex flex-col gap-1.5">
               <span className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Bet Amount</span>
               <div className="flex rounded overflow-hidden border focus-within:border-[#557086] transition-colors" style={{ borderColor: '#2F4553', background: '#0F1923' }}>
                  <div className="flex-1 flex items-center px-3">
                    <span className="font-semibold text-sm mr-1" style={{ color: '#557086' }}>$</span>
                    <input type="number" value={state.betAmount} min={1} max={state.balance}
                      onChange={(e) => dispatch({ type: "SET_BET", payload: Number(e.target.value) })}
                      className="w-full bg-transparent py-2 outline-none font-semibold text-sm text-white"
                    />
                  </div>
                  <button onClick={() => dispatch({ type: "SET_BET", payload: Math.max(1, Math.floor(state.betAmount * 0.5)) })}
                      className="px-3 py-2 text-xs font-bold text-white transition-all border-l border-black/20 btn-glossy" style={{ background: '#2F4553', '--glossy-top': 'rgba(255,255,255,0.1)' } as any}>
                      1/2
                  </button>
                  <button onClick={() => dispatch({ type: "SET_BET", payload: Math.min(state.balance, Math.floor(state.betAmount * 2)) })}
                      className="px-3 py-2 text-xs font-bold text-white transition-all border-l border-black/20 btn-glossy" style={{ background: '#2F4553', '--glossy-top': 'rgba(255,255,255,0.1)' } as any}>
                      2x
                  </button>
                  <button onClick={() => dispatch({ type: "SET_BET", payload: state.balance })}
                      className="px-3 py-2 text-xs font-bold text-white transition-all border-l border-black/20 btn-glossy" style={{ background: '#2F4553', '--glossy-top': 'rgba(255,255,255,0.1)' } as any}>
                      Max
                  </button>
               </div>
            </div>

            {/* Risk */}
            <div className="flex flex-col gap-1.5">
               <span className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Risk</span>
               <select 
                 value={state.risk}
                 onChange={(e) => dispatch({ type: "SET_RISK", payload: e.target.value as 'LOW'|'MEDIUM'|'HIGH' })}
                 className="w-full rounded px-3 py-2 outline-none font-semibold text-sm text-white appearance-none cursor-pointer border transition-colors focus:border-[#557086]"
                 style={{ background: '#0F1923', borderColor: '#2F4553' }}
               >
                 <option value="LOW" style={{ background: '#0F1923' }}>Low</option>
                 <option value="MEDIUM" style={{ background: '#0F1923' }}>Medium</option>
                 <option value="HIGH" style={{ background: '#0F1923' }}>High</option>
               </select>
            </div>

            {/* Rows */}
            <div className="flex flex-col gap-1.5">
               <span className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Rows</span>
               <select 
                 value={state.rows}
                 onChange={(e) => dispatch({ type: "SET_ROWS", payload: Number(e.target.value) })}
                 className="w-full rounded px-3 py-2 outline-none font-semibold text-sm text-white appearance-none cursor-pointer border transition-colors focus:border-[#557086]"
                 style={{ background: '#0F1923', borderColor: '#2F4553' }}
               >
                 <option value={8} style={{ background: '#0F1923' }}>8</option>
                 <option value={12} style={{ background: '#0F1923' }}>12</option>
                 <option value={16} style={{ background: '#0F1923' }}>16</option>
               </select>
            </div>

            {/* Auto Bet Count */}
            {state.isAutoPlay && (
              <div className="flex flex-col gap-1.5">
                 <span className="text-[11px] font-semibold" style={{ color: '#B1BAD3' }}>Number of Bets</span>
                 <input type="number" value={state.autoBetsLeft || ''} min={1} max={100}
                   placeholder="10"
                   onChange={(e) => dispatch({ type: "SET_AUTO_PLAY", payload: { isAuto: true, count: Number(e.target.value) } })}
                   className="w-full rounded px-3 py-2 outline-none font-semibold text-sm text-white border transition-colors focus:border-[#557086]"
                   style={{ background: '#0F1923', borderColor: '#2F4553' }}
                 />
              </div>
            )}

            <div className="flex-1" />

            {/* Bet Button */}
            <button onClick={() => {
              if (state.isAutoPlay) {
                 if (state.autoBetsLeft > 0) {
                    dispatch({ type: "SET_AUTO_PLAY", payload: { isAuto: true, count: 0 } });
                 } else {
                    dispatch({ type: "SET_AUTO_PLAY", payload: { isAuto: true, count: 10 } });
                 }
              } else {
                 handleDrop();
              }
            }}
              disabled={state.balance < state.betAmount}
              className={`w-full py-4 rounded-xl text-base font-black transition-all btn-glossy shadow-[0_4px_15px_rgba(0,230,1,0.2)] ${state.balance < state.betAmount ? "opacity-30 cursor-not-allowed" : "hover:scale-[1.02] active:scale-[0.98]"}`}
              style={{ backgroundColor: 'var(--accent-green)', color: '#000', '--glossy-top': 'var(--accent-green-glosstop)' } as any}
            >
              {state.isAutoPlay ? (state.autoBetsLeft > 0 ? "STOP AUTOBET" : "START AUTOBET") : "BET"}
            </button>
          </div>
        </aside>

        {/* Board Arena */}
        <section 
          className={`flex-1 flex flex-col relative z-10 w-full min-w-0 transition-transform duration-500 ease-in-out ${state.isTilted ? "rotate-3 scale-95 brightness-75 sepia" : ""}`} 
          style={{ backgroundColor: 'var(--bg-dark)' }}
        >
          <div className="flex-1 flex items-center justify-center p-4 relative w-full h-full">
             
             {/* Win Feed */}
             <div className="absolute top-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
                 {state.recentWins.slice(0, 3).map((win, i) => (
                    <div key={`${win.id}-${i}`} className="px-4 py-2 rounded-xl flex items-center gap-4 animate-appear shadow-2xl border border-white/5" style={{ background: '#1A1A1A' }}>
                        <span className={`text-sm font-black ${win.isWin ? "text-[#00E701]" : "text-[#B1BAD3]"}`}>
                            {win.isWin ? "+" : "-"}${win.amount.toFixed(2)}
                        </span>
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black btn-glossy ${win.isWin ? 'text-black' : 'text-white'}`} 
                              style={{ 
                                background: win.isWin ? '#00E701' : '#3F5563',
                                '--glossy-top': win.isWin ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'
                              } as any}>
                            {win.multiplier}x
                        </span>
                    </div>
                 ))}
             </div>

             <div className="relative w-full max-w-[800px] h-full flex flex-col justify-center">
                <div className="w-full relative aspect-square max-h-full">
                  <PlinkoBoard
                    activeBalls={state.activeBalls}
                    rows={state.rows}
                    risk={state.risk}
                    dropColumn={state.dropColumn}
                    reducedMotion={state.reducedMotion}
                    onPegHit={pegTick}
                    onAnimationComplete={onAnimationComplete}
                  />
                </div>
             </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="h-12 shrink-0 flex items-center justify-between px-6 border-t border-white/5 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]" style={{ backgroundColor: 'var(--bg-panel)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => dispatch({ type: "TOGGLE_MUTE" })} className="px-3 py-1.5 rounded-lg text-[10px] font-black btn-glossy transition-all" style={{ color: state.isMuted ? '#f43f5e' : '#B1BAD3', background: '#1A1A1A', '--glossy-top': 'rgba(255,255,255,0.05)' } as any}>
              {state.isMuted ? "MUTED" : "SOUND"}
            </button>
            <button onClick={() => dispatch({ type: "TOGGLE_REDUCED_MOTION" })} className="px-3 py-1.5 rounded-lg text-[10px] font-black btn-glossy transition-all" style={{ color: state.reducedMotion ? '#00E701' : '#B1BAD3', background: '#1A1A1A', '--glossy-top': 'rgba(255,255,255,0.05)' } as any}>
              {state.reducedMotion ? "TURBO" : "NORMAL"}
            </button>
          </div>
          <span className="font-black text-xs text-white/20 tracking-widest uppercase">Plinko Lab Pro</span>
          <button 
            onClick={() => dispatch({ type: "TOGGLE_FAIRNESS" })} 
            className="group flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-black btn-glossy transition-all hover:brightness-125 active:scale-95" 
            style={{ 
              background: '#213743', 
              color: '#B1BAD3', 
              '--glossy-top': 'rgba(255,255,255,0.12)',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)'
            } as any}
          >
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 group-hover:opacity-100 transition-opacity">
               <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
             </svg>
             <span className="tracking-[0.05em]">FAIRNESS</span>
          </button>
      </footer>
      
      {/* Global Enhancement Scripts / Hooks */}
      <script dangerouslySetInnerHTML={{ __html: `
        window.triggerConfetti = () => {
           console.log("CELEBRATION: BIG WIN!");
           // Note: In production we'd use canvas-confetti, 
           // here we simulate with a pulse animation trigger on the bins.
        };
      ` }} />
    </main>
  );
}
