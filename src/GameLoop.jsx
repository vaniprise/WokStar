import React, { useEffect, useState, useRef, useCallback } from 'react';
import { STORY_CHAPTERS, ALL_ITEMS, RECIPES, SPECIAL_EVENTS, FLAVOR_COMBOS, getScoreTitle } from './gameData';
import { Trash2, Droplets, Heart, CheckCircle, Plus, BookOpen, ChefHat, Flag, X } from 'lucide-react';
import {
  initAudio,
  updateBurner,
  updateSizzle,
  updateClean,
  playDing,
  playTrash,
  playTossShhh,
  playIngredientAdd,
} from './audioEngine';
import WokPhysics from './WokPhysics';

const CATEGORIES = [
  { id: 'PROTEINS', name: 'Proteins', items: ['egg', 'beef', 'char_siu', 'shrimp'] },
  { id: 'CARBS', name: 'Carbs', items: ['rice', 'noodle'] },
  { id: 'VEGETABLES', name: 'Vegetables', items: ['gai_lan', 'mushroom', 'scallion', 'garlic', 'ginger'] },
  { id: 'SPICES', name: 'Spices', items: ['salt', 'sugar', 'msg', 'white_pepper', 'five_spice', 'chili'] },
  { id: 'SAUCES', name: 'Sauces', items: ['soy_sauce', 'oyster_sauce', 'wine', 'xo_sauce'] },
];

const ALL_ITEMS_BY_ID = {};
Object.values(ALL_ITEMS).forEach(item => { ALL_ITEMS_BY_ID[item.id] = item; });

const DIFF_MULTS = {
  EASY:   { burn: 0.6, target: 0.6, spill: 0.5, color: 'text-green-400' },
  NORMAL: { burn: 1.0, target: 1.0, spill: 1.0, color: 'text-yellow-400' },
  HARD:   { burn: 1.6, target: 1.5, spill: 1.5, color: 'text-red-400' },
};

const DishIcon = ({ type, icons }) => (
  <div className="relative flex items-center justify-center shrink-0 w-10 h-10">
    {type === 'plate' ? (
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-md">
        <ellipse cx="50" cy="55" rx="45" ry="30" fill="#f8f9fa" stroke="#1e3a8a" strokeWidth="3"/>
        <ellipse cx="50" cy="55" rx="32" ry="20" fill="none" stroke="#1e3a8a" strokeWidth="1" strokeDasharray="4 2"/>
      </svg>
    ) : (
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-md">
        <path d="M 15 45 Q 50 95 85 45 Z" fill="#f8f9fa" stroke="#1e3a8a" strokeWidth="3"/>
        <ellipse cx="50" cy="45" rx="35" ry="12" fill="#e5e7eb" stroke="#1e3a8a" strokeWidth="2"/>
        <path d="M 30 55 Q 50 80 70 55" fill="none" stroke="#1e3a8a" strokeWidth="2" strokeDasharray="4 4"/>
      </svg>
    )}
    <div className="relative flex items-center justify-center gap-0 z-10 -mt-0.5">
      <span className="text-lg filter drop-shadow-md -mr-0.5">{String(icons[0])}</span>
      <span className="text-lg filter drop-shadow-md z-10 mt-0.5">{String(icons[1])}</span>
    </div>
  </div>
);

