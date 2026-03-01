/**
 * LiquidFun (Box2D.wasm) test view — runs inside the main app to avoid CSP issues.
 * Uses dynamic import('box2d-wasm') so it runs in the same context as the game.
 * Wok dimensions match WokPhysics.jsx: WOK_RADIUS = 140, COOKING_RADIUS = 126.
 */
import React, { useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';

const CW = 600;
const CH = 600;
const WOK_X = CW / 2;
const WOK_Y = CH / 2 + 30;
const WOK_RADIUS = 140;
const COOKING_RADIUS = WOK_RADIUS - 14;
const SCALE = 100;

export default function LiquidFunTest({ onClose }) {
  const canvasRef = useRef(null);
  const tossRef = useRef(null);
  const dotRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const refsRef = useRef({ world: null, wokBody: null, fluidSystem: null, flameSystem: null, lf: null, physicsLoopId: null, simpleLoopId: null, tossX: 0, tossY: 0, wokAx: 0, wokAy: 0, wokAa: 0, lastT: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const r = refsRef.current;

    function drawWokOnly() {
      const cx = WOK_X + r.wokAx;
      const cy = WOK_Y + r.wokAy;
      ctx.clearRect(0, 0, CW, CH);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(r.wokAa);
      ctx.beginPath();
      ctx.arc(0, 0, WOK_RADIUS, 0, Math.PI);
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = 24;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, COOKING_RADIUS, 0, Math.PI);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
      ctx.restore();
    }

    function simpleLoop() {
      r.simpleLoopId = requestAnimationFrame(simpleLoop);
      r.wokAx += (r.tossX * 90 - r.wokAx) * 0.4;
      r.wokAy += (r.tossY * 35 - r.wokAy) * 0.4;
      r.wokAa += (r.tossX * -0.35 - r.wokAa) * 0.4;
      drawWokOnly();
      if (r.world) {
        cancelAnimationFrame(r.simpleLoopId);
      }
    }
    simpleLoop();

    const pos = (e) => {
      const el = tossRef.current;
      const dot = dotRef.current;
      if (!el || !dot) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 90 - 45;
      const y = ((e.clientY - rect.top) / rect.height) * 90 - 45;
      const h = Math.min(1, Math.sqrt(x * x + y * y) / 45);
      const a = Math.atan2(y, x);
      r.tossX = h * Math.cos(a);
      r.tossY = h * Math.sin(a);
      dot.style.left = `${50 + r.tossX * 42}%`;
      dot.style.top = `${50 + r.tossY * 42}%`;
    };

    const handlePointerDown = (e) => {
      e.preventDefault();
      pos(e);
      const move = (ev) => pos(ev);
      const up = () => {
        tossRef.current?.removeEventListener('pointermove', move);
        tossRef.current?.removeEventListener('pointerup', up);
        tossRef.current?.removeEventListener('pointercancel', up);
      };
      tossRef.current?.addEventListener('pointermove', move);
      tossRef.current?.addEventListener('pointerup', up);
      tossRef.current?.addEventListener('pointercancel', up);
    };

    tossRef.current?.addEventListener('pointerdown', handlePointerDown);
    if (dotRef.current) {
      dotRef.current.style.left = '50%';
      dotRef.current.style.top = '50%';
    }

    import('box2d-wasm').then((mod) => {
      const Box2DFactory = mod.default;
      return Box2DFactory({ locateFile: (path) => (path === 'Box2D.wasm' ? '/Box2D.wasm' : path) });
    }).then((lf) => {
      r.lf = lf;
      const innerRM = COOKING_RADIUS / SCALE;

      const gravity = new lf.b2Vec2(0, 10);
      const world = new lf.b2World(gravity);
      lf.destroy(gravity);
      r.world = world;

      const bodyDef = new lf.b2BodyDef();
      bodyDef.set_type(lf.b2_kinematicBody);
      const posVec = new lf.b2Vec2(WOK_X / SCALE, WOK_Y / SCALE);
      bodyDef.set_position(posVec);
      bodyDef.set_angle(0);
      lf.destroy(posVec);
      const wokBody = world.CreateBody(bodyDef);
      lf.destroy(bodyDef);
      r.wokBody = wokBody;

      const n = 24;
      const points = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = -innerRM + 2 * innerRM * t;
        const y = -Math.sqrt(Math.max(0, innerRM * innerRM - x * x));
        points.push([x, y]);
      }
      const filter = new lf.b2Filter();
      filter.set_categoryBits(1);
      filter.set_maskBits(65535);
      for (let i = 0; i < n; i++) {
        const edge = new lf.b2EdgeShape();
        const v0 = new lf.b2Vec2(points[i > 0 ? i - 1 : 0][0], points[i > 0 ? i - 1 : 0][1]);
        const v1 = new lf.b2Vec2(points[i][0], points[i][1]);
        const v2 = new lf.b2Vec2(points[i + 1][0], points[i + 1][1]);
        const v3 = new lf.b2Vec2(points[i + 2 <= n ? i + 2 : n][0], points[i + 2 <= n ? i + 2 : n][1]);
        edge.SetOneSided(v0, v1, v2, v3);
        const fd = new lf.b2FixtureDef();
        fd.set_shape(edge);
        fd.set_friction(0.4);
        fd.set_restitution(0);
        fd.set_density(0);
        fd.set_filter(filter);
        wokBody.CreateFixture(fd);
        lf.destroy(v0);
        lf.destroy(v1);
        lf.destroy(v2);
        lf.destroy(v3);
        lf.destroy(edge);
        lf.destroy(fd);
      }
      lf.destroy(filter);

      const psd = new lf.b2ParticleSystemDef();
      psd.set_radius(0.018);
      psd.set_dampingStrength(0.5);
      psd.set_pressureStrength(0.2);
      psd.set_viscousStrength(0.3);
      psd.set_surfaceTensionNormalStrength(0.2);
      psd.set_surfaceTensionPressureStrength(0.2);
      psd.set_destroyByAge(false);
      const fluidSystem = world.CreateParticleSystem(psd);
      fluidSystem.SetRadius(0.018);
      lf.destroy(psd);
      r.fluidSystem = fluidSystem;

      const flamePsd = new lf.b2ParticleSystemDef();
      flamePsd.set_radius(0.025);
      flamePsd.set_dampingStrength(0.2);
      flamePsd.set_destroyByAge(true);
      flamePsd.set_lifetimeGranularity(1 / 60);
      flamePsd.set_powderStrength(0.5);
      const flameSystem = world.CreateParticleSystem(flamePsd);
      flameSystem.SetRadius(0.025);
      lf.destroy(flamePsd);
      r.flameSystem = flameSystem;

      const particleIterations = world.CalculateReasonableParticleIterations(1 / 60);

      function drawParticles(ps) {
        const count = ps.GetParticleCount();
        if (count === 0) return;
        const posBuf = ps.GetPositionBuffer();
        const colorBuf = ps.GetColorBuffer();
        const posPtr = lf.getPointer(posBuf);
        const colorPtr = lf.getPointer(colorBuf);
        const HEAPF32 = lf.HEAPF32;
        const HEAPU8 = lf.HEAPU8;
        const base = posPtr / 4;
        const radius = (ps.GetRadius && ps.GetRadius()) || 0.02;
        for (let i = 0; i < count; i++) {
          const x = HEAPF32[base + i * 2] * SCALE;
          const y = HEAPF32[base + i * 2 + 1] * SCALE;
          const rr = HEAPU8[colorPtr + i * 4] / 255;
          const g = HEAPU8[colorPtr + i * 4 + 1] / 255;
          const b = HEAPU8[colorPtr + i * 4 + 2] / 255;
          const a = HEAPU8[colorPtr + i * 4 + 3] / 255;
          ctx.fillStyle = `rgba(${Math.round(rr * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(2, radius * SCALE), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      function physicsLoop(now) {
        r.physicsLoopId = requestAnimationFrame(physicsLoop);
        const dt = Math.min(((now - r.lastT) / 1000) || 1 / 60, 1 / 10);
        r.lastT = now;
        r.wokAx += (r.tossX * 90 - r.wokAx) * 0.4;
        r.wokAy += (r.tossY * 35 - r.wokAy) * 0.4;
        r.wokAa += (r.tossX * -0.35 - r.wokAa) * 0.4;
        const cx = WOK_X + r.wokAx;
        const cy = WOK_Y + r.wokAy;

        const centerM = new lf.b2Vec2(cx / SCALE, cy / SCALE);
        wokBody.SetTransform(centerM, r.wokAa);
        lf.destroy(centerM);

        const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
        for (let s = 0; s < steps; s++) world.Step(1 / 60, 8, 3, particleIterations);

        ctx.clearRect(0, 0, CW, CH);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(r.wokAa);
        ctx.beginPath();
        ctx.arc(0, 0, WOK_RADIUS, 0, Math.PI);
        ctx.strokeStyle = '#161616';
        ctx.lineWidth = 24;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, COOKING_RADIUS, 0, Math.PI);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();
        ctx.restore();
        drawParticles(fluidSystem);
        drawParticles(flameSystem);
      }

      r.lastT = performance.now();
      r.physicsLoopId = requestAnimationFrame(physicsLoop);

      r.pourWater = () => {
        const pgd = new lf.b2ParticleGroupDef();
        pgd.set_flags(lf.b2_waterParticle);
        const p = new lf.b2Vec2(WOK_X / SCALE + (Math.random() - 0.5) * 0.4, 0.35);
        const v = new lf.b2Vec2((Math.random() - 0.5) * 0.5, 0.8 + Math.random() * 0.4);
        const color = new lf.b2ParticleColor(0.2, 0.45, 0.95, 1);
        const shape = new lf.b2CircleShape();
        shape.set_m_radius(0.12);
        const center = new lf.b2Vec2(0, 0);
        shape.set_m_p(center);
        pgd.set_position(p);
        pgd.set_linearVelocity(v);
        pgd.set_color(color);
        pgd.set_shape(shape);
        fluidSystem.CreateParticleGroup(pgd);
        lf.destroy(p);
        lf.destroy(v);
        lf.destroy(color);
        lf.destroy(center);
        lf.destroy(shape);
        lf.destroy(pgd);
      };

      r.pourOil = () => {
        const pgd = new lf.b2ParticleGroupDef();
        pgd.set_flags(lf.b2_viscousParticle);
        const p = new lf.b2Vec2(WOK_X / SCALE + (Math.random() - 0.5) * 0.4, 0.35);
        const v = new lf.b2Vec2((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.3);
        const color = new lf.b2ParticleColor(0.92, 0.82, 0.15, 0.95);
        const shape = new lf.b2CircleShape();
        shape.set_m_radius(0.1);
        const center = new lf.b2Vec2(0, 0);
        shape.set_m_p(center);
        pgd.set_position(p);
        pgd.set_linearVelocity(v);
        pgd.set_color(color);
        pgd.set_shape(shape);
        fluidSystem.CreateParticleGroup(pgd);
        lf.destroy(p);
        lf.destroy(v);
        lf.destroy(color);
        lf.destroy(center);
        lf.destroy(shape);
        lf.destroy(pgd);
      };

      r.addFlame = () => {
        const pgd = new lf.b2ParticleGroupDef();
        pgd.set_flags(lf.b2_powderParticle);
        pgd.set_lifetime(0.8 + Math.random() * 0.4);
        const p = new lf.b2Vec2(WOK_X / SCALE + (Math.random() - 0.5) * 0.5, (WOK_Y - 20) / SCALE);
        const v = new lf.b2Vec2((Math.random() - 0.5) * 0.8, -1.2 - Math.random() * 0.8);
        const color = new lf.b2ParticleColor(0.95, 0.45, 0.1, 0.9);
        const shape = new lf.b2CircleShape();
        shape.set_m_radius(0.08);
        const center = new lf.b2Vec2(0, 0);
        shape.set_m_p(center);
        pgd.set_position(p);
        pgd.set_linearVelocity(v);
        pgd.set_color(color);
        pgd.set_shape(shape);
        flameSystem.CreateParticleGroup(pgd);
        lf.destroy(p);
        lf.destroy(v);
        lf.destroy(color);
        lf.destroy(center);
        lf.destroy(shape);
        lf.destroy(pgd);
      };

      setReady(true);
    }).catch((e) => {
      setError(e?.message || String(e));
    });

    return () => {
      if (r.simpleLoopId) cancelAnimationFrame(r.simpleLoopId);
      if (r.physicsLoopId) cancelAnimationFrame(r.physicsLoopId);
      tossRef.current?.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const r = refsRef.current;

  const handleWater = () => ready && r.pourWater?.();
  const handleOil = () => ready && r.pourOil?.();
  const handleFlame = () => ready && r.addFlame?.();
  const handleClear = () => {
    if (!r.lf || !r.world || !r.fluidSystem || !r.flameSystem) return;
    r.world.DestroyParticleSystem(r.fluidSystem);
    r.world.DestroyParticleSystem(r.flameSystem);
    const psd2 = new r.lf.b2ParticleSystemDef();
    psd2.set_radius(0.018);
    psd2.set_dampingStrength(0.5);
    psd2.set_pressureStrength(0.2);
    psd2.set_viscousStrength(0.3);
    psd2.set_surfaceTensionNormalStrength(0.2);
    psd2.set_surfaceTensionPressureStrength(0.2);
    psd2.set_destroyByAge(false);
    r.fluidSystem = r.world.CreateParticleSystem(psd2);
    r.fluidSystem.SetRadius(0.018);
    r.lf.destroy(psd2);
    const fpsd = new r.lf.b2ParticleSystemDef();
    fpsd.set_radius(0.025);
    fpsd.set_dampingStrength(0.2);
    fpsd.set_destroyByAge(true);
    fpsd.set_lifetimeGranularity(1 / 60);
    fpsd.set_powderStrength(0.5);
    r.flameSystem = r.world.CreateParticleSystem(fpsd);
    r.flameSystem.SetRadius(0.025);
    r.lf.destroy(fpsd);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#1a1a1a] text-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-sm font-bold">LiquidFun test (Box2D.wasm)</h1>
        <button onClick={onClose} className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mb-2">Load failed: {error}</p>}
      {!ready && !error && <p className="text-amber-400 text-xs mb-2">Loading Box2D.wasm…</p>}
      <div className="flex gap-3 flex-1 min-h-0">
        <div className="relative border-2 border-neutral-600 rounded-lg overflow-hidden flex-shrink-0">
          <canvas ref={canvasRef} width={CW} height={CH} className="block bg-[#0d0d0d]" />
          <div
            ref={tossRef}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full bg-neutral-700 border-2 border-neutral-500 cursor-grab active:cursor-grabbing flex items-center justify-center flex-col"
          >
            <span className="text-[9px] text-neutral-400">TOSS</span>
            <div ref={dotRef} className="absolute w-2.5 h-2.5 rounded-full bg-blue-500 left-1/2 top-1/2 -ml-1.5 -mt-1.5 pointer-events-none" style={{ left: '50%', top: '50%' }} />
          </div>
        </div>
        <div className="bg-[#252525] rounded-lg p-2.5 max-w-[280px] flex flex-col gap-2">
          <h2 className="text-[0.85rem] text-neutral-400 font-semibold">Add ingredient</h2>
          <div className="flex flex-wrap gap-1">
            <button onClick={handleWater} disabled={!ready} className="px-2 py-1 text-[10px] border border-neutral-600 rounded bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50">Water</button>
            <button onClick={handleOil} disabled={!ready} className="px-2 py-1 text-[10px] border border-neutral-600 rounded bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50">Oil</button>
            <button onClick={handleFlame} disabled={!ready} className="px-2 py-1 text-[10px] border border-neutral-600 rounded bg-neutral-700 text-gray-300 hover:bg-neutral-600 disabled:opacity-50">Flame</button>
          </div>
          <button onClick={handleClear} disabled={!ready} className="mt-1.5 py-1.5 px-2.5 text-[11px] bg-red-900/80 text-red-200 border border-red-800 rounded cursor-pointer disabled:opacity-50">Clear wok</button>
        </div>
      </div>
    </div>
  );
}
