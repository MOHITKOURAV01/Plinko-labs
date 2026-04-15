"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { PAYOUTS, getBinColors, ROWS as DEFAULT_ROWS } from '@/lib/constants';

export interface ActiveBall {
  id: string;
  path: ('L' | 'R')[];
  pegMap: number[][];
  dropColumn: number;
  binIndex: number;
  startTime: number;
  isGolden?: boolean;
}

interface PlinkoBoardProps {
  activeBalls: ActiveBall[];
  rows: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  onAnimationComplete: (id: string, binIndex: number) => void;
  onPegHit?: () => void;
  reducedMotion?: boolean;
  dropColumn: number;
}

const ROW_DURATION = 120; // ms per row drop
const BALL_RADIUS = 7;

export const getPegPosition = (
  row: number,
  index: number,
  width: number,
  height: number,
  totalRows: number
) => {
  const spacing = width / (totalRows + 2);
  const rowHeight = (height * 0.8) / totalRows;
  const centerX = width / 2;
  const startY = height * 0.1;
  
  const rowPegCount = row + 2;
  const x = centerX + (index - (rowPegCount - 1) / 2) * spacing;
  const y = startY + row * rowHeight;
  
  return { x, y };
};

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  activeBalls,
  rows,
  risk,
  onAnimationComplete,
  onPegHit,
  reducedMotion = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const collisions = useRef<{ row: number; col: number; time: number }[]>([]);

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const parentHeight = containerRef.current.offsetHeight;
      const parentWidth = containerRef.current.offsetWidth;
      setDimensions({ width: parentWidth, height: parentHeight });
    }
  }, []);

  useEffect(() => {
    handleResize();
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [handleResize]);

  const drawBoard = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, currentRows: number) => {
    ctx.clearRect(0, 0, width, height);

    for (let r = 0; r < currentRows; r++) {
      const rowPegCount = r + 2;
      for (let i = 0; i < rowPegCount; i++) {
        const { x, y } = getPegPosition(r, i, width, height, currentRows);
        
        const collision = collisions.current.find(c => c.row === r && c.col === i);
        const isRecent = collision && Date.now() - collision.time < 300;
        const alpha = isRecent ? 1 - (Date.now() - collision.time) / 300 : 0;

        // Peg Glow (if hit)
        if (isRecent) {
          ctx.beginPath();
          ctx.arc(x, y, 6 + alpha * 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
          ctx.fill();
        }

        // 3D Peg Body
        const pegGrad = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, 4);
        pegGrad.addColorStop(0, '#FFFFFF');
        pegGrad.addColorStop(0.4, '#D1D5DB');
        pegGrad.addColorStop(1, '#4B5563');

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = pegGrad;
        ctx.fill();
        
        // Subtle Drop Shadow for peg
        ctx.beginPath();
        ctx.arc(x, y + 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
      }
    }
  }, []);

  const drawBins = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, currentRows: number, currentRisk: 'LOW'|'MEDIUM'|'HIGH', activeBins: number[]) => {
    const binsCount = currentRows + 1;
    const spacing = width / (currentRows + 2);
    const centerX = width / 2;
    const y = height * 0.92;
    const binWidth = spacing * 0.88;
    const binHeight = 36;

    const payoutTable = PAYOUTS[currentRows] ? PAYOUTS[currentRows][currentRisk] : PAYOUTS[12]['MEDIUM'];
    const colors = getBinColors(binsCount, payoutTable);

    for (let i = 0; i < binsCount; i++) {
      const x = centerX + (i - (binsCount - 1) / 2) * spacing;
      const color = colors[i];
      const multiplier = payoutTable[i];
      const isActive = activeBins.includes(i);

      ctx.save();
      if (isActive) {
        ctx.translate(0, 3);
        // Celebration Shimmer
        const shimmerGrad = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 40);
        shimmerGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
        shimmerGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shimmerGrad;
        ctx.fillRect(x - 50, y - 50, 100, 100);
      }

      // 3D Bin Body with Bevel
      const binGrad = ctx.createLinearGradient(x, y, x, y + binHeight);
      binGrad.addColorStop(0, color);
      binGrad.addColorStop(1, '#000000');

      ctx.shadowBlur = isActive ? 15 : 0;
      ctx.shadowColor = color;
      
      ctx.fillStyle = binGrad;
      ctx.beginPath();
      ctx.roundRect(x - binWidth / 2, y, binWidth, binHeight, 6);
      ctx.fill();

      // Inner Glossy Highlight
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.roundRect(x - binWidth / 2 + 2, y + 2, binWidth - 4, binHeight / 2.5, [4, 4, 0, 0]);
      ctx.fill();

      // Text with High Visibility
      ctx.fillStyle = '#000000';
      ctx.font = `900 ${binWidth < 28 ? '11px' : '14px'} Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.fillText(`${multiplier}x`, x, y + binHeight/2 + 6);
      
      ctx.restore();
    }
  }, []);

  const drawBall = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, isGolden: boolean = false) => {
    ctx.save();
    
    // Ball Shadow
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    // 3D Sphere Gradient
    const ballGrad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, BALL_RADIUS);
    if (isGolden) {
        ballGrad.addColorStop(0, '#FFD700'); // Gold Highlight
        ballGrad.addColorStop(0.5, '#DAA520'); // Golden Rod
        ballGrad.addColorStop(1, '#8B4513'); // Saddle Brown shadow
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FFD700';
    } else {
        ballGrad.addColorStop(0, '#FFFFFF'); // Highlight
        ballGrad.addColorStop(0.3, '#F3F4F6');
        ballGrad.addColorStop(1, '#9CA3AF'); // Shadow
    }

    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();
    
    // Reflection Spot
    ctx.beginPath();
    ctx.arc(x - 2.5, y - 2.5, 2, 0, Math.PI * 2);
    ctx.fillStyle = isGolden ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
    ctx.fill();

    ctx.restore();
  }, []);

  const tick = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // We isolate active balls to find which bins are currently being hit
    const hitBins: number[] = [];
    const totalDuration = rows * ROW_DURATION;
    const timeNow = Date.now();

    // In Reduced Motion, we jump to end instantly, so activeBalls shouldn't even be drawn, 
    // but the engine will prune them immediately if they are completed.
    
    // Draw Drop Indicator
    const dropSpacing = dimensions.width / (rows + 2);
    const dropX = dimensions.width / 2 + (dropColumn - rows / 2) * dropSpacing;
    const dropY = dimensions.height * 0.05;
    
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dropX - 10, dropY);
    ctx.lineTo(dropX + 10, dropY);
    ctx.lineTo(dropX, dropY + 15);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 231, 1, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00E701';
    ctx.fill();
    ctx.restore();

    // Draw Base
    drawBoard(ctx, dimensions.width, dimensions.height, rows);
    
    // Animate Balls
    const activeVisualBalls = activeBalls.filter(b => timeNow - b.startTime <= totalDuration);
    activeVisualBalls.forEach(ball => {
      const elapsed = timeNow - ball.startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      
      const currentRow = Math.floor(elapsed / ROW_DURATION);
      const rowProgress = (elapsed % ROW_DURATION) / ROW_DURATION;

      if (progress < 1) {
        const r = Math.min(currentRow, rows - 1);
        let currentPos = 0;
        for (let i = 0; i < r; i++) if (ball.path[i] === 'R') currentPos++;
        
        let nextPos = currentPos;
        if (ball.path[r] === 'R') nextPos++;

        const p1 = getPegPosition(r, currentPos, dimensions.width, dimensions.height, rows);
        const p2 = getPegPosition(r, currentPos + 1, dimensions.width, dimensions.height, rows);
        const currentX = (p1.x + p2.x) / 2;
        const currentY = p1.y;

        const p3 = getPegPosition(r + 1, nextPos, dimensions.width, dimensions.height, rows);
        const p4 = getPegPosition(r + 1, nextPos + 1, dimensions.width, dimensions.height, rows);
        const nextX = (p3.x + p4.x) / 2;
        const nextY = p3.y;

        const ballX = currentX + (nextX - currentX) * rowProgress;
        const ballY = currentY + (nextY - currentY) * rowProgress;

        // Trail for Golden Ball
        if (ball.isGolden) {
           ctx.beginPath();
           ctx.moveTo(currentX, currentY);
           ctx.lineTo(ballX, ballY);
           ctx.strokeStyle = 'rgba(218, 165, 32, 0.4)';
           ctx.lineWidth = 4;
           ctx.stroke();
        }

        // Collision logic
        if (rowProgress < 0.2 && currentRow >= 0) {
          const key = `hit-${ball.id}-${currentRow}`;
          if (!(window as any)[key]) {
            (window as any)[key] = true;
            const dir = ball.path[currentRow];
            let pIdx = 0;
            for(let i=0; i<currentRow; i++) if(ball.path[i]==='R') pIdx++;
            const targetPeg = dir === 'R' ? pIdx + 1 : pIdx;
            collisions.current.push({ row: currentRow, col: targetPeg, time: timeNow });
            onPegHit?.();
          }
        }

        drawBall(ctx, ballX, ballY, ball.isGolden);
      } else {
        hitBins.push(ball.binIndex);
        const spacing = dimensions.width / (rows + 2);
        const finalX = dimensions.width / 2 + (ball.binIndex - rows/2) * spacing;
        const finalY = dimensions.height * 0.92 - 10;
        drawBall(ctx, finalX, finalY, ball.isGolden);
      }
    });

    drawBins(ctx, dimensions.width, dimensions.height, rows, risk, hitBins);

    // Call completions safely
    activeBalls.forEach(ball => {
      const elapsed = timeNow - ball.startTime;
      if (elapsed > totalDuration || reducedMotion) {
         const finishedKey = `fin-${ball.id}`;
         if (!(window as any)[finishedKey]) {
           (window as any)[finishedKey] = true;
           onAnimationComplete(ball.id, ball.binIndex);
         }
      }
    });

    animationRef.current = requestAnimationFrame(tick);
  }, [dimensions, rows, risk, activeBalls, onAnimationComplete, onPegHit, drawBoard, drawBins, drawBall, reducedMotion]);

  useEffect(() => {
    // Continuous engine loop
    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [tick]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: dimensions.width, height: dimensions.height }}
      />
    </div>
  );
};

export default PlinkoBoard;

// Plinko Lab: Physics resolution optimization
