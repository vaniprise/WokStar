import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function rectWithPadding(r, pad) {
  return {
    left: r.left - pad,
    top: r.top - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
    right: r.right + pad,
    bottom: r.bottom + pad,
  };
}

function computeTooltipPlacement({ rect, tooltipSize, prefer = 'auto', margin = 12 }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const candidates = [];
  const add = (placement, x, y) => {
    const left = clamp(x, margin, vw - tooltipSize.width - margin);
    const top = clamp(y, margin, vh - tooltipSize.height - margin);
    const dx = Math.abs(left - x);
    const dy = Math.abs(top - y);
    // Lower score = less clamping => better placement
    const score = dx + dy;
    candidates.push({ placement, left, top, score });
  };

  // Desired anchor points
  add('right', rect.right + margin, rect.top);
  add('left', rect.left - tooltipSize.width - margin, rect.top);
  add('bottom', rect.left, rect.bottom + margin);
  add('top', rect.left, rect.top - tooltipSize.height - margin);

  if (prefer !== 'auto') {
    const preferred = candidates.find(c => c.placement === prefer);
    if (preferred) return preferred;
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || { placement: 'bottom', left: margin, top: margin, score: 0 };
}

export default function TutorialOverlay({
  active,
  step,
  totalSteps,
  targetId,
  title,
  body,
  hint,
  canGoBack,
  canGoNext,
  primaryLabel = 'Next',
  onNext,
  onBack,
  onSkip,
  onExit,
  showProgress = true,
}) {
  const [targetRect, setTargetRect] = useState(null);
  const tooltipRef = useRef(null);
  const [tooltipRect, setTooltipRect] = useState({ width: 320, height: 180 });
  const [tooltipPos, setTooltipPos] = useState({ left: 12, top: 12 });

  const paddedRect = useMemo(() => {
    if (!targetRect) return null;
    return rectWithPadding(targetRect, 10);
  }, [targetRect]);

  const recomputeTargetRect = () => {
    if (!active) return;
    if (!targetId) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tutorial-id="${String(targetId)}"]`);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // Ignore 0-sized anchors.
    if (!r || r.width < 2 || r.height < 2) {
      setTargetRect(null);
      return;
    }
    setTargetRect({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
  };

  useLayoutEffect(() => {
    recomputeTargetRect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetId, step]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => recomputeTargetRect();
    const onScroll = () => recomputeTargetRect();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetId, step]);

  useLayoutEffect(() => {
    if (!active) return;
    if (!tooltipRef.current) return;
    const r = tooltipRef.current.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) setTooltipRect({ width: r.width, height: r.height });
  }, [active, title, body, hint, step]);

  useEffect(() => {
    if (!active) return;
    if (!paddedRect) {
      setTooltipPos({
        left: Math.max(12, Math.round(window.innerWidth / 2 - tooltipRect.width / 2)),
        top: Math.max(12, Math.round(window.innerHeight * 0.18)),
      });
      return;
    }
    const placement = computeTooltipPlacement({ rect: paddedRect, tooltipSize: tooltipRect, prefer: 'auto', margin: 14 });
    setTooltipPos({ left: Math.round(placement.left), top: Math.round(placement.top) });
  }, [active, paddedRect, tooltipRect]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExit?.();
      } else if (e.key === 'Enter') {
        if (!canGoNext) return;
        e.preventDefault();
        onNext?.();
      } else if (e.key === 'ArrowLeft') {
        if (!canGoBack) return;
        e.preventDefault();
        onBack?.();
      } else if (e.key === 'ArrowRight') {
        if (!canGoNext) return;
        e.preventDefault();
        onNext?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, canGoBack, canGoNext, onBack, onExit, onNext]);

  if (!active) return null;

  const dimClass = 'bg-black/70';

  // “Hole-punch” via 4 rectangles around the target.
  const topH = paddedRect ? Math.max(0, paddedRect.top) : 0;
  const leftW = paddedRect ? Math.max(0, paddedRect.left) : 0;
  const rightW = paddedRect ? Math.max(0, window.innerWidth - paddedRect.right) : 0;
  const bottomH = paddedRect ? Math.max(0, window.innerHeight - paddedRect.bottom) : 0;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Dimmers (block clicks outside hole) */}
      {paddedRect ? (
        <>
          <div className={`absolute left-0 top-0 w-full ${dimClass}`} style={{ height: topH }} />
          <div className={`absolute left-0 ${dimClass}`} style={{ top: paddedRect.top, width: leftW, height: paddedRect.height }} />
          <div className={`absolute ${dimClass}`} style={{ left: paddedRect.right, top: paddedRect.top, width: rightW, height: paddedRect.height }} />
          <div className={`absolute left-0 w-full ${dimClass}`} style={{ top: paddedRect.bottom, height: bottomH }} />
        </>
      ) : (
        <div className={`absolute inset-0 ${dimClass}`} />
      )}

      {/* Spotlight frame */}
      {paddedRect && (
        <>
          <div
            className="absolute rounded-2xl border-2 border-white/80 shadow-[0_0_0_6px_rgba(59,130,246,0.25),_0_0_30px_rgba(59,130,246,0.35)] pointer-events-none"
            style={{
              left: paddedRect.left,
              top: paddedRect.top,
              width: paddedRect.width,
              height: paddedRect.height,
            }}
          />
          <div
            className="absolute rounded-2xl border border-cyan-300/60 pointer-events-none animate-pulse"
            style={{
              left: paddedRect.left - 2,
              top: paddedRect.top - 2,
              width: paddedRect.width + 4,
              height: paddedRect.height + 4,
            }}
          />
        </>
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-auto max-w-[360px] w-[min(360px,calc(100vw-24px))] bg-neutral-950/95 border border-neutral-700 rounded-2xl shadow-2xl backdrop-blur-md p-4"
        style={{ left: tooltipPos.left, top: tooltipPos.top }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-400 font-black">
              {showProgress ? `Tutorial ${step + 1}/${totalSteps}` : 'Tutorial'}
            </div>
            <div className="text-base font-black text-white leading-snug mt-1">
              {String(title || '')}
            </div>
          </div>
          <button
            onClick={onExit}
            className="shrink-0 w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center border border-neutral-700 transition-colors"
            title="Exit tutorial (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="text-sm text-neutral-200 leading-relaxed mt-3 whitespace-pre-line">
          {String(body || '')}
        </div>
        {hint && (
          <div className="mt-3 text-[11px] text-cyan-200 bg-cyan-900/20 border border-cyan-800/40 rounded-xl px-3 py-2 leading-relaxed">
            {String(hint)}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onBack}
            disabled={!canGoBack}
            className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 text-neutral-200 font-bold text-xs uppercase tracking-widest border border-neutral-700 transition-all active:scale-[0.98]"
            title="Back (←)"
          >
            Back
          </button>
          <button
            onClick={onSkip}
            className="px-3 py-2 rounded-xl bg-neutral-800/60 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 font-bold text-xs uppercase tracking-widest border border-neutral-800 transition-all active:scale-[0.98]"
            title="Skip this step"
          >
            Skip
          </button>
          <div className="flex-1" />
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-black text-xs uppercase tracking-widest border border-orange-900/40 transition-all active:scale-[0.98]"
            title="Next (Enter/→)"
          >
            {String(primaryLabel)}
          </button>
        </div>
      </div>
    </div>
  );
}

