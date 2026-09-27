'use client';

import { useEffect, useRef } from 'react';
import { fillFraction, tideLevel } from '@/lib/router/headroom';
import { replenishRate } from '@/lib/router/replenish';
import type { CapacitySource, Headroom } from '@/lib/types';

/**
 * The capacity field.
 *
 * An ambient generative canvas that is not ambient decoration: every quantity in
 * it is read off the pool.
 *
 *   one lane per connected source, ordered as the basins are
 *   particle density in a lane  = tokens of headroom remaining there
 *   drift speed                 = how fast that bucket is actually refilling
 *   lane colour                 = the tide level of that source
 *   downward pull and a faster  = a run streaming against that source, tokens
 *   current out of the lane       leaving it
 *
 * The last two are why this holds still in the right way. A token-bucket provider
 * replenishes continuously, so the field drifts even when nobody is working —
 * because capacity genuinely is coming back at that moment. It stops dead when
 * every bucket is full, which is also true: nothing is being replenished.
 *
 * Canvas rather than SVG because a thousand particles in the DOM is a different
 * kind of mistake. It pauses when the tab is hidden, draws a single static frame
 * under prefers-reduced-motion, and reads its palette from CSS custom properties
 * so it follows the theme without knowing the theme exists.
 */

interface Particle {
  x: number;
  y: number;
  lane: number;
  /** Phase offset so a lane does not look like a marching grid. */
  phase: number;
  size: number;
  /** 0..1, fades in and out so lanes can change density without popping. */
  alpha: number;
  /** Set when the particle is being consumed by a streaming run. */
  leaving: boolean;
}

const MAX_PARTICLES = 950;
const LANE_PAD = 12;

