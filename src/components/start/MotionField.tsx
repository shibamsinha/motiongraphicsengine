import React, { useEffect, useRef } from 'react';

type Point = { x: number; y: number };
type Track = { row: number; swing: number; phase: number; speed: number; keys: number[] };

const TRACKS = 7;
const MAX_DPR = 2;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const bezier = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

export const MotionField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !parent || !ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const tracks: Track[] = Array.from({ length: TRACKS }, (_, i) => ({
      row: (i + 0.5) / TRACKS,
      swing: 0.06 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
      speed: 0.00015 + Math.random() * 0.0002,
      keys: [Math.random(), Math.random()],
    }));

    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const stroke = ctx.createLinearGradient(0, 0, width, 0);
      stroke.addColorStop(0, 'rgba(255, 77, 109, 0)');
      stroke.addColorStop(0.45, 'rgba(255, 77, 109, 0.2)');
      stroke.addColorStop(1, 'rgba(255, 179, 71, 0.06)');
      ctx.lineWidth = 1;

      for (const track of tracks) {
        const lift = Math.sin(time * track.speed + track.phase) * track.swing * height;
        const y = track.row * height;
        const a = { x: -width * 0.05, y: y + lift };
        const b = { x: width * 0.4, y: y + lift };
        const c = { x: width * 0.6, y: y - lift };
        const d = { x: width * 1.05, y: y - lift };

        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
        ctx.stroke();

        track.keys.forEach((offset, i) => {
          const t = easeInOut((time * 0.00006 * (i + 1) + offset) % 1);
          const p = bezier(a, b, c, d, t);
          const size = 3.5;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * Math.sin(Math.PI * t)})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - size);
          ctx.lineTo(p.x + size, p.y);
          ctx.lineTo(p.x, p.y + size);
          ctx.lineTo(p.x - size, p.y);
          ctx.closePath();
          ctx.fill();
        });
      }
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    resize();
    draw(0);
    const observer = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    observer.observe(parent);
    if (!reduced) frame = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="motion-field" aria-hidden="true" />;
};