export default function GameLoop({ currentChapter = 0, score: initialScore = 0, cash: initialCash = 0, setScore: parentSetScore, setCash: parentSetCash, delight: parentDelight, setDelight: parentSetDelight, onRecipeSaved, isSandbox = false, isRestaurantMode = false, dailySpecialId = null, contracts = [], onShiftEnd }) {
  const chapter = isSandbox || isRestaurantMode ? null : STORY_CHAPTERS[Math.min(currentChapter, STORY_CHAPTERS.length - 1)];
  const wokPhysicsRef = useRef(null);
  const prevTossRef = useRef({ x: 0, y: 0 });
  const droppedItemsRef = useRef([]);
  const spillRef = useRef({ total: 0, timer: null });
  const [spillDisplay, setSpillDisplay] = useState(null);
  const restaurantStatsRef = useRef({
    dishesServed: 0, totalEarnedCash: 0, hadBurn: false, maxCombo: 1, perfectServes: 0, giftsCount: 0, specialServesCount: 0
  });

  const [audioReady, setAudioReady] = useState(false);
  const [heatLevel, setHeatLevel] = useState(40);
  const [wokContents, setWokContents] = useState([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [waterLevel, setWaterLevel] = useState(0);
  const [waterDirtiness, setWaterDirtiness] = useState(0);
  const [oilLevel, setOilLevel] = useState(20);
  const [isOiling, setIsOiling] = useState(false);
  const [toss, setToss] = useState({ x: 0, y: 0 });
  const [cookProgress, setCookProgress] = useState(0);
  const [burnProgress, setBurnProgress] = useState(0);
  const [wokHei, setWokHei] = useState(0);
  const [wokResidue, setWokResidue] = useState(0);

  const isControlled = parentSetScore != null && parentSetCash != null;
  const [localScore, setLocalScore] = useState(initialScore);
  const [localCash, setLocalCash] = useState(initialCash);
  const score = isControlled ? initialScore : localScore;
  const setScore = isControlled ? parentSetScore : setLocalScore;
  const cash = isControlled ? initialCash : localCash;
  const setCash = isControlled ? parentSetCash : setLocalCash;
  const [soul, setSoul] = useState(0);
  const [orders, setOrders] = useState([]);
  const [combo, setCombo] = useState(1);
  const [localDelight, setLocalDelight] = useState(0);
  const delight = parentDelight !== undefined ? parentDelight : localDelight;
  const setDelight = parentSetDelight || setLocalDelight;
  const [notifications, setNotifications] = useState([]);
  const [streakPopup, setStreakPopup] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [showSaveRecipe, setShowSaveRecipe] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [chefsSpecialMode, setChefsSpecialMode] = useState(false);
  const [recipeMarkup, setRecipeMarkup] = useState(2.5);
  const [specialMarkup, setSpecialMarkup] = useState(2.5);
  const [goodwill, setGoodwill] = useState(0);

  const gameDataRef = useRef({
    heatLevel: 40, wokContents: [], cookProgress: 0, burnProgress: 0,
    wokHei: 0, wokResidue: 0, isCleaning: false, oilLevel: 20,
    isOiling: false, toss: { x: 0, y: 0 }, waterLevel: 0,
    waterDirtiness: 0, isTossing: false, lastTossTime: 0, difficulty: 'NORMAL',
    spawnedIngredients: [],
  });
  const ordersRef = useRef([]);

  const [viewport, setViewport] = useState(() => {
    if (typeof window === 'undefined') return { isIpadPortrait: false };
    const isIpad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isPortrait = window.innerWidth < window.innerHeight;
    return { isIpadPortrait: isIpad && isPortrait };
  });

  useEffect(() => {
    const update = () => {
      const isIpad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isPortrait = window.innerWidth < window.innerHeight;
      setViewport({ isIpadPortrait: isIpad && isPortrait });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    const prev = gameDataRef.current;
    gameDataRef.current = {
      ...prev,
      heatLevel, wokContents, cookProgress, burnProgress, wokHei,
      wokResidue, isCleaning, oilLevel, isOiling, toss, waterLevel, waterDirtiness,
    };
  }, [heatLevel, wokContents, cookProgress, burnProgress, wokHei,
      wokResidue, isCleaning, oilLevel, isOiling, toss, waterLevel, waterDirtiness]);

  // Keyboard: Q = heat up, A = heat down, C = oil (hold)
  useEffect(() => {
    const target = (e) => /input|textarea|select/i.test(e.target?.tagName || '');
    const onKeyDown = (e) => {
      if (target(e)) return;
      const k = e.key?.toLowerCase();
      if (k === 'q') {
        e.preventDefault();
        setHeatLevel(prev => Math.min(100, prev + 8));
      } else if (k === 'a') {
        e.preventDefault();
        setHeatLevel(prev => Math.max(0, prev - 8));
      } else if (k === 'c') {
        e.preventDefault();
        setIsOiling(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.key?.toLowerCase() === 'c') setIsOiling(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => { ordersRef.current = orders; }, [orders]);

  const showNotification = useCallback((msg, type = 'normal') => {
    const id = Date.now() + Math.random();
    const durationMs = type === 'success' ? 5000 : 2000;
    setNotifications(prev => [...prev, { id, msg: String(msg), type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), durationMs);
  }, []);

  const bringOrderToFront = useCallback((orderId) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === orderId);
      if (idx <= 0) return prev;
      const next = prev.slice();
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  }, []);

  const triggerStreakPopup = useCallback((text, color) => {
    const id = Date.now();
    setStreakPopup({ text: String(text), color: String(color), id });
    setTimeout(() => {
      setStreakPopup(prev => prev?.id === id ? null : prev);
    }, 2000);
  }, []);

  const emptyWok = useCallback(() => {
    setWokContents(prev => {
      if (prev.length > 0) setWokResidue(r => Math.min(100, r + 15));
      return [];
    });
    setCookProgress(0);
    setBurnProgress(0);
    setWokHei(0);
    setOilLevel(0); // Oil exits with the food when serving, gifting, or trashing
    wokPhysicsRef.current?.clearWok?.();
    droppedItemsRef.current = [];
    clearTimeout(spillRef.current.timer);
    spillRef.current.total = 0;
    setSpillDisplay(null);
  }, []);

  const handleStartShift = () => {
    initAudio();
    setAudioReady(true);
  };

  useEffect(() => {
    if (!audioReady || orders.length > 0) return;
    if (isSandbox || isRestaurantMode) {
      const available = RECIPES;
      if (available.length > 0) {
        const r = available[Math.floor(Math.random() * available.length)];
        setOrders([{ ...r, id: Date.now(), recipeId: r.id, timeLeft: 9999 }]);
      }
      return;
    }
    const available = RECIPES.filter(r => r.chapter <= currentChapter);
    if (available.length > 0) {
      const r = available[0];
      setOrders([{ ...r, id: Date.now(), timeLeft: r.timeLimit }]);
    }
  }, [audioReady, isSandbox, isRestaurantMode]);

  const forceNextOrder = useCallback(() => {
    if (ordersRef.current.length >= (isSandbox || isRestaurantMode ? 5 : 3)) return;
    const available = (isSandbox || isRestaurantMode) ? RECIPES : RECIPES.filter(r => r.chapter <= currentChapter);
    const recipe = available[Math.floor(Math.random() * available.length)];
    let newOrder = { ...recipe, id: Date.now(), recipeId: recipe.id, timeLeft: (isSandbox || isRestaurantMode) ? 9999 : recipe.timeLimit };

    if (!isSandbox && !isRestaurantMode && currentChapter > 0 && Math.random() < 0.25) {
      const event = SPECIAL_EVENTS[Math.floor(Math.random() * SPECIAL_EVENTS.length)];
      if (!(event.id === 'spicy' && recipe.requires.includes('chili')) &&
          !(event.id === 'drunk' && recipe.requires.includes('wine'))) {
        newOrder = event.modifier(newOrder);
        newOrder.specialEvent = event;
      }
    }

    setOrders(prev => [...prev, newOrder]);
  }, [currentChapter, isSandbox, isRestaurantMode]);

  const handleMergeOrders = useCallback((dishName) => {
    setOrders(prev => {
      const matching = prev.filter(o => o.name === dishName && !o.failed && !o.isMerged);
      if (matching.length < 2) return prev;

      const others = prev.filter(o => !(o.name === dishName && !o.failed && !o.isMerged));
      const count = matching.length;
      const base = matching[0];

      let newRequires = [];
      for (let i = 0; i < count; i++) newRequires.push(...base.requires);

      const newTimeLimit = base.timeLimit * (1 + (count - 1) * 0.5);

      return [...others, {
        ...base,
        id: Date.now(),
        name: `${count}x ${base.name}`,
        requires: newRequires,
        timeLimit: newTimeLimit,
        timeLeft: newTimeLimit,
        baseScore: base.baseScore * count,
        batchSize: count,
        isMerged: true,
      }];
    });
    showNotification('Bulk Order Merged! Watch your heat!', 'success');
  }, [showNotification]);

  const handleHeatPointer = useCallback((e) => {
    if (e.type === 'pointermove' && e.buttons !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const newHeat = 100 - ((e.clientY - rect.top) / rect.height) * 100;
    setHeatLevel(Math.round(Math.max(0, Math.min(100, newHeat))));
  }, []);

  const handleTossPointer = useCallback((e) => {
    if (e.type === 'pointermove' && e.buttons !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRx = rect.width / 2;
    const maxRy = rect.height / 2;
    let dx = (e.clientX - centerX) / maxRx;
    let dy = (e.clientY - centerY) / maxRy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) { dx /= dist; dy /= dist; }

    const newToss = { x: dx, y: dy };
    const vX = dx - prevTossRef.current.x;
    const vY = dy - prevTossRef.current.y;
    const velocity = Math.sqrt(vX * vX + vY * vY);

    if (velocity > 0.08) {
      gameDataRef.current.lastTossTime = Date.now();
      if (velocity > 0.15) {
        playTossShhh();
        setHeatLevel(prev => Math.max(5, prev - 0.2));
      }
    }

    gameDataRef.current.isTossing = velocity > 0.02 || dist > 0.8;
    gameDataRef.current.toss = newToss;
    setToss(newToss);
    prevTossRef.current = newToss;
  }, []);

  const handleTossRelease = useCallback(() => {
    const center = { x: 0, y: 0 };
    setToss(center);
    prevTossRef.current = center;
    gameDataRef.current.toss = center;
    gameDataRef.current.isTossing = false;
  }, []);

  const addIngredient = useCallback((ingId) => {
    if (burnProgress >= 100) return;
    if (wokResidue > 80 && wokContents.length === 0) {
      showNotification("Wok is too filthy! Clean first!", "error");
      return;
    }
    setWokContents(prev => {
      if (prev.length >= 25) {
        showNotification("Wok is full! (Max 25 items)", "error");
        return prev;
      }
      playIngredientAdd(ingId);

      let absorption = 2;
      if (['rice', 'noodle'].includes(ingId)) absorption = 10;
      if (['egg', 'beef', 'char_siu', 'shrimp'].includes(ingId)) absorption = 6;
      setOilLevel(current => Math.max(0, current - absorption));

      wokPhysicsRef.current?.addFood?.(ingId);
      return [...prev, ingId];
    });
  }, [burnProgress, wokResidue, wokContents.length, showNotification]);

  const serveDish = (isDonation = false) => {
    if (wokContents.length === 0) {
      showNotification(isDonation ? "Nothing to gift!" : "Wok is empty!", "error");
      return;
    }
    if (burnProgress >= 100) {
      if (isRestaurantMode) restaurantStatsRef.current.hadBurn = true;
      if (isSandbox || isRestaurantMode) {
        showNotification("Burnt! Try again — no penalty.", "error");
      } else {
        showNotification(isDonation ? "Charity rejected burnt food!" : "Burnt! Customer left unhappy. -2 delight", "error");
        if (!isDonation) {
          setDelight(d => { const next = Math.max(-10, d - 2); if (next <= -10) setGameOver(true); return next; });
        }
      }
      setCombo(1);
      emptyWok();
      return;
    }

    let wokFreq = {};
    wokContents.forEach(item => { wokFreq[item] = (wokFreq[item] || 0) + 1; });

    let matchedOrderIndex = -1;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      if (order.failed) continue;

      let reqMap = {};
      order.requires.forEach(req => reqMap[req] = (reqMap[req] || 0) + 1);

      let canFulfill = true;
      for (let req in reqMap) {
        if ((wokFreq[req] || 0) < reqMap[req]) {
          canFulfill = false;
          break;
        }
      }

      if (canFulfill) {
        if (!isDonation && order.requiresWokHei && wokHei < order.requiresWokHei) {
          if (isSandbox) {
            showNotification("Wok Hei too low — keep experimenting!", "error");
          } else {
            showNotification("Failed! VIP demanded 90% Wok Hei! Customer left unhappy. -2 delight", "error");
            setDelight(d => { const next = Math.max(-10, d - 2); if (next <= -10) setGameOver(true); return next; });
          }
          setCombo(1);
          setOrders(prev => prev.filter((_, idx) => idx !== i));
          emptyWok();
          return;
        }
        matchedOrderIndex = i;
        break;
      }
    }

    if (matchedOrderIndex >= 0 && cookProgress >= 75) {
      const order = orders[matchedOrderIndex];
      const batchSize = order.batchSize || 1;

      let totalCost = 0;
      wokContents.forEach(item => {
        const info = ALL_ITEMS_BY_ID[item];
        if (info) totalCost += info.cost;
      });

      let quality = "Good!";
      let isPerfect = cookProgress >= 95 && burnProgress < 20;

      let wokHeiMult = 1.0;
      if (wokHei > 80) { wokHeiMult = 1.5; quality = "WOK HEI MASTER!"; }
      if (isPerfect && wokHei <= 80) { quality = "Perfect!"; wokHeiMult = 1.2; }

      const avgOiliness = wokContents.reduce((sum, id) => sum + (ALL_ITEMS_BY_ID[id]?.oiliness || 0), 0) / wokContents.length;
      const effectiveOil = oilLevel + (avgOiliness - 1.5) * 8;
      const idealOil = order.idealOil || 40;
      const oilDiff = Math.abs(effectiveOil - idealOil);

      let oilMult = 1.0;
      let oilTip = 0;
      if (oilDiff <= 12) {
        oilMult = 1.25;
        oilTip = 1.5;
        quality = "Perfect Oil! " + quality;
      } else if (effectiveOil > idealOil + 35) {
        oilMult = 0.5;
        quality = "Way Too Greasy! " + quality;
      } else if (effectiveOil > idealOil + 20) {
        oilMult = 0.7;
        quality = "Too Greasy! " + quality;
      } else if (effectiveOil < idealOil - 25) {
        oilMult = 0.85;
        quality = "Too Dry! " + quality;
      }

      let flavorMult = 1.0;
      let activeCombos = [];
      FLAVOR_COMBOS.forEach(comboData => {
        if (comboData.items.every(i => wokContents.includes(i))) {
          flavorMult *= comboData.mult;
          activeCombos.push(comboData.name);
        }
      });
      if (activeCombos.length > 0) quality = `${activeCombos.join(" + ")}!`;

      const umamiData = getWokUmami();
      const umamiMult = 1.0 + Math.min(umamiData.avg, 5) * 0.06;
      if (umamiData.avg >= 3) quality = "Deep Umami! " + quality;

      const batchMultiplier = 1.0 + (batchSize - 1) * 0.4;
      if (batchSize > 1) quality = `BULK x${batchSize}! ` + quality;

      const urgency = order.timeLeft / order.timeLimit;
      const comboMult = 1 + Math.log2(Math.max(1, combo)) * 0.15;
      let speedTip = urgency * 2.0 * batchMultiplier * batchSize;

      let baseRevenue = order.baseScore;
      const sellingPrice = baseRevenue * wokHeiMult * flavorMult * umamiMult * comboMult * batchMultiplier * oilMult;
      const totalTips = (order.bonusCash || 0) + speedTip + oilTip * batchSize;
      const tipCapFraction = (isSandbox || isRestaurantMode) ? 0.30 : 0.12;
      const cappedTips = Math.min(totalTips, sellingPrice * tipCapFraction);
      const surplusGoodwill = Math.max(0, totalTips - cappedTips);
      let finalRevenue = sellingPrice + cappedTips;
      const dailySpecialMult = (isRestaurantMode && dailySpecialId && (order.recipeId || order.id) === dailySpecialId) ? 1.25 : 1.0;
      if (dailySpecialMult > 1) finalRevenue *= dailySpecialMult;

      let profit = Number((finalRevenue - totalCost).toFixed(2));
      let newCombo = combo + batchSize;
      if (order.bonusCombo) newCombo += (order.bonusCombo * batchSize);

      if (isRestaurantMode) {
        const r = restaurantStatsRef.current;
        if (isDonation) {
          r.giftsCount += 1;
        } else {
          r.dishesServed += batchSize;
          r.totalEarnedCash += profit;
          if (isPerfect) r.perfectServes += 1;
          r.maxCombo = Math.max(r.maxCombo, newCombo);
        }
      }

      if (isDonation) {
        const gainedSoul = Math.floor(finalRevenue / 10) + batchSize;
        setSoul(s => s + gainedSoul);
        setCash(c => c - totalCost);
        triggerStreakPopup(`+${gainedSoul} SOUL!`, "#22d3ee");
        showNotification(`${quality} Donated! +${gainedSoul} Soul -$${totalCost.toFixed(2)}`, 'success');
      } else {
      setCash(c => c + profit);
      setScore(s => s + finalRevenue);
      if (surplusGoodwill > 0) {
        setGoodwill(g => g + surplusGoodwill);
      }
      setCombo(newCombo);
      if (!isSandbox && !isRestaurantMode) setDelight(d => Math.min(10, d + 2));
      if (effectiveOil > idealOil + 35) {
        setDelight(d => { const next = Math.max(-10, d - 2); if (next <= -10) setGameOver(true); return next; });
      }

      if (newCombo >= 3 && combo < 3) triggerStreakPopup("HEATING UP!", "#f97316");
      else if (newCombo >= 5 && combo < 5) triggerStreakPopup("WOK & ROLL!", "#eab308");
      else if (newCombo >= 10 && combo < 10) triggerStreakPopup("SHAOLIN SPEED!", "#a855f7");
      else if (newCombo >= 15 && combo < 15) triggerStreakPopup("SORROWFUL TEARS!", "#3b82f6");
      else if (newCombo >= 20 && newCombo % 5 === 0) triggerStreakPopup("SIK SAN!", "#ec4899");
      showNotification(`${quality} +$${profit.toFixed(2)}${dailySpecialMult > 1 ? ' 🌟 Daily Special!' : ''}${oilTip > 0 ? ` (+$${(oilTip * batchSize).toFixed(0)} oil tip)` : ''}${surplusGoodwill > 0 ? ` · +$${surplusGoodwill.toFixed(2)} goodwill` : ''}${!isSandbox && !isRestaurantMode ? ' +2 delight' : ''}`, profit >= 0 ? 'success' : 'error');
      }
      playDing(isPerfect);
      setOrders(prev => prev.filter((_, idx) => idx !== matchedOrderIndex));
      wokPhysicsRef.current?.triggerServeToss?.();
      setWokContents([]);
      setWokResidue(prev => Math.min(100, prev + 15));
      setCookProgress(0);
      setBurnProgress(0);
      setWokHei(0);
      setOilLevel(0);
      droppedItemsRef.current = [];

    } else {
      if (isDonation) {
        let totalCost = 0;
        wokContents.forEach(item => {
          const info = ALL_ITEMS_BY_ID[item];
          if (info) totalCost += info.cost;
        });
        if (!isSandbox) setCash(c => c - totalCost);
        showNotification(isSandbox ? 'Donated — no penalty in sandbox!' : `Imperfect Donation -$${totalCost.toFixed(2)}`, isSandbox ? 'success' : 'error');
        setCombo(1);
        wokPhysicsRef.current?.triggerServeToss?.();
        setWokContents([]);
        setWokResidue(prev => Math.min(100, prev + 15));
        setCookProgress(0);
        setBurnProgress(0);
        setWokHei(0);
        setOilLevel(0);
        droppedItemsRef.current = [];
      } else {
        const activeOrders = orders.filter(o => !o.failed);

        if (activeOrders.length === 0) {
          showNotification(isSandbox ? "No tickets — add one with [+] to practice." : "No active orders! Press [+] for a ticket.", "error");
          return;
        }

        if (matchedOrderIndex >= 0) {
          showNotification(isSandbox ? `Undercooked (${Math.floor(cookProgress)}%) — cook longer!` : `Undercooked! (${Math.floor(cookProgress)}% < 75%) Customer left unhappy. -1 😊`, "error");
        } else {
          const missing = [];
          const firstOrder = activeOrders[0];
          firstOrder.requires.forEach(req => {
            if ((wokFreq[req] || 0) < firstOrder.requires.filter(r => r === req).length) {
              const info = ALL_ITEMS_BY_ID[req];
              if (info && !missing.includes(info.icon)) missing.push(info.icon);
            }
          });
          showNotification(isSandbox ? `Missing: ${missing.join(' ')} — keep experimenting!` : `Missing: ${missing.join(' ')} Customer left unhappy. -2 delight`, "error");
        }

        if (!isSandbox) setDelight(d => { const next = Math.max(-10, d - 2); if (next <= -10) setGameOver(true); return next; });
        setCombo(1);
        wokPhysicsRef.current?.triggerTrashToss?.();
        setWokContents([]);
        setWokResidue(prev => Math.min(100, prev + 15));
        setCookProgress(0);
        setBurnProgress(0);
        setWokHei(0);
        droppedItemsRef.current = [];
      }
    }
  };

  const handleTrash = useCallback(() => {
    if (wokContents.length === 0) return;

    let totalCost = 0;
    wokContents.forEach(item => {
      const info = ALL_ITEMS_BY_ID[item];
      if (info) totalCost += info.cost;
    });

    setCombo(1);
    playTrash();

    if (totalCost > 0) {
      const sp = spillRef.current;
      sp.total += totalCost;
      setSpillDisplay(sp.total);
      clearTimeout(sp.timer);
      sp.timer = setTimeout(() => {
        setSpillDisplay(null);
        spillRef.current.total = 0;
      }, 2500);
    }

    wokPhysicsRef.current?.triggerTrashToss?.();
    setWokContents([]);
    setWokResidue(prev => Math.min(100, prev + 15));
    setCookProgress(0);
    setBurnProgress(0);
    setWokHei(0);
    if (!isSandbox) setCash(c => c - totalCost);
    droppedItemsRef.current = [];
  }, [wokContents]);

  const handleSpill = useCallback((ingredientId, instanceId, pCount, isFirstForInstance) => {
    droppedItemsRef.current.push({ id: ingredientId, instanceId, pCount, isFirstForInstance });
  }, []);

  const handleCleanDown = () => {
    if (wokContents.length > 0) return;
    setIsCleaning(true);
  };

  const handleCleanRelease = () => {
    setIsCleaning(false);
    if (gameDataRef.current.waterLevel > 0) {
      wokPhysicsRef.current?.triggerCleanToss?.();
      setWaterLevel(0);
      setWaterDirtiness(0);
    }
  };

  useEffect(() => {
    if (!audioReady) return;
    updateBurner(heatLevel, false);
  }, [audioReady, heatLevel]);

  useEffect(() => {
    if (!audioReady) return;
    updateSizzle(heatLevel, wokContents.length > 0);
  }, [audioReady, heatLevel, wokContents.length]);

  useEffect(() => {
    if (!audioReady) return;
    updateClean(isCleaning);
  }, [audioReady, isCleaning]);

  useEffect(() => {
    if (!audioReady) return;
    const tickRate = 100;
    const difficulty = gameDataRef.current.difficulty || 'NORMAL';
    const diffMults = DIFF_MULTS[difficulty] || DIFF_MULTS.NORMAL;

    const interval = setInterval(() => {
      const state = gameDataRef.current;

      setOrders(prevOrders => {
        if (isSandbox || isRestaurantMode) return prevOrders;
        let repLost = 0;
        const newOrders = prevOrders.map(order => {
          const timeDecay = tickRate / 1000;
          const timeLeft = order.timeLeft - timeDecay;

          if (timeLeft <= 0 && !order.failed) {
            repLost++;
            showNotification('Order failed! Customer left unhappy. -1 😊', 'error');
            setCombo(1);
            return { ...order, timeLeft: 0, failed: true };
          }
          return { ...order, timeLeft };
        }).filter(o => o.timeLeft > -2);

        if (repLost > 0) setDelight(d => {
          const perFail = gameDataRef.current?.npcBuffs?.gooseProtection ? 1 : 2;
          const next = Math.max(-10, d - repLost * perFail);
          if (next <= -10) setGameOver(true);
          return next;
        });
        return newOrders;
      });

      if (!isSandbox && !isRestaurantMode && Math.random() < 0.02 && ordersRef.current.length < 3) {
        const available = RECIPES.filter(r => r.chapter <= currentChapter);
        let base = available[Math.floor(Math.random() * available.length)];
        let newOrder = { ...base, id: Date.now(), timeLeft: base.timeLimit };

        if (currentChapter > 0 && Math.random() < 0.25) {
          const event = SPECIAL_EVENTS[Math.floor(Math.random() * SPECIAL_EVENTS.length)];
          if (!(event.id === 'spicy' && base.requires.includes('chili')) &&
              !(event.id === 'drunk' && base.requires.includes('wine'))) {
            newOrder = event.modifier(newOrder);
            newOrder.specialEvent = event;
          }
        }

        setOrders(prev => [...prev, newOrder]);
      }

      if (droppedItemsRef.current.length > 0) {
        const dropped = [...droppedItemsRef.current];
        droppedItemsRef.current = [];

        let wastageCost = 0;

        dropped.forEach(drop => {
          const info = ALL_ITEMS_BY_ID[drop.id];
          if (info) wastageCost += (info.cost / drop.pCount) * diffMults.spill;
        });

        if (wastageCost > 0) {
          if (!isSandbox && !isRestaurantMode) setCash(c => c - wastageCost);
          const sp = spillRef.current;
          sp.total += wastageCost;
          setSpillDisplay(sp.total);

          clearTimeout(sp.timer);
          sp.timer = setTimeout(() => {
            setSpillDisplay(null);
            spillRef.current.total = 0;
          }, 2000);
        }
      }

      if (state.isCleaning) {
        setWaterLevel(prev => Math.min(100, prev + 8));
        const removedResidue = Math.min(state.wokResidue, 3);
        setWokResidue(prev => Math.max(0, prev - removedResidue));
        setWaterDirtiness(prev => Math.min(100, prev + removedResidue * 3));
        setHeatLevel(prev => Math.max(0, prev - 3));
        setOilLevel(0);
      }

      if (state.isOiling) {
        setOilLevel(prev => Math.min(100, prev + 6));
      }

      if (state.heatLevel > 80 && state.oilLevel > 0) {
        setOilLevel(prev => Math.max(0, prev - (state.heatLevel - 80) * 0.03));
      }

      if (state.wokContents.length > 0) {
        let newCook = state.cookProgress;
        let newBurn = state.burnProgress;
        let newWokHei = state.wokHei;
        const heatFactor = state.heatLevel / 100;

        const isFoodMoving = state.isTossing;
        // Burn multiplier: tossing = minimal burn; no toss = ramps up the longer since last toss (tossing regularly keeps it low)
        let burnMultiplier;
        if (isFoodMoving) {
          burnMultiplier = 0.02;
        } else {
          const lastToss = state.lastTossTime || 0;
          const timeSinceTossSec = lastToss ? (Date.now() - lastToss) / 1000 : 999;
          if (timeSinceTossSec < 0.4) burnMultiplier = 0.04;
          else if (timeSinceTossSec < 1.2) burnMultiplier = 0.04 + (timeSinceTossSec - 0.4) * 0.45;
          else if (timeSinceTossSec < 3) burnMultiplier = 0.4 + (timeSinceTossSec - 1.2) * 0.25;
          else burnMultiplier = 0.85;
        }
        const cookMultiplier = isFoodMoving ? 1.5 : 0.5;

        const isDry = state.oilLevel < 20;
        const isGreasy = state.oilLevel > 75;
        const oilCookMod = isGreasy ? 0.4 : 1.0;
        // More oil at high heat = more burn; scale with oil level; extra when very hot + greasy
        const oilBurnMod = isDry ? 3.0 : (1 + (state.oilLevel / 100) * 0.9 + (isGreasy && state.heatLevel > 80 ? 0.8 : 0));
        const oilResidueMod = isDry ? 3.0 : 0.5;

        const complexity = state.wokContents.length;
        const baseCookSpeed = Math.max(0.5, (6 - complexity) * 0.3);

        if (state.heatLevel > 20) {
          newCook += (heatFactor * 0.8) * baseCookSpeed * cookMultiplier * oilCookMod;
        }

        const residueBurnMultiplier = 1 + (state.wokResidue / 30);

        if (state.heatLevel > 70) {
          if (state.isTossing && state.oilLevel > 2) {
            const wokHeiGain = Math.max(3.0, 8.0 - (state.wokResidue / 20));
            newWokHei = Math.min(100, newWokHei + wokHeiGain);
            setOilLevel(prev => Math.max(0, prev - 0.6));
          }
          // Base burn rate; higher when very hot + greasy. Scale up with cook time at high heat.
          const burnBaseCoeff = (isGreasy && state.heatLevel > 80) ? 0.0042 : 0.002;
          const cookDurationFactor = 1 + (state.cookProgress / 100) * 0.65;
          newBurn += ((state.heatLevel - 65) * burnBaseCoeff) * residueBurnMultiplier * burnMultiplier * diffMults.burn * oilBurnMod * cookDurationFactor;
          if (!state.isTossing) newWokHei = Math.max(0, newWokHei - 0.2);
        } else {
          newWokHei = Math.max(0, newWokHei - 0.3);
        }

        setWokResidue(prev => Math.min(100, prev + ((0.15 + (heatFactor * 0.3)) * oilResidueMod)));
        setCookProgress(Math.min(100, newCook));
        setBurnProgress(Math.min(100, newBurn));
        setWokHei(newWokHei);
      } else {
        setWokHei(prev => Math.max(0, prev - 1));
      }
    }, tickRate);

    return () => clearInterval(interval);
  }, [audioReady, currentChapter, showNotification]);

  useEffect(() => {
    if (wokContents.length === 0 && chefsSpecialMode) setChefsSpecialMode(false);
  }, [wokContents.length, chefsSpecialMode]);

  const getWokUmami = () => {
    if (wokContents.length === 0) return { total: 0, avg: 0 };
    const total = wokContents.reduce((sum, id) => sum + (ALL_ITEMS_BY_ID[id]?.umami || 0), 0);
    return { total, avg: parseFloat((total / wokContents.length).toFixed(1)) };
  };

  const saveCustomRecipe = () => {
    if (!newRecipeName.trim() || wokContents.length === 0) return;
    const freqMap = {};
    wokContents.forEach(id => freqMap[id] = (freqMap[id] || 0) + 1);
    const umami = getWokUmami();
    const totalCost = wokContents.reduce((sum, id) => sum + (ALL_ITEMS_BY_ID[id]?.cost || 0), 0);
    const recipe = {
      id: `custom_${Date.now()}`,
      name: newRecipeName.trim(),
      ingredients: freqMap,
      ingredientList: wokContents.slice(),
      totalUmami: umami.total,
      avgUmami: umami.avg,
      totalCost,
      markup: recipeMarkup,
      sellingPrice: Number((totalCost * recipeMarkup).toFixed(2)),
      timestamp: Date.now()
    };
    try {
      const existing = JSON.parse(localStorage.getItem('wokstar_custom_recipes') || '[]');
      localStorage.setItem('wokstar_custom_recipes', JSON.stringify([...existing, recipe]));
    } catch { /* ignore */ }
    if (onRecipeSaved) onRecipeSaved(recipe);
    setNewRecipeName('');
    setShowSaveRecipe(false);
    showNotification(`Recipe "${recipe.name}" saved!`, 'success');
  };

  const calculateAcceptChance = (order) => {
    const umami = getWokUmami();
    const urgency = order.timeLeft / order.timeLimit;
    let chance = 35
      + umami.avg * 7
      + (cookProgress / 100) * 12
      + urgency * 8
      + (wokHei / 100) * 10
      - (burnProgress / 100) * 25;
    if (order.specialEvent) chance -= 15;
    if (order.isMerged) chance -= 10;
    const pricePenalty = Math.max(0, specialMarkup - 2.0) * 12;
    chance -= pricePenalty;
    return Math.max(5, Math.min(95, chance));
  };

  const proposeSpecial = (orderId) => {
    const orderIndex = orders.findIndex(o => o.id === orderId);
    const order = orders[orderIndex];
    if (!order || order.failed) return;
    setChefsSpecialMode(false);

    if (wokContents.length === 0) {
      showNotification("Wok is empty!", "error");
      return;
    }
    if (cookProgress < 50) {
      showNotification("Cook at least 50% first!", "error");
      return;
    }
    if (burnProgress >= 100) {
      showNotification("Can't serve burnt food as a special!", "error");
      return;
    }

    const umami = getWokUmami();
    const acceptChance = calculateAcceptChance(order);
    const roll = Math.random() * 100;
    const accepted = roll < acceptChance;

    if (accepted) {
      let totalCost = 0;
      wokContents.forEach(item => {
        const info = ALL_ITEMS_BY_ID[item];
        if (info) totalCost += info.cost;
      });

      const umamiMult = 1.0 + Math.min(umami.avg, 5) * 0.06;
      const specialBaseRevenue = totalCost * specialMarkup * (1 + umami.avg * 0.15);

      let quality = "CHEF'S SPECIAL!";
      let isPerfect = cookProgress >= 95 && burnProgress < 20;

      let wokHeiMult = 1.0;
      if (wokHei > 80) { wokHeiMult = 1.5; quality = "WOK HEI SPECIAL!"; }

      const avgOiliness = wokContents.reduce((sum, id) => sum + (ALL_ITEMS_BY_ID[id]?.oiliness || 0), 0) / wokContents.length;
      const effectiveOil = oilLevel + (avgOiliness - 1.5) * 8;
      const idealOil = 40;
      const oilDiff = Math.abs(effectiveOil - idealOil);

      let oilMult = 1.0;
      if (oilDiff <= 12) {
        oilMult = 1.25;
        quality = "Perfect Oil! " + quality;
      } else if (effectiveOil > idealOil + 35) {
        oilMult = 0.5;
        quality = "Way Too Greasy! " + quality;
      } else if (effectiveOil > idealOil + 20) {
        oilMult = 0.7;
        quality = "Too Greasy! " + quality;
      } else if (effectiveOil < idealOil - 25) {
        oilMult = 0.85;
        quality = "Too Dry! " + quality;
      }

      let flavorMult = 1.0;
      let activeCombos = [];
      FLAVOR_COMBOS.forEach(comboData => {
        if (comboData.items.every(i => wokContents.includes(i))) {
          flavorMult *= comboData.mult;
          activeCombos.push(comboData.name);
        }
      });
      if (activeCombos.length > 0) quality = activeCombos.join(" + ") + " SPECIAL!";
      if (umami.avg >= 3) quality = "Deep Umami " + quality;

      const specialMult = 1.3;
      const comboMult = 1 + Math.log2(Math.max(1, combo)) * 0.15;
      let finalRevenue = specialBaseRevenue * wokHeiMult * flavorMult * umamiMult * specialMult * comboMult * oilMult;
      let profit = Number((finalRevenue - totalCost).toFixed(2));
      let newCombo = combo + 1;

      setCash(c => c + profit);
      setScore(s => s + finalRevenue);
      setCombo(newCombo);

      if (newCombo >= 3 && combo < 3) triggerStreakPopup("HEATING UP!", "#f97316");
      else if (newCombo >= 5 && combo < 5) triggerStreakPopup("WOK & ROLL!", "#eab308");
      else triggerStreakPopup("CHEF'S SPECIAL!", "#f59e0b");

      showNotification(`${quality} +$${profit.toFixed(2)}`, 'success');
      playDing(isPerfect);

      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (isRestaurantMode) restaurantStatsRef.current.specialServesCount += 1;
      wokPhysicsRef.current?.triggerServeToss?.();
      setWokContents([]);
      setWokResidue(prev => Math.min(100, prev + 15));
      setCookProgress(0);
      setBurnProgress(0);
      setWokHei(0);
      setOilLevel(0);
      droppedItemsRef.current = [];
    } else {
      const moodPenalty = 3 + Math.random() * 5;
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, timeLeft: o.timeLeft - moodPenalty } : o
      ));

      const responses = [
        "No thanks, I know what I want!",
        "I ordered what I ordered, chef!",
        "That doesn't look like my dish...",
        "Maybe next time, Sik San.",
        "I'll stick with my order!",
        "You think you know better than me?!",
        "Hmm... no. Give me what I asked for.",
      ];
      showNotification(responses[Math.floor(Math.random() * responses.length)], 'error');
    }
  };

  const wokUmami = getWokUmami();
  const wokCost = wokContents.reduce((s, id) => s + (ALL_ITEMS_BY_ID[id]?.cost || 0), 0);

  const getDynamicPrompt = () => {
    if (chefsSpecialMode) return { text: "🍳 TAP A TICKET to suggest your Chef's Special!", color: "text-yellow-400 animate-pulse font-bold" };
    if (gameOver) return { text: "GAME OVER — delight hit -10!", color: "text-red-500 font-black animate-pulse" };
    if (isSandbox) {
      if (wokContents.length === 0) {
        if (orders.length === 0) return { text: "Add a ticket with [+] or just throw ingredients in!", color: "text-cyan-400" };
        return { text: "Pick a recipe to practice, or freestyle!", color: "text-cyan-400" };
      }
      if (burnProgress > 75) return { text: "BURNING! Toss to slow it down.", color: "text-red-500 animate-pulse font-black" };
      if (cookProgress >= 90 && burnProgress < 20) return { text: "PERFECTLY COOKED! Try serving it.", color: "text-green-400 font-black" };
      if (heatLevel > 80 && gameDataRef.current.isTossing && oilLevel > 5) return { text: "BUILDING WOK HEI...", color: "text-fuchsia-400 font-bold" };
      return { text: `Cook: ${Math.floor(cookProgress)}% • Burn: ${Math.floor(burnProgress)}% • Wok Hei: ${Math.floor(wokHei)}%`, color: "text-neutral-400" };
    }
    if (wokContents.length === 0) {
      if (combo >= 10) return { text: `Combo x${combo}! DARK ARTS UNLEASHED!`, color: "text-lime-400 drop-shadow-[0_0_5px_rgba(163,230,53,0.8)]" };
      if (combo >= 5) return { text: `Combo x${combo}! ANGELIC FLAMES IGNITED!`, color: "text-purple-400 drop-shadow-[0_0_5px_rgba(192,132,252,0.8)]" };
      if (combo > 1) return { text: `Combo x${combo}! Toss high to maintain streak!`, color: "text-orange-400" };
      return { text: "Serve perfect dishes to start a streak.", color: "text-neutral-500" };
    }
    if (burnProgress > 75) return { text: "BURNING! TOSS NOW!", color: "text-red-500 animate-pulse font-black" };
    if (cookProgress >= 90 && burnProgress < 20) return { text: "PERFECT! SERVE NOW!", color: "text-green-400 animate-bounce font-black" };
    if (heatLevel > 80 && gameDataRef.current.isTossing && oilLevel > 5) return { text: "BUILDING WOK HEI...", color: "text-fuchsia-400 font-bold" };
    return { text: "Keep heat > 80 to build Wok Hei.", color: "text-yellow-500" };
  };

  const dynPrompt = getDynamicPrompt();

  const duplicateNames = [];
  const nameCounts = {};
  orders.forEach(o => {
    if (!o.failed && !o.isMerged) {
      nameCounts[o.name] = (nameCounts[o.name] || 0) + 1;
      if (nameCounts[o.name] === 2 && !duplicateNames.includes(o.name)) {
        duplicateNames.push(o.name);
      }
    }
  });

  return (
    <div className="relative flex flex-col h-full min-h-0 text-white" style={{ backgroundColor: '#0a0a0a' }}>

      <style>{`
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); text-shadow: 0 0 10px #facc15; }
          100% { transform: scale(1); }
        }
        .animate-pop { animation: pop 0.3s ease-out; }
        @keyframes streak-zoom {
          0% { transform: translate(-50%, -50%) scale(0.2) rotate(-10deg); opacity: 0; }
          15% { transform: translate(-50%, -50%) scale(1.2) rotate(5deg); opacity: 1; text-shadow: 0 0 40px currentColor; }
          25% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
          80% { transform: translate(-50%, -50%) scale(1.05) rotate(0deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.5) rotate(5deg); opacity: 0; filter: blur(10px); }
        }
        .animate-streak { animation: streak-zoom 2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>

      {/* Notifications */}
      <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none flex flex-col items-center gap-2">
        {notifications.map(n => (
          <div key={n.id} className={`px-4 py-2 rounded-full font-bold text-lg animate-bounce shadow-xl ${n.type === 'error' ? 'bg-red-600 text-white' : n.type === 'success' ? 'bg-green-500 text-neutral-900' : 'bg-neutral-700 text-white'}`}>
            {String(n.msg)}
          </div>
        ))}
      </div>

      {/* Spill running total */}
      {spillDisplay != null && (
        <div className="absolute top-[15%] left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div className={`px-5 py-2 rounded-full font-black text-lg shadow-xl border animate-pulse ${isSandbox ? 'bg-amber-800 text-amber-200 border-amber-600' : 'bg-red-700 text-white border-red-500'}`}>
            {isSandbox ? `Spilled ~$${spillDisplay.toFixed(2)}` : `Spilled! -$${spillDisplay.toFixed(2)}`}
          </div>
        </div>
      )}

      {/* Streak popup */}
      {streakPopup && (
        <div
          key={streakPopup.id}
          className="fixed top-1/2 left-1/2 z-[100] text-4xl font-black tracking-wider animate-streak pointer-events-none whitespace-nowrap drop-shadow-2xl"
          style={{ color: streakPopup.color }}
        >
          {String(streakPopup.text)}
        </div>
      )}

      {/* Start Shift Overlay */}
      {!audioReady && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-center shadow-2xl">
            <h2 className={`mb-2 text-2xl font-black tracking-tight ${isRestaurantMode ? 'text-amber-400' : isSandbox ? 'text-cyan-400' : 'text-orange-400'}`}>
              {isRestaurantMode ? 'Restaurant Shift' : isSandbox ? 'Sandbox Kitchen' : 'Start Shift'}
            </h2>
            <p className="mb-4 text-xs text-neutral-300">
              {isRestaurantMode
                ? 'Run your restaurant. Complete contracts, serve the daily special, then End shift when done.'
                : isSandbox
                ? 'Free play — no timers, no penalties. Experiment with any recipe and cooking technique!'
                : 'Tap below to wake the kitchen audio. Browsers need a click before sound can play.'}
            </p>
            <button
              type="button"
              onClick={handleStartShift}
              className={`mt-2 w-full rounded-xl py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-transform active:translate-y-0.5 active:scale-95 ${isRestaurantMode ? 'bg-gradient-to-r from-amber-500 to-orange-600' : isSandbox ? 'bg-gradient-to-r from-cyan-500 to-teal-600' : 'bg-gradient-to-r from-orange-500 to-red-600'}`}
            >
              {isRestaurantMode ? 'Start Kitchen' : isSandbox ? 'Enter Kitchen' : 'Begin Service'}
            </button>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-red-700 bg-neutral-900 p-6 text-center shadow-2xl">
            <h2 className="mb-2 text-2xl font-black tracking-tight text-red-500">SHIFT OVER</h2>
            <p className="mb-2 text-sm text-neutral-300">Customer delight hit -10 — the crowd has turned!</p>
            <div className="text-xl font-bold text-green-400 mb-1" title="Score">Score: {Math.round(score)}</div>
            <div className="text-sm text-yellow-400 mb-1" title="Cash">Cash: ${cash.toFixed(2)}</div>
            {goodwill > 0 && <div className="text-sm text-amber-400 mb-4" title="Surplus tips stored as goodwill from perfect oil matches.">Goodwill: ${goodwill.toFixed(2)}</div>}
            {!goodwill && <div className="mb-4" />}
            <div className="text-lg font-black mb-4" style={{ color: getScoreTitle(score).color?.replace('text-', '') }} title="Chef rank based on total earnings this run.">
              {getScoreTitle(score).title}
            </div>
          </div>
        </div>
      )}

      {/* Ticket Rail (header row removed; End shift + stars moved to end of order row) */}
      <div className="flex flex-col w-full z-10 relative">
        {chefsSpecialMode ? (
          <div className="w-full bg-yellow-950/90 border-b border-yellow-700 py-1.5 px-3 flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.2)]" title="Chef's Special: set your markup (1.5x–4x of dish cost). Tap a ticket to serve at this price. Higher = more profit but risk of rejection if too high.">
            <ChefHat size={14} className="text-yellow-400 shrink-0" />
            <span className="text-[9px] font-black text-yellow-500 uppercase tracking-wider shrink-0" title="Markup multiplier on your dish cost. 2.5x = 2.5× ingredient cost as selling price.">Price</span>
            <input
              type="range" min="1.5" max="4.0" step="0.1"
              value={specialMarkup}
              onChange={e => setSpecialMarkup(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-yellow-500 cursor-pointer min-w-0"
            />
            <span className={`font-mono font-bold text-[11px] shrink-0 ${specialMarkup > 3 ? 'text-red-400' : specialMarkup > 2.5 ? 'text-yellow-400' : 'text-green-400'}`}>
              {specialMarkup.toFixed(1)}x
            </span>
            <span className="text-[10px] font-mono text-yellow-300 shrink-0">
              ${(wokCost * specialMarkup).toFixed(0)}
            </span>
            <span className="text-yellow-400/80 text-[8px] font-bold uppercase tracking-widest animate-pulse shrink-0">Tap ticket →</span>
          </div>
        ) : duplicateNames.length > 0 ? (
          <div className="w-full bg-blue-900 border-b border-blue-700 py-1 px-4 flex justify-center items-center gap-2 text-[10px] tracking-widest uppercase text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            <span className="animate-pulse text-blue-200">Multiple similar orders detected!</span>
            <button onClick={() => handleMergeOrders(duplicateNames[0])} className="bg-yellow-500 hover:bg-yellow-400 text-black font-black px-2 py-0.5 rounded shadow-lg active:scale-95 transition-transform flex items-center gap-1 border-b-2 border-yellow-700 active:border-b-0 active:translate-y-px" title="Merge duplicate orders into one bulk order.">
              MERGE BULK {String(duplicateNames[0]).toUpperCase()}
            </button>
          </div>
        ) : (
          <div className={`w-full bg-neutral-950/80 border-b border-[#111] py-1 px-4 flex justify-center items-center text-xs tracking-widest uppercase transition-colors duration-300 ${dynPrompt.color}`} title="Current tip or status.">
            {String(dynPrompt.text)}
          </div>
        )}

        <div className="shrink-0 bg-[#1a1a1c] border-b-4 border-[#111] flex overflow-x-auto shadow-inner h-20 p-2 gap-3 items-center">
          <button
            onClick={forceNextOrder}
            disabled={orders.length >= (isSandbox || isRestaurantMode ? 5 : 3) || gameOver}
            className={`h-full flex flex-col items-center justify-center border-2 border-dashed rounded-lg hover:text-white transition-all shrink-0 min-w-[72px] ${(isSandbox || isRestaurantMode) ? 'border-cyan-800 text-cyan-600' : 'border-neutral-700 text-neutral-500'}`}
            title={orders.length >= (isSandbox || isRestaurantMode ? 5 : 3) ? "Maximum orders reached" : (isSandbox || isRestaurantMode) ? "Add a recipe" : "Next order will appear here"}
          >
            <Plus className="w-5 h-5" />
            <span className="text-[8px] uppercase font-bold text-center leading-tight">{isSandbox ? 'Recipe' : 'Next'}</span>
          </button>

          {orders.map((order, orderIdx) => {
            const urgency = (isSandbox || isRestaurantMode) ? 1 : order.timeLeft / order.timeLimit;
            const isSpecial = !!order.specialEvent;
            const isMerged = !!order.isMerged;
            const ticketColor = order.failed ? 'bg-red-950 border-red-800 text-red-400' :
                                isMerged ? 'bg-blue-900 border-blue-400 text-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.3)]' :
                                urgency < 0.25 ? 'bg-red-100 border-red-500 text-red-900 animate-pulse' :
                                isSpecial ? order.specialEvent.color :
                                urgency < 0.5 ? 'bg-yellow-50 border-yellow-400 text-yellow-900' : 'bg-white border-neutral-300 text-neutral-900';
            return (
              <div
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => bringOrderToFront(order.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') bringOrderToFront(order.id);
                }}
                className={`rounded-lg shadow-lg border-2 ${ticketColor} relative flex flex-row items-center shrink-0 min-w-[160px] p-1.5 gap-2 cursor-pointer ${chefsSpecialMode && !order.failed ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-black' : ''}`}
                title={`Order: ${order.name}. Tap to bring this ticket to the front (timer stays the same).`}
              >
                {isSpecial && !order.failed && !isMerged && (
                  <div className="absolute -top-3 -right-3 bg-black text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border border-current z-20 flex items-center gap-1 shadow-lg transform rotate-6 whitespace-nowrap">
                    <span>{String(order.specialEvent.icon)}</span> {String(order.specialEvent.name)}
                  </div>
                )}
                {isMerged && !order.failed && (
                  <div className="absolute -top-3 -right-3 bg-yellow-500 text-black text-[8px] font-black px-2 py-0.5 rounded-full border border-black z-20 flex items-center gap-1 shadow-lg transform rotate-6 whitespace-nowrap">
                    BULK x{order.batchSize}
                  </div>
                )}
                {isRestaurantMode && dailySpecialId && (order.recipeId || order.id) === dailySpecialId && !order.failed && !isMerged && (
                  <div className="absolute -top-3 -left-3 bg-amber-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded-full border border-amber-700 z-20 flex items-center gap-1 shadow-lg transform -rotate-6 whitespace-nowrap">
                    🌟 Daily Special
                  </div>
                )}
                <DishIcon type={order.dishType} icons={order.displayIcons} />
                <div className="flex flex-col justify-center min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="font-bold leading-tight truncate text-xs">{String(order.name)}</div>
                    {order.idealOil != null && !order.failed && (() => {
                      const oilClose = Math.abs(oilLevel - order.idealOil) <= 12;
                      const oilFar = Math.abs(oilLevel - order.idealOil) > 25;
                      return (
                        <span className={`text-[8px] font-bold shrink-0 ${oilClose ? 'text-green-500' : oilFar ? 'text-red-400' : 'text-neutral-400'}`} title={`Ideal oil: ${order.idealOil}% (current: ${Math.round(oilLevel)}%)`}>
                          🫒{order.idealOil}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {chefsSpecialMode && !order.failed && (
                  <div
                    className="absolute inset-0 rounded-lg bg-yellow-500/15 flex items-center justify-center z-30 cursor-pointer hover:bg-yellow-500/30 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      bringOrderToFront(order.id);
                      proposeSpecial(order.id);
                    }}
                  >
                    <div className="bg-black/90 px-2.5 py-1 rounded-full text-[10px] font-black text-yellow-300 flex items-center gap-1.5 shadow-lg border border-yellow-600/50">
                      <ChefHat size={12} /> {Math.round(calculateAcceptChance(order))}% CHANCE
                    </div>
                  </div>
                )}
                {!isSandbox && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20 overflow-hidden rounded-b-lg">
                    <div className={`h-full ${urgency < 0.25 ? 'bg-red-500' : isMerged ? 'bg-blue-400' : 'bg-green-500'}`} style={{ width: `${Math.max(0, urgency * 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {/* End shift (restaurant) or ∞ FREE PLAY (sandbox) or Customer Delight (story) */}
          {(isRestaurantMode || isSandbox) && (
          <div className="flex items-center gap-1.5 shrink-0 border-l border-neutral-700 pl-3 ml-1" title={isRestaurantMode ? 'End your shift to bank progress' : 'Sandbox: no delight penalty, unlimited play.'}>
            {isRestaurantMode && onShiftEnd ? (
              <button
                onClick={() => {
                  const r = restaurantStatsRef.current;
                  onShiftEnd({
                    score,
                    cash,
                    dishesServed: r.dishesServed,
                    totalEarnedCash: r.totalEarnedCash,
                    hadBurn: r.hadBurn,
                    maxCombo: r.maxCombo,
                    perfectServes: r.perfectServes,
                    giftsCount: r.giftsCount,
                    specialServesCount: r.specialServesCount,
                  });
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-neutral-900 font-bold text-[10px] uppercase tracking-wider transition-transform active:scale-95"
              >
                <Flag size={12} /> End shift
              </button>
            ) : (
              <span className="text-cyan-400 text-[10px] font-bold px-1" title="Sandbox: no delight penalty, unlimited play.">∞ FREE PLAY</span>
            )}
          </div>
          )}
          {!isSandbox && !isRestaurantMode && (
            <div className="flex items-center gap-1 shrink-0 border-l border-neutral-700 pl-3 ml-1" title="Customer Delight: -10 (angry) to +10 (delighted). 0 = center. Game over at -10.">
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Delight</span>
              <div className="flex items-center gap-0.5">
                <span className="text-sm opacity-80" title="-10 (angry)">😠</span>
                <div className="w-14 md:w-16 h-2 md:h-2.5 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700 relative shrink-0">
                  {(() => {
                    const d = Number(delight);
                    if (Number.isNaN(d)) return null;
                    const displayValue = Math.max(-10, Math.min(10, d));
                    const redWidth = displayValue < 0 ? ((-displayValue) / 10) * 50 : 0;
                    const greenWidth = displayValue > 0 ? (displayValue / 10) * 50 : 0;
                    return (
                      <>
                        {redWidth > 0 && <div className="absolute top-0 bottom-0 right-1/2 bg-red-500 rounded-l-full transition-all duration-200" style={{ width: `${redWidth}%` }} />}
                        {greenWidth > 0 && <div className="absolute top-0 bottom-0 left-1/2 bg-green-500 rounded-r-full transition-all duration-200" style={{ width: `${greenWidth}%` }} />}
                      </>
                    );
                  })()}
                </div>
                <span className="text-sm opacity-80" title="+10 (delighted)">😊</span>
              </div>
            </div>
          )}
        </div>
        <div className="shrink-0 bg-[#1a1a1c] border-b border-[#111] py-1 px-3 flex justify-center items-center text-[10px] text-neutral-500 tracking-wide" title="Tap any order ticket to move it to the front of the queue; its countdown stays the same so you can prioritise.">
          Tap an order to bring it to the front — timer unchanged.
        </div>
      </div>

      {/* Main gameplay: Left controls | Ingredients | Canvas | Right controls */}
      <div className={`flex flex-1 min-h-0 min-w-0 relative px-1 py-1 gap-1 ${viewport.isIpadPortrait ? 'flex-col' : 'justify-between items-stretch'}`}>

        <div className="flex flex-1 min-h-0 min-w-0 justify-between items-stretch gap-1">
        {/* Left Column: Heat + Oil */}
        <div className="flex flex-row justify-center gap-1.5 h-full z-20 shrink-0 w-28 max-h-[90%]">

          {/* Heat Slider */}
          <div className="w-1/2 bg-neutral-900 rounded-full flex flex-col items-center border border-neutral-800 relative flex-1 min-h-0 py-4" title="Drag to set burner heat. High heat cooks faster but fills the Burn meter quicker.">
            <div className={`font-black text-[8px] mb-2 z-10 pointer-events-none transition-colors ${heatLevel > 80 ? 'text-red-500 animate-pulse' : 'text-neutral-500'}`}>HEAT</div>
            <div
              className="relative flex-1 w-full flex justify-center cursor-ns-resize touch-none"
              onPointerDown={handleHeatPointer}
              onPointerMove={handleHeatPointer}
            >
              <div className="w-2 h-full bg-black rounded-full overflow-hidden relative shadow-inner pointer-events-none">
                <div
                  className={`absolute bottom-0 w-full transition-all duration-100 bg-gradient-to-t ${heatLevel > 80 ? 'from-red-600 to-orange-400' : 'from-orange-500 to-yellow-400'}`}
                  style={{ height: `${heatLevel}%` }}
                />
              </div>
              <div
                className={`w-10 h-8 bg-neutral-200 rounded-lg absolute z-10 pointer-events-none transition-transform flex items-center justify-center shadow-lg ${heatLevel > 80 ? 'border-2 border-red-500 bg-white scale-110' : 'border-b-4 border-neutral-400'}`}
                style={{ bottom: `calc(${heatLevel}% - 16px)` }}
              >
                <div className="flex flex-col gap-1 opacity-40">
                  <div className="w-5 h-0.5 bg-neutral-800 rounded-full"></div>
                  <div className="w-5 h-0.5 bg-neutral-800 rounded-full"></div>
                  <div className="w-5 h-0.5 bg-neutral-800 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Oil Squeeze Bottle */}
          <div className="w-1/2 bg-neutral-900/60 rounded-full flex flex-col items-center border border-yellow-900/50 relative flex-1 min-h-0 py-4 shadow-[inset_0_0_20px_rgba(234,179,8,0.05)]" title="Oil level. Hold the bottle button below to add oil.">
            <div className={`font-black text-[8px] mb-2 z-10 pointer-events-none transition-colors ${oilLevel < 20 ? 'text-red-500 animate-pulse' : oilLevel > 75 ? 'text-orange-400' : 'text-yellow-500'}`}>OIL</div>
            <div className="relative flex-1 w-full flex justify-center">
              <div className="w-2 h-full bg-black rounded-full overflow-hidden relative shadow-inner">
                <div
                  className={`absolute bottom-0 w-full transition-all duration-100 bg-gradient-to-t from-yellow-600 to-yellow-300 ${oilLevel > 75 ? 'animate-pulse' : ''}`}
                  style={{ height: `${oilLevel}%` }}
                />
              </div>
              {orders?.[0]?.idealOil != null && !orders?.[0]?.failed && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-none"
                  style={{ bottom: `calc(${Math.max(0, Math.min(100, orders[0].idealOil))}% - 1px)` }}
                  title={`Optimal oil for "${String(orders[0].name)}": ${Math.round(orders[0].idealOil)}%`}
                >
                  <div className="w-2 h-[2px] bg-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.6)] rounded-full" />
                  <div className="ml-1 text-[7px] font-black text-cyan-200 whitespace-nowrap drop-shadow-sm">
                    OPT {Math.round(orders[0].idealOil)}%{oilLevel < orders[0].idealOil ? ` (+${Math.round(orders[0].idealOil - oilLevel)}%)` : ''}
                  </div>
                </div>
              )}
            </div>
            <button
              onPointerDown={() => setIsOiling(true)}
              onPointerUp={() => setIsOiling(false)}
              onPointerLeave={() => setIsOiling(false)}
              className={`absolute bottom-2 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-xl border-b-4 active:border-b-0 active:translate-y-1 ${oilLevel < 20 ? 'bg-red-900 border-red-950 animate-pulse' : oilLevel > 75 ? 'bg-orange-800 border-orange-950' : 'bg-yellow-600 border-yellow-800 hover:bg-yellow-500'}`}
              title="Hold to add oil to the wok."
            >
              <Droplets className={`w-4 h-4 ${oilLevel < 20 ? 'text-red-400' : 'text-yellow-100'}`} />
            </button>
          </div>
        </div>

        {!viewport.isIpadPortrait && (
        /* Ingredients left: 3 cols — Proteins | Carbs | Vegetables */
        <div className="flex flex-col shrink-0 w-[19.6rem] h-full min-h-0 bg-[#151517] border border-[#0a0a0c] rounded-xl overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] z-20">
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center py-2 border-b border-neutral-800 shrink-0" title="Click an ingredient to add it to the wok. Cost and stats on hover.">Add</div>
          <div className={`flex-1 min-h-0 flex gap-1 p-1.5 overflow-hidden ${viewport.isIpadPortrait ? 'flex-col overflow-y-auto' : 'flex-row'}`}>
            {viewport.isIpadPortrait ? (
              CATEGORIES.filter(c => ['PROTEINS', 'CARBS', 'VEGETABLES'].includes(c.id)).map(cat => (
                <div key={cat.id} className="flex flex-col gap-1 shrink-0">
                  <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider truncate text-center shrink-0">
                    {cat.name}
                  </div>
                  <div className="flex flex-col gap-1 w-[70%] mx-auto">
                    {cat.items.map(itemId => {
                      const item = ALL_ITEMS_BY_ID[itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => addIngredient(item.id)}
                          disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                          title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5 | Oil ${item.oiliness}/5`}
                          className={`rounded-lg flex flex-col items-center justify-center gap-0.5 py-2 w-full transition-all bg-black ${item.text || 'text-neutral-100'} border-2 shadow-sm min-h-0 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5 ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'}`}
                        >
                          <span className="text-3xl leading-none drop-shadow-md">{String(item.icon)}</span>
                          <span className="text-[9px] font-black text-white uppercase tracking-wider leading-tight w-full text-center px-0.5 drop-shadow-sm break-words">{String(item.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              CATEGORIES.filter(c => ['PROTEINS', 'CARBS', 'VEGETABLES'].includes(c.id)).map(cat => (
                <div key={cat.id} className="flex-1 min-w-0 flex flex-col overflow-y-auto custom-scrollbar">
                  <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider truncate text-center pb-1 shrink-0">
                    {cat.name}
                  </div>
                  <div className="flex flex-col gap-1">
                    {cat.items.map(itemId => {
                      const item = ALL_ITEMS_BY_ID[itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => addIngredient(item.id)}
                          disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                          title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5 | Oil ${item.oiliness}/5`}
                          className={`rounded-lg flex flex-col items-center justify-center gap-0.5 py-2 transition-all bg-black ${item.text || 'text-neutral-100'} border-2 shadow-sm w-full min-h-0 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5 ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'}`}
                        >
                          <span className="text-3xl leading-none drop-shadow-md">{String(item.icon)}</span>
                          <span className="text-[9px] font-black text-white uppercase tracking-wider leading-tight w-full text-center px-0.5 drop-shadow-sm break-words">{String(item.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}

        {/* Center: Canvas (no Wok Hei here) */}
        <div className="flex-1 h-full min-h-0 min-w-0 flex flex-row items-center justify-center gap-2 mx-1 overflow-hidden">
          <div className="flex-1 min-w-0 h-full flex flex-col items-center justify-center relative overflow-hidden">
          {/* Cook / Burn progress overlay */}
          <div
            className="absolute top-0 w-full flex justify-between px-1 z-20 pointer-events-none transition-opacity duration-300"
            style={{ opacity: wokContents.length > 0 ? 1 : 0 }}
            title="Cook and Burn meters. Serve when Cook is high and Burn is low. Toss to slow Burn."
          >
            <div className="w-20 bg-black/60 rounded-lg border border-neutral-800 backdrop-blur-md p-1.5" title="Cook progress. High heat and tossing fill it.">
              <div className="flex justify-between text-[8px] mb-0.5 font-bold uppercase tracking-wider text-neutral-400">
                <span>Cook</span>
                <span className={cookProgress > 90 ? 'text-green-400' : 'text-white'}>{Math.floor(cookProgress)}%</span>
              </div>
              <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-100" style={{ width: `${cookProgress}%` }} />
              </div>
            </div>

            <div className={`bg-black/60 rounded-lg border backdrop-blur-md flex flex-col items-center p-1 ${wokUmami.avg >= 3 ? 'border-amber-700/60' : 'border-neutral-800'}`} title="Umami (旨味). Average from ingredients. Higher = flavor bonus.">
              <div className="text-[7px] font-black uppercase tracking-wider text-amber-500">旨味</div>
              <div className={`text-sm font-mono font-black ${wokUmami.avg >= 3 ? 'text-amber-300' : wokUmami.avg >= 2 ? 'text-amber-400' : 'text-neutral-500'}`}>
                {wokUmami.avg.toFixed(1)}
              </div>
            </div>

            <div className="w-20 bg-black/60 rounded-lg border border-neutral-800 backdrop-blur-md p-1.5" title="Burn meter. Toss to slow it. Don't let it hit 100%.">
              <div className="flex justify-between text-[8px] mb-0.5 font-bold uppercase tracking-wider text-neutral-400">
                <span>Burn</span>
                <span className={burnProgress > 75 ? 'text-red-500 animate-pulse' : 'text-white'}>{Math.floor(burnProgress)}%</span>
              </div>
              <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
                <div className="h-full bg-red-600 transition-all duration-100" style={{ width: `${burnProgress}%` }} />
              </div>
            </div>
          </div>

          <WokPhysics
            ref={wokPhysicsRef}
            heatLevel={heatLevel}
            isCleaning={isCleaning}
            waterLevel={waterLevel}
            waterDirtiness={waterDirtiness}
            oilLevel={oilLevel}
            isOiling={isOiling}
            toss={toss}
            cookProgress={cookProgress}
            burnProgress={burnProgress}
            wokHei={wokHei}
            wokResidue={wokResidue}
            onSpill={handleSpill}
          />
          </div>
          {orders?.[0] && !orders[0].failed && (() => {
            const order = orders[0];
            const reqMap = {};
            order.requires.forEach(req => { reqMap[req] = (reqMap[req] || 0) + 1; });
            const wokFreq = {};
            wokContents.forEach(id => { wokFreq[id] = (wokFreq[id] || 0) + 1; });
            const totalRemaining = Object.keys(reqMap).reduce((sum, id) => sum + Math.max(0, (reqMap[id] || 0) - (wokFreq[id] || 0)), 0);
            return (
              <div className="shrink-0 bg-black/70 rounded-xl border border-neutral-700 p-4 max-h-[85%] overflow-y-auto custom-scrollbar z-10" title="Ingredients needed for current order. ✓ enough added, ✗ over-added.">
                <div className="text-xs font-black text-neutral-400 uppercase tracking-wider mb-2">Current order</div>
                <div className="text-sm text-amber-400 font-bold mb-3 truncate max-w-[270px]" title={order.name}>{order.name}</div>
                <div className="text-xs text-neutral-300 font-bold mb-4">Remaining: <span className={totalRemaining === 0 ? 'text-green-400' : 'text-amber-400'}>{totalRemaining}</span></div>
                <ul className="space-y-2">
                  {Object.entries(reqMap).map(([id, needed]) => {
                    const current = wokFreq[id] || 0;
                    const remaining = Math.max(0, needed - current);
                    const isSufficient = current >= needed;
                    const isOver = current > needed;
                    const item = ALL_ITEMS_BY_ID[id];
                    if (!item) return null;
                    return (
                      <li key={id} className="flex items-center gap-3 text-sm">
                        <span className="text-2xl leading-none shrink-0">{item.icon}</span>
                        <span className="flex-1 min-w-0 truncate text-neutral-200" title={item.name}>{item.name}</span>
                        <span className="text-neutral-500 shrink-0 tabular-nums">{current}/{needed}</span>
                        {isSufficient && !isOver && <CheckCircle className="w-7 h-7 shrink-0 text-green-500" aria-label="enough" />}
                        {isOver && <X className="w-7 h-7 shrink-0 text-red-500" aria-label="over-added" />}
                        {!isSufficient && <span className="text-amber-400 shrink-0 tabular-nums">−{remaining}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </div>

        {!viewport.isIpadPortrait && (
        <div className="flex flex-col shrink-0 h-full min-h-0 bg-[#151517] border border-[#0a0a0c] rounded-xl overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] z-20 w-[18.48rem]">
          {/* Spices | Sauces */}
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center py-2 border-b border-neutral-800 shrink-0" title="Spices and sauces. Click to add to wok.">Spices & Sauces</div>
          <div className={`flex-1 min-h-0 p-1.5 overflow-hidden flex gap-1 ${viewport.isIpadPortrait ? 'flex-col overflow-y-auto' : 'flex-row'}`}>
            {viewport.isIpadPortrait ? (
              <>
                <div className="flex flex-col gap-1 shrink-0 w-[70%] mx-auto">
                  <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider truncate text-center shrink-0">Spices</div>
                  <div className="flex flex-col gap-1">
                    {(CATEGORIES.find(c => c.id === 'SPICES')?.items || []).map(itemId => {
                      const item = ALL_ITEMS_BY_ID[itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => addIngredient(item.id)}
                          disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                          title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5 | Oil ${item.oiliness}/5`}
                          className={`rounded-lg flex flex-col items-center justify-center gap-0.5 py-2 transition-all bg-black ${item.text || 'text-neutral-100'} border-2 shadow-sm w-full min-h-0 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5 ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'}`}
                        >
                          <span className="text-3xl leading-none drop-shadow-md">{String(item.icon)}</span>
                          <span className="text-[9px] font-black text-white uppercase tracking-wider leading-tight w-full text-center px-0.5 drop-shadow-sm break-words">{String(item.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0 border-t border-neutral-800/70 pt-2 w-[70%] mx-auto">
                  <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider truncate text-center shrink-0">Sauces</div>
                  <div className="flex flex-col gap-1">
                    {(CATEGORIES.find(c => c.id === 'SAUCES')?.items || []).map(itemId => {
                      const item = ALL_ITEMS_BY_ID[itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => addIngredient(item.id)}
                          disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                          title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5 | Oil ${item.oiliness}/5`}
                          className={`rounded-lg flex flex-col items-center justify-center gap-0.5 py-2 transition-all bg-black ${item.text || 'text-neutral-100'} border-2 shadow-sm w-full min-h-0 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5 ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'}`}
                        >
                          <span className="text-3xl leading-none drop-shadow-md">{String(item.icon)}</span>
                          <span className="text-[9px] font-black text-white uppercase tracking-wider leading-tight w-full text-center px-0.5 drop-shadow-sm break-words">{String(item.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
            {/* Spices column 1 (3 items) */}
            <div className="flex-1 min-w-0 flex flex-col overflow-y-auto custom-scrollbar gap-1">
              <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider truncate text-center shrink-0">Spices</div>
              {(CATEGORIES.find(c => c.id === 'SPICES')?.items || []).slice(0, 3).map(itemId => {
                const item = ALL_ITEMS_BY_ID[itemId];
                if (!item) return null;
                return (
                  <button
                    key={item.id}
                    onClick={() => addIngredient(item.id)}
                    disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                    title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5 | Oil ${item.oiliness}/5`}
                    className={`rounded-lg flex flex-col items-center justify-center gap-0.5 py-2 transition-all bg-black ${item.text || 'text-neutral-100'} border-2 shadow-sm w-full min-h-0 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5 ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'}`}
                  >
                    <span className="text-3xl leading-none drop-shadow-md">{String(item.icon)}</span>
                    <span className="text-[9px] font-black text-white uppercase tracking-wider leading-tight w-full text-center px-0.5 drop-shadow-sm break-words">{String(item.name)}</span>
                  </button>
                );
              })}
            </div>

            {/* Spices column 2 (3 items) */}
            <div className="flex-1 min-w-0 flex flex-col overflow-y-auto custom-scrollbar gap-1">
              <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider truncate text-center shrink-0">Spices</div>
              {(CATEGORIES.find(c => c.id === 'SPICES')?.items || []).slice(3, 6).map(itemId => {
                const item = ALL_ITEMS_BY_ID[itemId];
                if (!item) return null;
                return (
                  <button
                    key={item.id}
                    onClick={() => addIngredient(item.id)}
                    disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                    title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5 | Oil ${item.oiliness}/5`}
                    className={`rounded-lg flex flex-col items-center justify-center gap-0.5 py-2 transition-all bg-black ${item.text || 'text-neutral-100'} border-2 shadow-sm w-full min-h-0 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5 ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'}`}
                  >
                    <span className="text-3xl leading-none drop-shadow-md">{String(item.icon)}</span>
                    <span className="text-[9px] font-black text-white uppercase tracking-wider leading-tight w-full text-center px-0.5 drop-shadow-sm break-words">{String(item.name)}</span>
                  </button>
                );
              })}
            </div>

            {/* Sauces column (4 items) */}
            <div className="flex-1 min-w-0 flex flex-col overflow-y-auto custom-scrollbar gap-1">
              <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider truncate text-center shrink-0">Sauces</div>
              {(CATEGORIES.find(c => c.id === 'SAUCES')?.items || []).map(itemId => {
                const item = ALL_ITEMS_BY_ID[itemId];
                if (!item) return null;
                return (
                  <button
                    key={item.id}
                    onClick={() => addIngredient(item.id)}
                    disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                    title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5 | Oil ${item.oiliness}/5`}
                    className={`rounded-lg flex flex-col items-center justify-center gap-0.5 py-2 transition-all bg-black ${item.text || 'text-neutral-100'} border-2 shadow-sm w-full min-h-0 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5 ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'}`}
                  >
                    <span className="text-3xl leading-none drop-shadow-md">{String(item.icon)}</span>
                    <span className="text-[9px] font-black text-white uppercase tracking-wider leading-tight w-full text-center px-0.5 drop-shadow-sm break-words">{String(item.name)}</span>
                  </button>
                );
              })}
            </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* Wok Hei meter */}
        <div className="flex flex-col items-center justify-center shrink-0 z-20 py-2 h-full" title="Wok Hei. Build by tossing at high heat with oil. Boosts revenue.">
          <div
            className={`text-[8px] font-black mb-1 text-fuchsia-500 tracking-widest ${wokHei > 80 ? 'animate-pulse drop-shadow-[0_0_5px_rgba(217,70,239,0.8)]' : 'opacity-50'}`}
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            WOK HEI
          </div>
          <div className={`bg-black/50 border border-neutral-800 rounded-full overflow-hidden shadow-2xl flex flex-col justify-end backdrop-blur-sm transition-colors flex-1 min-h-0 w-4 ${wokHei > 80 ? 'border-fuchsia-500/50 shadow-[0_0_30px_rgba(217,70,239,0.4)]' : ''}`}>
            <div className="w-full transition-all duration-200 bg-gradient-to-t from-indigo-900 to-fuchsia-400 relative" style={{ height: `${wokHei}%` }}>
              {wokHei > 80 && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
            </div>
          </div>
        </div>

        {/* Right Column: Toss Pad + Actions */}
        <div className="flex flex-col justify-center z-20 shrink-0 h-full gap-1.5 w-24 max-h-[90%]">

          {/* 2D Elliptical Toss Pad */}
          <div className="flex flex-col flex-1 bg-neutral-900/80 rounded-[40px] border border-blue-900/50 relative shadow-[inset_0_0_20px_rgba(59,130,246,0.05)] min-h-0 py-4 px-1.5" title="Drag to toss the wok. Tossing slows Burn and builds Wok Hei at high heat.">
            <div className={`font-black text-[8px] mb-1 z-10 pointer-events-none text-center transition-colors ${toss.x !== 0 || toss.y !== 0 ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]' : 'text-neutral-500'}`}>TOSS</div>
            <div
              className="relative flex-1 w-full flex justify-center items-center cursor-move touch-none"
              onPointerDown={handleTossPointer}
              onPointerMove={handleTossPointer}
              onPointerUp={handleTossRelease}
              onPointerLeave={handleTossRelease}
            >
              <div className="w-full h-[90%] bg-black/50 rounded-[40px] overflow-hidden relative shadow-inner border-2 border-neutral-800 pointer-events-none">
                <div className="absolute top-1/2 w-full h-px bg-neutral-700/50 transform -translate-y-1/2"></div>
                <div className="absolute left-1/2 h-full w-px bg-neutral-700/50 transform -translate-x-1/2"></div>
              </div>
              <div
                className="w-10 h-10 bg-neutral-200 rounded-full absolute z-10 pointer-events-none transition-transform flex items-center justify-center shadow-[0_10px_20px_rgba(0,0,0,0.5)] border-b-4 border-neutral-400"
                style={{
                  left: `calc(50% + ${toss.x * 35}%)`,
                  top: `calc(50% + ${toss.y * 35}%)`,
                  transform: `translate(-50%, -50%) scale(${toss.x === 0 && toss.y === 0 ? 1 : 1.15})`,
                }}
              >
                <div className="w-4 h-4 bg-blue-500 rounded-full opacity-60 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)]"></div>
              </div>
            </div>
          </div>

          {/* Tactile Action Grid */}
          <div className="grid grid-cols-2 w-full shrink-0 min-w-0 gap-1.5 h-14">
            <button
              onClick={handleTrash}
              disabled={gameOver}
              className="w-full min-w-0 h-full bg-neutral-800 hover:bg-neutral-700 border-black border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-red-500 flex flex-col items-center justify-center transition-all text-[9px] shadow-lg tracking-wider overflow-hidden disabled:opacity-30"
              title="Discard everything in the wok. Resets combo."
            >
              <Trash2 className="w-4 h-4 mb-0.5 shrink-0" /> TRASH
            </button>
            <button
              onPointerDown={handleCleanDown}
              onPointerUp={handleCleanRelease}
              onPointerLeave={handleCleanRelease}
              disabled={wokContents.length > 0 || gameOver}
              className="w-full min-w-0 h-full bg-blue-800 hover:bg-blue-700 border-blue-950 border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-white flex flex-col items-center justify-center transition-all text-[9px] disabled:opacity-30 shadow-lg tracking-wider overflow-hidden"
              title="Clean the wok with water. Empty wok only."
            >
              <Droplets className="w-4 h-4 mb-0.5 shrink-0" /> CLEAN
            </button>
          </div>
          {wokContents.length > 0 && cookProgress >= 50 && !gameOver && orders.filter(o => !o.failed).length > 0 && (
            <button
              onClick={() => { if (!chefsSpecialMode) setSpecialMarkup(2.5); setChefsSpecialMode(prev => !prev); }}
              className={`w-full shrink-0 ${chefsSpecialMode ? 'bg-yellow-500 text-black border-yellow-700 ring-2 ring-yellow-300' : 'bg-orange-900/80 hover:bg-orange-800 text-orange-200 border-orange-950'} border-b-2 active:border-b-0 active:translate-y-0.5 rounded-xl font-bold flex items-center justify-center gap-1 transition-all shadow-lg text-[8px] tracking-wider h-8`}
              title="Chef's Special: Mark up the dish and tap a ticket to serve as a special for higher price."
            >
              <ChefHat className="w-3 h-3" /> {chefsSpecialMode ? 'CANCEL' : "CHEF'S SPECIAL"}
            </button>
          )}
          <div className="grid grid-cols-2 w-full shrink-0 min-w-0 gap-1.5 h-14">
            <button
              onClick={() => serveDish(true)}
              disabled={gameOver}
              className="w-full min-w-0 h-full bg-cyan-800 hover:bg-cyan-700 border-cyan-950 border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-cyan-100 flex flex-col items-center justify-center transition-all shadow-xl text-[9px] tracking-wider overflow-hidden disabled:opacity-30"
              title="Gift: Donate the dish for Soul. No order match needed."
            >
              <Heart className="w-4 h-4 mb-0.5 shrink-0" /> GIFT
            </button>
            <button
              onClick={() => serveDish(false)}
              disabled={gameOver}
              className="w-full min-w-0 h-full bg-green-600 hover:bg-green-500 border-green-900 border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-white flex flex-col items-center justify-center transition-all shadow-xl text-[9px] tracking-wider overflow-hidden disabled:opacity-30"
              title="Serve to a matching order for cash."
            >
              <CheckCircle className="w-4 h-4 mb-0.5 shrink-0" /> SERVE
            </button>
          </div>

          {wokContents.length > 0 && (
            <button
              onClick={() => { setNewRecipeName(''); setShowSaveRecipe(true); }}
              className="w-full shrink-0 bg-amber-900/80 hover:bg-amber-800 border-amber-950 border-b-2 active:border-b-0 active:translate-y-0.5 rounded-xl font-bold text-amber-200 flex items-center justify-center gap-1 transition-all shadow-lg text-[8px] tracking-wider h-8"
              title="Save current wok as a custom recipe."
            >
              <BookOpen className="w-3 h-3" /> SAVE
            </button>
          )}
        </div>

        </div>

        {/* iPad portrait only: all ingredients at bottom — 2 rows: Spices/Sauces top, Proteins/Carbs/Veg bottom */}
        {viewport.isIpadPortrait && (
          <div className="shrink-0 bg-[#151517] border-t-4 border-[#0a0a0c] w-full overflow-hidden py-2 px-1.5 flex flex-col gap-2 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
            {/* Top row: Spices & Sauces */}
            <div className="flex flex-wrap gap-2 shrink-0 justify-center items-start">
              {CATEGORIES.filter(c => ['SPICES', 'SAUCES'].includes(c.id)).map(cat => (
                <div key={cat.id} className="flex flex-col gap-1 shrink-0 bg-neutral-900/60 rounded-lg p-1.5 border border-neutral-800">
                  <div className="text-[8px] text-neutral-500 font-black uppercase tracking-widest text-center shrink-0">{cat.name}</div>
                  <div className="flex gap-1 flex-wrap justify-center">
                    {(cat.items || []).map(itemId => {
                      const item = ALL_ITEMS_BY_ID[itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => addIngredient(item.id)}
                          disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                          title={`${item.name} $${item.cost.toFixed(2)}`}
                          className="rounded-md flex flex-col items-center justify-center gap-0 py-1 px-1.5 min-w-[2.75rem] shrink-0 transition-all bg-black border border-neutral-600 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5"
                        >
                          <span className="text-xl leading-none">{String(item.icon)}</span>
                          <span className="text-[8px] font-bold text-white uppercase tracking-tight leading-tight text-center line-clamp-2">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Bottom row: Proteins, Carbs, Vegetables */}
            <div className="flex flex-wrap gap-2 shrink-0 justify-center items-start">
              {CATEGORIES.filter(c => ['PROTEINS', 'CARBS', 'VEGETABLES'].includes(c.id)).map(cat => (
                <div key={cat.id} className="flex flex-col gap-1 shrink-0 bg-neutral-900/60 rounded-lg p-1.5 border border-neutral-800">
                  <div className="text-[8px] text-neutral-500 font-black uppercase tracking-widest text-center shrink-0">{cat.name}</div>
                  <div className="flex gap-1 flex-wrap justify-center">
                    {(cat.items || []).map(itemId => {
                      const item = ALL_ITEMS_BY_ID[itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => addIngredient(item.id)}
                          disabled={wokContents.length >= 25 || burnProgress >= 100 || gameOver}
                          title={`${item.name} $${item.cost.toFixed(2)}`}
                          className="rounded-md flex flex-col items-center justify-center gap-0 py-1 px-1.5 min-w-[2.75rem] shrink-0 transition-all bg-black border border-neutral-600 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-0.5"
                        >
                          <span className="text-xl leading-none">{String(item.icon)}</span>
                          <span className="text-[8px] font-bold text-white uppercase tracking-tight leading-tight text-center line-clamp-2">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save Recipe Dialog */}
      {showSaveRecipe && (
        <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-amber-700 p-5 rounded-2xl max-w-sm w-full shadow-2xl relative">
            <button onClick={() => setShowSaveRecipe(false)} className="absolute top-3 right-3 text-neutral-400 hover:text-white text-lg">✕</button>
            <h2 className="text-xl font-black mb-3 text-amber-400 flex items-center justify-center gap-2"><BookOpen size={20} /> Save Recipe</h2>
            
            <div className="mb-3 bg-black/40 p-3 rounded-xl border border-neutral-800">
              <div className="text-[10px] text-neutral-400 uppercase tracking-widest mb-1.5">Ingredients in Wok</div>
              <div className="flex flex-wrap gap-1">
                {[...new Set(wokContents)].map(id => {
                  const count = wokContents.filter(x => x === id).length;
                  const info = ALL_ITEMS_BY_ID[id];
                  return (
                    <span key={id} className="bg-neutral-800 px-2 py-1 rounded-md text-sm flex items-center gap-1">
                      {String(info?.icon || '?')} {count > 1 && <span className="text-xs text-neutral-400">x{count}</span>}
                    </span>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className="text-amber-400 font-bold">旨味 Umami: {wokUmami.avg.toFixed(1)}</span>
                <span className="text-red-400 font-mono">Cost: ${wokContents.reduce((s, id) => s + (ALL_ITEMS_BY_ID[id]?.cost || 0), 0).toFixed(2)}</span>
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5 mb-3">
              <label className="text-[10px] font-bold text-amber-500 uppercase tracking-widest ml-1">Recipe Name</label>
              <input 
                type="text" 
                placeholder="Name your creation..." 
                value={newRecipeName} 
                onChange={e => setNewRecipeName(e.target.value)} 
                maxLength={30} 
                className="w-full p-2.5 rounded-lg bg-neutral-950 text-white border border-neutral-600 outline-none font-bold text-sm focus:border-amber-500 transition-colors" 
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveCustomRecipe(); }}
              />
            </div>

            <div className="flex flex-col gap-1.5 mb-3">
              <label className="text-[10px] font-bold text-green-500 uppercase tracking-widest ml-1">Profit Margin</label>
              <div className="bg-black/40 rounded-xl p-3 border border-neutral-800">
                <input
                  type="range" min="1.5" max="4.0" step="0.1"
                  value={recipeMarkup}
                  onChange={e => setRecipeMarkup(parseFloat(e.target.value))}
                  className="w-full h-2 accent-green-500 cursor-pointer"
                />
                <div className="flex justify-between items-center mt-2 text-xs">
                  <span className={`font-bold ${recipeMarkup > 3 ? 'text-red-400' : recipeMarkup > 2.5 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {recipeMarkup.toFixed(1)}x markup
                  </span>
                  <span className="text-green-400 font-mono">
                    Sell: ${(wokCost * recipeMarkup).toFixed(2)}
                  </span>
                  <span className={`font-bold font-mono ${recipeMarkup > 3 ? 'text-red-300' : 'text-white'}`}>
                    +${(wokCost * (recipeMarkup - 1)).toFixed(2)} profit
                  </span>
                </div>
                <div className="mt-1.5 text-[9px] text-neutral-500 text-center">
                  {recipeMarkup <= 2.0 ? 'Budget friendly — easy sell' : recipeMarkup <= 2.5 ? 'Fair price — good balance' : recipeMarkup <= 3.0 ? 'Premium — harder to sell' : 'Luxury — very hard to sell'}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button onClick={() => setShowSaveRecipe(false)} className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95 text-xs">
                Cancel
              </button>
              <button onClick={saveCustomRecipe} disabled={!newRecipeName.trim()} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-neutral-950 rounded-xl font-bold uppercase tracking-widest transition-all active:scale-95 text-xs">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
