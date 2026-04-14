"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { PAYOUT_TABLE, BIN_COLORS } from '@/lib/constants';

interface PlinkoBoardProps {
  path: ('L' | 'R')[];
  pegMap: number[][];
  dropColumn: number;
  binIndex: number;
  isDropping: boolean;
  reducedMotion?: boolean;
  showPath?: boolean;
  onPegHit?: () => void;
  onAnimationComplete: (binIndex: number) => void;
  isGolden?: boolean;
  isDungeon?: boolean;
  isDebug?: boolean;
}

const ROWS = 12;
const ROW_DURATION = 120; // ms
const BALL_RADIUS = 6;
const PEG_RADIUS = 3;

export const getPegPosition = (
  row: number,
  index: number,
  width: number,
  height: number
) => {
  const spacing = width / 18; // Adjusted for padding
  const rowHeight = (height * 0.8) / ROWS;
  const centerX = width / 2;
  const startY = height * 0.1;
  
  // Staggered triangular layout: Row r has r+2 pegs
  const rowPegCount = row + 2;
  const x = centerX + (index - (rowPegCount - 1) / 2) * spacing;
  const y = startY + row * rowHeight;
  
  return { x, y };
};

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  path,
  pegMap,
  dropColumn,
  binIndex,
  isDropping,
  showPath = false,
  onPegHit,
  onAnimationComplete,
  reducedMotion = false,
  isGolden = false,
  isDungeon = false,
  isDebug = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Collision state for visual effects
  const collisions = useRef<{ row: number; col: number; time: number }[]>([]);
  const particles = useRef<{ x: number; y: number; vx: number; vy: number; color: string; life: number; type?: 'confetti' | 'trail' }[]>([]);
  const ballTrail = useRef<{ x: number; y: number; life: number }[]>([]);

  const triggerConfetti = useCallback((x: number, y: number, multiplier: number) => {
    let color = '#10b981'; // green
    if (multiplier >= 5) color = '#facc15'; // gold
    if (multiplier >= 10) color = 'rainbow';

    const colors = ['#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];
    for (let i = 0; i < 20; i++) {
        const pColor = color === 'rainbow' ? colors[i % colors.length] : color;
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 1) * 10,
        color: pColor,
        life: 1.0,
        type: 'confetti'
      });
    }
  }, []);

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const width = containerRef.current.offsetWidth;
      const height = width / 0.75; // Aspect ratio exactly 0.75 (W/H)
      setDimensions({ width, height });
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    particles.current = particles.current.filter(p => p.life > 0);
    particles.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;

      if (p.type === 'confetti') {
        ctx.fillRect(p.x, p.y, 4, 6);
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // Gravity
        p.life -= 0.016; // ~60 frames
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        p.life -= 0.05;
      }
      ctx.globalAlpha = 1.0;
    });
  }, []);

  const drawBoard = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    // Background for Dungeon
    if (isDungeon) {
      ctx.fillStyle = 'rgba(45, 26, 12, 0.4)'; // Dark brown
      ctx.fillRect(0, 0, width, height);
    }

    // Draw Pegs
    for (let r = 0; r < ROWS; r++) {
      const rowPegCount = r + 2;
      for (let i = 0; i < rowPegCount; i++) {
        const { x, y } = getPegPosition(r, i, width, height);
        const bias = pegMap[r]?.[i] ?? 0.5;
        
        let color = isDungeon ? '#eab308' : `rgb(${Math.floor((1 - bias) * 255)}, 50, ${Math.floor(bias * 255)})`;
        
        ctx.beginPath();
        ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
        
        if (isDungeon) {
          // torch flicker simulation
          const flicker = 0.8 + Math.random() * 0.2;
          ctx.globalAlpha = flicker;
          ctx.fillStyle = '#f97316'; // orange torch
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 10;
        } else {
          ctx.fillStyle = color;
        }
        
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        // Debug Grid
        if (isDebug) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.font = '6px monospace';
          ctx.fillText(`[${r},${i}]`, x - 8, y - 8);
          ctx.fillText(bias.toFixed(3), x - 8, y + 12);
          
          // Next Row Expectation
          if (r < ROWS - 1) {
            const nextBias = pegMap[r+1]?.[i] ?? 0.5;
            ctx.fillText(`Next: ${nextBias.toFixed(2)}`, x - 8, y + 20);
          }
        }

        // Draw collisions
        const collision = collisions.current.find(c => c.row === r && c.col === i);
        if (collision && Date.now() - collision.time < 200) {
          const alpha = 1 - (Date.now() - collision.time) / 200;
          ctx.beginPath();
          ctx.arc(x, y, PEG_RADIUS * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(249, 115, 22, ${alpha * 0.4})`;
          ctx.fill();
        }
      }
    }
  }, [pegMap]);


  const drawBins = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, activeBin: number | null) => {
    const spacing = width / 18;
    const centerX = width / 2;
    const y = height * 0.9;
    const binWidth = spacing * 0.9;
    const binHeight = 30;

    for (let i = 0; i < 13; i++) {
      const x = centerX + (i - 6) * spacing;
      const color = BIN_COLORS[i];
      const multiplier = PAYOUT_TABLE[i];
      const isActive = activeBin === i;

      ctx.save();
      if (isActive) {
        ctx.translate(0, -5);
        ctx.scale(1.1, 1.1);
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - binWidth / 2, y, binWidth, binHeight, 4);
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${multiplier}x`, x, y + 20);
      ctx.restore();
    }
  }, []);

  const drawBall = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const gradient = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, BALL_RADIUS);
    if (isGolden) {
        gradient.addColorStop(0, '#fff7ed');
        gradient.addColorStop(0.5, '#facc15');
        gradient.addColorStop(1, '#854d0e');
    } else {
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#fbbf24');
    }

    ctx.save();
    ctx.shadowBlur = isGolden ? 20 : 15;
    ctx.shadowColor = isGolden ? '#facc15' : 'rgba(251, 191, 36, 0.6)';
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    // Trail logic
    if (isGolden) {
        particles.current.push({
            x, y, vx: 0, vy: 0, 
            color: 'rgba(250, 204, 21, 0.3)', 
            life: 0.8, 
            type: 'trail'
        });
    }
  }, [isGolden]);

  const drawPath = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (path.length === 0) return;
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    let currentPos = 0;
    const startPegP1 = getPegPosition(0, 0, width, height);
    const startPegP2 = getPegPosition(0, 1, width, height);
    ctx.moveTo((startPegP1.x + startPegP2.x) / 2, startPegP1.y);

    for (let r = 0; r < ROWS; r++) {
      if (path[r] === 'R') currentPos++;
      const p1 = getPegPosition(r + 1, currentPos, width, height);
      const p2 = getPegPosition(r + 1, currentPos + 1, width, height);
      ctx.lineTo((p1.x + p2.x) / 2, p1.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }, [path]);

  const animate = useCallback((startTime: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const elapsed = Date.now() - startTime;
    const totalDuration = ROWS * ROW_DURATION;
    const progress = Math.min(elapsed / totalDuration, 1);
    
    drawBoard(ctx, dimensions.width, dimensions.height);
    drawBins(ctx, dimensions.width, dimensions.height, progress === 1 ? binIndex : null);
    drawParticles(ctx);
    
    if (progress === 1) {
      drawPath(ctx, dimensions.width, dimensions.height);
    }

    // Ball movement logic
    const totalPathRows = ROWS;
    const currentRow = Math.floor(elapsed / ROW_DURATION);
    const rowProgress = (elapsed % ROW_DURATION) / ROW_DURATION;

    if (progress < 1) {
      const r = Math.min(currentRow, totalPathRows - 1);
      
      let currentPos = 0;
      for (let i = 0; i < r; i++) if (path[i] === 'R') currentPos++;
      
      let nextPos = currentPos;
      if (path[r] === 'R') nextPos++;

      const p1 = getPegPosition(r, currentPos, dimensions.width, dimensions.height);
      const p2 = getPegPosition(r, currentPos + 1, dimensions.width, dimensions.height);
      const currentX = (p1.x + p2.x) / 2;
      const currentY = p1.y;

      const p3 = getPegPosition(r + 1, nextPos, dimensions.width, dimensions.height);
      const p4 = getPegPosition(r + 1, nextPos + 1, dimensions.width, dimensions.height);
      const nextX = (p3.x + p4.x) / 2;
      const nextY = p3.y;

      const ballX = currentX + (nextX - currentX) * rowProgress;
      const ballY = currentY + (nextY - currentY) * rowProgress;

      // Peg collision effect
      if (rowProgress < 0.2 && currentRow >= 0) {
        const key = `hit-${currentRow}-${startTime}`;
        if (!(window as any)[key]) {
          (window as any)[key] = true;
          const dir = path[currentRow];
          // Determine which peg was hit
          let pIdx = 0;
          for(let i=0; i<currentRow; i++) if(path[i]==='R') pIdx++;
          const targetPeg = dir === 'R' ? pIdx + 1 : pIdx;
          collisions.current.push({ row: currentRow, col: targetPeg, time: Date.now() });
          onPegHit?.();
        }
      }

      drawBall(ctx, ballX, ballY);
      animationRef.current = requestAnimationFrame(() => animate(startTime));
    } else {
      // Finished landing
      const spacing = dimensions.width / 18;
      const finalX = dimensions.width / 2 + (binIndex - 6) * spacing;
      const finalY = dimensions.height * 0.9 - 5;
      
      const finishedKey = `fin-${startTime}`;
      if (!(window as any)[finishedKey]) {
        (window as any)[finishedKey] = true;
        const multiplier = PAYOUT_TABLE[binIndex];
        triggerConfetti(finalX, finalY, multiplier);
      }
      
      drawBall(ctx, finalX, finalY);
      onAnimationComplete(binIndex);
      // Keep drawing particles after landing
      if (particles.current.length > 0) {
        animationRef.current = requestAnimationFrame(() => animate(startTime));
      }
    }
  }, [dimensions, binIndex, path, drawBoard, drawBins, drawBall, drawPath, drawParticles, onAnimationComplete, onPegHit, triggerConfetti]);

  useEffect(() => {
    if (isDropping) {
      collisions.current = [];
      if (reducedMotion) {
        onAnimationComplete(binIndex);
      } else {
        const startTime = Date.now();
        animationRef.current = requestAnimationFrame(() => animate(startTime));
      }
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isDropping, animate, binIndex, onAnimationComplete, reducedMotion]);

  // Initial draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && dimensions.width > 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawBoard(ctx, dimensions.width, dimensions.height);
        drawBins(ctx, dimensions.width, dimensions.height, null);
      }
    }
  }, [dimensions, drawBoard, drawBins]);

  return (
    <div ref={containerRef} className="w-full aspect-[0.75] relative bg-black/20 rounded-3xl overflow-hidden border border-white/5">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
    </div>
  );
};

export default PlinkoBoard;
