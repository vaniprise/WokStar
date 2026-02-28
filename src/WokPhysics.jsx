import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { playTossShhh, playFoodImpact, playTrash as playTrashSfx } from './audioEngine';

const lerpColor = (c1, c2, ratio) => [
  c1[0] + (c2[0] - c1[0]) * ratio,
  c1[1] + (c2[1] - c1[1]) * ratio,
  c1[2] + (c2[2] - c1[2]) * ratio,
];

const resolveColor = (raw, cooked, burnt, cookRatio, burnRatio) => {
  let current = lerpColor(raw, cooked, cookRatio);
  current = lerpColor(current, burnt, burnRatio);
  return `rgb(${Math.round(current[0])}, ${Math.round(current[1])}, ${Math.round(current[2])})`;
};

const getMass = (f) => {
  const t = f.type || f.id;
  if (['beef', 'char_siu', 'gai_lan', 'mushroom'].includes(t)) return 3.5;
  if (['rice', 'noodle', 'shrimp'].includes(t)) return 2.5;
  return 2.0;
};

const getBounciness = (f) => {
  const t = f.type || f.id;
  if (t === 'noodle') return 0.15;
  if (t === 'shrimp') return 0.25;
  if (t === 'egg') return 0.2;
  return 0.35;
};

const WokPhysics = forwardRef(function WokPhysics(
  {
    heatLevel = 0, isCleaning = false, waterLevel = 0, waterDirtiness = 0,
    oilLevel = 0, isOiling = false, toss = { x: 0, y: 0 },
    cookProgress = 0, burnProgress = 0, wokHei = 0, wokResidue = 0,
    onSpill,
  },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const onSpillRef = useRef(null);
  useEffect(() => { onSpillRef.current = onSpill; }, [onSpill]);
  const spilledInstancesRef = useRef(new Set());
  const instanceCounterRef = useRef(0);
  const stateRef = useRef({
    foodBodies: [],
    particles: [],
    waterParticles: [],
    oilParticles: [],
    spawnedIngredients: [],
    wokContents: [],
    cookProgress: 0,
    burnProgress: 0,
    heatLevel: 0,
    isCleaning: false,
    waterLevel: 0,
    waterDirtiness: 0,
    oilLevel: 0,
    isOiling: false,
    toss: { x: 0, y: 0 },
    wokHei: 0,
    wokResidue: 0,
    cleanTossTriggered: false,
    trashTossTriggered: false,
    serveTossTriggered: false,
  });
  const animFrameRef = useRef(null);

  useEffect(() => { stateRef.current.heatLevel = heatLevel; }, [heatLevel]);
  useEffect(() => {
    stateRef.current.isCleaning = isCleaning;
    stateRef.current.waterLevel = waterLevel;
    stateRef.current.waterDirtiness = waterDirtiness;
  }, [isCleaning, waterLevel, waterDirtiness]);
  useEffect(() => {
    stateRef.current.oilLevel = oilLevel;
    stateRef.current.isOiling = isOiling;
  }, [oilLevel, isOiling]);
  useEffect(() => { stateRef.current.toss = toss; }, [toss]);
  useEffect(() => {
    stateRef.current.cookProgress = cookProgress;
    stateRef.current.burnProgress = burnProgress;
    stateRef.current.wokHei = wokHei;
    stateRef.current.wokResidue = wokResidue;
  }, [cookProgress, burnProgress, wokHei, wokResidue]);

  const addFood = useCallback((ingredientId) => {
    const s = stateRef.current;
    s.wokContents = [...s.wokContents, ingredientId];
  }, []);

  const clearWok = useCallback(() => {
    const s = stateRef.current;
    s.foodBodies = [];
    s.wokContents = [];
    s.spawnedIngredients = [];
    s.particles = [];
    s.oilParticles = [];
    spilledInstancesRef.current.clear();
  }, []);

  const triggerCleanToss = useCallback(() => {
    stateRef.current.cleanTossTriggered = true;
  }, []);

  const triggerTrashToss = useCallback(() => {
    stateRef.current.trashTossTriggered = true;
  }, []);

  const triggerServeToss = useCallback(() => {
    stateRef.current.serveTossTriggered = true;
  }, []);

  useImperativeHandle(ref, () => ({ addFood, clearWok, triggerCleanToss, triggerTrashToss, triggerServeToss }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CW = 400;
    const CH = 400;
    canvas.width = CW;
    canvas.height = CH;

    const wokCenterX = CW / 2;
    const wokCenterY = CH / 2 + 30;
    const wokRadius = 140;

    let metalTemp = 0;
    let lastTime = performance.now();
    const targetInterval = 1000 / 60;

    let wokAnimX = 0, wokAnimY = 0, wokAnimAngle = 0;
    let prevWokX = null, prevWokY = null;
    let cleanThrowPos = 0, cleanThrowVel = 0;
    let screenShake = 0;

    // Serve animation state
    let serveAnim = null; // { phase, timer, plateX, servedFood, servedOil }

    const renderLoop = (time) => {
      animFrameRef.current = requestAnimationFrame(renderLoop);
      if (!time) time = performance.now();
      const elapsed = time - lastTime;
      if (elapsed < targetInterval) return;
      lastTime = time - (elapsed % targetInterval);
      const dt = Math.min(elapsed / targetInterval, 3);

      const s = stateRef.current;

      ctx.clearRect(0, 0, CW, CH);
      ctx.save();

      // Screen shake
      if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        screenShake *= 0.8;
        if (screenShake < 0.5) screenShake = 0;
      }

      // Clean toss spring physics
      if (s.cleanTossTriggered) {
        s.cleanTossTriggered = false;
        cleanThrowVel = 80;
        screenShake = Math.max(screenShake, 5);
        playTossShhh();

        const dirt = s.waterDirtiness / 100;
        const r = Math.floor(34 + dirt * 100);
        const g = Math.floor(211 - dirt * 100);
        const b = Math.floor(238 - dirt * 180);

        s.waterParticles.forEach(wp => {
          s.particles.push({
            type: 'splash',
            color: `rgba(${r}, ${g}, ${b}, 0.8)`,
            x: wp.x, y: wp.y,
            vx: 25 + Math.random() * 20,
            vy: -15 - Math.random() * 15,
            life: 1, maxLife: 30 + Math.random() * 20,
            size: 3 + Math.random() * 4,
          });
        });
        s.waterParticles = [];
      }

      // Trash toss - flings food out with the same wok flip
      if (s.trashTossTriggered) {
        s.trashTossTriggered = false;
        cleanThrowVel = 80;
        screenShake = Math.max(screenShake, 5);
        playTossShhh();

        s.foodBodies.forEach(f => {
          s.particles.push({
            type: 'splash',
            color: 'rgba(80, 60, 40, 0.7)',
            x: f.x, y: f.y,
            vx: 20 + Math.random() * 25,
            vy: -12 - Math.random() * 18,
            life: 1, maxLife: 35 + Math.random() * 20,
            size: f.size * 0.4 + Math.random() * 3,
          });
        });
        s.oilParticles.forEach(p => {
          s.particles.push({
            type: 'splash',
            color: 'rgba(200, 160, 40, 0.6)',
            x: p.x, y: p.y,
            vx: 18 + Math.random() * 15,
            vy: -10 - Math.random() * 12,
            life: 1, maxLife: 25 + Math.random() * 15,
            size: 2 + Math.random() * 3,
          });
        });
        s.foodBodies = [];
        s.oilParticles = [];
        s.wokContents = [];
        s.spawnedIngredients = [];
        spilledInstancesRef.current.clear();
      }

      // Serve animation - tip wok onto a sliding plate
      if (s.serveTossTriggered && !serveAnim) {
        s.serveTossTriggered = false;
        serveAnim = {
          phase: 0,   // 0=plate slides in, 1=pour, 2=plate slides out
          timer: 0,
          plateX: CW + 80,
          plateTargetX: wokCenterX + wokRadius + 30,
          servedFood: [],
          servedOil: [],
          sparkles: [],
          tiltAmount: 0,
        };
      }

      if (serveAnim) {
        serveAnim.timer += dt;
        const sa = serveAnim;

        if (sa.phase === 0) {
          // Plate slides in from the right
          sa.plateX += (sa.plateTargetX - sa.plateX) * 0.25 * dt;
          sa.tiltAmount += (0.4 - sa.tiltAmount) * 0.15 * dt;
          if (Math.abs(sa.plateX - sa.plateTargetX) < 3 || sa.timer > 20) {
            sa.plateX = sa.plateTargetX;
            sa.phase = 1;
            sa.timer = 0;
          }
        } else if (sa.phase === 1) {
          // Pour food onto plate
          sa.tiltAmount += (0.5 - sa.tiltAmount) * 0.2 * dt;
          const plateTopY = wokCenterY + wokRadius * 0.6;

          // Move food bodies onto plate
          if (s.foodBodies.length > 0) {
            const pourRate = Math.max(2, Math.ceil(s.foodBodies.length * 0.5));
            for (let k = 0; k < pourRate && s.foodBodies.length > 0; k++) {
              const f = s.foodBodies.pop();
              const tx = sa.plateTargetX + (Math.random() - 0.5) * 50;
              const ty = plateTopY - 5 - Math.random() * 15;
              sa.servedFood.push({
                ...f,
                landed: false,
                targetX: tx,
                targetY: ty,
              });
              for (let j = 0; j < 2; j++) {
                sa.sparkles.push({
                  x: f.x, y: f.y,
                  vx: 3 + Math.random() * 8,
                  vy: -5 - Math.random() * 6,
                  life: 0, maxLife: 15 + Math.random() * 10,
                  size: 1.5 + Math.random() * 2,
                });
              }
            }
          }
          // Move oil particles too
          while (s.oilParticles.length > 0) {
            const p = s.oilParticles.pop();
            sa.servedOil.push({
              x: p.x, y: p.y,
              targetX: sa.plateTargetX + (Math.random() - 0.5) * 40,
              targetY: plateTopY - Math.random() * 8,
              landed: false,
            });
          }

          // Animate served food toward plate using lerp
          let allLanded = true;
          sa.servedFood.forEach(sf => {
            if (!sf.landed) {
              sf.x += (sf.targetX - sf.x) * 0.2 * dt;
              sf.y += (sf.targetY - sf.y) * 0.2 * dt;
              const dx = sf.targetX - sf.x;
              const dy = sf.targetY - sf.y;
              if (dx * dx + dy * dy < 9) {
                sf.landed = true;
                sf.x = sf.targetX;
                sf.y = sf.targetY;
              } else {
                allLanded = false;
              }
            }
          });
          sa.servedOil.forEach(so => {
            if (!so.landed) {
              so.x += (so.targetX - so.x) * 0.25 * dt;
              so.y += (so.targetY - so.y) * 0.25 * dt;
              const dx = so.targetX - so.x;
              const dy = so.targetY - so.y;
              if (dx * dx + dy * dy < 9) {
                so.landed = true;
                so.x = so.targetX;
                so.y = so.targetY;
              }
            }
          });

          // Advance when all landed or after a generous timeout
          if ((allLanded && s.foodBodies.length === 0) || sa.timer > 30) {
            // Force-land any stragglers
            sa.servedFood.forEach(sf => { sf.landed = true; sf.x = sf.targetX; sf.y = sf.targetY; });
            sa.servedOil.forEach(so => { so.landed = true; so.x = so.targetX; so.y = so.targetY; });
            sa.phase = 2;
            sa.timer = 0;
          }
        } else if (sa.phase === 2) {
          // Plate slides out to the right, wok returns to center
          const slideSpeed = 10 + sa.timer * 0.5;
          sa.plateX += slideSpeed * dt;
          sa.tiltAmount += (0 - sa.tiltAmount) * 0.25 * dt;

          // Move served food/oil with the plate
          sa.servedFood.forEach(sf => { sf.x += slideSpeed * dt; });
          sa.servedOil.forEach(so => { so.x += slideSpeed * dt; });

          if (sa.plateX > CW + 100) {
            s.foodBodies = [];
            s.oilParticles = [];
            s.wokContents = [];
            s.spawnedIngredients = [];
            spilledInstancesRef.current.clear();
            serveAnim = null;
          }
        }

        // Update sparkles
        if (sa) {
          for (let i = sa.sparkles.length - 1; i >= 0; i--) {
            const sp = sa.sparkles[i];
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            sp.vy += 0.3 * dt;
            sp.life += dt;
            if (sp.life >= sp.maxLife) sa.sparkles.splice(i, 1);
          }
        }
      }

      cleanThrowVel -= cleanThrowPos * 0.12 * dt;
      cleanThrowVel *= Math.pow(0.85, dt);
      cleanThrowPos += cleanThrowVel * dt;

      // Wok animation from toss pad + clean throw + serve tilt
      const serveTilt = serveAnim ? serveAnim.tiltAmount : 0;
      const targetWokX = s.toss.x * 90 + cleanThrowPos + serveTilt * 30;
      const targetWokY = s.toss.y * 35 - (cleanThrowPos * 0.2);
      const targetAngle = s.toss.x * -0.35 + (cleanThrowPos * 0.012) + serveTilt;

      wokAnimX += (targetWokX - wokAnimX) * 0.4;
      wokAnimY += (targetWokY - wokAnimY) * 0.4;
      wokAnimAngle += (targetAngle - wokAnimAngle) * 0.4;

      const currentWokX = wokCenterX + wokAnimX;
      const currentWokY = wokCenterY + wokAnimY;

      if (prevWokX === null) { prevWokX = currentWokX; prevWokY = currentWokY; }
      const wokVx = currentWokX - prevWokX;
      const wokVy = currentWokY - prevWokY;
      prevWokX = currentWokX;
      prevWokY = currentWokY;

      const isTossingGlobal = Math.abs(wokVx) > 1 || Math.abs(wokVy) > 1;

      // ==========================================
      // SPAWN NEW INGREDIENTS
      // ==========================================
      while (s.spawnedIngredients.length < s.wokContents.length) {
        const newIngId = s.wokContents[s.spawnedIngredients.length];
        s.spawnedIngredients.push(newIngId);

        const spawnY = currentWokY - 200 - Math.random() * 50;
        const dropVy = 8 + Math.random() * 6;
        const instId = ++instanceCounterRef.current;
        const scatterX = 110;
        const scatterVx = 11;

        const LIQUIDS = ['soy_sauce', 'oyster_sauce', 'wine', 'xo_sauce'];
        const DUSTS = ['msg', 'white_pepper', 'five_spice', 'salt', 'sugar'];

        if (LIQUIDS.includes(newIngId)) {
          const liquidColor = newIngId === 'soy_sauce' ? 'rgba(50,25,10,0.8)' : newIngId === 'wine' ? 'rgba(200,120,20,0.7)' : newIngId === 'xo_sauce' ? 'rgba(180,60,10,0.9)' : 'rgba(20,10,5,0.9)';
          for (let i = 0; i < 40; i++) {
            s.particles.push({ type: 'splash', color: liquidColor, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 30, vx: (Math.random() - 0.5) * 4, vy: dropVy + (Math.random() - 0.5) * 2, life: 1, maxLife: 20 + Math.random() * 10, size: 3 + Math.random() * 4 });
          }
        } else if (DUSTS.includes(newIngId)) {
          let dustColor = 'rgba(255, 255, 255, 0.9)';
          if (newIngId === 'sugar') dustColor = 'rgba(240, 240, 245, 0.8)';
          if (newIngId === 'five_spice') dustColor = 'rgba(139, 69, 19, 0.8)';
          if (newIngId === 'white_pepper') dustColor = 'rgba(220, 220, 210, 0.8)';
          for (let i = 0; i < 50; i++) {
            s.particles.push({ type: 'dust', color: dustColor, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 40, vx: (Math.random() - 0.5) * 5, vy: dropVy + (Math.random() - 0.5) * 3, life: 1, maxLife: 30 + Math.random() * 20, size: 1 + Math.random() * 2 });
          }
        } else if (newIngId === 'rice') {
          const pc = 50;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'grain', id: newIngId, instanceId: instId, pCount: pc, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.4, size: 6 + Math.random() * 2 });
        } else if (newIngId === 'egg') {
          const pc = 15;
          for (let i = 0; i < pc; i++) {
            const blobs = Array(3).fill(0).map(() => ({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, r: 4 + Math.random() * 4 }));
            s.foodBodies.push({ type: 'egg', id: newIngId, instanceId: instId, pCount: pc, blobs, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.2, size: 12 });
          }
        } else if (newIngId === 'beef') {
          const pc = 8;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'beef', id: newIngId, instanceId: instId, pCount: pc, w: 25 + Math.random() * 15, h: 12 + Math.random() * 6, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.3, size: 20 });
        } else if (newIngId === 'char_siu') {
          const pc = 10;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'char_siu', id: newIngId, instanceId: instId, pCount: pc, w: 18 + Math.random() * 8, h: 14 + Math.random() * 6, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.3, size: 18 });
        } else if (newIngId === 'noodle') {
          const pc = 12;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'noodle', id: newIngId, instanceId: instId, pCount: pc, w: 55 + Math.random() * 35, h: 5 + Math.random() * 4, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.15, size: 26, wavePhase: Math.random() * Math.PI * 2, waveAmp: 0.3 + Math.random() * 0.4 });
        } else if (newIngId === 'shrimp') {
          const pc = 7;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'shrimp', id: newIngId, instanceId: instId, pCount: pc, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.35, size: 14 + Math.random() * 4, bend: 0 });
        } else if (newIngId === 'gai_lan') {
          const pc = 10;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'gai_lan', id: newIngId, instanceId: instId, pCount: pc, w: 12 + Math.random() * 8, h: 25 + Math.random() * 10, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.4, size: 24 });
        } else if (newIngId === 'mushroom') {
          const pc = 12;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'mushroom', id: newIngId, instanceId: instId, pCount: pc, w: 18 + Math.random() * 8, h: 18 + Math.random() * 8, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.4, size: 20 });
        } else if (newIngId === 'chili') {
          const pc = 15;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'chili', id: newIngId, instanceId: instId, pCount: pc, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 7 + Math.random() * 3 });
        } else if (newIngId === 'scallion') {
          const pc = 25;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'scallion', id: newIngId, instanceId: instId, pCount: pc, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 8 + Math.random() * 3 });
        } else if (newIngId === 'garlic') {
          const pc = 15;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'garlic', id: newIngId, instanceId: instId, pCount: pc, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 5 + Math.random() * 2 });
        } else if (newIngId === 'ginger') {
          const pc = 20;
          for (let i = 0; i < pc; i++) s.foodBodies.push({ type: 'ginger', id: newIngId, instanceId: instId, pCount: pc, x: currentWokX + (Math.random() - 0.5) * scatterX, y: spawnY - Math.random() * 60, vx: (Math.random() - 0.5) * scatterVx, vy: dropVy + (Math.random() - 0.5) * 2, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 4 + Math.random() * 2 });
        }
      }

      if (s.wokContents.length === 0 && !serveAnim) {
        s.foodBodies = [];
        s.spawnedIngredients = [];
      }

      // ==========================================
      // PHYSICS: GRAVITY, COLLISION & OVERLAPS
      // ==========================================
      s.foodBodies.forEach(f => {
        const mass = getMass(f);
        f.vy += (0.8 + 0.08 * mass) * dt;

        if (f.type === 'noodle') {
          f.wavePhase = (f.wavePhase || 0) + dt * (2 + Math.abs(f.vx + f.vy) * 0.3);
        }
        if (f.type === 'shrimp') {
          const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
          const targetBend = Math.max(-0.4, Math.min(0.4, (f.vx - f.vy) * 0.04));
          f.bend = (f.bend || 0) + (targetBend - (f.bend || 0)) * 0.15 * dt;
        }

        if (!isTossingGlobal) {
          if (Math.abs(f.vx) < 0.15) f.vx *= 0.9;
          if (Math.abs(f.vy) < 0.15 && f.y > currentWokY) f.vy *= 0.9;
        }

        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rotation += f.rotSpeed * dt;
      });

      // Wok collisions
      s.foodBodies.forEach(f => {
        const dx = f.x - currentWokX;
        const mass = getMass(f);
        const bounciness = getBounciness(f);

        if (!f.spilled) {
          if (Math.abs(dx) > wokRadius + 5 && f.y > currentWokY - 5) {
            f.spilled = true;
            const isFirstForInstance = f.instanceId && !spilledInstancesRef.current.has(f.instanceId);
            if (isFirstForInstance) {
              spilledInstancesRef.current.add(f.instanceId);
              playTrashSfx();
            }
            onSpillRef.current?.(f.id, f.instanceId, f.pCount || 1, isFirstForInstance);
          }
        }

        if (!f.spilled) {
          const maxDx = wokRadius - 5;
          const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
          const angleOffset = Math.tan(wokAnimAngle) * clampedDx;
          const groundY = currentWokY + angleOffset + Math.sqrt(wokRadius * wokRadius - clampedDx * clampedDx) - f.size / 2;

          if (f.y >= groundY) {
            if (f.vy > 3) playFoodImpact();
            f.y = groundY;

            if (isTossingGlobal) {
              f.vy *= -bounciness;
              f.vx *= 0.9;
              f.rotSpeed *= 0.8;
              f.vx -= (clampedDx / maxDx) * (2.0 / mass);

              const safeVx = Math.max(-18, Math.min(18, wokVx));
              const safeVy = Math.max(-18, Math.min(18, wokVy));
              f.vx += safeVx * (0.15 / mass);
              f.vy += safeVy * 0.3;
              f.vx += Math.sin(wokAnimAngle) * (2.0 / mass);
            } else {
              f.vy = 0;
              f.vx *= 0.35;
              f.rotSpeed *= 0.9;
              if (Math.abs(f.vx) < 0.15) f.vx = 0;
            }
          }

          if (f.y > currentWokY - 150) {
            if (f.x < currentWokX - wokRadius + 15) { f.x = currentWokX - wokRadius + 15; f.vx *= -0.5; }
            if (f.x > currentWokX + wokRadius - 15) { f.x = currentWokX + wokRadius - 15; f.vx *= -0.5; }
          }
        } else {
          f.vy += 0.8 * mass * dt;
        }
      });

      s.foodBodies = s.foodBodies.filter(f => f.y < CH + 100);

      // Soft body overlaps — different stiffness per type
      for (let step = 0; step < 2; step++) {
        for (let i = 0; i < s.foodBodies.length; i++) {
          for (let j = i + 1; j < s.foodBodies.length; j++) {
            const f1 = s.foodBodies[i], f2 = s.foodBodies[j];
            let ddx = f2.x - f1.x;
            let ddy = f2.y - f1.y;
            let distSq = ddx * ddx + ddy * ddy;
            const r1 = (f1.w ? (f1.w + f1.h) / 2 : f1.size) || f1.size;
            const r2 = (f2.w ? (f2.w + f2.h) / 2 : f2.size) || f2.size;
            const minDist = (r1 + r2) * 0.5 * (isTossingGlobal ? 0.6 : 0.5);
            const minDistSq = minDist * minDist;

            if (distSq < minDistSq && distSq > 0.01) {
              const dist = Math.sqrt(distSq);
              const isNoodle1 = f1.type === 'noodle';
              const isNoodle2 = f2.type === 'noodle';
              const softFactor = (isNoodle1 || isNoodle2) ? 0.6 : 1.0;
              const overlap = (minDist - dist) * (isTossingGlobal ? 0.4 : 0.08) * softFactor;
              let nx = ddx / dist;
              let ny = ddy / dist;

              if (!isTossingGlobal) {
                if (Math.abs(ny) < 0.7) { ny = ny < 0 ? -0.85 : 0.85; nx *= 0.25; }
              }

              f1.x -= nx * overlap;
              f1.y -= ny * overlap;
              f2.x += nx * overlap;
              f2.y += ny * overlap;

              const relVx = f2.vx - f1.vx;
              const relVy = f2.vy - f1.vy;
              const aerationForce = isTossingGlobal ? (isNoodle1 || isNoodle2 ? 0.45 : 0.28) : 0;
              f1.vx += relVx * aerationForce;
              f1.vy += relVy * aerationForce;
              f2.vx -= relVx * aerationForce;
              f2.vy -= relVy * aerationForce;

              if (!isTossingGlobal) {
                const damp = (isNoodle1 || isNoodle2) ? 0.6 : 0.5;
                f1.vx *= damp; f2.vx *= damp;
                f1.vy *= 0.85; f2.vy *= 0.85;
              }
            }
          }
        }
      }

      // ==========================================
      // OIL FLUID PARTICLE ENGINE
      // ==========================================
      const targetOilCount = Math.floor(s.oilLevel * 3.5);
      const missingOil = targetOilCount - s.oilParticles.length;

      if (missingOil > 0) {
        const spawnAmount = s.isOiling ? Math.min(12, missingOil) : missingOil;
        for (let i = 0; i < spawnAmount; i++) {
          const isInstant = !s.isOiling;
          s.oilParticles.push({
            x: currentWokX + (Math.random() - 0.5) * (isInstant ? 100 : 10),
            y: isInstant ? currentWokY + 50 + Math.random() * 50 : currentWokY - 180 - Math.random() * 10,
            vx: (Math.random() - 0.5) * (isInstant ? 3 : 0.8),
            vy: isInstant ? 0 : Math.random() * 2 + 8,
            size: 1.5 + Math.random() * 2.0,
            spilled: false,
            depthOffset: Math.random(),
          });
        }
      } else if (missingOil < 0) {
        const removeCount = Math.min(Math.abs(missingOil), 10);
        for (let i = 0; i < removeCount; i++) {
          const unspilledIdx = s.oilParticles.findIndex(p => !p.spilled);
          if (unspilledIdx !== -1) s.oilParticles.splice(unspilledIdx, 1);
          else s.oilParticles.pop();
        }
      }

      s.oilParticles.forEach(p => {
        p.vy += 0.8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const dx = p.x - currentWokX;
        if (!p.spilled && Math.abs(dx) > wokRadius + 15 && p.y > currentWokY - 20) {
          p.spilled = true;
        }

        if (!p.spilled) {
          const maxDx = wokRadius - 2;
          const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
          const angleOffset = Math.tan(wokAnimAngle) * clampedDx;
          const groundY = currentWokY + angleOffset + Math.sqrt(wokRadius * wokRadius - clampedDx * clampedDx) - p.size;
          const poolDepth = s.oilLevel * 0.8;
          const surfaceY = currentWokY + wokRadius - p.size - poolDepth;

          let targetY = groundY;
          if (surfaceY < groundY) {
            targetY = surfaceY + (groundY - surfaceY) * p.depthOffset;
          }

          if (p.y >= targetY) {
            p.y = targetY;
            p.vy *= -0.1;
            p.vx *= 0.9;
            if (targetY === groundY) {
              p.vx -= clampedDx * 0.06;
            } else {
              p.vx += (Math.random() - 0.5) * 3.5;
            }
            const safeVx = Math.max(-18, Math.min(18, wokVx));
            const safeVy = Math.max(-18, Math.min(18, wokVy));
            p.vx += safeVx * 0.03;
            p.vy += safeVy * 0.1;
            p.vx += Math.sin(wokAnimAngle) * 1.0;
          }

          if (Math.abs(dx) > wokRadius * 0.7 && p.y < currentWokY + 30) {
            p.vy += 2.0;
            p.vx *= 0.5;
          }

          if (p.y > currentWokY - 120) {
            if (p.x < currentWokX - wokRadius + 5) { p.x = currentWokX - wokRadius + 5; p.vx *= -0.5; }
            if (p.x > currentWokX + wokRadius - 5) { p.x = currentWokX + wokRadius - 5; p.vx *= -0.5; }
          }
        }
      });
      s.oilParticles = s.oilParticles.filter(p => p.y < CH + 100);

      // ==========================================
      // WATER FLUID PARTICLE ENGINE
      // ==========================================
      const targetWaterCount = Math.floor(s.waterLevel * 4.0);
      const missingWater = targetWaterCount - s.waterParticles.length;

      if (missingWater > 0 && s.isCleaning) {
        const spawnAmount = Math.min(15, missingWater);
        for (let i = 0; i < spawnAmount; i++) {
          s.waterParticles.push({
            x: currentWokX + (Math.random() - 0.5) * 20,
            y: currentWokY - 180 - Math.random() * 10,
            vx: (Math.random() - 0.5) * 1.5,
            vy: Math.random() * 3 + 10,
            size: 2.0 + Math.random() * 2.0,
            spilled: false,
            depthOffset: Math.random(),
          });
        }
      }

      s.waterParticles.forEach(p => {
        p.vy += 0.6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const dx = p.x - currentWokX;
        if (!p.spilled && Math.abs(dx) > wokRadius + 5 && p.y > currentWokY - 20) {
          p.spilled = true;
        }

        if (!p.spilled) {
          const maxDx = wokRadius - 2;
          const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
          const angleOffset = Math.tan(wokAnimAngle) * clampedDx;
          const groundY = currentWokY + angleOffset + Math.sqrt(wokRadius * wokRadius - clampedDx * clampedDx) - p.size;
          const poolDepth = s.waterLevel * 0.9;
          const surfaceY = currentWokY + wokRadius - p.size - poolDepth;
          let targetY = groundY;
          if (surfaceY < groundY) targetY = surfaceY + (groundY - surfaceY) * p.depthOffset;

          if (p.y >= targetY) {
            p.y = targetY;
            p.vy *= -0.1;
            p.vx *= 0.95;
            if (targetY === groundY) {
              p.vx -= clampedDx * 0.08;
            } else {
              p.vx += (Math.random() - 0.5) * 4.5;
            }
            const safeVx = Math.max(-18, Math.min(18, wokVx));
            const safeVy = Math.max(-18, Math.min(18, wokVy));
            p.vx += safeVx * 0.05;
            p.vy += safeVy * 0.15;
            p.vx += Math.sin(wokAnimAngle) * 2.0;
          }

          if (Math.abs(dx) > wokRadius * 0.7 && p.y < currentWokY + 30) {
            p.vy += 2.5;
            p.vx *= 0.5;
          }
          if (p.y > currentWokY - 120) {
            if (p.x < currentWokX - wokRadius + 5) { p.x = currentWokX - wokRadius + 5; p.vx *= -0.5; }
            if (p.x > currentWokX + wokRadius - 5) { p.x = currentWokX + wokRadius - 5; p.vx *= -0.5; }
          }
        }
      });
      s.waterParticles = s.waterParticles.filter(p => p.y < CH + 100);

      // ==========================================
      // PARTICLE GENERATION (Fire, Smoke, Oil Smoke, Bubbles)
      // ==========================================

      // Fire particles from burner (under wok)
      const fireCount = s.particles.reduce((n, p) => n + (p.type === 'fire' ? 1 : 0), 0);
      const FIRE_CAP = 200;
      if (s.heatLevel > 5 && !s.isCleaning && fireCount < FIRE_CAP) {
        const budget = FIRE_CAP - fireCount;
        const intensity = Math.min(1, (s.heatLevel - 5) / 95);
        const isJet = s.heatLevel > 60;
        const jetFactor = isJet ? (s.heatLevel - 60) / 40 : 0;

        // Base ring flames around the wok edge
        const baseCount = Math.min(budget, Math.ceil(intensity * 6) + 1);
        for (let i = 0; i < baseCount; i++) {
          const angle = Math.random() * Math.PI;
          const offsetR = wokRadius + 2 + Math.random() * 12;
          s.particles.push({
            type: 'fire',
            layer: Math.random() < 0.4 ? 'back' : 'front',
            x: currentWokX + Math.cos(angle) * offsetR,
            y: currentWokY + Math.sin(angle) * offsetR,
            vx: (Math.random() - 0.5) * 2,
            vy: -2.5 - Math.random() * 4 - jetFactor * 6,
            life: 0,
            maxLife: 8 + Math.random() * 10 + jetFactor * 6,
            size: 4 + Math.random() * (8 * intensity) + jetFactor * 5,
            wobbleSpeed: 0.15 + Math.random() * 0.4,
            wobbleOffset: Math.random() * Math.PI * 2,
          });
        }

        // Inner ring — smaller tongues between the edge flames
        const innerCount = Math.min(budget - baseCount, Math.ceil(intensity * 4));
        for (let i = 0; i < innerCount; i++) {
          const angle = Math.random() * Math.PI;
          const offsetR = wokRadius * (0.5 + Math.random() * 0.5);
          s.particles.push({
            type: 'fire',
            layer: Math.random() < 0.6 ? 'back' : 'front',
            x: currentWokX + Math.cos(angle) * offsetR,
            y: currentWokY + Math.sin(angle) * offsetR,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -1.5 - Math.random() * 2.5 - jetFactor * 3,
            life: 0,
            maxLife: 6 + Math.random() * 8,
            size: 3 + Math.random() * 5 * intensity,
            wobbleSpeed: 0.2 + Math.random() * 0.5,
            wobbleOffset: Math.random() * Math.PI * 2,
          });
        }

        // Central jet column — fires straight up from under the wok center
        if (s.heatLevel > 30) {
          const jetIntensity = (s.heatLevel - 30) / 70;
          const jetCount = Math.min(budget >> 1, Math.ceil(jetIntensity * 6) + (isJet ? Math.ceil(jetFactor * 8) : 0));
          for (let i = 0; i < jetCount; i++) {
            const spread = isJet ? 20 + (1 - jetFactor) * 35 : 70;
            const speed = 5 + jetIntensity * 6 + jetFactor * 10;
            s.particles.push({
              type: 'fire',
              layer: Math.random() < 0.5 ? 'back' : 'front',
              x: currentWokX + (Math.random() - 0.5) * spread,
              y: currentWokY + wokRadius + 3 + Math.random() * 12,
              vx: (Math.random() - 0.5) * (isJet ? 0.6 : 3),
              vy: -speed - Math.random() * 4,
              life: 0,
              maxLife: 8 + Math.random() * 10 + jetFactor * 8,
              size: (3 + Math.random() * 6) * (1 + jetIntensity * 0.8),
              wobbleSpeed: isJet ? 0.03 + Math.random() * 0.08 : 0.15 + Math.random() * 0.4,
              wobbleOffset: Math.random() * Math.PI * 2,
            });
          }
        }

        // Side jets — shoot up along the wok walls at higher heat
        if (isJet) {
          const sideCount = Math.min(budget >> 2, Math.ceil(jetFactor * 5));
          for (let i = 0; i < sideCount; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            s.particles.push({
              type: 'fire',
              layer: 'front',
              x: currentWokX + side * (wokRadius * (0.5 + Math.random() * 0.5)),
              y: currentWokY + wokRadius * 0.2 + Math.random() * wokRadius * 0.6,
              vx: -side * (1.5 + Math.random() * 3) * jetFactor,
              vy: -6 - Math.random() * 8 - jetFactor * 8,
              life: 0,
              maxLife: 7 + Math.random() * 8 + jetFactor * 5,
              size: 4 + Math.random() * 5 + jetFactor * 5,
              wobbleSpeed: 0.04 + Math.random() * 0.06,
              wobbleOffset: Math.random() * Math.PI * 2,
            });
          }
        }

        // Embers — tiny bright sparks that shoot far upward
        if (s.heatLevel > 50) {
          const emberIntensity = (s.heatLevel - 50) / 50;
          const emberCount = Math.min(budget >> 2, Math.ceil(emberIntensity * 2) + (isJet ? Math.ceil(jetFactor * 3) : 0));
          for (let i = 0; i < emberCount; i++) {
            s.particles.push({
              type: 'fire',
              layer: 'front',
              x: currentWokX + (Math.random() - 0.5) * wokRadius * 1.2,
              y: currentWokY + wokRadius * 0.5 + Math.random() * wokRadius * 0.5,
              vx: (Math.random() - 0.5) * 3,
              vy: -10 - Math.random() * 6 - jetFactor * 10,
              life: 0,
              maxLife: 10 + Math.random() * 12,
              size: 1.5 + Math.random() * 2,
              wobbleSpeed: 0.3 + Math.random() * 0.6,
              wobbleOffset: Math.random() * Math.PI * 2,
            });
          }
        }
      }

      // Smoke from cooking
      if (s.heatLevel > 40 && s.foodBodies.length > 0 && Math.random() < (s.heatLevel / 100) * 0.4) {
        const fx = currentWokX + (Math.random() - 0.5) * wokRadius;
        const fy = currentWokY + 20 + Math.random() * 40;
        s.particles.push({ type: 'smoke', x: fx, y: fy, vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random() * 2, life: 0, maxLife: 40 + Math.random() * 30, size: 6 + Math.random() * 8 });
      }

      // Oil smoke at high heat — scales heavily with temperature
      if (s.heatLevel > 40 && s.oilParticles.length > 0) {
        const oilSmokeIntensity = (s.heatLevel - 40) / 60;
        const smokeChance = 0.1 + oilSmokeIntensity * 0.6;
        const smokeCount = Math.random() < smokeChance ? Math.ceil(oilSmokeIntensity * 3) : 0;
        for (let i = 0; i < smokeCount; i++) {
          const fx = currentWokX + (Math.random() - 0.5) * wokRadius * 0.9;
          const fy = currentWokY + Math.random() * 35;
          s.particles.push({
            type: 'oil_smoke',
            x: fx, y: fy,
            vx: (Math.random() - 0.5) * (0.8 + oilSmokeIntensity),
            vy: -0.8 - Math.random() * (1.5 + oilSmokeIntensity * 3),
            life: 0,
            maxLife: 40 + Math.random() * 30 + oilSmokeIntensity * 20,
            size: 6 + Math.random() * 8 + oilSmokeIntensity * 8,
          });
        }
      }

      // Bubbles from boiling water
      if (s.waterParticles.length > 0 && s.heatLevel > 60 && Math.random() < 0.3) {
        s.particles.push({ type: 'bubble', x: currentWokX + (Math.random() - 0.5) * 60, y: currentWokY + wokRadius - 20, vx: (Math.random() - 0.5) * 1, vy: -1 - Math.random() * 2, life: 0, maxLife: 20 + Math.random() * 15, size: 2 + Math.random() * 3 });
      }

      // ==========================================
      // RENDERING
      // ==========================================

      // Volumetric fire renderer
      const jetFactor = s.heatLevel > 60 ? (s.heatLevel - 60) / 40 : 0;
      const baseHue = Math.max(0, 60 - s.heatLevel * 0.6);
      const coreLight = 75 + jetFactor * 20;
      const coreSat = Math.round(100 - jetFactor * 50);

      const drawFlameLayer = (layerName) => {
        ctx.globalCompositeOperation = 'lighter';
        const particles = s.particles;
        for (let i = 0, len = particles.length; i < len; i++) {
          const p = particles[i];
          if (p.type !== 'fire' || p.layer !== layerName) continue;
          const lifeRatio = p.life / p.maxLife;
          if (lifeRatio >= 1) continue;
          const currentSize = p.size * (1 - lifeRatio * 0.25);
          if (currentSize < 0.5) continue;

          const hue = Math.max(0, baseHue - lifeRatio * 25) | 0;
          const alpha = (1 - lifeRatio) * (0.6 + jetFactor * 0.35);
          const stretch = 1 + jetFactor * 2.0 * (1 - lifeRatio * 0.5);
          const sx = currentSize;
          const sy = currentSize * stretch;

          // Outer body
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, sx, sy, 0, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue},100%,55%,${alpha})`;
          ctx.fill();

          // Hot core
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, sx * 0.35, sy * 0.35, 0, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue},${coreSat}%,${coreLight}%,${alpha * 1.5})`;
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      };

      // Wok Hei glow (purple aura)
      if (s.wokHei > 80) {
        const pulse = Math.sin(Date.now() / 150) * 0.2 + 0.8;
        const gradient = ctx.createRadialGradient(currentWokX, currentWokY, 0, currentWokX, currentWokY, wokRadius * 2.5);
        gradient.addColorStop(0, `rgba(217, 70, 239, ${0.4 * pulse})`);
        gradient.addColorStop(0.4, `rgba(168, 85, 247, ${0.15 * pulse})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(currentWokX, currentWokY, wokRadius * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Heat glow
      if (s.heatLevel > 30) {
        const heatIntensity = (s.heatLevel - 30) / 70;
        const pulse = Math.sin(Date.now() / 150) * 0.15 + 0.85;
        const glowY = currentWokY + wokRadius + 10;
        const glowRadius = wokRadius * (0.8 + heatIntensity * 1.2);

        // Burner glow from beneath
        const grad = ctx.createRadialGradient(currentWokX, glowY, 0, currentWokX, glowY, glowRadius);
        const hue = Math.max(0, 40 - heatIntensity * 40);
        grad.addColorStop(0, `hsla(${hue}, 100%, 60%, ${(0.15 + heatIntensity * 0.4) * pulse})`);
        grad.addColorStop(0.3, `hsla(${hue}, 100%, 50%, ${(0.08 + heatIntensity * 0.2) * pulse})`);
        grad.addColorStop(0.6, `rgba(239, 68, 68, ${heatIntensity * 0.08 * pulse})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(currentWokX, glowY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      // Back flames
      drawFlameLayer('back');

      // Wok outer hull with glowing metal
      if (s.isCleaning) {
        metalTemp = 0;
      } else {
        const targetTemp = s.heatLevel > 20 ? s.heatLevel : 0;
        if (targetTemp > metalTemp) metalTemp += (targetTemp - metalTemp) * 0.05;
        else metalTemp += (targetTemp - metalTemp) * 0.005;
      }

      ctx.save();
      ctx.translate(currentWokX, currentWokY);
      ctx.rotate(wokAnimAngle);

      ctx.beginPath();
      ctx.arc(0, 0, wokRadius, 0, Math.PI);
      let wokColor = '#161616';
      if (s.burnProgress >= 100) wokColor = '#050505';
      else if (s.cookProgress > 80) wokColor = '#241700';
      ctx.lineWidth = 14;
      ctx.strokeStyle = wokColor;
      ctx.stroke();

      if (metalTemp > 5) {
        const glowIntensity = metalTemp / 100;
        ctx.beginPath();
        ctx.arc(0, 0, wokRadius, 0, Math.PI);
        const linGrad = ctx.createLinearGradient(0, wokRadius + 5, 0, wokRadius * 0.2);
        linGrad.addColorStop(0, `rgba(255, 120, 0, ${glowIntensity * 1.5})`);
        linGrad.addColorStop(0.4, `rgba(239, 68, 68, ${glowIntensity * 1.2})`);
        linGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.strokeStyle = linGrad;
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = `rgba(255, 60, 0, ${glowIntensity})`;
        ctx.shadowBlur = 30 * glowIntensity;
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      // Front flames
      drawFlameLayer('front');

      // Wok inner bowl
      ctx.save();
      ctx.translate(currentWokX, currentWokY);
      ctx.rotate(wokAnimAngle);

      ctx.beginPath();
      ctx.arc(0, 0, wokRadius - 7, 0, Math.PI);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, wokRadius - 4, 0, Math.PI);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#333';
      ctx.stroke();

      // Wok residue stain
      if (s.wokResidue > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, wokRadius - 8, 0, Math.PI);
        ctx.lineWidth = 8;
        ctx.strokeStyle = `rgba(28, 16, 0, ${s.wokResidue / 100})`;
        ctx.stroke();
      }

      // Handle
      ctx.beginPath();
      ctx.moveTo(-wokRadius, 0);
      ctx.lineTo(-wokRadius - 70, -25);
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111';
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Render oil
      if (s.oilParticles.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.4)';
        s.oilParticles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.0, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
        s.oilParticles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }

      // Render water
      if (s.waterParticles.length > 0) {
        ctx.save();
        const dirt = s.waterDirtiness / 100;
        const r = Math.floor(34 + dirt * 100);
        const g = Math.floor(211 - dirt * 100);
        const b = Math.floor(238 - dirt * 180);

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
        s.waterParticles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = `rgba(${r + 30}, ${g + 30}, ${b + 30}, 0.8)`;
        s.waterParticles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }

      // Render food bodies
      const cookRatio = s.cookProgress / 100;
      const burnRatio = s.burnProgress / 100;
      const hasSoy = s.wokContents.includes('soy_sauce');
      const hasOyster = s.wokContents.includes('oyster_sauce');
      const hasXO = s.wokContents.includes('xo_sauce');
      const lightDir = { x: -0.6, y: -0.8 };

      const applySauceTint = (colorArr) => {
        let [cr, cg, cb] = colorArr;
        if (hasSoy) { cr *= 0.8; cg *= 0.7; cb *= 0.5; }
        if (hasOyster) { cr *= 0.7; cg *= 0.6; cb *= 0.4; }
        if (hasXO) { cr *= 0.9; cg *= 0.6; cb *= 0.4; }
        return [cr, cg, cb];
      };

      const addShadow = (f, extra) => {
        const r = (f.w ? Math.max(f.w, f.h) : f.size) || f.size;
        const shadowY = 4 + (extra || 0);
        const grad = ctx.createRadialGradient(0, shadowY, 0, 0, shadowY, r * 1.8);
        grad.addColorStop(0, 'rgba(0,0,0,0.35)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, shadowY, r * 1.2, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      const addHighlight = (x, y, r, alpha) => {
        const grad = ctx.createRadialGradient(x * r, y * r, 0, x * r, y * r, r);
        grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
        grad.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.3})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fill();
      };

      s.foodBodies.forEach(f => {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rotation);

        if (f.y < currentWokY - 40 && s.heatLevel > 80) {
          ctx.shadowColor = 'rgba(251,191,36,0.6)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        if (f.type === 'grain') {
          addShadow(f);
          const base = resolveColor(applySauceTint([250, 248, 235]), applySauceTint([200, 140, 50]), [28, 25, 22], cookRatio, burnRatio);
          const dark = resolveColor(applySauceTint([200, 170, 100]), applySauceTint([140, 90, 40]), [20, 18, 15], cookRatio, burnRatio);
          const grad = ctx.createLinearGradient(-f.size, -f.size, f.size, f.size);
          grad.addColorStop(0, base);
          grad.addColorStop(0.5, dark);
          grad.addColorStop(1, base);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(0, 0, f.size * 1.1, f.size * 0.5, f.rotation * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          addHighlight(-0.3, -0.4, f.size * 0.5, 0.5);
        } else if (f.type === 'egg') {
          addShadow(f, 2);
          ctx.fillStyle = resolveColor(applySauceTint([255, 228, 80]), applySauceTint([240, 160, 30]), [45, 35, 25], cookRatio, burnRatio);
          ctx.beginPath();
          f.blobs.forEach(bl => { ctx.moveTo(bl.x + bl.r, bl.y); ctx.arc(bl.x, bl.y, bl.r * 1.02, 0, Math.PI * 2); });
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 1;
          ctx.stroke();
          const yolkColor = resolveColor(applySauceTint([255, 190, 40]), applySauceTint([220, 130, 20]), [35, 25, 15], cookRatio, burnRatio);
          ctx.fillStyle = yolkColor;
          f.blobs.forEach(bl => { if (bl.r > 5) { ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r * 0.55, 0, Math.PI * 2); ctx.fill(); } });
          ctx.fillStyle = `rgba(255,255,255,${0.35 + cookRatio * 0.15})`;
          f.blobs.forEach(bl => { ctx.beginPath(); ctx.arc(bl.x - bl.r * 0.35, bl.y - bl.r * 0.35, bl.r * 0.22, 0, Math.PI * 2); ctx.fill(); });
        } else if (f.type === 'beef') {
          addShadow(f, 3);
          const base = resolveColor(applySauceTint([160, 50, 50]), applySauceTint([100, 55, 45]), [22, 18, 16], cookRatio, burnRatio);
          const edge = resolveColor(applySauceTint([120, 35, 35]), applySauceTint([75, 40, 35]), [18, 14, 12], cookRatio, burnRatio);
          const grad = ctx.createLinearGradient(-f.w / 2, -f.h / 2, f.w / 2, f.h / 2);
          grad.addColorStop(0, edge);
          grad.addColorStop(0.3, base);
          grad.addColorStop(0.7, base);
          grad.addColorStop(1, edge);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(-f.w / 2, -f.h / 2 + 2);
          ctx.quadraticCurveTo(0, -f.h / 2 - 4, f.w / 2, -f.h / 2);
          ctx.quadraticCurveTo(f.w / 2 + 4, 0, f.w / 2, f.h / 2);
          ctx.quadraticCurveTo(0, f.h / 2 + 4, -f.w / 2, f.h / 2 - 2);
          ctx.quadraticCurveTo(-f.w / 2 - 4, 0, -f.w / 2, -f.h / 2 + 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.strokeStyle = resolveColor(applySauceTint([255, 220, 220]), applySauceTint([180, 120, 100]), [40, 30, 25], cookRatio, burnRatio);
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(-f.w / 3, -f.h / 4);
          ctx.quadraticCurveTo(0, -f.h / 6, f.w / 4, -f.h / 8);
          ctx.moveTo(f.w / 4, f.h / 6);
          ctx.quadraticCurveTo(0, f.h / 5, -f.w / 4, f.h / 8);
          ctx.stroke();
          addHighlight(-0.4, -0.5, f.w * 0.4, 0.25);
        } else if (f.type === 'char_siu') {
          addShadow(f, 4);
          const edgeColor = resolveColor(applySauceTint([190, 55, 55]), applySauceTint([150, 38, 38]), [28, 18, 18], cookRatio, burnRatio);
          const innerColor = resolveColor(applySauceTint([235, 150, 130]), applySauceTint([160, 75, 55]), [22, 16, 14], cookRatio, burnRatio);
          const grad = ctx.createLinearGradient(-f.w / 2, -f.h / 2, f.w / 2, f.h / 2);
          grad.addColorStop(0, edgeColor);
          grad.addColorStop(0.2, innerColor);
          grad.addColorStop(0.8, innerColor);
          grad.addColorStop(1, edgeColor);
          ctx.fillStyle = grad;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(-f.w / 2, -f.h / 2, f.w, f.h, 5);
          else ctx.rect(-f.w / 2, -f.h / 2, f.w, f.h);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          addHighlight(-0.35, -0.45, f.w * 0.35, 0.3);
        } else if (f.type === 'noodle') {
          addShadow(f, 1);
          const phase = f.wavePhase || 0;
          const amp = f.waveAmp || 0.4;
          const n = 8;
          const points = [];
          for (let i = 0; i <= n; i++) {
            const t = i / n - 0.5;
            const wave = Math.sin(phase + t * 4) * amp * f.w * 0.15;
            points.push({ x: t * f.w, y: wave + Math.sin(t * 2) * f.h });
          }
          const mainColor = resolveColor(applySauceTint([250, 245, 230]), applySauceTint([220, 185, 130]), [45, 40, 35], cookRatio, burnRatio);
          const darkColor = resolveColor(applySauceTint([230, 220, 200]), applySauceTint([190, 155, 100]), [50, 45, 38], cookRatio, burnRatio);
          ctx.strokeStyle = darkColor;
          ctx.lineWidth = f.h * 1.1;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const prev = points[i - 1];
            ctx.quadraticCurveTo((prev.x + p.x) / 2, (prev.y + p.y) / 2, p.x, p.y);
          }
          ctx.stroke();
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = f.h * 0.85;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const prev = points[i - 1];
            ctx.quadraticCurveTo((prev.x + p.x) / 2, (prev.y + p.y) / 2, p.x, p.y);
          }
          ctx.stroke();
          addHighlight(-0.2, -0.3, f.w * 0.25, 0.35);
        } else if (f.type === 'shrimp') {
          addShadow(f, 2);
          const bend = f.bend || 0;
          const bodyColor = resolveColor(applySauceTint([255, 180, 160]), applySauceTint([240, 100, 80]), [55, 35, 25], cookRatio, burnRatio);
          const segmentColor = resolveColor(applySauceTint([240, 140, 120]), applySauceTint([200, 80, 60]), [45, 28, 22], cookRatio, burnRatio);
          const r = f.size * 0.65;
          ctx.fillStyle = bodyColor;
          ctx.beginPath();
          ctx.ellipse(-r * 0.5, 0, r * 0.6, r, bend * 0.3, -Math.PI * 0.7 + bend, Math.PI * 0.5 + bend);
          ctx.fill();
          ctx.strokeStyle = segmentColor;
          ctx.lineWidth = 1.2;
          for (let i = 1; i <= 4; i++) {
            const t = i / 5;
            const ang = -Math.PI * 0.6 + t * Math.PI * 1.1 + bend * t;
            const segR = r * (0.7 + Math.sin(t * Math.PI) * 0.3);
            ctx.beginPath();
            ctx.arc(Math.cos(ang) * segR * 0.8, Math.sin(ang) * segR, 3, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.fillStyle = resolveColor(applySauceTint([255, 120, 100]), applySauceTint([230, 70, 55]), [50, 30, 22], cookRatio, burnRatio);
          ctx.beginPath();
          const tailAng = Math.PI * 0.4 + bend * 0.5;
          ctx.moveTo(Math.cos(tailAng) * r * 1.1, Math.sin(tailAng) * r * 1.1);
          ctx.lineTo(Math.cos(tailAng + 0.5) * r * 1.4, Math.sin(tailAng + 0.5) * r * 1.4);
          ctx.lineTo(Math.cos(tailAng + 0.3) * r * 1.2, Math.sin(tailAng + 0.3) * r * 1.2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
          addHighlight(-0.4, -0.5, f.size * 0.4, 0.4);
        } else if (f.type === 'gai_lan') {
          addShadow(f, 3);
          const stemColor = resolveColor(applySauceTint([130, 215, 110]), applySauceTint([95, 175, 75]), [22, 32, 18], cookRatio, burnRatio);
          const stemDark = resolveColor(applySauceTint([90, 170, 80]), applySauceTint([70, 140, 60]), [15, 25, 12], cookRatio, burnRatio);
          const grad = ctx.createLinearGradient(-f.w / 4, -f.h / 2, f.w / 4, f.h / 2);
          grad.addColorStop(0, stemDark);
          grad.addColorStop(0.5, stemColor);
          grad.addColorStop(1, stemDark);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(-f.w / 4, -f.h / 2, f.w / 2, f.h, 2) : ctx.rect(-f.w / 4, -f.h / 2, f.w / 2, f.h);
          ctx.fill();
          const leafColor = resolveColor(applySauceTint([55, 165, 55]), applySauceTint([38, 125, 38]), [8, 22, 8], cookRatio, burnRatio);
          ctx.fillStyle = leafColor;
          ctx.beginPath();
          ctx.moveTo(0, -f.h / 2);
          ctx.quadraticCurveTo(f.w * 0.85, -f.h / 3, f.w * 0.75, 0);
          ctx.quadraticCurveTo(f.w * 0.7, f.h / 3, 0, f.h / 5);
          ctx.fill();
          addHighlight(0.3, -0.4, f.w * 0.3, 0.2);
        } else if (f.type === 'mushroom') {
          addShadow(f, 4);
          const stemColor = resolveColor(applySauceTint([225, 205, 185]), applySauceTint([185, 165, 145]), [35, 35, 32], cookRatio, burnRatio);
          const stemGrad = ctx.createLinearGradient(-f.w / 6, 0, f.w / 6, f.h / 2);
          stemGrad.addColorStop(0, resolveColor(applySauceTint([200, 180, 160]), applySauceTint([160, 140, 120]), [30, 30, 28], cookRatio, burnRatio));
          stemGrad.addColorStop(0.5, stemColor);
          stemGrad.addColorStop(1, stemColor);
          ctx.fillStyle = stemGrad;
          ctx.fillRect(-f.w / 6, 0, f.w / 3, f.h / 2);
          const capColor = resolveColor(applySauceTint([125, 85, 65]), applySauceTint([95, 55, 35]), [22, 16, 12], cookRatio, burnRatio);
          const capDark = resolveColor(applySauceTint([95, 60, 45]), applySauceTint([70, 40, 25]), [18, 12, 8], cookRatio, burnRatio);
          const capGrad = ctx.createRadialGradient(0, -f.h / 4, 0, 0, 0, f.w / 2);
          capGrad.addColorStop(0, capDark);
          capGrad.addColorStop(0.7, capColor);
          capGrad.addColorStop(1, capDark);
          ctx.fillStyle = capGrad;
          ctx.beginPath();
          ctx.ellipse(0, -f.h / 8, f.w / 2, f.h / 2.2, 0, Math.PI, 0);
          ctx.fill();
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 0.8 + Math.PI * 0.6;
            ctx.moveTo(Math.cos(a) * f.w * 0.2, Math.sin(a) * f.h * 0.15);
            ctx.lineTo(Math.cos(a) * f.w * 0.4, Math.sin(a) * f.h * 0.3);
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
          addHighlight(-0.3, -0.5, f.w * 0.25, 0.25);
        } else if (f.type === 'chili') {
          addShadow(f);
          const chiliColor = resolveColor(applySauceTint([225, 45, 45]), applySauceTint([185, 35, 35]), [32, 12, 10], cookRatio, burnRatio);
          const chiliDark = resolveColor(applySauceTint([180, 30, 30]), applySauceTint([140, 22, 22]), [25, 8, 6], cookRatio, burnRatio);
          const grad = ctx.createLinearGradient(-f.size, 0, f.size, 0);
          grad.addColorStop(0, chiliDark);
          grad.addColorStop(0.3, chiliColor);
          grad.addColorStop(0.7, chiliColor);
          grad.addColorStop(1, chiliDark);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(-f.size, 0);
          ctx.quadraticCurveTo(0, -f.size * 0.65, f.size, 0);
          ctx.quadraticCurveTo(0, f.size * 0.65, -f.size, 0);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
          ctx.fillStyle = '#228b22';
          ctx.fillRect(f.size * 0.75, -f.size * 0.2, f.size * 0.55, f.size * 0.4);
          addHighlight(-0.35, -0.4, f.size * 0.4, 0.35);
        } else if (f.type === 'scallion') {
          addShadow(f);
          const color = resolveColor(applySauceTint([95, 225, 95]), applySauceTint([118, 165, 78]), [32, 32, 22], cookRatio, burnRatio);
          const innerColor = resolveColor(applySauceTint([180, 255, 180]), applySauceTint([155, 185, 125]), [22, 22, 18], cookRatio, burnRatio);
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, f.size / 1.2);
          grad.addColorStop(0, innerColor);
          grad.addColorStop(0.6, color);
          grad.addColorStop(1, resolveColor(applySauceTint([45, 145, 45]), applySauceTint([75, 95, 45]), [12, 12, 8], cookRatio, burnRatio));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, f.size / 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          addHighlight(-0.3, -0.4, f.size * 0.35, 0.4);
        } else if (f.type === 'garlic') {
          addShadow(f);
          const color = resolveColor(applySauceTint([252, 248, 235]), applySauceTint([225, 185, 110]), [52, 32, 22], cookRatio, burnRatio);
          const darkColor = resolveColor(applySauceTint([220, 210, 180]), applySauceTint([190, 155, 85]), [45, 28, 18], cookRatio, burnRatio);
          const grad = ctx.createRadialGradient(-f.size * 0.3, -f.size * 0.3, 0, 0, 0, f.size * 1.2);
          grad.addColorStop(0, color);
          grad.addColorStop(0.7, darkColor);
          grad.addColorStop(1, darkColor);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(0, 0, f.size * 1.05, f.size * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
          addHighlight(-0.35, -0.45, f.size * 0.5, 0.35);
        } else if (f.type === 'ginger') {
          addShadow(f, 2);
          const color = resolveColor(applySauceTint([245, 225, 160]), applySauceTint([205, 165, 90]), [42, 28, 18], cookRatio, burnRatio);
          const knotColor = resolveColor(applySauceTint([220, 195, 130]), applySauceTint([180, 140, 70]), [38, 24, 14], cookRatio, burnRatio);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(0, 0, f.size * 1.8, f.size * 0.6, f.rotation * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = knotColor;
          ctx.beginPath();
          ctx.ellipse(-f.size * 0.4, -f.size * 0.2, f.size * 0.5, f.size * 0.35, 0, 0, Math.PI * 2);
          ctx.ellipse(f.size * 0.3, f.size * 0.15, f.size * 0.4, f.size * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
          addHighlight(-0.3, -0.4, f.size * 0.5, 0.3);
        }
        ctx.restore();
      });

      // Cleaning sponge - traces along the wok's inner curved surface
      if (s.isCleaning) {
        const innerR = wokRadius - 22;
        const t = Date.now() / 150;
        const scrubSweep = Math.sin(t) * 0.65 + Math.sin(t * 3.7) * 0.08;
        const theta = Math.PI / 2 + scrubSweep;
        const pressureR = innerR + Math.sin(t * 2.3) * 3;

        ctx.save();
        ctx.translate(currentWokX, currentWokY);
        ctx.rotate(wokAnimAngle);
        ctx.translate(Math.cos(theta) * pressureR, Math.sin(theta) * pressureR);
        ctx.rotate(theta - Math.PI / 2);

        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-25, -10, 50, 20, 4); else ctx.rect(-25, -10, 50, 20);
        ctx.fill();
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-25, -14, 50, 8, 2); else ctx.rect(-25, -14, 50, 8);
        ctx.fill();
        ctx.restore();
      }

      // Serve animation: plate + served food rendering
      if (serveAnim) {
        const sa = serveAnim;
        const plateX = sa.plateX;
        const plateY = wokCenterY + wokRadius * 0.6;
        const plateW = 90;
        const plateH = 14;

        // Plate shadow
        ctx.beginPath();
        ctx.ellipse(plateX, plateY + plateH + 2, plateW * 0.5, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        // Plate base
        ctx.beginPath();
        ctx.ellipse(plateX, plateY + plateH * 0.3, plateW * 0.48, plateH, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#d4d4d4';
        ctx.fill();

        // Plate rim highlight
        ctx.beginPath();
        ctx.ellipse(plateX, plateY + plateH * 0.3, plateW * 0.48, plateH, 0, Math.PI, 0);
        ctx.fillStyle = '#f5f5f5';
        ctx.fill();

        // Plate inner surface
        ctx.beginPath();
        ctx.ellipse(plateX, plateY, plateW * 0.4, plateH * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fafafa';
        ctx.fill();

        // Plate rim border
        ctx.beginPath();
        ctx.ellipse(plateX, plateY + plateH * 0.3, plateW * 0.48, plateH, 0, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#aaa';
        ctx.stroke();

        // Served oil (underneath food)
        sa.servedOil.forEach(so => {
          ctx.beginPath();
          ctx.arc(so.x, so.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 200, 50, 0.5)';
          ctx.fill();
        });

        // Served food on plate
        sa.servedFood.forEach(sf => {
          ctx.save();
          ctx.translate(sf.x, sf.y);
          ctx.rotate(sf.rotation || 0);
          const sz = sf.size || 8;
          ctx.beginPath();
          if (sf.type === 'grain') {
            ctx.fillStyle = '#f5f5dc';
            ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2);
          } else if (sf.type === 'egg') {
            ctx.fillStyle = '#ffd700';
            ctx.ellipse(0, 0, sz * 0.6, sz * 0.4, 0, 0, Math.PI * 2);
          } else if (sf.type === 'beef' || sf.type === 'char_siu') {
            ctx.fillStyle = sf.type === 'char_siu' ? '#8b2500' : '#8b4513';
            ctx.rect(-sz * 0.4, -sz * 0.2, sz * 0.8, sz * 0.4);
          } else if (sf.type === 'noodle') {
            ctx.strokeStyle = '#f0dc82';
            ctx.lineWidth = 3;
            ctx.moveTo(-sz * 0.4, 0);
            ctx.bezierCurveTo(-sz * 0.1, -sz * 0.3, sz * 0.1, sz * 0.3, sz * 0.4, 0);
            ctx.stroke();
            ctx.restore();
            return;
          } else if (sf.type === 'shrimp') {
            ctx.fillStyle = '#ff8c69';
            ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2);
          } else if (sf.type === 'gai_lan' || sf.type === 'scallion') {
            ctx.fillStyle = '#4caf50';
            ctx.arc(0, 0, sz * 0.4, 0, Math.PI * 2);
          } else if (sf.type === 'mushroom') {
            ctx.fillStyle = '#d2b48c';
            ctx.arc(0, 0, sz * 0.45, 0, Math.PI * 2);
          } else if (sf.type === 'chili') {
            ctx.fillStyle = '#dc143c';
            ctx.ellipse(0, 0, sz * 0.5, sz * 0.25, 0, 0, Math.PI * 2);
          } else {
            ctx.fillStyle = '#ccc';
            ctx.arc(0, 0, sz * 0.4, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.restore();
        });

        // Sparkles
        ctx.globalCompositeOperation = 'lighter';
        sa.sparkles.forEach(sp => {
          const alpha = 1 - sp.life / sp.maxLife;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 230, 120, ${alpha * 0.9})`;
          ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
      }

      // Update & render foreground particles
      const jf = s.heatLevel > 60 ? (s.heatLevel - 60) / 40 : 0;
      const fireSizeDamp = Math.pow(0.95, dt);
      const fireVxDamp = Math.pow(0.9 - jf * 0.15, dt);
      const smokeDamp = Math.pow(0.98, dt);
      const wobbleAmp = (0.8 - jf * 0.5) * dt;
      const fireUpAccel = (0.6 + jf * 0.8) * dt;
      const fireJetAccel = jf * 0.3 * dt;
      const wokCollideThreshold = wokRadius + 15;
      const wokYThreshold = currentWokY - 10;

      let writeIdx = 0;
      for (let i = 0, len = s.particles.length; i < len; i++) {
        const p = s.particles[i];
        if (p.life >= p.maxLife) continue;

        if (p.type === 'fire') {
          if (p.wobbleSpeed) {
            p.vx += Math.sin(p.life * p.wobbleSpeed + p.wobbleOffset) * wobbleAmp;
          }
          p.size *= fireSizeDamp;
          if (jf > 0) p.vy -= fireJetAccel;
          const dx = p.x - currentWokX;
          if (p.y > wokYThreshold) {
            const adx = dx < 0 ? -dx : dx;
            if (adx < wokCollideThreshold) {
              const r2 = wokRadius * wokRadius - dx * dx;
              if (r2 > 0) {
                const wokOuterCurveY = currentWokY + Math.sqrt(r2);
                p.vx += (dx >= 0 ? 0.8 : -0.8) * dt;
                if (p.y < wokOuterCurveY + 2) {
                  p.y = wokOuterCurveY + 2;
                  p.vy *= 0.8;
                }
              }
            }
          } else {
            p.vy -= fireUpAccel;
            p.vx *= fireVxDamp;
          }
        } else if (p.type === 'smoke' || p.type === 'steam' || p.type === 'oil_smoke') {
          const r = p.size * (p.life / p.maxLife);
          if (r > 0.5) {
            const alpha = 1 - (p.life / p.maxLife);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            if (p.type === 'smoke') ctx.fillStyle = `rgba(30,30,30,${alpha * 0.8})`;
            else if (p.type === 'oil_smoke') ctx.fillStyle = `rgba(180,180,190,${alpha * 0.6})`;
            else ctx.fillStyle = `rgba(220,220,220,${alpha * 0.5})`;
            ctx.fill();
          }
          p.vy -= 0.03 * dt;
          p.vx *= smokeDamp;
        } else if (p.type === 'splash' || p.type === 'dust') {
          ctx.beginPath();
          if (p.type === 'splash') ctx.ellipse(p.x, p.y, p.size * 0.5, p.size * 1.5, 0, 0, Math.PI * 2);
          else ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          p.vy += 0.4 * dt;
        } else if (p.type === 'bubble') {
          const alpha = 1 - p.life / p.maxLife;
          if (alpha > 0.05) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${0.6 * alpha})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(200,240,255,${alpha})`;
            ctx.stroke();
          }
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        s.particles[writeIdx++] = p;
      }
      s.particles.length = writeIdx;

      ctx.restore();
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="block max-w-full max-h-full object-contain drop-shadow-2xl" style={{ aspectRatio: '1 / 1' }} />
    </div>
  );
});

export default WokPhysics;