export function CapacityField({
  sources,
  headroom,
  streaming,
  height = 196,
}: {
  sources: CapacitySource[];
  headroom: Record<string, Headroom | null>;
  streaming: Set<string>;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The draw loop reads live state out of a ref so React re-renders never
  // restart the animation — a field that stutters on every state change is
  // worse than no field.
  const state = useRef({ sources, headroom, streaming });
  state.current = { sources, headroom, streaming };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles: Particle[] = [];
    let raf = 0;
    let w = 0;
    let h = 0;
    let running = true;

    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const palette = () => ({
      flood: css('--water') || '#0e8c99',
      ebb: css('--shallow') || '#e0a008',
      shallow: css('--shallow') || '#e0a008',
      slack: css('--coral') || '#d6452e',
      line: css('--line') || '#ded7c8',
    });
    let colours = palette();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colours = palette();
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const laneCount = () => Math.max(1, state.current.sources.length);
    const laneY = (lane: number) => {
      const n = laneCount();
      const usable = h - LANE_PAD * 2;
      return LANE_PAD + (usable / n) * (lane + 0.5);
    };

    const spawn = (lane: number, atLeft: boolean): Particle => ({
      x: atLeft ? -8 : Math.random() * w,
      y: laneY(lane) + (Math.random() - 0.5) * (h / laneCount()) * 0.7,
      lane,
      phase: Math.random() * Math.PI * 2,
      size: 0.75 + Math.random() * 1.9,
      alpha: 0,
      leaving: false,
    });

    let last = performance.now();

    const frame = (t: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const now = Date.now();
      const { sources: srcs, headroom: hr, streaming: live } = state.current;

      // --- what the data says this frame should look like ---------------------
      const lanes = srcs.map((s, i) => {
        const hh = hr[s.id] ?? null;
        const frac = s.status === 'revoked' || s.status === 'exhausted' ? 0 : (fillFraction(hh, now) ?? 0.8);
        const rate = replenishRate(hh, now);
        return {
          index: i,
          // Owned compute has no window, so it sits at a steady healthy level
          // rather than pretending to a number it never reports.
          fraction: hh === null && s.status === 'active' ? 0.8 : frac,
          // Normalised so a huge bucket refilling slowly and a small one
          // refilling fast look comparably alive.
          speed: hh === null ? 8 : Math.min(46, 6 + (rate / Math.max(1, hh.limitTokens)) * 90_000),
          colour: colours[tideLevel(hh === null ? 0.8 : frac)] ?? colours.flood,
          draining: live.has(s.id),
          dead: s.status === 'revoked' || s.status === 'exhausted',
        };
      });

      // Density has to read as a *current*, not as scattered dust, or the lane
      // with more headroom does not visibly have more of anything.
      const totalWanted = Math.min(
        MAX_PARTICLES,
        Math.round(lanes.reduce((a, l) => a + l.fraction * 185, 0)),
      );

      // --- reconcile the particle population toward that ----------------------
      while (particles.length < totalWanted) {
        const hungriest = lanes
          .filter((l) => !l.dead)
          .sort(
            (a, b) =>
              b.fraction - particles.filter((p) => p.lane === b.index).length / 185 -
              (a.fraction - particles.filter((p) => p.lane === a.index).length / 185),
          )[0];
        if (!hungriest) break;
        particles.push(spawn(hungriest.index, false));
      }

      ctx.clearRect(0, 0, w, h);

      // Nothing connected: still water. An empty basin, drawn — which is the
      // one thing the empty state has to communicate before anything else.
      if (lanes.length === 0) {
        const surface = h * 0.66;
        // A body of still water in an empty vessel: a surface line, and the
        // shallow tint of what little is below it. Nothing moves, because
        // nothing is replenishing — which is exactly the state being shown.
        const grad = ctx.createLinearGradient(0, surface, 0, h);
        grad.addColorStop(0, colours.flood);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = grad;
        ctx.fillRect(0, surface, w, h - surface);
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = colours.flood;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, surface);
        ctx.lineTo(w, surface);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (reduced) return;
        raf = window.requestAnimationFrame(frame);
        return;
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        const lane = lanes[p.lane];
        if (!lane || lane.dead) {
          p.alpha -= dt * 2;
          if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
          }
        } else {
          p.alpha = Math.min(1, p.alpha + dt * 1.6);
        }

        const speed = lane ? lane.speed * (lane.draining ? 2.6 : 1) : 10;
        p.x += speed * dt * (reduced ? 0 : 1);
        p.phase += dt * 0.7;

        // A lane being drawn from pulls its particles down and out — tokens
        // leaving, drawn as tokens leaving.
        if (lane?.draining) p.y += 14 * dt;

        const home = lane ? laneY(lane.index) : p.y;
        const amplitude = (h / laneCount()) * 0.34;
        const wave = Math.sin(p.phase + p.x * 0.012) * amplitude;
        const target = home + wave;
        p.y += (target - p.y) * Math.min(1, dt * 1.6);

        if (p.x > w + 10 || particles.length > totalWanted + 12) {
          if (particles.length > totalWanted) {
            particles.splice(i, 1);
            continue;
          }
          p.x = -8;
          p.phase = Math.random() * Math.PI * 2;
        }

        ctx.globalAlpha = p.alpha * (lane?.draining ? 0.95 : 0.62);
        ctx.fillStyle = lane?.colour ?? colours.line;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // A short trail in the direction of travel, so speed is readable as
        // speed rather than only as position.
        if (!reduced && speed > 9) {
          ctx.globalAlpha = p.alpha * 0.26;
          ctx.strokeStyle = lane?.colour ?? colours.line;
          ctx.lineWidth = p.size * 0.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x - Math.min(46, speed * 1.1), p.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      if (reduced) return; // one frame, then hold
      raf = window.requestAnimationFrame(frame);
    };

    raf = window.requestAnimationFrame(frame);

    // A background animating in a tab nobody is looking at is pure waste.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        window.cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = window.requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="capacityField"
      style={{ height }}
      // The numbers this draws are all stated in text beside it; to a screen
      // reader it is a texture and nothing more.
      aria-hidden="true"
    />
  );
}
