import React, { useState, useEffect, useRef } from 'react';
import { Flame, ChefHat, AlertTriangle, CheckCircle, Trash2, ChevronRight, ChevronLeft, Droplets, Info, Plus, Trophy, User, RotateCcw, BookOpen, Play, Crosshair, ShoppingCart, Settings, Heart, X } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot } from 'firebase/firestore';
import GameLoop from './GameLoop';
import RestaurantHub, { loadRestaurantState, saveRestaurantState } from './RestaurantHub';
import { initAudio as initAudioEngine } from './audioEngine';

// ==========================================
// DIFFICULTY SCALING
// ==========================================
const DIFF_MULTS = {
  EASY: { burn: 0.6, spill: 0.5, target: 0.75, name: 'EASY', color: 'text-green-400' },
  NORMAL: { burn: 1.0, spill: 1.0, target: 1.0, name: 'NORMAL', color: 'text-yellow-400' },
  HARD: { burn: 1.5, spill: 2.0, target: 1.5, name: 'HARD', color: 'text-red-500' }
};

// ==========================================
// ECONOMY: SCORE, CASH, PROFIT, REPUTATION, SOUL
// ==========================================
// SCORE   = Quality-adjusted lifetime earnings. Base dish value × Wok Hei × flavor combos × combo × prep × oil × tips + event bonuses. Never decreases. Drives STORY PROGRESSION and chef rank (Sik San, etc.). Used for leaderboard.
// CASH    = Wallet — money you can spend now. Goes UP with profit from serves + tips + NPC cash bonuses. Goes DOWN when you add ingredients, buy upgrades, spill, or GIFT. Used to buy ingredients and shop upgrades only.
// PROFIT  = From one serve: (revenue − ingredient cost). Revenue includes all score multipliers + speed tip. Profit is added to CASH.
// TIPS    = Speed bonus from serving with time left on the ticket. Part of revenue → adds to both SCORE and CASH (via profit).
// DELIGHT = Customer delight (-10 to +10). Starts at 0. +2 per successful serve (max +10), -2 per failed order/burn (or -1 with Goose); game over at -10.
// SOUL    = Goodwill from GIFTing dishes (no cash profit). Used in story NPC encounters for bonuses. Does not affect cash or score.

// ==========================================
// AUDIO ENGINE
// ==========================================
let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let compressor = null;

let sizzleSource = null;
let sizzleGain = null;
let sizzleFilter = null;

let burnerSource = null;
let burnerGain = null;
let burnerFilter = null;

let cleanSource = null;
let cleanGain = null;

let noiseBuffer = null;

let sfxVolumeLevel = 0.5;
let musicVolumeLevel = 0.5;

const setSfxVolume = (val) => {
  sfxVolumeLevel = val;
  if (sfxGain && audioCtx) {
    sfxGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.1);
  }
};

const setMusicVolume = (val) => {
  musicVolumeLevel = val;
  if (musicGain && audioCtx) {
    musicGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.1);
  }
};

const getNoiseBuffer = () => {
  if (!audioCtx) return null;
  if (noiseBuffer) return noiseBuffer;
  const bufferSize = audioCtx.sampleRate * 2;
  noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
};

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8; 

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = sfxVolumeLevel;

    musicGain = audioCtx.createGain();
    musicGain.gain.value = musicVolumeLevel;

    sfxGain.connect(compressor);
    musicGain.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  setupSizzle();
  setupBurner();
  setupClean();
};

const setupSizzle = () => {
  if (sizzleSource) return;
  sizzleSource = audioCtx.createBufferSource();
  sizzleSource.buffer = getNoiseBuffer();
  sizzleSource.loop = true;
  sizzleFilter = audioCtx.createBiquadFilter();
  sizzleFilter.type = 'bandpass';
  sizzleFilter.Q.value = 1.0;
  sizzleGain = audioCtx.createGain();
  sizzleGain.gain.value = 0;

  sizzleSource.connect(sizzleFilter);
  sizzleFilter.connect(sizzleGain);
  sizzleGain.connect(sfxGain); 
  sizzleSource.start();
};

const setupBurner = () => {
  if (burnerSource) return;
  burnerSource = audioCtx.createBufferSource();
  burnerSource.buffer = getNoiseBuffer();
  burnerSource.loop = true;
  burnerFilter = audioCtx.createBiquadFilter();
  burnerFilter.type = 'lowpass';
  burnerFilter.frequency.value = 200;
  burnerGain = audioCtx.createGain();
  burnerGain.gain.value = 0;

  burnerSource.connect(burnerFilter);
  burnerFilter.connect(burnerGain);
  burnerGain.connect(sfxGain);
  burnerSource.start();
};

const setupClean = () => {
  if (cleanSource) return;
  cleanSource = audioCtx.createBufferSource();
  cleanSource.buffer = getNoiseBuffer();
  cleanSource.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1500;
  filter.Q.value = 0.8;
  cleanGain = audioCtx.createGain();
  cleanGain.gain.value = 0;

  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 5; 
  const oscGain = audioCtx.createGain();
  oscGain.gain.value = 600; 
  osc.connect(oscGain);
  oscGain.connect(filter.frequency);
  osc.start();

  cleanSource.connect(filter);
  filter.connect(cleanGain);
  cleanGain.connect(sfxGain); 
  cleanSource.start();
};

const updateSizzle = (heatLevel, hasFood) => {
  if (!audioCtx || !sizzleGain) return;
  if (!hasFood || heatLevel < 5) {
    sizzleGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    return;
  }
  const targetVolume = 0.05 + (heatLevel / 100) * 0.35;
  const targetFreq = 1000 + (heatLevel / 100) * 5000;
  sizzleGain.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.1);
  sizzleFilter.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
};

const updateBurner = (heatLevel, isWhoosh) => {
  if (!audioCtx || !burnerGain) return;
  const targetVol = (heatLevel / 100) * 0.6;
  const targetFreq = 200 + (heatLevel / 100) * 800;

  if (isWhoosh) {
     burnerFilter.frequency.cancelScheduledValues(audioCtx.currentTime);
     burnerFilter.frequency.setValueAtTime(burnerFilter.frequency.value, audioCtx.currentTime);
     burnerFilter.frequency.exponentialRampToValueAtTime(targetFreq * 3.0, audioCtx.currentTime + 0.1);
     burnerFilter.frequency.exponentialRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.6);

     burnerGain.gain.cancelScheduledValues(audioCtx.currentTime);
     burnerGain.gain.setValueAtTime(burnerGain.gain.value, audioCtx.currentTime);
     burnerGain.gain.linearRampToValueAtTime(Math.min(1.0, targetVol * 1.8), audioCtx.currentTime + 0.1);
     burnerGain.gain.exponentialRampToValueAtTime(targetVol, audioCtx.currentTime + 0.6);
  } else {
     burnerGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.1);
     burnerFilter.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
  }
};

const updateClean = (isCleaning) => {
  if (!audioCtx || !cleanGain) return;
  cleanGain.gain.setTargetAtTime(isCleaning ? 0.35 : 0, audioCtx.currentTime, 0.1);
};

const playChop = () => {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.connect(gain);
  gain.connect(sfxGain);
  
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  
  osc.start(); osc.stop(audioCtx.currentTime + 0.1);
};

const playDing = (isPerfect) => {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.connect(gain);
  gain.connect(sfxGain);

  osc.frequency.setValueAtTime(isPerfect ? 880 : 587.33, audioCtx.currentTime);
  gain.gain.setValueAtTime(isPerfect ? 0.4 : 0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);

  osc.start(); osc.stop(audioCtx.currentTime + 1.5);
};

const playTrash = () => {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.connect(gain);
  gain.connect(sfxGain);

  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  osc.start(); osc.stop(audioCtx.currentTime + 0.3);
};

const playTossShhh = () => {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const noise = audioCtx.createBufferSource();
  noise.buffer = getNoiseBuffer();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, now);
  filter.Q.value = 0.4;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.008, now + 0.28);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);

  noise.start(now);
  noise.stop(now + 0.28);
};

const playFoodImpact = () => {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.04, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.006, now + 0.06);

  osc.connect(gain);
  gain.connect(sfxGain);

  osc.start(now);
  osc.stop(now + 0.06);
};

const playIngredientAdd = (ingId) => {
  if (!audioCtx || !sfxGain) return;
  const now = audioCtx.currentTime;

  const isWet = ['egg', 'beef', 'shrimp', 'char_siu'].includes(ingId);
  const isLiquid = ['soy_sauce', 'oyster_sauce', 'wine', 'xo_sauce'].includes(ingId);
  const isDry = ['scallion', 'gai_lan', 'mushroom', 'chili', 'garlic', 'ginger', 'five_spice', 'salt', 'sugar', 'msg', 'white_pepper'].includes(ingId);
  const isHeavy = ['rice', 'noodle'].includes(ingId);
  
  const noise = audioCtx.createBufferSource();
  noise.buffer = getNoiseBuffer();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);

  if (isWet) {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    noise.start(now); noise.stop(now + 0.15);

    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    oscGain.gain.setValueAtTime(0.1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(sfxGain);
    osc.start(now); osc.stop(now + 0.1);

  } else if (isLiquid) {
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    noise.start(now); noise.stop(now + 0.25);

  } else if (isDry) {
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4000, now);
    filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    noise.start(now); noise.stop(now + 0.1);

  } else if (isHeavy) {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    noise.start(now); noise.stop(now + 0.2);
    
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(oscGain);
    oscGain.connect(sfxGain);
    osc.start(now); osc.stop(now + 0.15);

  } else {
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(5000, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    noise.start(now); noise.stop(now + 0.15);
  }
};

// ==========================================
// GAME DATA & CONFIG
// ==========================================
const STORY_CHAPTERS = [
  { target: 0, chapter: 0, title: "Chapter 1: The Fall of the Emperor", desc: "You were the arrogant 'Emperor of Eats'. But your evil apprentice framed you! Grab a rusty wok and start grinding out cheap fried rice to survive!", goal: "Reach a score of 150 to buy a decent chef's knife.", color: "text-blue-400", border: "border-blue-900" },
  { target: 150, chapter: 1, title: "Chapter 2: Temple Street Triads", desc: "You invent dishes so incredible the local triad bosses demand them! But now they want a hefty cut of your profits.", goal: "Reach a score of 500 to pay off the local gangs.", color: "text-green-400", border: "border-green-900" },
  { target: 500, chapter: 2, title: "Chapter 3: The 18 Bronze Chefs", desc: "You must master the ancient Dragon-Subduing Wok Tosses inside a giant brass bell at the Shaolin Culinary Monastery!", goal: "Reach a score of 1,200 to graduate from Shaolin.", color: "text-yellow-400", border: "border-yellow-900" },
  { target: 1200, chapter: 3, title: "Chapter 4: The Mega-Laser Wok", desc: "You only have your iron pan and your newfound Shaolin inner peace against Bullhorn's high-tech Mega-Laser Wok. Show them the true meaning of Wok Hei!", goal: "Reach a score of 2,500 to expose the sabotage.", color: "text-orange-500", border: "border-orange-900" },
  { target: 2500, chapter: 4, title: "Chapter 5: The Sorrowful Rice", desc: "Treachery! Bullhorn destroyed your premium ingredients! You must pour your soul into the legendary 'Sorrowful Rice'.", goal: "Reach a score of 5,000 to ascend as the God of Cookery.", color: "text-red-500", border: "border-red-900" },
  { target: 5000, chapter: 5, title: "EPILOGUE: Ascension", desc: "A divine light beams from the heavens. You are officially recognized by the celestial courts. You are the true SIK SAN!", goal: "Endless Glory.", color: "text-fuchsia-400", border: "border-fuchsia-900" }
];

const getScoreTitle = (score) => {
  if (score >= 5000) return { title: "Sik San (God of Cookery) 食神", color: "text-fuchsia-400" };
  if (score >= 2500) return { title: "Wok Hei Dragon 鑊氣神龍", color: "text-red-500" };
  if (score >= 1200) return { title: "Executive Chef 行政總廚", color: "text-orange-400" };
  if (score >= 500) return { title: "Da Ho (Line Chef) 打荷", color: "text-yellow-400" };
  if (score >= 150) return { title: "Apprentice Cook 學徒", color: "text-green-400" };
  return { title: "Sai Wun Gung (Wok Washer) 洗碗工", color: "text-blue-300" };
};

const ALL_ITEMS = {
  // BASES
  rice: { id: 'rice', name: 'Day-Old Rice', color: 'bg-yellow-50', icon: '🍚', cost: 1.50, rarity: 1, umami: 1, oiliness: 0 },
  noodle: { id: 'noodle', name: 'Ho Fun', color: 'bg-orange-100', icon: '🍜', cost: 2.20, rarity: 1, umami: 1, oiliness: 1 },
  // MEATS
  egg: { id: 'egg', name: 'Beaten Egg', color: 'bg-yellow-400', icon: '🥚', cost: 1.80, rarity: 1, umami: 2, oiliness: 2 },
  beef: { id: 'beef', name: 'Velvet Beef', color: 'bg-red-800', icon: '🥩', cost: 11.50, rarity: 3, umami: 3, oiliness: 3 },
  char_siu: { id: 'char_siu', name: 'Char Siu', color: 'bg-red-900', icon: '🍖', text: 'text-white', cost: 85.00, rarity: 4, umami: 3, oiliness: 4 },
  shrimp: { id: 'shrimp', name: 'Fresh Prawn', color: 'bg-pink-200', icon: '🦐', cost: 25.00, rarity: 3, umami: 3, oiliness: 1 },
  // VEGES
  gai_lan: { id: 'gai_lan', name: 'Gai Lan', color: 'bg-emerald-600', icon: '🥬', text: 'text-white', cost: 3.50, rarity: 2, umami: 1, oiliness: 0 },
  mushroom: { id: 'mushroom', name: 'Shiitake', color: 'bg-stone-700', icon: '🍄', text: 'text-white', cost: 9.50, rarity: 2, umami: 4, oiliness: 1 },
  // AROMATICS
  scallion: { id: 'scallion', name: 'Scallions', color: 'bg-green-500', icon: '🌿', cost: 0.70, rarity: 1, umami: 1, oiliness: 0 },
  garlic: { id: 'garlic', name: 'Garlic', color: 'bg-orange-50', icon: '🧄', cost: 0.50, rarity: 1, umami: 2, oiliness: 1 },
  ginger: { id: 'ginger', name: 'Ginger', color: 'bg-amber-200', icon: '🫚', cost: 0.60, rarity: 1, umami: 1, oiliness: 0 },
  // SPICES
  chili: { id: 'chili', name: 'Birdseye Chili', color: 'bg-red-600', icon: '🌶️', text: 'text-white', cost: 1.20, rarity: 2, umami: 1, oiliness: 0 },
  white_pepper: { id: 'white_pepper', name: 'White Pepper', color: 'bg-stone-200', icon: '🧂', text: 'text-stone-800', cost: 1.20, rarity: 1, umami: 1, oiliness: 0 },
  five_spice: { id: 'five_spice', name: 'Five Spice', color: 'bg-amber-900', icon: '🌰', text: 'text-amber-100', cost: 1.50, rarity: 2, umami: 1, oiliness: 0 },
  salt: { id: 'salt', name: 'Salt', color: 'bg-gray-100', icon: '🧂', text: 'text-gray-800', cost: 0.10, rarity: 1, umami: 2, oiliness: 0 },
  sugar: { id: 'sugar', name: 'Sugar', color: 'bg-sky-50', icon: '🧊', text: 'text-sky-900', cost: 0.20, rarity: 1, umami: 0, oiliness: 0 },
  msg: { id: 'msg', name: 'M.S.G.', color: 'bg-slate-200', icon: '✨', text: 'text-slate-800', cost: 0.80, rarity: 1, umami: 5, oiliness: 0 },
  // SAUCES
  soy_sauce: { id: 'soy_sauce', name: 'Soy Sauce', color: 'bg-stone-800', icon: '🫖', text: 'text-stone-200', cost: 0.50, rarity: 1, umami: 4, oiliness: 0 },
  oyster_sauce: { id: 'oyster_sauce', name: 'Oyster Sauce', color: 'bg-amber-900', icon: '🫙', text: 'text-amber-200', cost: 1.80, rarity: 2, umami: 4, oiliness: 1 },
  xo_sauce: { id: 'xo_sauce', name: 'XO Sauce', color: 'bg-orange-800', icon: '🥫', text: 'text-orange-100', cost: 45.00, rarity: 4, umami: 5, oiliness: 4 },
  wine: { id: 'wine', name: 'Shaoxing Wine', color: 'bg-amber-700', icon: '🍶', text: 'text-amber-100', cost: 2.50, rarity: 2, umami: 1, oiliness: 0 },
};

const CATEGORIES = [
  { id: 'BASES', name: 'Bases', items: ['rice', 'noodle'] },
  { id: 'AROMATICS', name: 'Aromatics', items: ['scallion', 'garlic', 'ginger'] },
  { id: 'MEATS', name: 'Meats', items: ['egg', 'beef', 'char_siu', 'shrimp'] },
  { id: 'VEGES', name: 'Veges', items: ['gai_lan', 'mushroom'] },
  { id: 'SPICES', name: 'Spices', items: ['salt', 'sugar', 'msg', 'white_pepper', 'five_spice', 'chili'] },
  { id: 'SAUCES', name: 'Sauces', items: ['soy_sauce', 'oyster_sauce', 'wine', 'xo_sauce'] }
];

const FLAVOR_COMBOS = [
  { name: "Umami Bomb", items: ['mushroom', 'oyster_sauce', 'msg'], mult: 1.5 },
  { name: "Spicy & Numbing", items: ['chili', 'white_pepper'], mult: 1.3 },
  { name: "Drunken Seafood", items: ['wine', 'shrimp'], mult: 1.4 },
  { name: "Emperor's Indulgence", items: ['xo_sauce', 'beef'], mult: 1.6 },
  { name: "Classic Wok Hei", items: ['soy_sauce', 'scallion', 'egg'], mult: 1.2 },
  { name: "The Holy Trinity", items: ['scallion', 'garlic', 'ginger'], mult: 1.4 },
  { name: "Five Spice Magic", items: ['five_spice', 'char_siu'], mult: 1.4 }
];

const RECIPES = [
  { id: 'spicy_beef_rice', chapter: 0, dishType: 'bowl', displayIcons: ['🍚', '🌶️'], name: 'Spicy Beef Fried Rice', requires: ['beef', 'rice', 'egg', 'chili', 'soy_sauce'], baseScore: 22.00, timeLimit: 55 },
  { id: 'beef_chow_fun', chapter: 1, dishType: 'plate', displayIcons: ['🍜', '🥩'], name: 'Beef Chow Fun', requires: ['beef', 'noodle', 'scallion', 'soy_sauce', 'oyster_sauce'], baseScore: 22.50, timeLimit: 50 },
  { id: 'braised_shiitake', chapter: 1, dishType: 'plate', displayIcons: ['🍄', '🥬'], name: 'Braised Shiitake', requires: ['mushroom', 'gai_lan', 'oyster_sauce', 'wine'], baseScore: 23.50, timeLimit: 48 },
  { id: 'beef_gailan', chapter: 2, dishType: 'plate', displayIcons: ['🥩', '🥬'], name: 'Beef & Gai Lan', requires: ['beef', 'gai_lan', 'oyster_sauce', 'wine'], baseScore: 26.00, timeLimit: 50 },
  { id: 'fried_rice', chapter: 2, dishType: 'bowl', displayIcons: ['🍚', '🦐'], name: 'Yangzhou Fried Rice', requires: ['egg', 'rice', 'scallion', 'shrimp', 'msg'], baseScore: 40.00, timeLimit: 60 },
  { id: 'drunken_shrimp_noodle', chapter: 3, dishType: 'bowl', displayIcons: ['🍜', '🦐'], name: 'Drunken Shrimp Noodle', requires: ['shrimp', 'noodle', 'scallion', 'wine', 'white_pepper'], baseScore: 42.50, timeLimit: 45 },
  { id: 'xo_seafood_noodle', chapter: 4, dishType: 'plate', displayIcons: ['🍜', '🦐'], name: 'XO Seafood Noodles', requires: ['shrimp', 'noodle', 'scallion', 'xo_sauce'], baseScore: 98.00, timeLimit: 45 },
  { id: 'char_siu_rice', chapter: 4, dishType: 'bowl', displayIcons: ['🍚', '🍖'], name: 'Sorrowful Rice (Char Siu)', requires: ['char_siu', 'rice', 'egg', 'scallion', 'soy_sauce'], baseScore: 120.00, timeLimit: 40 },
];

const SPECIAL_EVENTS = [
  { id: 'rush', name: "TRIAD RUSH!", desc: "Half time limit!", icon: "⏱️", color: "bg-red-600 text-white border-red-400", modifier: (o) => ({ ...o, timeLimit: o.timeLimit * 0.5, timeLeft: o.timeLimit * 0.5, bonusCash: 40.00 }) },
  { id: 'spicy', name: "SPICE FREAK!", desc: "Must add Chili!", icon: "🌶️", color: "bg-orange-600 text-white border-orange-400", modifier: (o) => ({ ...o, requires: [...o.requires, 'chili'], displayIcons: [...o.displayIcons, '🌶️'], bonusCombo: 1, bonusCash: 15.00 }) },
  { id: 'drunk', name: "DRUNK MASTER!", desc: "Must add Wine!", icon: "🍶", color: "bg-purple-600 text-white border-purple-400", modifier: (o) => ({ ...o, requires: [...o.requires, 'wine'], displayIcons: [...o.displayIcons, '🍶'], bonusCash: 50.00 }) },
  { id: 'wok_hei', name: "SIK SAN'S TEST!", desc: "Requires >90% Wok Hei!", icon: "🐉", color: "bg-fuchsia-600 text-white border-fuchsia-400", modifier: (o) => ({ ...o, requiresWokHei: 90, bonusCash: 80.00 }) },
];

const UPGRADES = [
  { id: 'spatula', name: "Titanium Spatula", desc: "Buff: +20% Wok Hei generation.", cost: 150, icon: "🥄" },
  { id: 'turbo_burner', name: "F-16 Jet Burner", desc: "Buff: +50% Cook Speed. Debuff: +50% Burn Rate.", cost: 350, icon: "🚀" },
  { id: 'msg_shaker', name: "MSG Shaker of Doom", desc: "Buff: +25% Cash. Debuff: Customers lose patience 15% faster.", cost: 250, icon: "🧂" },
  { id: 'cursed_chili', name: "Cursed Ghost Chili", desc: "Buff: +50% Cash earned. Debuff: Customers lose patience 30% faster!", cost: 600, icon: "🔥" },
  { id: 'boombox', name: "Temple Street Boombox", desc: "Buff: Perfect chops in Prep give 3 points instead of 2.", cost: 700, icon: "📻" },
  { id: 'iron_palm', name: "Iron Sand Palm Gloves", desc: "Buff: Tossing cools wok drastically (-6 heat). Debuff: -30% Wok Hei generation.", cost: 850, icon: "🧤" },
  { id: 'carbon_seasoning', name: "Carbon Steel Seasoning", desc: "Buff: Reduces grime buildup by 50%.", cost: 1000, icon: "🧽" },
  { id: 'monk_spoon', name: "Abbot's Wooden Spoon", desc: "Buff: Burn rate reduced by 80%. Debuff: Cooking speed reduced by 40%.", cost: 1200, icon: "🥢" },
  { id: 'dragon_wok', name: "Golden Dragon Wok", desc: "Buff: +100% Wok Hei Bonus. Debuff: Residue builds 2x faster.", cost: 2000, icon: "🐉" },
  { id: 'neon_hat', name: "Neon Chef Hat", desc: "Cosmetic: Upgrades your UI Chef Hat to a glowing neon pink.", cost: 1500, icon: "🧢" },
  { id: 'golden_confetti', name: "Sik San's Confetti", desc: "Cosmetic: Perfect serves explode in pure gold confetti.", cost: 2500, icon: "✨" },
  { id: 'rolex', name: "Triad Boss Rolex", desc: "Cosmetic: Adds a sparkling diamond to your cash display.", cost: 5000, icon: "⌚" },
];

// ==========================================
// NPC CHARACTERS & SIDE QUESTS
// ==========================================
const NPC_CHARACTERS = {
  turkey:    { name: "Turkey",           chName: "火雞",     icon: "🐔", color: "text-pink-400",    border: "border-pink-700",    bg: "from-pink-950/90" },
  goose:     { name: "Goose",            chName: "鵝頭",     icon: "🦢", color: "text-emerald-400", border: "border-emerald-700", bg: "from-emerald-950/90" },
  master:    { name: "Wet Dream Master", chName: "夢遺大師", icon: "🧘", color: "text-yellow-400",  border: "border-yellow-700",  bg: "from-yellow-950/90" },
  sister13:  { name: "Sister Thirteen",  chName: "十三姨",   icon: "🥢", color: "text-red-400",     border: "border-red-700",     bg: "from-red-950/90" },
  bull_tong: { name: "Bull Tong",        chName: "唐牛",     icon: "🐂", color: "text-orange-400",  border: "border-orange-700",  bg: "from-orange-950/90" },
};
const NPC_IMAGES = { turkey: '/npc/turkey.png', goose: '/npc/goose.png', master: '/npc/master.png', sister13: '/npc/sister13.png', bull_tong: '/npc/bull_tong.png' };

const SIDE_QUESTS = [
  {
    id: 'turkey_ch1', npc: 'turkey', chapter: 1,
    title: "Pissing Beef Balls",
    dialog: [
      "「吖，大佬，你個樣咁衰，一定未食過我嘅撒尿牛丸！」",
      "(Hey, big shot, you look terrible — you clearly haven't tried my Pissing Beef Balls!)",
      "A street hawker with a face only a mother could love blocks your path. She shoves a skewer of suspiciously bouncy beef balls under your nose. They smell... incredible."
    ],
    choices: [
      {
        id: 'sell', label: '💰 "Thanks. I\'ll sell these for a nice profit."',
        response: "「你同嗰個唐牛冇分別。」(You're no different from Bull Tong.)",
        effects: { cashBonus: 75 },
        desc: "+$75 instant cash. But Turkey remembers your greed..."
      },
      {
        id: 'gift', label: '🤍 "These are incredible... teach me your secret."',
        response: "「你...都識煮嘢食嘅？」(You... actually know how to cook?)",
        effects: { soulBonus: 5, turkeyBurnBuff: true },
        desc: "+5 Soul. Permanent -10% burn rate. Turkey becomes your ally."
      }
    ]
  },
  {
    id: 'goose_ch2', npc: 'goose', chapter: 2,
    title: "The Triad Banquet",
    dialog: [
      "「大佬話今晚有飯局。你煮，我罩你。你唔煮...你知啦。」",
      "(Big Boss says there's a dinner tonight. You cook, I protect you. You don't cook... you know what happens.)",
      "A man with a neck like a giraffe cracks his knuckles. Behind him, several men in dark suits adjust their sunglasses. His food blog — 'Anonymous Foodie 14K' — peeks from his phone screen."
    ],
    choices: [
      {
        id: 'accept', label: '🤝 "Tell the Boss to bring his appetite."',
        response: "「好！今晚你係我嘅人！」(Good! Tonight, you're under my wing!)",
        effects: { cashBonus: 200, gooseProtection: true },
        desc: "+$200 cash. Failed orders only cost half a delight 😊 this run."
      },
      {
        id: 'refuse', label: '✊ "I cook for the people, not the triads."',
        response: "「夠膽唔接？你有種！我記住你。」(You dare refuse? Gutsy! I'll remember you.)",
        effects: { soulBonus: 3, gooseRespect: true, triadPressure: true },
        desc: "+3 Soul. Special events appear 2x more often. But Goose returns in Ch4 with a better offer."
      }
    ]
  },
  {
    id: 'sister13_ch2', npc: 'sister13', chapter: 2,
    title: "The Golden Chopstick Review",
    dialog: [
      "「我聽講你以前係食神。Show me.」",
      "(I heard you used to be the God of Cookery. Show me.)",
      "She taps two golden chopsticks together. The sound rings like a temple bell. Every customer goes silent. This is Sister Thirteen — the critic who has never left more than three customers delighted."
    ],
    choices: [
      {
        id: 'accept_review', label: '🔥 "Watch closely. I only cook once."',
        response: "「大口氣。我鍾意。」(Big talk. I like it.)",
        effects: { sister13Active: true },
        desc: "HIGH RISK: Next perfect dish (95%+ cook, <10% burn, 85%+ Wok Hei) = permanent +15% revenue. Anything less = permanent -1 delight 😊."
      },
      {
        id: 'decline_review', label: '😤 "I don\'t cook for critics."',
        response: "「怕？」(Scared?)",
        effects: {},
        desc: "No risk, no reward. Sister Thirteen leaves without a word."
      }
    ]
  },
  {
    id: 'master_ch3', npc: 'master', chapter: 3,
    title: "The 18 Bronze Wok Tosses",
    dialog: [
      "「鑊氣即係人氣。你嘅人氣...唔夠。」",
      "(Wok Hei is life force. Your life force... is insufficient.)",
      "The ancient abbot strokes an eyebrow so long it nearly dips into his soup. He smells faintly of sesame oil and enlightenment. Three paths lie before you in the great bronze bell."
    ],
    choices: [
      {
        id: 'tiger', label: '🐯 Tiger Claw — "I want POWER."',
        response: "「猛虎出山！燒咗都唔好驚！」(The tiger descends! Don't fear the burn!)",
        effects: { masterPath: 'tiger' },
        desc: "+40% Wok Hei generation. +25% Burn rate. Aggressive mastery."
      },
      {
        id: 'water', label: '💧 Flowing Water — "I want CONTROL."',
        response: "「上善若水。水...唔會燒嘅。」(The highest good is like water. Water doesn't burn.)",
        effects: { masterPath: 'water' },
        desc: "-40% Burn rate. -20% Wok Hei generation. Patient mastery."
      },
      {
        id: 'middle', label: '☯️ Middle Way — "Balance is strength."',
        response: "「你終於明白喇。」(You finally understand.)",
        effects: { masterPath: 'middle' },
        desc: "+15% Wok Hei, -15% Burn rate, Abbot's Spoon 50% off.",
        requiresSoul: 10
      }
    ]
  },
  {
    id: 'bull_tong_ch4', npc: 'bull_tong', chapter: 4,
    title: "Sabotage!",
    dialog: [
      "「師傅...定係應該叫你...洗碗工？」",
      "(Master... or should I call you... dishwasher?)",
      "A letter arrives bearing Bull Tong's golden bull seal. Inside: a photo of your ingredient supply, crossed out in red marker. A note reads: 'The Mega-Laser Wok sends its regards.'"
    ],
    choices: [
      {
        id: 'endure', label: '🛡️ "I\'ll survive whatever you throw at me."',
        response: "「我哋睇吓。」(We'll see about that.)",
        effects: { sabotageActive: true, sabotageLevel: 'normal' },
        desc: "Bull Tong sabotages your kitchen: -20% revenue and random burner shutoffs."
      },
      {
        id: 'counter', label: '🔥 "Bring it. I\'ll turn your sabotage into seasoning."',
        response: "「你...仲敢反抗？！」(You dare fight back?!)",
        effects: { sabotageActive: true, sabotageLevel: 'hard', counterBonus: true },
        desc: "Harder: -35% revenue & more shutoffs. BUT +40% bonus cash on every serve. High risk, high reward."
      }
    ]
  },
  {
    id: 'goose_ch4', npc: 'goose', chapter: 4,
    requires: { questId: 'goose_ch2', choiceId: 'refuse' },
    title: "Goose's Redemption",
    dialog: [
      "「阿哥，我收皮喇。教我煮嘢食，我幫你對付唐牛。」",
      "(Brother, I'm done with gang life. Teach me to cook, and I'll help you fight Bull Tong.)",
      "Goose stands before you in an apron, neck held high. His blog 'Anonymous Foodie 14K' just hit 50,000 followers. For the first time, he looks sincere."
    ],
    choices: [
      {
        id: 'teach', label: '🤝 "Grab a wok. First lesson\'s free."',
        response: "「多謝你...真係多謝。」(Thank you... truly thank you.)",
        effects: { gooseAlly: true },
        desc: "Goose joins you! +50% special event bonus cash. Weakens Bull Tong's sabotage."
      },
      {
        id: 'refuse_again', label: '😤 "Too late. I work alone."',
        response: "「...我明白。」(...I understand.)",
        effects: {},
        desc: "Goose leaves for good. No bonus."
      }
    ]
  },
  {
    id: 'turkey_ch5', npc: 'turkey', chapter: 5,
    title: "The Heart of Wok Hei",
    dialog: [
      "「你夠喇，唐牛！佢煮嘅嘢有心，你嘅冇！」",
      "(Enough, Bull Tong! His cooking has HEART. Yours doesn't!)",
      "Turkey steps between you and Bull Tong's camera crew. Tears stream down her scarred face. The studio audience gasps. Even the Mega-Laser Wok flickers and dies."
    ],
    choices: [
      {
        id: 'together', label: '😭 "Cook with me. The Sorrowful Rice — together."',
        response: "「眼淚，就係最好嘅調味料。」(Tears... are the best seasoning.)",
        effects: { turkeyAlly: true, bullTongWeakened: true, sorrowfulBuff: true },
        desc: "Turkey neutralizes sabotage! Sorrowful Rice earns +50%. Your tears season the wok."
      },
      {
        id: 'alone', label: '💪 "Stand back. This is MY fight."',
        response: "「...你真係傻㗎。但我信你。」(...You're an idiot. But I believe in you.)",
        effects: { soloFinale: true },
        desc: "+30% cash multiplier for Ch5. But Bull Tong's sabotage stays at full strength."
      }
    ]
  },
];

// ==========================================
// FIREBASE & APP
// ==========================================
let app, auth, db;
let firebaseConfig = null;
try {
  firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
} catch (_) {
  firebaseConfig = null;
}

if (firebaseConfig && firebaseConfig.apiKey && getApps().length === 0) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.warn('Firebase init failed:', e);
  }
}

const appId = (typeof __app_id !== 'undefined' ? __app_id : 'wok-star-default').toString().replace(/[^a-zA-Z0-9._-]/g, '_');

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

const DishIcon = ({ type, icons, isLandscape }) => {
  const sizeClass = isLandscape ? 'w-10 h-10 md:w-14 md:h-14' : 'w-14 h-14 md:w-20 md:h-20';
  const iconSizeClass = isLandscape ? 'text-base md:text-xl' : 'text-2xl md:text-3xl';
  return (
    <div className={`relative flex items-center justify-center shrink-0 ${sizeClass}`}>
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
      <div className="relative flex items-center justify-center gap-0 z-10 -mt-1 md:-mt-2">
        <span className={`${iconSizeClass} filter drop-shadow-md -mr-1`}>{String(icons[0])}</span>
        <span className={`${iconSizeClass} filter drop-shadow-md z-10 mt-1 md:mt-2`}>{String(icons[1])}</span>
      </div>
    </div>
  );
};

export default function App() {
  const [difficulty, setDifficulty] = useState('NORMAL');
  const [gameState, setGameState] = useState('MENU'); 
  const [isStoryMode, setIsStoryMode] = useState(false);
  const [currentChapter, setCurrentChapter] = useState(0);
  
  const [score, setScore] = useState(0); 
  const [cash, setCash] = useState(0);   
  const [soul, setSoul] = useState(0);
  const [customRecipes, setCustomRecipes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wokstar_custom_recipes') || '[]'); } catch { return []; }
  });
  const [showSaveRecipe, setShowSaveRecipe] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [ownedUpgrades, setOwnedUpgrades] = useState([]);
  
  const [combo, setCombo] = useState(1);
  const [delight, setDelight] = useState(0);
  
  const flameTheme = combo >= 10 ? 'dark' : combo >= 5 ? 'angelic' : 'standard';
  
  const [orders, setOrders] = useState([]);
  const [heatLevel, setHeatLevel] = useState(0);
  const [wokContents, setWokContents] = useState([]);
  const [cookProgress, setCookProgress] = useState(0); 
  const [burnProgress, setBurnProgress] = useState(0);
  const [wokHei, setWokHei] = useState(0);
  const [wokResidue, setWokResidue] = useState(0); 
  const [isCleaning, setIsCleaning] = useState(false);
  
  const [waterLevel, setWaterLevel] = useState(0);
  const [waterDirtiness, setWaterDirtiness] = useState(0);
  const [oilLevel, setOilLevel] = useState(20); 
  const [isOiling, setIsOiling] = useState(false);
  const [toss, setToss] = useState({ x: 0, y: 0 }); // 2D analog coordinate system (-1 to 1)
  
  const [prepItems, setPrepItems] = useState([]);
  const [currentPrepIdx, setCurrentPrepIdx] = useState(0);
  const [prepCursorPos, setPrepCursorPos] = useState(0);
  const [prepChops, setPrepChops] = useState(0);
  const [prepScore, setPrepScore] = useState(0); 
  const [prepFeedback, setPrepFeedback] = useState(null);
  const [activePrepBuff, setActivePrepBuff] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [streakPopup, setStreakPopup] = useState(null); 

  const [viewport, setViewport] = useState({
    isLandscape: typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        isLandscape: window.innerWidth > window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('wokstar_custom_recipes', JSON.stringify(customRecipes));
  }, [customRecipes]);

  const [showGuide, setShowGuide] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [sfxVol, setSfxVol] = useState(50);
  const [musicVol, setMusicVol] = useState(50);
  const [user, setUser] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const [isRestaurantMode, setIsRestaurantMode] = useState(false);
  const [restaurantShiftConfig, setRestaurantShiftConfig] = useState(null);

  const [questLog, setQuestLog] = useState({});
  const [npcBuffs, setNpcBuffs] = useState({});
  const [npcEncounter, setNpcEncounter] = useState(null);

  const canvasRef = useRef(null);
  const scoreRef = useRef(0);

  const prevHeatRef = useRef(0);
  useEffect(() => {
    const isWhoosh = heatLevel > prevHeatRef.current + 15;
    updateBurner(heatLevel, isWhoosh);
    prevHeatRef.current = heatLevel;
    updateSizzle(heatLevel, wokContents.length > 0);
  }, [heatLevel, wokContents.length]);

  useEffect(() => {
    updateClean(isCleaning);
  }, [isCleaning]);

  const gameDataRef = useRef({
    heatLevel: 0, wokContents: [], cookProgress: 0, burnProgress: 0, wokHei: 0, wokResidue: 0,
    isTossing: false, tossTriggered: false, lastTossTime: 0, isCleaning: false, spawnedIngredients: [],
    showGuide: false, showLeaderboard: false, showShop: false, showRecipes: false, flameTheme: 'standard',
    serveTriggered: null, trashTriggered: false, orderFailedTriggered: false, ownedUpgrades: [],
    activePrepBuff: null,
    toss: { x: 0, y: 0 }, 
    droppedItemsQueue: [],
    difficulty: 'NORMAL',
    oilLevel: 20,
    isOiling: false,
    waterLevel: 0,
    waterDirtiness: 0,
    cleanTossTriggered: false,
    npcBuffs: {}
  });

  useEffect(() => {
    gameDataRef.current = { ...gameDataRef.current, heatLevel, wokContents, cookProgress, burnProgress, wokHei, wokResidue, isCleaning, showGuide, showLeaderboard, showShop, showRecipes, flameTheme, ownedUpgrades, activePrepBuff, difficulty, oilLevel, isOiling, toss, waterLevel, waterDirtiness, npcBuffs };
  }, [heatLevel, wokContents, cookProgress, burnProgress, wokHei, wokResidue, isCleaning, showGuide, showLeaderboard, showShop, showRecipes, flameTheme, ownedUpgrades, activePrepBuff, difficulty, oilLevel, isOiling, toss, waterLevel, waterDirtiness, npcBuffs]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // Keyboard: Q = heat up, A = heat down, C = oil (hold)
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
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
  }, [gameState]);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch(e) { console.error("Auth init error:", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const lbRef = collection(db, 'artifacts', appId, 'public', 'data', 'leaderboard');
    const unsubscribe = onSnapshot(lbRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const sorted = data.sort((a,b) => b.score - a.score).slice(0, 50);
      setLeaderboard(sorted);
    }, (err) => console.error("Leaderboard fetch error:", err));
    return () => unsubscribe();
  }, [user]);

  // --- Prep Minigame Loop ---
  useEffect(() => {
      if (gameState !== 'PREP') return;
      let pos = 0;
      let dir = 1;
      const speed = 1.2 + (currentChapter * 0.3); 
      
      const prepInterval = setInterval(() => {
          pos += speed * dir;
          if (pos >= 100) { pos = 100; dir = -1; }
          if (pos <= 0) { pos = 0; dir = 1; }
          setPrepCursorPos(pos);
      }, 16);
      return () => clearInterval(prepInterval);
  }, [gameState, currentChapter]);

  // --- Main Cooking Loop ---
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const tickRate = 100;
    const interval = setInterval(() => {
      const state = gameDataRef.current;
      
      if (state.showGuide || state.showLeaderboard || state.showShop || state.showRecipes) return;

      setOrders(prevOrders => {
        let repLost = 0;
        const newOrders = prevOrders.map(order => {
          const decayMult = 1.0 + (state.ownedUpgrades.includes('cursed_chili') ? 0.3 : 0) + (state.ownedUpgrades.includes('msg_shaker') ? 0.15 : 0);
          const timeDecay = (tickRate / 1000) * decayMult;
          const timeLeft = order.timeLeft - timeDecay;
          
          if (timeLeft <= 0 && !order.failed) {
            repLost++;
            showNotification(`Order failed! Customer left unhappy. -1 😊`, 'error');
            setCombo(1); 
            gameDataRef.current.orderFailedTriggered = true; 
            return { ...order, timeLeft: 0, failed: true };
          }
          return { ...order, timeLeft };
        }).filter(o => o.timeLeft > -2); 

        if (repLost > 0) {
            const perFail = state.npcBuffs?.gooseProtection ? 1 : 2;
            setDelight(d => {
              const next = Math.max(-10, d - repLost * perFail);
              if (next <= -10) setGameState('GAMEOVER');
              return next;
            });
        }
        return newOrders;
      });

      if (Math.random() < 0.02 && state.orders?.length < 3) {
        const availableRecipes = isStoryMode 
            ? RECIPES.filter(r => r.chapter <= currentChapter) 
            : RECIPES;
        let baseRecipe = availableRecipes[Math.floor(Math.random() * availableRecipes.length)];
        let newOrder = { ...baseRecipe, id: Date.now(), timeLeft: baseRecipe.timeLimit };
        
        const eventChance = state.npcBuffs?.triadPressure ? 0.45 : 0.25;
        if ((!isStoryMode || currentChapter > 0) && Math.random() < eventChance) {
            const event = SPECIAL_EVENTS[Math.floor(Math.random() * SPECIAL_EVENTS.length)];
            if (!(event.id === 'spicy' && baseRecipe.requires.includes('chili')) &&
                !(event.id === 'drunk' && baseRecipe.requires.includes('wine'))) {
                newOrder = event.modifier(newOrder);
                newOrder.specialEvent = event;
            }
        }
        
        setOrders(prev => [...prev, newOrder]);
      }

      if (state.droppedItemsQueue.length > 0) {
         setWokContents(prev => {
            let next = [...prev];
            let nextSpawned = [...state.spawnedIngredients];
            let wastageCost = 0;
            
            state.droppedItemsQueue.forEach(droppedId => {
                const idx = next.lastIndexOf(droppedId);
                if (idx !== -1) next.splice(idx, 1);
                
                const spawnIdx = nextSpawned.lastIndexOf(droppedId);
                if (spawnIdx !== -1) nextSpawned.splice(spawnIdx, 1);
                
                const itemKey = Object.keys(ALL_ITEMS).find(k => ALL_ITEMS[k].id === droppedId);
                if (itemKey) wastageCost += ALL_ITEMS[itemKey].cost * DIFF_MULTS[state.difficulty].spill;
            });
            state.spawnedIngredients = nextSpawned;
            
            if (wastageCost > 0) {
                setCash(c => c - wastageCost);
                showNotification(`Wastage! -$${wastageCost.toFixed(2)}`, 'error');
            }
            
            return next;
         });
         state.droppedItemsQueue = [];
         setCombo(1); 
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

      // Passive oil vaporization: If heat is dangerously high, oil slowly burns away into smoke!
      if (state.heatLevel > 80 && state.oilLevel > 0) {
         setOilLevel(prev => Math.max(0, prev - (state.heatLevel - 80) * 0.03)); 
      }

      if (state.npcBuffs?.sabotageActive && !state.npcBuffs?.turkeyAlly) {
         const shutoffChance = state.npcBuffs?.sabotageLevel === 'hard' ? 0.004 : 0.002;
         if (Math.random() < shutoffChance) {
            setHeatLevel(0);
            showNotification("SABOTAGE! 🐂 Bull Tong killed your burner!", "error");
         }
      }

      if (state.wokContents.length > 0) {
        let newCook = state.cookProgress;
        let newBurn = state.burnProgress;
        let newWokHei = state.wokHei;
        const heatFactor = state.heatLevel / 100;

        const prepBuff = state.activePrepBuff || { cash: 1.0, cook: 1.0, burn: 1.0 };
        const diffMults = typeof DIFF_MULTS !== 'undefined' ? DIFF_MULTS[state.difficulty] : { burn: 1.0 };

        let whMult = 1;
        if (state.ownedUpgrades.includes('spatula')) whMult += 0.2;
        if (state.ownedUpgrades.includes('dragon_wok')) whMult += 1.0;
        if (state.npcBuffs?.masterPath === 'tiger') whMult += 0.4;
        if (state.npcBuffs?.masterPath === 'middle') whMult += 0.15;
        if (state.npcBuffs?.masterPath === 'water') whMult -= 0.2;

        let burnResist = 1;
        if (state.ownedUpgrades.includes('turbo_burner')) burnResist += 0.5; 
        if (state.ownedUpgrades.includes('monk_spoon')) burnResist -= 0.8;
        if (state.npcBuffs?.turkeyBurnBuff) burnResist -= 0.1;
        if (state.npcBuffs?.masterPath === 'tiger') burnResist += 0.25;
        if (state.npcBuffs?.masterPath === 'water') burnResist -= 0.4;
        if (state.npcBuffs?.masterPath === 'middle') burnResist -= 0.15;

        let cookSpeedMod = 1;
        if (state.ownedUpgrades.includes('turbo_burner')) cookSpeedMod += 0.5; 

        const isFoodMoving = state.isTossing;
        // Burn multiplier: tossing = minimal burn; no toss = ramps up the longer since last toss (tossing regularly keeps it low)
        let burnMultiplier;
        if (isFoodMoving) {
          burnMultiplier = 0.02;
        } else {
          const lastToss = state.lastTossTime || 0;
          const timeSinceTossSec = lastToss ? (Date.now() - lastToss) / 1000 : 999;
          if (timeSinceTossSec < 0.4) burnMultiplier = 0.04;
          else if (timeSinceTossSec < 1.2) burnMultiplier = 0.04 + (timeSinceTossSec - 0.4) * 0.45;  // ramp to ~0.4
          else if (timeSinceTossSec < 3) burnMultiplier = 0.4 + (timeSinceTossSec - 1.2) * 0.25;  // ramp to ~0.85
          else burnMultiplier = 0.85;
        }
        const cookMultiplier = isFoodMoving ? 1.5 : 0.5;

        // OIL MODIFIERS
        const isDry = state.oilLevel < 20;
        const isGreasy = state.oilLevel > 75;
        const oilCookMod = isGreasy ? 0.4 : 1.0; 
        // More oil at high heat = more burn (oil scorches). Scale with oil level; extra when very hot + greasy.
        const oilBurnMod = isDry ? 3.0 : (1 + (state.oilLevel / 100) * 0.9 + (isGreasy && state.heatLevel > 80 ? 0.8 : 0)); 
        const oilResidueMod = isDry ? 3.0 : 0.5; 

        const complexity = state.wokContents.length;
        const baseCookSpeed = Math.max(0.5, (6 - complexity) * 0.3);

        if (state.heatLevel > 20) {
            newCook += (heatFactor * 0.8) * baseCookSpeed * cookSpeedMod * cookMultiplier * prepBuff.cook * oilCookMod; 
        }

        const residueBurnMultiplier = 1 + (state.wokResidue / 30); 

        if (state.heatLevel > 70) {
          if (state.isTossing) {
            // WOK HEI REQUIRES OIL!
            if (state.oilLevel > 5) {
                const wokHeiGain = Math.max(3.0, 8.0 - (state.wokResidue / 20)) * whMult;
                newWokHei = Math.min(100, newWokHei + wokHeiGain);
                setOilLevel(prev => Math.max(0, prev - 1.5)); 
            }
          }
          // Base burn rate; higher when very hot + greasy. Scale up with cook time at high heat (longer cooking = faster burn).
          const burnBaseCoeff = (isGreasy && state.heatLevel > 80) ? 0.0042 : 0.002;
          const cookDurationFactor = 1 + (state.cookProgress / 100) * 0.65; // longer at high heat = more burn
          newBurn += ((state.heatLevel - 65) * burnBaseCoeff) * residueBurnMultiplier * burnMultiplier * burnResist * prepBuff.burn * diffMults.burn * oilBurnMod * cookDurationFactor;
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
  }, [gameState, isStoryMode, currentChapter, difficulty]);

  // Story mode: when SCORE (quality-adjusted earnings) meets chapter target, advance immediately
  useEffect(() => {
    if (!isStoryMode || gameState !== 'PLAYING') return;
    const nextChap = STORY_CHAPTERS[currentChapter + 1];
    const targetNeeded = nextChap ? nextChap.target * DIFF_MULTS[difficulty].target : Infinity;
    if (nextChap && score >= targetNeeded) {
      const nextChapterIndex = currentChapter + 1;
      setCurrentChapter(curr => curr + 1);
      setGameState(nextChapterIndex === 5 ? 'EPILOGUE' : 'STORY_CHAPTER');
    }
  }, [isStoryMode, gameState, score, currentChapter, difficulty]);

  // --- Engine Physics Canvas ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let particles = [];
    let foodBodies = [];
    let waterParticles = [];
    let floatingTexts = [];
    let shockwaves = [];
    let screenShake = 0;
    
    let wokAnimX = 0;
    let wokAnimY = 0;
    let wokAnimAngle = 0;
    let prevWokX = null; 
    let prevWokY = null; 
    
    let wokVelX = 0;   
    let wokVelY = 0;   
    let wokVelAngle = 0;
    let metalTemp = 0; // Tracks the heat state of the physical wok metal
    let cleanThrowPos = 0; // Tracks the smooth sweeping animation
    let cleanThrowVel = 0;
    
    const cw = canvas.width;
    const ch = canvas.height;
    const wokCenterX = cw / 2;
    const wokCenterY = ch / 2 + 30; 
    const wokRadius = 140;
    const innerRadius = wokRadius - 16;

    let lastDrawTime = performance.now();
    const fpsInterval = 1000 / 60; // 60 FPS cap for high-refresh rate monitors

    const renderLoop = (time) => {
      animationFrameId = requestAnimationFrame(renderLoop);
      
      if (!time) time = performance.now();
      const elapsed = time - lastDrawTime;
      if (elapsed < fpsInterval) return;
      lastDrawTime = time - (elapsed % fpsInterval);

      const state = gameDataRef.current;

      if (state.showGuide || state.showLeaderboard || state.showShop || state.showRecipes || gameState === 'STORY_CHAPTER' || gameState === 'PREP' || gameState === 'EPILOGUE' || gameState === 'NPC_ENCOUNTER') {
         return; 
      }

      ctx.save();
      ctx.clearRect(0, 0, cw, ch);
      
      if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        screenShake *= 0.8; 
        if (screenShake < 0.5) screenShake = 0;
      }

      // Clean Toss Throw Simulation
      if (state.cleanTossTriggered) {
          state.cleanTossTriggered = false;
          cleanThrowVel = 80; // Inject a smooth, massive velocity kick instead of instantly snapping
          screenShake = Math.max(screenShake, 5); // Softer shake for grace
          playTossShhh();
          
          const dirt = state.waterDirtiness / 100;
          const r = Math.floor(34 + dirt * 100);
          const g = Math.floor(211 - dirt * 100);
          const b = Math.floor(238 - dirt * 180);

          // Launch ALL existing water particles out dynamically
          waterParticles.forEach(wp => {
              particles.push({
                  type: 'splash',
                  color: `rgba(${r}, ${g}, ${b}, 0.8)`,
                  x: wp.x, y: wp.y,
                  vx: 25 + Math.random() * 20, // Sweep them hard right
                  vy: -15 - Math.random() * 15,
                  life: 1, maxLife: 30 + Math.random() * 30, size: wp.size * 2.5
              });
          });
          
          // Absolute guarantee no water remains in the pan
          waterParticles = [];
          setWaterLevel(0);
          setWaterDirtiness(0);
      }

      // Graceful clean throw spring physics
      cleanThrowVel -= cleanThrowPos * 0.12; // Spring tension gently pulling back to neutral
      cleanThrowVel *= 0.85; // Dampening/Friction for a smooth arc
      cleanThrowPos += cleanThrowVel;

      // 1:1 Analog Mapping: Vertical UI track translates to a horizontal, tilted physical ellipse
      // We inject the cleanThrowPos into the target variables so it seamlessly overrides the slider
      const targetWokX = state.toss.x * 90 + cleanThrowPos;
      const targetWokY = state.toss.y * 35 - (cleanThrowPos * 0.2); // Lift slightly on the throw
      const targetAngle = state.toss.x * -0.35 + (cleanThrowPos * 0.012); // Tilt down gracefully

      // Tiny 0.4 lerp to smooth out mouse sensor jitter, but instantly responsive
      wokAnimX += (targetWokX - wokAnimX) * 0.4;
      wokAnimY += (targetWokY - wokAnimY) * 0.4;
      wokAnimAngle += (targetAngle - wokAnimAngle) * 0.4;
      
      const currentWokX = wokCenterX + wokAnimX;
      const currentWokY = wokCenterY + wokAnimY;

      // Calculate instantaneous wok velocity for food sloshing and fluid forces
      if (prevWokX === null) { prevWokX = currentWokX; prevWokY = currentWokY; }
      const wokVx = currentWokX - prevWokX;
      const wokVy = currentWokY - prevWokY;
      prevWokX = currentWokX;
      prevWokY = currentWokY;

      // Wok Hei pulse background
      if (state.wokHei > 80) {
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

      // Spawn new ingredients
      if (state.wokContents.length > state.spawnedIngredients.length) {
        const newIngId = state.wokContents[state.spawnedIngredients.length];
        state.spawnedIngredients.push(newIngId);

        // Add slight vertical randomization to prevent perfect coordinate overlaps which break soft-body engines
        const spawnY = currentWokY - 200 - (Math.random() * 50); 
        const dropVy = 8 + Math.random() * 6;

        const LIQUIDS = ['soy_sauce', 'oyster_sauce', 'wine', 'xo_sauce'];
        const DUSTS = ['msg', 'white_pepper', 'five_spice', 'salt', 'sugar'];

        if (LIQUIDS.includes(newIngId)) {
            const liquidColor = newIngId === 'soy_sauce' ? 'rgba(50, 25, 10, 0.8)' : newIngId === 'wine' ? 'rgba(200, 120, 20, 0.7)' : newIngId === 'xo_sauce' ? 'rgba(180, 60, 10, 0.9)' : 'rgba(20, 10, 5, 0.9)';
            for (let i = 0; i < 40; i++) {
              particles.push({ type: 'splash', color: liquidColor, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 20, vx: (Math.random() - 0.5) * 2, vy: dropVy, life: 1, maxLife: 20 + Math.random() * 10, size: 3 + Math.random() * 4 });
            }
        } else if (DUSTS.includes(newIngId)) {
            let dustColor = 'rgba(255, 255, 255, 0.9)'; // default salt, msg
            if (newIngId === 'sugar') dustColor = 'rgba(240, 240, 245, 0.8)';
            if (newIngId === 'five_spice') dustColor = 'rgba(139, 69, 19, 0.8)';
            if (newIngId === 'white_pepper') dustColor = 'rgba(220, 220, 210, 0.8)';
            for (let i = 0; i < 50; i++) {
              particles.push({ type: 'dust', color: dustColor, x: currentWokX + (Math.random() - 0.5) * 100, y: spawnY - Math.random() * 30, vx: (Math.random() - 0.5) * 3, vy: dropVy, life: 1, maxLife: 30 + Math.random() * 20, size: 1 + Math.random() * 2 });
            }
        } else if (newIngId === 'rice') {
          for (let i = 0; i < 50; i++) {
            foodBodies.push({ type: 'grain', id: newIngId, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.4, size: 6 + Math.random() * 2 });
          }
        } else if (newIngId === 'egg') {
          for (let i = 0; i < 15; i++) {
            const blobs = Array(3).fill(0).map(()=>({x: (Math.random()-0.5)*8, y: (Math.random()-0.5)*8, r: 4+Math.random()*4}));
            foodBodies.push({ type: 'egg', id: newIngId, blobs, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.2, size: 12 });
          }
        } else if (newIngId === 'beef') {
          for (let i = 0; i < 8; i++) {
            foodBodies.push({ type: 'beef', id: newIngId, w: 25+Math.random()*15, h: 12+Math.random()*6, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.3, size: 20 });
          }
        } else if (newIngId === 'char_siu') {
          for (let i = 0; i < 10; i++) {
            foodBodies.push({ type: 'char_siu', id: newIngId, w: 18+Math.random()*8, h: 14+Math.random()*6, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.3, size: 18 });
          }
        } else if (newIngId === 'noodle') {
          for (let i = 0; i < 12; i++) {
            foodBodies.push({ type: 'noodle', id: newIngId, w: 60+Math.random()*30, h: 4+Math.random()*3, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.2, size: 26 });
          }
        } else if (newIngId === 'shrimp') {
          for (let i = 0; i < 7; i++) {
            foodBodies.push({ type: 'shrimp', id: newIngId, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.4, size: 14 + Math.random() * 3 });
          }
        } else if (newIngId === 'gai_lan') {
          for (let i = 0; i < 10; i++) {
            foodBodies.push({ type: 'gai_lan', id: newIngId, w: 12+Math.random()*8, h: 25+Math.random()*10, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.4, size: 24 });
          }
        } else if (newIngId === 'mushroom') {
          for (let i = 0; i < 12; i++) {
            foodBodies.push({ type: 'mushroom', id: newIngId, w: 18+Math.random()*8, h: 18+Math.random()*8, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.4, size: 20 });
          }
        } else if (newIngId === 'chili') {
          for (let i = 0; i < 15; i++) {
            foodBodies.push({ type: 'chili', id: newIngId, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 7 + Math.random() * 3 });
          }
        } else if (newIngId === 'scallion') {
          for (let i = 0; i < 25; i++) {
            foodBodies.push({ type: 'scallion', id: newIngId, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 8 + Math.random() * 3 });
          }
        } else if (newIngId === 'garlic') {
          for (let i = 0; i < 15; i++) {
            foodBodies.push({ type: 'garlic', id: newIngId, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 5 + Math.random() * 2 });
          }
        } else if (newIngId === 'ginger') {
          for (let i = 0; i < 20; i++) {
            foodBodies.push({ type: 'ginger', id: newIngId, x: currentWokX + (Math.random() - 0.5) * 80, y: spawnY - Math.random() * 50, vx: (Math.random() - 0.5) * 5, vy: dropVy, rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.5, size: 4 + Math.random() * 2 });
          }
        }
      } else if (state.wokContents.length === 0) {
        foodBodies = [];
        state.spawnedIngredients = [];
      }

      // ==========================================
      // PHYSICS: GRAVITY, COLLISION & OVERLAPS
      // ==========================================
      
      const isTossingGlobal = Math.abs(wokVx) > 1 || Math.abs(wokVy) > 1;

      // 1. PHYSICS: Gravity & Rotation
      foodBodies.forEach(f => {
        let mass = 2.5; 
        if (['beef', 'char_siu', 'gai_lan'].includes(f.id)) mass = 3.8; 
        else if (['rice', 'noodle', 'mushroom', 'shrimp'].includes(f.id)) mass = 2.8; 
        else if (['egg', 'scallion', 'chili', 'garlic', 'ginger'].includes(f.id)) mass = 2.0; 

        f.vy += 0.8 + (0.1 * mass); // Normal gravity
        
        // Aggressively kill tiny micro-movements when resting so the pile sleeps
        if (!isTossingGlobal) {
           if (Math.abs(f.vx) < 0.2) f.vx = 0;
           if (Math.abs(f.vy) < 0.2 && f.y > currentWokY) f.vy = 0;
        }

        f.x += f.vx;
        f.y += f.vy;
        f.rotation += f.rotSpeed;
      });

      // 2. PHYSICS: Wok Collisions & Friction
      let impactsPlayedThisFrame = 0;
      foodBodies.forEach(f => {
        const dx = f.x - currentWokX;
        
        let mass = 2.5; 
        if (['beef', 'char_siu', 'gai_lan'].includes(f.id)) mass = 3.8; 
        else if (['rice', 'noodle', 'mushroom', 'shrimp'].includes(f.id)) mass = 2.8; 
        else if (['egg', 'scallion', 'chili', 'garlic', 'ginger'].includes(f.id)) mass = 2.0; 

        if (!f.spilled) {
            // Adjusted spill bounds for the vertical cutaway walls (inner rim)
            if (Math.abs(dx) > innerRadius + 5 && f.y > currentWokY - 5) {
                f.spilled = true;
                state.droppedItemsQueue.push(f.id);
                floatingTexts.push({ text: "Spilled!", x: f.x, y: f.y - 30, life: 1, maxLife: 50, color: '#ef4444', size: 24, vy: -2 });
                playTrash(); 
            }
        }

        if (!f.spilled) {
            const maxDx = innerRadius - 5;
            const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
            const angleOffset = Math.tan(wokAnimAngle) * clampedDx;
            
            const groundY = currentWokY + angleOffset + Math.sqrt(innerRadius*innerRadius - clampedDx*clampedDx) - f.size/2;

            if (f.y >= groundY) {
              if (f.vy > 3 && impactsPlayedThisFrame < 2) {
                playFoodImpact();
                impactsPlayedThisFrame++;
              }
              
              f.y = groundY;
              
              if (isTossingGlobal) {
                  f.vy *= -0.2; // Slight bounce
                  f.vx *= 0.9;  // Glides easily
                  f.rotSpeed *= 0.8;
                  
                  // Natural curve sliding during toss
                  f.vx -= (clampedDx / maxDx) * (2.0 / mass); 

                  const safeVx = Math.max(-18, Math.min(18, wokVx));
                  const safeVy = Math.max(-18, Math.min(18, wokVy));
                  f.vx += safeVx * (0.15 / mass); 
                  f.vy += safeVy * 0.3; 
                  f.vx += Math.sin(wokAnimAngle) * (2.0 / mass);
              } else {
                  // RESTING MODE: Massive inertia to stick to the bottom
                  f.vy = 0;
                  f.vx *= 0.3; // Brutal friction completely stops the endless climbing
                  f.rotSpeed = 0;
                  
                  // Only apply slope gravity if it's really far up the wall, otherwise let it stick in the pile
                  if (Math.abs(dx) > innerRadius * 0.4) {
                      f.vx -= (clampedDx / maxDx) * 0.5; 
                  } else {
                      // Center pocket: instant dead zone
                      if (Math.abs(f.vx) < 1.0) f.vx = 0;
                  }
              }
            }
            
            if (f.y > currentWokY - 150) {
                if (f.x < currentWokX - innerRadius + 8) { f.x = currentWokX - innerRadius + 8; f.vx *= -0.5; }
                if (f.x > currentWokX + innerRadius - 8) { f.x = currentWokX + innerRadius - 8; f.vx *= -0.5; }
            }
        } else {
            f.vy += 0.8 * mass;
        }
      });
      
      foodBodies = foodBodies.filter(f => f.y < ch + 100);

      // 3. PHYSICS: Soft Body Overlaps
      for (let step = 0; step < 2; step++) { 
         for (let i = 0; i < foodBodies.length; i++) {
             for (let j = i + 1; j < foodBodies.length; j++) {
                 let f1 = foodBodies[i], f2 = foodBodies[j];
                 let dx = f2.x - f1.x;
                 let dy = f2.y - f1.y;
                 let distSq = dx*dx + dy*dy;
                 
                 // Smaller min-distance when resting allows highly dense piling!
                 let minDist = (f1.size + f2.size) * (isTossingGlobal ? 0.55 : 0.45); 
                 let minDistSq = minDist * minDist;

                 if (distSq < minDistSq && distSq > 0.01) {
                     let dist = Math.sqrt(distSq);
                     
                     // Weak overlap force when resting prevents explosive "crawling"
                     let overlap = (minDist - dist) * (isTossingGlobal ? 0.5 : 0.1); 
                     
                     let nx = dx / dist;
                     let ny = dy / dist;

                     // Bias stacking: Pushes the higher object UP vertically instead of OUT horizontally
                     if (!isTossingGlobal) {
                         if (Math.abs(ny) < 0.7) { 
                             ny = ny < 0 ? -0.8 : 0.8; 
                             nx *= 0.3; // Massively reduce horizontal side-spreading
                         }
                     }

                     f1.x -= nx * overlap;
                     f1.y -= ny * overlap;
                     f2.x += nx * overlap;
                     f2.y += ny * overlap;

                     let relVx = f2.vx - f1.vx;
                     let relVy = f2.vy - f1.vy;
                     
                     // Only transfer bouncy squishy momentum when actively tossing
                     const aerationForce = isTossingGlobal ? 0.3 : 0.0; 
                     
                     f1.vx += relVx * aerationForce;
                     f1.vy += relVy * aerationForce;
                     f2.vx -= relVx * aerationForce;
                     f2.vy -= relVy * aerationForce;

                     // Aggressive wiping of all energy when they are clumped in the bottom together
                     if (!isTossingGlobal) {
                         f1.vx *= 0.5;
                         f2.vx *= 0.5;
                         f1.vy *= 0.8;
                         f2.vy *= 0.8;
                     }
                 }
             }
         }
      }

      // ==========================================
      // WATER FLUID PARTICLE ENGINE (CLEANING)
      // ==========================================
      const targetWaterCount = Math.floor(state.waterLevel * 4.0); 
      const missingWater = targetWaterCount - waterParticles.length;
      
      if (missingWater > 0 && state.isCleaning) {
          const spawnAmount = Math.min(15, missingWater);
          for(let i=0; i<spawnAmount; i++) {
              waterParticles.push({
                  x: currentWokX + (Math.random() - 0.5) * 20, 
                  y: currentWokY - 180 - Math.random() * 10,
                  vx: (Math.random() - 0.5) * 1.5,
                  vy: Math.random() * 3 + 10, 
                  size: 2.0 + Math.random() * 2.0,
                  spilled: false,
                  depthOffset: Math.random() 
              });
          }
      }

      waterParticles.forEach(p => {
          p.vy += 0.6; 
          p.x += p.vx;
          p.y += p.vy;

          const dx = p.x - currentWokX;
          
          if (!p.spilled && Math.abs(dx) > innerRadius + 5 && p.y > currentWokY - 20) {
              p.spilled = true;
          }

          if (!p.spilled) {
              const maxDx = innerRadius - 2;
              const clampedDx = Math.max(-maxDx, Math.min(maxDx, dx));
              const angleOffset = Math.tan(wokAnimAngle) * clampedDx;
              
              const groundY = currentWokY + angleOffset + Math.sqrt(innerRadius*innerRadius - clampedDx*clampedDx) - p.size;
              const poolDepth = state.waterLevel * 0.9;
              const surfaceY = currentWokY + innerRadius - p.size - poolDepth;

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
              
              if (Math.abs(dx) > innerRadius * 0.7 && p.y < currentWokY + 30) {
                  p.vy += 2.5; 
                  p.vx *= 0.5; 
              }

              if (p.y > currentWokY - 120) {
                  if (p.x < currentWokX - innerRadius + 8) { p.x = currentWokX - innerRadius + 8; p.vx *= -0.5; }
                  if (p.x > currentWokX + innerRadius - 8) { p.x = currentWokX + innerRadius - 8; p.vx *= -0.5; }
              }
          }
      });
      waterParticles = waterParticles.filter(p => p.y < ch + 100);

      // ==========================================
      // RENDERING PHASE: WOK, FLUIDS, FOOD, & PARTICLES
      // ==========================================

      // 1. Volumetric Fire Definition
      const drawFlameLayer = (layerName) => {
        ctx.globalCompositeOperation = 'lighter';
        particles.forEach(p => {
          if (p.type !== 'fire' || p.layer !== layerName) return;
          const lifeRatio = p.life / p.maxLife;
          if (lifeRatio >= 1) return;
          const currentSize = Math.max(0.1, p.size * (1 - lifeRatio * 0.3));
          let hue; 
          if (state.flameTheme === 'dark') {
             hue = 140 - lifeRatio * 80; 
          } else if (state.flameTheme === 'angelic') {
             hue = 280 + lifeRatio * 70; 
          } else { 
             const baseHue = 60 - (state.heatLevel * 0.6); 
             hue = Math.max(0, baseHue - lifeRatio * 20); 
          }
          const alpha = (1 - lifeRatio) * 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${alpha * 1.5})`;
          ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
      };

      // 2. Shockwaves
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = shockwaves.length - 1; i >= 0; i--) {
          let sw = shockwaves[i];
          sw.r += sw.speed;
          let alpha = 1 - (sw.r / sw.maxR);
          if (alpha <= 0) {
              shockwaves.splice(i, 1);
          } else {
              ctx.beginPath();
              ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(${sw.color}, ${alpha})`;
              ctx.lineWidth = (sw.maxR - sw.r) * 0.05;
              ctx.stroke();
          }
      }
      ctx.restore();

      // 3. Back Flames
      drawFlameLayer('back');

      // 4. Wok Outer Hull & Glowing Metal
      if (state.isCleaning) {
          metalTemp = 0; // Instant quench
      } else {
          const targetTemp = state.heatLevel > 20 ? state.heatLevel : 0;
          if (targetTemp > metalTemp) {
              metalTemp += (targetTemp - metalTemp) * 0.05;
          } else {
              metalTemp += (targetTemp - metalTemp) * 0.005;
          }
      }

      ctx.save();
      ctx.translate(currentWokX, currentWokY);
      ctx.rotate(wokAnimAngle);
      
      ctx.beginPath();
      ctx.arc(0, 0, wokRadius, 0, Math.PI);
      let wokColor = '#161616'; 
      if (state.burnProgress >= 100) wokColor = '#050505';
      else if (state.cookProgress > 80) wokColor = '#241700';
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
          linGrad.addColorStop(1, `rgba(239, 68, 68, 0)`);
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

      // 5. Front Flames
      drawFlameLayer('front');

      // 6. Wok Inner Bowl Mask
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
      
      if (state.wokResidue > 0) {
         ctx.beginPath();
         ctx.arc(0, 0, wokRadius - 8, 0, Math.PI);
         ctx.lineWidth = 8;
         ctx.strokeStyle = `rgba(28, 16, 0, ${state.wokResidue / 100})`;
         ctx.stroke();
      }
      
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

      // 7. Render Fluids (Water; oil is puddle only in WokPhysics)
      if (waterParticles.length > 0) {
          ctx.save();
          const dirt = state.waterDirtiness / 100;
          const r = Math.floor(34 + dirt * 100);
          const g = Math.floor(211 - dirt * 100);
          const b = Math.floor(238 - dirt * 180);
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`; 
          waterParticles.forEach(p => {
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
              ctx.fill();
          });

          ctx.fillStyle = `rgba(${r + 30}, ${g + 30}, ${b + 30}, 0.8)`; 
          waterParticles.forEach(p => {
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
          });
          
          ctx.restore();
      }

      // 8. Render Food Bodies
      const cookRatio = state.cookProgress / 100;
      const burnRatio = state.burnProgress / 100;
      const hasSoy = state.wokContents.includes('soy_sauce');
      const hasOyster = state.wokContents.includes('oyster_sauce');
      const hasXO = state.wokContents.includes('xo_sauce');

      const applySauceTint = (colorArr) => {
         let [r, g, b] = colorArr;
         if (hasSoy) { r *= 0.8; g *= 0.7; b *= 0.5; }
         if (hasOyster) { r *= 0.7; g *= 0.6; b *= 0.4; }
         if (hasXO) { r *= 0.9; g *= 0.6; b *= 0.4; }
         return [r, g, b];
      };

      foodBodies.forEach(f => {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rotation);

        if (f.y < currentWokY - 40 && state.heatLevel > 80) {
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        
        if (f.type === 'grain') {
           const color = resolveColor(applySauceTint([250,250,245]), applySauceTint([200,140,50]), [30,30,30], cookRatio, burnRatio);
           ctx.fillStyle = color;
           ctx.beginPath();
           ctx.ellipse(0, 0, f.size, f.size * 0.45, 0, 0, Math.PI * 2);
           ctx.fill();
           ctx.strokeStyle = 'rgba(0,0,0,0.1)';
           ctx.lineWidth = 1;
           ctx.stroke();
           ctx.fillStyle = 'rgba(255,255,255,0.4)';
           ctx.beginPath();
           ctx.ellipse(-f.size/4, -f.size/8, f.size/3, f.size/8, 0, 0, Math.PI * 2);
           ctx.fill();

        } else if (f.type === 'egg') {
           const color = resolveColor(applySauceTint([255,220,50]), applySauceTint([240,160,20]), [40,30,20], cookRatio, burnRatio);
           ctx.fillStyle = color;
           ctx.beginPath();
           f.blobs.forEach(b => {
              ctx.moveTo(b.x + b.r, b.y);
              ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
           });
           ctx.fill();
           
           const yolkColor = resolveColor(applySauceTint([255,180,20]), applySauceTint([220,120,10]), [30,20,10], cookRatio, burnRatio);
           ctx.fillStyle = yolkColor;
           f.blobs.forEach(b => {
              if (b.r > 5) {
                  ctx.beginPath();
                  ctx.arc(b.x, b.y, b.r * 0.6, 0, Math.PI*2);
                  ctx.fill();
              }
           });

           ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
           f.blobs.forEach(b => {
              ctx.beginPath();
              ctx.arc(b.x - b.r*0.3, b.y - b.r*0.3, b.r*0.25, 0, Math.PI * 2);
              ctx.fill();
           });

        } else if (f.type === 'beef') {
           const color = resolveColor(applySauceTint([150,40,40]), applySauceTint([90,50,40]), [20,15,15], cookRatio, burnRatio);
           ctx.fillStyle = color;
           ctx.beginPath();
           ctx.moveTo(-f.w/2, -f.h/2 + 2);
           ctx.quadraticCurveTo(0, -f.h/2 - 3, f.w/2, -f.h/2);
           ctx.quadraticCurveTo(f.w/2 + 3, 0, f.w/2, f.h/2);
           ctx.quadraticCurveTo(0, f.h/2 + 3, -f.w/2, f.h/2 - 2);
           ctx.quadraticCurveTo(-f.w/2 - 3, 0, -f.w/2, -f.h/2 + 2);
           ctx.fill();
           
           ctx.strokeStyle = resolveColor(applySauceTint([220,200,200]), applySauceTint([150,120,110]), [30,25,25], cookRatio, burnRatio);
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.moveTo(-f.w/3, -f.h/4);
           ctx.quadraticCurveTo(0, 0, f.w/4, f.h/4);
           ctx.moveTo(f.w/6, -f.h/3);
           ctx.quadraticCurveTo(0, 0, -f.w/4, f.h/3);
           ctx.stroke();
           
           ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
           ctx.beginPath();
           ctx.ellipse(-f.w/6, -f.h/4, f.w/5, f.h/8, Math.PI/6, 0, Math.PI*2);
           ctx.fill();

        } else if (f.type === 'char_siu') {
           const edgeColor = resolveColor(applySauceTint([200,60,60]), applySauceTint([160,40,40]), [30,20,20], cookRatio, burnRatio);
           ctx.fillStyle = edgeColor;
           ctx.beginPath();
           if (ctx.roundRect) ctx.roundRect(-f.w/2, -f.h/2, f.w, f.h, 4);
           else ctx.rect(-f.w/2, -f.h/2, f.w, f.h);
           ctx.fill();
           
           const innerColor = resolveColor(applySauceTint([220,140,120]), applySauceTint([150,70,50]), [20,15,15], cookRatio, burnRatio);
           ctx.fillStyle = innerColor;
           ctx.beginPath();
           if (ctx.roundRect) ctx.roundRect(-f.w/2 + 2, -f.h/2 + 2, f.w - 4, f.h - 4, 2);
           else ctx.rect(-f.w/2 + 2, -f.h/2 + 2, f.w - 4, f.h - 4);
           ctx.fill();

           ctx.fillStyle = resolveColor(applySauceTint([80,20,20]), applySauceTint([50,10,10]), [10,5,5], cookRatio, burnRatio);
           ctx.fillRect(f.w/2 - 3, -f.h/2 + 1, 2, f.h - 2);

           ctx.fillStyle = 'rgba(255,255,255,0.25)';
           ctx.beginPath();
           ctx.ellipse(-f.w/4, -f.h/3, f.w/4, f.h/8, 0, 0, Math.PI*2);
           ctx.fill();

        } else if (f.type === 'noodle') {
           const color = resolveColor(applySauceTint([245,240,230]), applySauceTint([210,180,120]), [40,35,30], cookRatio, burnRatio);
           ctx.strokeStyle = color;
           ctx.lineWidth = f.h;
           ctx.lineCap = 'round';
           ctx.lineJoin = 'round';
           
           ctx.beginPath();
           ctx.moveTo(-f.w/2, 0);
           ctx.bezierCurveTo(-f.w/4, -f.w/3, f.w/4, f.w/3, f.w/2, 0);
           ctx.stroke();
           
           ctx.strokeStyle = 'rgba(255,255,255,0.3)';
           ctx.lineWidth = f.h * 0.3;
           ctx.beginPath();
           ctx.moveTo(-f.w/2 + 2, 0);
           ctx.bezierCurveTo(-f.w/4 + 2, -f.w/3 + 2, f.w/4 - 2, f.w/3 - 2, f.w/2 - 2, 0);
           ctx.stroke();

        } else if (f.type === 'shrimp') {
           const color = resolveColor(applySauceTint([240,190,190]), applySauceTint([255,110,80]), [50,30,20], cookRatio, burnRatio);
           ctx.strokeStyle = color;
           ctx.lineWidth = f.size * 0.7;
           ctx.lineCap = 'round';
           ctx.beginPath();
           ctx.arc(0, 0, f.size*0.7, -Math.PI*0.8, Math.PI*0.2, false);
           ctx.stroke();
           
           ctx.strokeStyle = 'rgba(255,255,255,0.4)';
           ctx.lineWidth = 1;
           for(let a = -Math.PI*0.6; a <= 0; a += 0.4) {
               ctx.beginPath();
               ctx.moveTo(Math.cos(a) * (f.size*0.4), Math.sin(a) * (f.size*0.4));
               ctx.lineTo(Math.cos(a) * (f.size*1.0), Math.sin(a) * (f.size*1.0));
               ctx.stroke();
           }

           const tailColor = resolveColor(applySauceTint([255,100,100]), applySauceTint([220,60,60]), [40,20,20], cookRatio, burnRatio);
           ctx.fillStyle = tailColor;
           ctx.beginPath();
           ctx.moveTo(f.size*0.6, f.size*0.2);
           ctx.lineTo(f.size*1.2, f.size*0.8);
           ctx.lineTo(f.size*0.4, f.size*0.9);
           ctx.fill();

           ctx.fillStyle = 'rgba(255,255,255,0.3)';
           ctx.beginPath();
           ctx.arc(Math.cos(-Math.PI*0.4) * f.size*0.7, Math.sin(-Math.PI*0.4) * f.size*0.7, f.size*0.2, 0, Math.PI*2);
           ctx.fill();

        } else if (f.type === 'gai_lan') {
           const stemColor = resolveColor(applySauceTint([140,220,120]), applySauceTint([100,180,80]), [20,30,20], cookRatio, burnRatio);
           ctx.fillStyle = stemColor;
           ctx.fillRect(-f.w/4, -f.h/2, f.w/2, f.h);
           
           const leafColor = resolveColor(applySauceTint([60,160,60]), applySauceTint([40,120,40]), [10,20,10], cookRatio, burnRatio);
           ctx.fillStyle = leafColor;
           ctx.beginPath();
           ctx.moveTo(0, -f.h/2);
           ctx.quadraticCurveTo(f.w*0.8, -f.h/2, f.w*0.8, 0);
           ctx.quadraticCurveTo(f.w*0.8, f.h/2, 0, f.h/4);
           ctx.fill();
           
           ctx.strokeStyle = 'rgba(20,50,20,0.3)';
           ctx.lineWidth = 1.5;
           ctx.beginPath();
           ctx.moveTo(0, -f.h/4);
           ctx.lineTo(f.w*0.6, -f.h/8);
           ctx.stroke();

        } else if (f.type === 'mushroom') {
           const stemColor = resolveColor(applySauceTint([220,200,180]), applySauceTint([180,160,140]), [30,30,30], cookRatio, burnRatio);
           ctx.fillStyle = stemColor;
           ctx.fillRect(-f.w/6, 0, f.w/3, f.h/2);
           const capColor = resolveColor(applySauceTint([120,80,60]), applySauceTint([90,50,30]), [20,15,10], cookRatio, burnRatio);
           ctx.fillStyle = capColor;
           
           ctx.beginPath();
           ctx.ellipse(0, 0, f.w/2, f.h/2.5, 0, Math.PI, 0); 
           ctx.fill();
           
           ctx.strokeStyle = stemColor; 
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.moveTo(-f.w/4, -f.h/4);
           ctx.lineTo(f.w/4, -f.h/8);
           ctx.moveTo(f.w/4, -f.h/4);
           ctx.lineTo(-f.w/4, -f.h/8);
           ctx.stroke();

        } else if (f.type === 'chili') {
           const color = resolveColor(applySauceTint([220,40,40]), applySauceTint([180,30,30]), [30,10,10], cookRatio, burnRatio);
           ctx.fillStyle = color;
           ctx.beginPath();
           ctx.moveTo(-f.size, 0);
           ctx.quadraticCurveTo(0, -f.size*0.6, f.size, 0);
           ctx.quadraticCurveTo(0, f.size*0.6, -f.size, 0);
           ctx.fill();
           
           ctx.fillStyle = '#2e8b57';
           ctx.fillRect(f.size * 0.8, -f.size*0.15, f.size*0.5, f.size*0.3);
           
           ctx.fillStyle = 'rgba(255,255,255,0.3)';
           ctx.beginPath();
           ctx.ellipse(0, -f.size*0.2, f.size/2, f.size/8, 0, 0, Math.PI*2);
           ctx.fill();

        } else if (f.type === 'scallion') {
           const color = resolveColor(applySauceTint([100,220,100]), applySauceTint([120,160,80]), [30,30,20], cookRatio, burnRatio);
           const strokeColor = resolveColor(applySauceTint([50,150,50]), applySauceTint([80,100,50]), [15,15,10], cookRatio, burnRatio);
           
           ctx.strokeStyle = strokeColor;
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.arc(0, 0, f.size/1.5, 0, Math.PI*2);
           ctx.stroke();
           
           ctx.strokeStyle = color;
           ctx.lineWidth = 2.5;
           ctx.beginPath();
           ctx.arc(0, 0, f.size/2, 0, Math.PI*2);
           ctx.stroke();
           
           ctx.fillStyle = resolveColor(applySauceTint([200,255,200]), applySauceTint([160,180,120]), [20,20,15], cookRatio, burnRatio);
           ctx.beginPath();
           ctx.arc(0, 0, f.size/4, 0, Math.PI*2);
           ctx.fill();
        
        } else if (f.type === 'garlic') {
           const color = resolveColor(applySauceTint([250,245,230]), applySauceTint([220,180,100]), [50,30,20], cookRatio, burnRatio);
           ctx.fillStyle = color;
           ctx.beginPath();
           ctx.ellipse(0, 0, f.size, f.size * 0.6, 0, 0, Math.PI * 2);
           ctx.fill();
        } else if (f.type === 'ginger') {
           const color = resolveColor(applySauceTint([240,220,150]), applySauceTint([200,160,80]), [40,25,15], cookRatio, burnRatio);
           ctx.fillStyle = color;
           ctx.fillRect(-f.size, -f.size/2, f.size*2, f.size);
        }
        ctx.restore();
      });

      // 9. Draw Cleaning Sponge
      if (state.isCleaning) {
          ctx.save();
          ctx.translate(brushX, brushY);
          ctx.rotate(brushAngle);
          
          ctx.fillStyle = '#facc15'; 
          ctx.beginPath();
          if(ctx.roundRect) ctx.roundRect(-25, -10, 50, 20, 4); else ctx.rect(-25,-10,50,20);
          ctx.fill();
          
          ctx.fillStyle = '#16a34a'; 
          ctx.beginPath();
          if(ctx.roundRect) ctx.roundRect(-25, -14, 50, 8, 2); else ctx.rect(-25,-14,50,8);
          ctx.fill();
          
          ctx.restore();
      }

      // 10. Update & Apply Foreground Particles (Smoke, Splash, Dust, Bubbles)
      particles.forEach(p => {
        if (p.type === 'fire') {
            if (p.wobbleSpeed) {
                p.vx += Math.sin(p.life * p.wobbleSpeed + p.wobbleOffset) * 0.8;
            }
            p.size *= 0.95; 
            
            const dx = p.x - currentWokX;
            if (p.y > currentWokY - 10) {
                if (Math.abs(dx) < wokRadius + 15) {
                    const wokOuterCurveY = currentWokY + Math.sqrt(Math.max(0, wokRadius*wokRadius - dx*dx));
                    const pushDir = dx >= 0 ? 1 : -1;
                    p.vx += pushDir * 0.8; 
                    
                    if (p.y < wokOuterCurveY + 2) {
                        p.y = wokOuterCurveY + 2; 
                        p.vy *= 0.8; 
                    }
                }
            } else {
                p.vy -= 0.6;
                p.vx *= 0.9; 
            }
        } 
        else if (p.type === 'smoke' || p.type === 'steam' || p.type === 'oil_smoke') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0, p.size * (p.life / p.maxLife)), 0, Math.PI * 2);
          const alpha = 1 - (p.life / p.maxLife);
          if (p.type === 'smoke') ctx.fillStyle = `rgba(30, 30, 30, ${alpha * 0.8})`;
          else if (p.type === 'oil_smoke') ctx.fillStyle = `rgba(180, 180, 190, ${alpha * 0.6})`;
          else ctx.fillStyle = `rgba(220, 220, 220, ${alpha * 0.5})`;
          ctx.fill();
        } else if (p.type === 'splash' || p.type === 'dust') {
          ctx.beginPath();
          if (p.type === 'splash') ctx.ellipse(p.x, p.y, p.size * 0.5, p.size * 1.5, 0, 0, Math.PI * 2);
          else ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        } else if (p.type === 'water') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
          ctx.fill();
          p.vy += 0.5; 
          if (p.y > wokCenterY) { p.y = wokCenterY; p.vy *= -0.5; p.vx *= 0.8; }
        } else if (p.type === 'bubble') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * (1 - p.life/p.maxLife)})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(200, 240, 255, ${1 - p.life/p.maxLife})`;
          ctx.stroke();
        } else if (p.type === 'confetti') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 1 - (p.life / p.maxLife);
          ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 0.6);
          ctx.restore();
          p.rot += p.rotSpeed;
          p.vy += 0.5; 
        } else if (p.type === 'sparkle') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - p.life/p.maxLife), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 215, 0, ${1 - p.life/p.maxLife})`;
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
      });
      particles = particles.filter(p => p.life < p.maxLife);

      // 11. Draw Floating Text (Combo, Quality, Cash)
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
          let ft = floatingTexts[i];
          ft.y += ft.vy;
          ft.life++;
          let alpha = 1 - (ft.life / ft.maxLife);
          if (alpha <= 0) {
              floatingTexts.splice(i, 1);
          } else {
              ctx.save();
              ctx.font = `900 ${ft.size}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillStyle = ft.color;
              ctx.globalAlpha = alpha;
              ctx.shadowColor = 'rgba(0,0,0,0.8)';
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 2;
              ctx.shadowOffsetY = 2;
              ctx.fillText(String(ft.text), ft.x, ft.y);
              ctx.restore();
          }
      }

      ctx.restore();
    };

    renderLoop(performance.now());
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);

  // --- Helpers ---
  const isUnlocked = (ingId) => {
      if (!isStoryMode) return true; 
      const unlockedReqs = new Set(RECIPES.filter(r => r.chapter <= currentChapter).flatMap(r => r.requires));
      return unlockedReqs.has(ingId) || ['garlic', 'ginger', 'salt', 'sugar', 'five_spice'].includes(ingId);
  };

  const getWokUmami = () => {
    if (wokContents.length === 0) return { total: 0, avg: 0 };
    const total = wokContents.reduce((sum, id) => sum + (ALL_ITEMS[id]?.umami || 0), 0);
    return { total, avg: parseFloat((total / wokContents.length).toFixed(1)) };
  };

  const saveCustomRecipe = () => {
    if (!newRecipeName.trim() || wokContents.length === 0) return;
    const freqMap = {};
    wokContents.forEach(id => freqMap[id] = (freqMap[id] || 0) + 1);
    const umami = getWokUmami();
    const totalCost = wokContents.reduce((sum, id) => sum + (ALL_ITEMS[id]?.cost || 0), 0);
    const recipe = {
      id: `custom_${Date.now()}`,
      name: newRecipeName.trim(),
      ingredients: freqMap,
      ingredientList: wokContents.slice(),
      totalUmami: umami.total,
      avgUmami: umami.avg,
      totalCost,
      timestamp: Date.now()
    };
    setCustomRecipes(prev => [...prev, recipe]);
    setNewRecipeName('');
    setShowSaveRecipe(false);
    showNotification(`Recipe "${recipe.name}" saved!`, 'success');
  };

  const deleteCustomRecipe = (recipeId) => {
    setCustomRecipes(prev => prev.filter(r => r.id !== recipeId));
  };
  
  const getDynamicPrompt = () => {
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

  // --- Prep Minigame Functions ---
  const startPrepPhase = () => {
      const unlockedReqs = Array.from(new Set(RECIPES.filter(r => r.chapter <= currentChapter).flatMap(r => r.requires)));
      const itemsToPrep = [];
      for(let i=0; i<3; i++) {
         itemsToPrep.push(unlockedReqs[Math.floor(Math.random() * unlockedReqs.length)]);
      }
      setPrepItems(itemsToPrep);
      setCurrentPrepIdx(0);
      setPrepChops(0);
      setPrepScore(0);
      setPrepFeedback(null);
      setGameState('PREP');
  };

  const handlePrepChop = () => {
      playChop(); 
      const dist = Math.abs(50 - prepCursorPos);
      let pts = 0;
      
      if (dist <= 8) { 
          pts = gameDataRef.current.ownedUpgrades.includes('boombox') ? 3 : 2; 
          setPrepFeedback({ text: "PERFECT CHOP!", color: "text-green-400" }); 
      }
      else if (dist <= 20) { 
          pts = 1; 
          setPrepFeedback({ text: "GOOD CHOP", color: "text-yellow-400" }); 
      }
      else { 
          pts = 0; 
          setPrepFeedback({ text: "MISS!", color: "text-red-500" }); 
      }

      setPrepScore(s => s + pts);
      setTimeout(() => setPrepFeedback(null), 500);

      if (prepChops + 1 >= 3) {
          if (currentPrepIdx + 1 >= prepItems.length) {
              const finalScore = prepScore + pts;
              const maxScore = prepItems.length * 3 * 2; 
              const ratio = finalScore / maxScore;
              
              let buff = null;
              if (ratio >= 0.8) {
                  buff = { name: "MICHELIN PREP", cash: 1.5, cook: 1.2, burn: 0.8, color: 'text-fuchsia-400', hex: '#e879f9' };
              } else if (ratio >= 0.5) {
                  buff = { name: "SOLID PREP", cash: 1.2, cook: 1.1, burn: 0.9, color: 'text-yellow-400', hex: '#facc15' };
              } else {
                  buff = { name: "SLOPPY PREP", cash: 1.0, cook: 1.0, burn: 1.0, color: 'text-neutral-500', hex: '#737373' };
              }

              setActivePrepBuff(buff);
              triggerStreakPopup(`${buff.name}!`, buff.hex);
              
              setGameState('PLAYING');
              const availableRecipes = RECIPES.filter(r => r.chapter <= currentChapter);
              const startRecipe = availableRecipes[Math.floor(Math.random() * availableRecipes.length)];
              setOrders([{ ...startRecipe, id: Date.now(), timeLeft: startRecipe.timeLimit }]);
          } else {
              setCurrentPrepIdx(i => i + 1);
              setPrepChops(0);
          }
      } else {
          setPrepChops(c => c + 1);
      }
  };

  // --- Actions ---
  const quitToMenu = () => {
    emptyWok();
    setOrders([]);
    setActivePrepBuff(null);
    setNpcEncounter(null);
    setGameState('MENU');
  };

  const startGame = (mode) => {
    initAudio();
    initAudioEngine(); // so GameLoop's playIngredientAdd (from audioEngine) works
    setIsStoryMode(mode === 'STORY');
    setScore(0);
    setCash(0);
    setSoul(0);
    setOwnedUpgrades([]);
    setCombo(1);
    setDelight(0);
    setWokResidue(0);
    setOilLevel(20);
    setActivePrepBuff(null);
    setScoreSubmitted(false);
    setQuestLog({});
    setNpcBuffs({});
    setNpcEncounter(null);
    emptyWok();
    setOrders([]);
    
    if (mode === 'STORY') {
       setCurrentChapter(0);
       setGameState('STORY_CHAPTER');
    } else {
       setGameState('PLAYING');
       setOrders([{ ...RECIPES[0], id: Date.now(), timeLeft: RECIPES[0].timeLimit }]);
    }
  };

  const getChapterEncounters = (chapter) => {
      return SIDE_QUESTS.filter(quest => {
          if (quest.chapter !== chapter) return false;
          if (questLog[quest.id]) return false;
          if (quest.requires) {
              if (questLog[quest.requires.questId] !== quest.requires.choiceId) return false;
          }
          return true;
      });
  };

  const getStoryProgress = () => {
      if (currentChapter >= 5) return { pct: 100, current: score, target: score, label: 'Campaign complete' };
      const nextChap = STORY_CHAPTERS[currentChapter + 1];
      const target = nextChap ? nextChap.target * DIFF_MULTS[difficulty].target : 0;
      const pct = target > 0 ? Math.max(0, Math.min(100, (score / target) * 100)) : 0;
      return { pct, current: score, target, label: nextChap ? STORY_CHAPTERS[currentChapter].goal : '' };
  };

  const getChapterTodos = (chapter) => {
      const nextChap = STORY_CHAPTERS[chapter + 1];
      const nextTarget = nextChap ? nextChap.target * DIFF_MULTS[difficulty].target : 0;
      const baseGoal = STORY_CHAPTERS[chapter].goal;
      const goalLabel = nextChap
        ? String(baseGoal).replace(/Reach a score of [\d,]+/, `Reach a score of ${Math.round(nextTarget)}`)
        : 'Complete the campaign';
      const todos = [{ id: 'goal', label: goalLabel, done: nextTarget > 0 && score >= nextTarget }];
      const encounterQuests = SIDE_QUESTS.filter(q => q.chapter === chapter && (!q.requires || questLog[q.requires.questId] === q.requires.choiceId));
      encounterQuests.forEach(q => {
          todos.push({ id: q.id, label: `Meet ${NPC_CHARACTERS[q.npc].name}: ${q.title}`, done: !!questLog[q.id] });
      });
      return todos;
  };

  const continueStory = () => {
      initAudio();
      initAudioEngine();
      const encounters = getChapterEncounters(currentChapter);
      if (encounters.length > 0) {
          const [first, ...rest] = encounters;
          setNpcEncounter({ ...first, phase: 'dialog', remaining: rest });
          setGameState('NPC_ENCOUNTER');
      } else {
          startPrepPhase();
      }
  };

  const handleEncounterChoice = (quest, choice) => {
      setQuestLog(prev => ({ ...prev, [quest.id]: choice.id }));
      const fx = choice.effects;
      if (fx.cashBonus) {
          setCash(c => c + fx.cashBonus);
          showNotification(`+$${fx.cashBonus} cash!`, 'success');
      }
      if (fx.soulBonus) {
          setSoul(s => s + fx.soulBonus);
          triggerStreakPopup(`+${fx.soulBonus} SOUL`, '#22d3ee');
      }
      const { cashBonus, soulBonus, ...persistentBuffs } = fx;
      if (Object.keys(persistentBuffs).length > 0) {
          setNpcBuffs(prev => ({ ...prev, ...persistentBuffs }));
      }
      setNpcEncounter(prev => ({ ...prev, phase: 'response', responseText: choice.response, chosenDesc: choice.desc }));
  };

  const proceedFromEncounter = () => {
      const remaining = npcEncounter?.remaining || [];
      if (remaining.length > 0) {
          const [next, ...rest] = remaining;
          setNpcEncounter({ ...next, phase: 'dialog', remaining: rest });
      } else {
          setNpcEncounter(null);
          startPrepPhase();
      }
  };

  const buyUpgrade = (upgrade, effectiveCost) => {
      const cost = effectiveCost !== undefined ? effectiveCost : upgrade.cost;
      if (cash >= cost && !ownedUpgrades.includes(upgrade.id)) {
          setCash(c => c - cost);
          setOwnedUpgrades(prev => [...prev, upgrade.id]);
          showNotification(`${upgrade.name} Acquired!`, "success");
      }
  };

  const triggerStreakPopup = (text, color) => {
      const id = Date.now();
      setStreakPopup({ text: String(text), color: String(color), id });
      setTimeout(() => {
          setStreakPopup(prev => prev?.id === id ? null : prev);
      }, 2000);
  };

  const forceNextOrder = () => {
    if (orders.length >= 3) return;
    const availableRecipes = isStoryMode ? RECIPES.filter(r => r.chapter <= currentChapter) : RECIPES;
    const randomRecipe = availableRecipes[Math.floor(Math.random() * availableRecipes.length)];
    setOrders(prev => [...prev, { ...randomRecipe, id: Date.now(), timeLeft: randomRecipe.timeLimit }]);
  };

  const handleMergeOrders = (dishName) => {
    setOrders(prev => {
        const matching = prev.filter(o => o.name === dishName && !o.failed && !o.isMerged);
        if (matching.length < 2) return prev; 
        
        const others = prev.filter(o => !(o.name === dishName && !o.failed && !o.isMerged));
        const count = matching.length;
        const baseOrder = matching[0];
        
        let newRequires = [];
        for(let i=0; i<count; i++) {
            newRequires.push(...baseOrder.requires);
        }
        
        const newTimeLimit = baseOrder.timeLimit * (1 + (count - 1) * 0.5);
        
        const mergedOrder = {
            ...baseOrder,
            id: Date.now(),
            name: `${count}x ${baseOrder.name}`,
            requires: newRequires,
            timeLimit: newTimeLimit,
            timeLeft: newTimeLimit,
            baseScore: baseOrder.baseScore * count,
            batchSize: count,
            isMerged: true
        };
        
        return [...others, mergedOrder];
    });
    showNotification(`Bulk Order Merged! Watch your heat!`, 'success');
  };

  const addIngredient = (ingId) => {
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

      return [...prev, ingId];
    });
  };

  const emptyWok = () => {
    if (wokContents.length > 0) {
       setWokResidue(prev => Math.min(100, prev + 15));
    }
    setWokContents([]);
    setCookProgress(0);
    setBurnProgress(0);
    setWokHei(0);
    setOilLevel(0); // Oil exits with the food when serving, gifting, or trashing
  };

  const handleTrash = () => {
    if (wokContents.length > 0) {
      setCombo(1); 
      gameDataRef.current.trashTriggered = true;
      playTrash();
    }
    emptyWok();
  };

  const prevTossRef = useRef({ x: 0, y: 0 });
  const lastTossShhhRef = useRef(0);

  const handleTossPointer = (e) => {
    if (e.type === 'pointermove' && e.buttons !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Calculate relative coordinates from center
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRx = rect.width / 2;
    const maxRy = rect.height / 2;

    let dx = (e.clientX - centerX) / maxRx;
    let dy = (e.clientY - centerY) / maxRy;

    // Constrain thumb to an ellipse
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 1) {
        dx /= dist;
        dy /= dist;
    }

    const newToss = { x: dx, y: dy };
    
    // Determine the speed of the user's sweep to trigger physical aerating/flames
    const vX = dx - prevTossRef.current.x;
    const vY = dy - prevTossRef.current.y;
    const velocity = Math.sqrt(vX*vX + vY*vY);

    if (velocity > 0.08) {
        gameDataRef.current.tossTriggered = true;
        gameDataRef.current.lastTossTime = Date.now();
        if (velocity > 0.15) {
            const now = Date.now();
            if (now - (lastTossShhhRef.current || 0) >= 220) {
                lastTossShhhRef.current = now;
                playTossShhh();
            }
            // Reduced heat penalty so repeated tossing doesn't drain heat too fast
            const coolAmount = gameDataRef.current.ownedUpgrades.includes('iron_palm') ? 0.6 : 0.2;
            setHeatLevel(prev => Math.max(5, prev - coolAmount));
        }
    }

    setToss(newToss);
    prevTossRef.current = newToss;
    gameDataRef.current.toss = newToss; // Update ref instantly for 60fps physics
    gameDataRef.current.isTossing = velocity > 0.02 || dist > 0.8; 
  };

  const handleTossRelease = () => {
    const center = { x: 0, y: 0 };
    setToss(center);
    prevTossRef.current = center;
    gameDataRef.current.toss = center;
    gameDataRef.current.isTossing = false;
  };

  const handleHeatPointer = (e) => {
    if (e.type === 'pointermove' && e.buttons !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const newHeat = 100 - ((e.clientY - rect.top) / rect.height) * 100;
    setHeatLevel(Math.round(Math.max(0, Math.min(100, newHeat))));
  };

  const handleCleanRelease = () => {
    setIsCleaning(false);
    if (gameDataRef.current.waterLevel > 0) {
      gameDataRef.current.cleanTossTriggered = true;
    }
  };

  const serveDish = (isDonation = false) => {
    if (wokContents.length === 0) return;
    if (burnProgress >= 100) {
      if (isDonation) showNotification("Charity rejected burnt food!", "error");
      setCombo(1);
      gameDataRef.current.trashTriggered = true;
      emptyWok();
      return;
    }

    let wokFreq = {};
    wokContents.forEach(item => {
        wokFreq[item] = (wokFreq[item] || 0) + 1;
    });

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
                showNotification("Failed! VIP demanded 90% Wok Hei!", "error");
                setDelight(d => { const next = Math.max(-10, d - (npcBuffs.gooseProtection ? 1 : 2)); if (next <= -10) setGameState('GAMEOVER'); return next; });
                setCombo(1);
                gameDataRef.current.trashTriggered = true;
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
            const itemKey = Object.keys(ALL_ITEMS).find(k => ALL_ITEMS[k].id === item);
            if (itemKey) totalCost += ALL_ITEMS[itemKey].cost;
        });

        let quality = "Good!";
        let isPerfect = cookProgress >= 95 && burnProgress < 20;

        if (npcBuffs.sister13Active && !isDonation) {
            if (isPerfect && wokHei > 85) {
                setNpcBuffs(prev => ({ ...prev, sister13Active: false, revenueBonus: (prev.revenueBonus || 0) + 0.15 }));
                triggerStreakPopup("GOLDEN CHOPSTICK! 🥢", "#ef4444");
                showNotification("十三姨: 唔錯! +15% Revenue!", "success");
            } else {
                setNpcBuffs(prev => ({ ...prev, sister13Active: false }));
                setDelight(d => { const next = Math.max(-10, d - (npcBuffs.gooseProtection ? 1 : 2)); if (next <= -10) setGameState('GAMEOVER'); return next; });
                showNotification("十三姨: 我就知。(I knew it.) -2 delight", "error");
            }
        }

        let wokHeiMult = 1.0;
        if (wokHei > 80) { wokHeiMult = 1.5; quality = "WOK HEI MASTER!"; }
        if (isPerfect && wokHei <= 80) { quality = "Perfect!"; wokHeiMult = 1.2; }

        let oilMult = 1.0;
        if (oilLevel > 75) { 
            quality = "Too Greasy!"; 
            oilMult = 0.7; 
        } else if (oilLevel >= 20 && oilLevel <= 75) { 
            quality = "Perfect Texture! " + quality; 
            oilMult = 1.25; 
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
        let speedTip = urgency * 5.0 * batchMultiplier * batchSize; 

        let baseRevenue = order.baseScore;
        if (npcBuffs.sorrowfulBuff && order.id === 'char_siu_rice') baseRevenue *= 1.5;
        const prepMult = gameDataRef.current.activePrepBuff ? gameDataRef.current.activePrepBuff.cash : 1.0;
        let finalRevenue = (baseRevenue * wokHeiMult * flavorMult * umamiMult * combo * prepMult * batchMultiplier * oilMult);
        let eventBonus = order.bonusCash || 0;
        if (npcBuffs.gooseAlly && order.specialEvent) eventBonus *= 1.5;
        if (eventBonus > 0) finalRevenue += eventBonus;

        let cashMult = 1;
        if (gameDataRef.current.ownedUpgrades.includes('cursed_chili')) cashMult += 0.5;
        if (gameDataRef.current.ownedUpgrades.includes('msg_shaker')) cashMult += 0.25;
        if (npcBuffs.revenueBonus) cashMult += npcBuffs.revenueBonus;
        if (npcBuffs.soloFinale) cashMult += 0.3;
        if (npcBuffs.sabotageActive && !npcBuffs.turkeyAlly) {
            const penalty = npcBuffs.sabotageLevel === 'hard' ? 0.35 : 0.2;
            cashMult -= npcBuffs.bullTongWeakened ? penalty * 0.5 : penalty;
            if (npcBuffs.counterBonus) cashMult += 0.4;
        }
        finalRevenue = (finalRevenue * cashMult) + speedTip;

        let profit = Number((finalRevenue - totalCost).toFixed(2));
        let newCombo = combo + batchSize;
        if (order.bonusCombo) newCombo += (order.bonusCombo * batchSize);

        if (isDonation) {
            const gainedSoul = Math.floor(finalRevenue / 10) + batchSize;
            setSoul(s => s + gainedSoul);
            setCash(c => c - totalCost); 
            triggerStreakPopup(`+${gainedSoul} SOUL! 🤍`, "#22d3ee"); 
            gameDataRef.current.serveTriggered = {
                points: `-${totalCost.toFixed(2)} (Donated)`,
                quality: "Soulful Charity",
                isPerfect: true
            };
        } else {
            setCash(c => c + profit); 
            setScore(prevScore => {
                const newScore = prevScore + finalRevenue;
                if (isStoryMode) {
                    const nextChap = STORY_CHAPTERS[currentChapter + 1];
                    const targetNeeded = nextChap ? nextChap.target * DIFF_MULTS[difficulty].target : Infinity;
                    if (nextChap && newScore >= targetNeeded) {
                        const nextChapterIndex = currentChapter + 1;
                        setTimeout(() => {
                            setCurrentChapter(curr => curr + 1);
                            setGameState(nextChapterIndex === 5 ? 'EPILOGUE' : 'STORY_CHAPTER');
                        }, 1500);
                    }
                }
                return newScore;
            });
            
            if (newCombo >= 3 && combo < 3) triggerStreakPopup("HEATING UP! 🔥", "#f97316");
            else if (newCombo >= 5 && combo < 5) triggerStreakPopup("WOK & ROLL! 🎸", "#eab308");
            else if (newCombo >= 10 && combo < 10) triggerStreakPopup("SHAOLIN SPEED! 🥋", "#a855f7");
            else if (newCombo >= 15 && combo < 15) triggerStreakPopup("SORROWFUL TEARS! 😭", "#3b82f6");
            else if (newCombo >= 20 && newCombo % 5 === 0) triggerStreakPopup("SIK SAN! 🐉", "#ec4899");

            gameDataRef.current.serveTriggered = {
                points: profit,
                quality: profit < 0 ? "Loss Margin!" : quality,
                isPerfect: isPerfect
            };
        }

        setCombo(newCombo);
        playDing(isPerfect);
        setOrders(prev => prev.filter((_, idx) => idx !== matchedOrderIndex));
        emptyWok();

    } else {
        if (isDonation) {
            let totalCost = 0;
            wokContents.forEach(item => {
                const itemKey = Object.keys(ALL_ITEMS).find(k => ALL_ITEMS[k].id === item);
                if (itemKey) totalCost += ALL_ITEMS[itemKey].cost;
            });
            setCash(c => c - totalCost);
            gameDataRef.current.serveTriggered = {
                points: `-${totalCost.toFixed(2)}`,
                quality: "Imperfect Donation",
                isPerfect: false
            };
            setCombo(1); 
            emptyWok();  
        } else {
            setDelight(d => { const next = Math.max(-10, d - (npcBuffs.gooseProtection ? 1 : 2)); if (next <= -10) setGameState('GAMEOVER'); return next; });
            setCombo(1);
            gameDataRef.current.trashTriggered = true;
            emptyWok();
        }
    }
  };

  const showNotification = (msg, type = 'normal') => {
    const id = Date.now();
    const durationMs = type === 'success' ? 5000 : 2000;
    setNotifications(prev => [...prev, { id, msg: String(msg), type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), durationMs);
  };

  const bringOrderToFront = (orderId) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === orderId);
      if (idx <= 0) return prev;
      const next = prev.slice();
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  };

  const submitScoreToLeaderboard = async () => {
    if (!playerName.trim()) return;
    if (scoreSubmitted) return;
    if (score === 0) {
      showNotification("Score is 0 — nothing to submit.", "error");
      return;
    }
    if (!user) {
      showNotification("Sign-in required to submit to the leaderboard. Enable Anonymous sign-in in Firebase, or use a signed-in build.", "error");
      return;
    }
    if (!db) {
      showNotification("Leaderboard is not available. Check Firebase config.", "error");
      return;
    }
    setScoreSubmitting(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'leaderboard'), {
        userId: user.uid,
        name: playerName.trim(),
        score: Math.round(Number(score)),
        title: getScoreTitle(score).title,
        timestamp: Date.now()
      });
      setScoreSubmitted(true);
      setShowLeaderboard(true);
      showNotification("Score submitted!", "success");
    } catch (err) {
      console.error("Error submitting score", err);
      showNotification("Failed to save score. Check console or Firebase rules.", "error");
    } finally {
      setScoreSubmitting(false);
    }
  };

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

  const finalTitle = getScoreTitle(score);
  const dynPrompt = getDynamicPrompt();
  const wokUmami = getWokUmami();

  const storyProgress = isStoryMode && gameState === 'PLAYING' ? getStoryProgress() : null;

  return (
    <div className={`absolute inset-0 bg-neutral-950 text-white font-sans overflow-hidden flex flex-col user-select-none pb-8 md:pb-12 ${gameState === 'PLAYING' ? 'gameplay-touch-lock' : ''}`}>
      
      {/* UI FLASH & STREAK ANIMATIONS + TOUCH LOCK (tablets/phones during gameplay) */}
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

        /* Disable zoom and text selection on touch devices during gameplay */
        .gameplay-touch-lock,
        .gameplay-touch-lock * {
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
      `}</style>

      {/* --- HEADER --- */}
      <header className={`shrink-0 bg-neutral-900 border-b border-neutral-800 flex justify-between items-center z-20 shadow-xl relative ${viewport.isLandscape ? 'p-1 md:p-2' : 'p-2 md:p-4'}`}>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-1 md:gap-2">
            <ChefHat className={`w-5 h-5 md:w-7 md:h-7 ${ownedUpgrades.includes('neon_hat') ? 'text-fuchsia-500 drop-shadow-[0_0_10px_#d946ef] animate-pulse' : 'text-orange-500'}`} />
            <h1 className="text-lg md:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-yellow-300 flex items-center gap-2">
              WOK STAR
              {activePrepBuff && activePrepBuff.name !== "SLOPPY PREP" && (
                <span className={`text-[8px] md:text-[10px] uppercase tracking-widest ${activePrepBuff.color} border border-current px-2 py-0.5 rounded-full hidden md:inline-block`} title="Prep buff from the start-of-shift minigame. Michelin = +50% cash, +20% cook, -20% burn. Solid = +20% cash, +10% cook, -10% burn. Sloppy = no bonus. Lasts the whole shift.">
                  {String(activePrepBuff.name)}
                </span>
              )}
            </h1>
          </div>
          <div className="bg-neutral-800 px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-neutral-700 flex items-center gap-3 md:gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 md:gap-2" title="Total score">
              <span className="text-[9px] md:text-[10px] text-amber-400/90 uppercase tracking-widest shrink-0">Score</span>
              <span className="font-mono text-amber-300 font-bold text-sm md:text-lg tabular-nums animate-pop" title="Score">{Math.round(Number(score))}</span>
            </div>
            <span className="text-neutral-600 shrink-0" aria-hidden="true">·</span>
            <div className="flex items-center gap-1.5 md:gap-2" title="Wallet">
              <span className="text-[9px] md:text-[10px] text-green-400/90 uppercase tracking-widest shrink-0">Cash</span>
              <span className={`font-mono font-bold text-sm md:text-lg tabular-nums animate-pop ${cash < 0 ? 'text-red-500' : 'text-green-400'}`} title="Cash">${Number(cash).toFixed(2)} {ownedUpgrades.includes('rolex') && '💎'}</span>
            </div>
            {soul > 0 && <span key={`soul-${soul}`} className="text-cyan-400 font-bold flex items-center gap-1 border-l border-neutral-700 pl-2" title="Soul (goodwill): from GIFTing. Used in NPC encounters."><Heart size={14} fill="currentColor" /> {soul}</span>}
            {combo > 1 && <span key={combo} className="text-xs md:text-sm text-orange-400 font-black border-l border-neutral-700 pl-2" title="Combo multiplier">x{combo}</span>}
          </div>
        </div>

        {/* When playing: context label (My Restaurant / Sandbox / Chapter) centered, above score bar & objectives */}
        {gameState === 'PLAYING' && (
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
            <div className={`text-xs md:text-sm font-bold truncate max-w-[50vw] ${isRestaurantMode ? 'text-amber-400' : !isStoryMode ? 'text-cyan-400' : (STORY_CHAPTERS[currentChapter]?.color ?? 'text-orange-400')}`} title={isRestaurantMode ? 'Restaurant shift' : !isStoryMode ? 'Sandbox mode' : 'Story chapter'}>
              {isRestaurantMode ? '🍳 My Restaurant' : !isStoryMode ? '🧪 Sandbox Kitchen' : (STORY_CHAPTERS[currentChapter]?.title ?? 'Chapter 1')}
            </div>
            {isStoryMode && storyProgress !== null && (
              <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-center">
                <span className="text-[10px] md:text-xs text-neutral-500 uppercase tracking-widest shrink-0" title="Score">Score</span>
                <div className="relative w-24 md:w-32 lg:w-40 h-3 md:h-4 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700 shrink-0">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-600 to-green-500 transition-all duration-200 rounded-full"
                    style={{ width: `${storyProgress.pct}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] md:text-xs font-black text-yellow-400 tabular-nums drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]">
                    {Math.round(storyProgress.pct)}%
                  </span>
                </div>
                <span className="text-[10px] md:text-xs text-neutral-500 font-mono shrink-0" title="Current / target">{Math.round(Number(storyProgress.current))} / {Math.round(storyProgress.target)}</span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] md:text-xs border-l border-neutral-700 pl-2 md:pl-3">
                  <span className="text-neutral-600 uppercase tracking-wider shrink-0">Objectives:</span>
                  {getChapterTodos(currentChapter).map(t => (
                    <span
                      key={t.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${t.done ? 'bg-green-900/30 border-green-700/50 text-green-400' : 'bg-neutral-800/80 border-neutral-700 text-neutral-400'}`}
                    >
                      {t.done ? <CheckCircle className="w-3 h-3 shrink-0" /> : <span className="w-3 h-3 shrink-0 rounded-full border border-current" />}
                      <span className={t.done ? 'line-through' : ''}>{String(t.label)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => setShowOptions(true)} className="p-1.5 md:p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-blue-400 hover:text-blue-300 shadow-md" title="Options">
            <Settings className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={() => setShowShop(true)} className="p-1.5 md:p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-orange-400 hover:text-orange-300 shadow-md" title="Equipment Shop">
            <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={() => setShowLeaderboard(true)} className="p-1.5 md:p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-yellow-500 hover:text-yellow-400 shadow-md" title="Leaderboard">
            <Trophy className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={() => setShowRecipes(true)} className="p-1.5 md:p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-green-400 hover:text-green-300 shadow-md" title="Ledger & Recipes">
            <BookOpen className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={() => setShowGuide(true)} className="p-1.5 md:p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-neutral-400 hover:text-white" title="How to Play">
            <Info className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={quitToMenu} className="p-1.5 md:p-2 bg-neutral-800 hover:bg-red-900/60 rounded-full transition-colors text-red-400 hover:text-red-300 shadow-md" title="Restart Shift">
            <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          <div className="flex gap-1.5 md:gap-2 hidden sm:flex ml-1 md:ml-2 border-l border-neutral-700 pl-2 md:pl-4 items-center" title="Customer Delight: -10 (angry) to +10 (delighted). 0 = center. Earn by serving well, lose on fails. Game over at -10.">
            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider shrink-0">Delight</span>
            <div className="flex items-center gap-1">
              <span className="text-base md:text-lg opacity-80" title="-10 (angry)">😠</span>
              <div className="w-16 md:w-20 h-2.5 md:h-3 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700 flex relative shrink-0">
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
              <span className="text-base md:text-lg opacity-80" title="+10 (delighted)">😊</span>
            </div>
          </div>
        </div>

        {npcBuffs.sister13Active && gameState === 'PLAYING' && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 bg-red-900/90 text-red-300 text-[9px] md:text-[11px] px-3 py-0.5 rounded-b-lg border border-red-700 border-t-0 font-bold tracking-widest z-30 whitespace-nowrap">
            🥢 SISTER 13 IS WATCHING YOUR NEXT DISH
          </div>
        )}
        {npcBuffs.sabotageActive && !npcBuffs.turkeyAlly && gameState === 'PLAYING' && (
          <div className="absolute top-full right-2 bg-orange-900/90 text-orange-300 text-[9px] md:text-[11px] px-3 py-0.5 rounded-b-lg border border-orange-700 border-t-0 font-bold tracking-widest z-30 whitespace-nowrap">
            🐂 SABOTAGE {npcBuffs.counterBonus ? '(COUNTER ACTIVE)' : 'ACTIVE'}
          </div>
        )}
      </header>

      {/* --- MENU STATE --- */}
      {gameState === 'MENU' && !showGuide && !showLeaderboard && !showShop && !showRecipes && (
        <div className="flex-1 flex items-center justify-center bg-neutral-900/90 absolute inset-0 z-50 backdrop-blur-sm">
          <div className="text-center bg-neutral-900 p-8 rounded-3xl border border-neutral-800 shadow-[0_0_100px_rgba(249,115,22,0.15)] max-w-md w-full">
            <Flame size={64} className="mx-auto text-orange-500 mb-4 animate-pulse" />
            <h2 className="text-4xl font-black mb-2 tracking-tight">WOK STAR</h2>
            <p className="text-neutral-400 mb-4 text-sm">Can you become the God of Cookery?</p>

            <div className="flex justify-center gap-2 mb-6">
              {['EASY', 'NORMAL', 'HARD'].map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-transform active:scale-95 border-b-2 ${difficulty === d ? 'bg-neutral-200 text-black border-neutral-400' : 'bg-neutral-800 text-neutral-500 border-neutral-900 hover:bg-neutral-700'}`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={() => startGame('STORY')} className="w-full py-4 flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 rounded-xl font-bold text-xl uppercase tracking-widest shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-transform active:scale-95">
                <BookOpen size={24} /> Story Campaign
              </button>
              <button onClick={() => startGame('ENDLESS')} className="w-full py-3 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-neutral-300 transition-transform active:scale-95">
                <Play size={20} /> Endless Shift
              </button>
              <button onClick={() => { setGameState('RESTAURANT_HUB'); }} className="w-full py-3 flex items-center justify-center gap-2 bg-amber-900/80 hover:bg-amber-800 rounded-xl font-bold uppercase tracking-widest text-amber-200 transition-transform active:scale-95 border border-amber-700/50">
                <ChefHat size={20} /> My Restaurant
              </button>
              <div className="flex gap-3 mt-2">
                 <button onClick={() => setShowGuide(true)} className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-neutral-300 transition-transform active:scale-95 flex items-center justify-center gap-2 text-xs">
                   <Info size={16} /> How to Play
                 </button>
                 <button onClick={() => setShowLeaderboard(true)} className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-yellow-500 transition-transform active:scale-95 flex items-center justify-center gap-2 text-xs">
                   <Trophy size={16} /> Rankings
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- RESTAURANT HUB --- */}
      {gameState === 'RESTAURANT_HUB' && !showGuide && !showLeaderboard && !showShop && !showRecipes && (
        <div className="flex-1 flex flex-col absolute inset-0 z-50 min-h-0">
          <RestaurantHub
            onStartShift={({ dailySpecialId, contracts }) => {
              setRestaurantShiftConfig({ dailySpecialId, contracts });
              setIsRestaurantMode(true);
              setGameState('PLAYING');
            }}
          />
        </div>
      )}

      {/* --- STORY CHAPTER OVERLAYS --- */}
      {(gameState === 'STORY_CHAPTER' || gameState === 'EPILOGUE') && !showShop && !showRecipes && (
        <div className="flex-1 flex items-center justify-center bg-neutral-950/95 absolute inset-0 z-50 p-4">
           <div className={`text-center bg-neutral-900 p-8 md:p-12 rounded-3xl border-2 ${STORY_CHAPTERS[currentChapter].border} max-w-2xl w-full shadow-2xl relative overflow-hidden`}>
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-current to-transparent opacity-50" style={{ color: STORY_CHAPTERS[currentChapter].color }} />
            
            <h3 className={`text-lg md:text-xl font-bold mb-2 uppercase tracking-widest ${STORY_CHAPTERS[currentChapter].color}`}>
               {gameState === 'EPILOGUE' ? 'CAMPAIGN COMPLETE' : 'STORY MODE'}
            </h3>
            <h2 className="text-3xl md:text-5xl font-black mb-6 text-white leading-tight">
               {String(STORY_CHAPTERS[currentChapter].title)}
            </h2>
            
            <p className="text-neutral-300 md:text-lg mb-8 leading-relaxed italic">
               "{String(STORY_CHAPTERS[currentChapter].desc)}"
            </p>
            
            {gameState !== 'EPILOGUE' && (
              <div className="bg-black/50 p-4 rounded-xl border border-neutral-800 mb-6 inline-block text-left w-full max-w-lg">
                 <div className="text-xs text-neutral-500 uppercase tracking-widest mb-2 flex items-center justify-between gap-4">
                   <span title="Level progress">Level progress</span>
                   <span className={`text-[10px] font-black px-2 py-0.5 rounded-sm bg-black border border-current ${DIFF_MULTS[difficulty].color}`}>{difficulty}</span>
                 </div>
                 {(() => {
                    const prog = getStoryProgress();
                    return (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-5 md:h-6 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
                            <div 
                              className="h-full bg-gradient-to-r from-yellow-600 to-green-500 transition-all duration-500 rounded-full" 
                              style={{ width: `${Math.round(prog.pct)}%` }} 
                            />
                          </div>
                          <span className="text-lg font-black text-yellow-400 tabular-nums shrink-0">{Math.round(prog.pct)}%</span>
                        </div>
                        <div className="text-sm text-neutral-400 font-mono mb-4">
                          Score: <span className="text-amber-400 font-bold">{Math.round(score)}</span>
                          {prog.target > 0 && <span> / <span className="text-yellow-400">{Math.round(prog.target)}</span> to advance</span>}
                        </div>
                      </>
                    );
                 })()}
                 <div className="text-xs text-neutral-500 uppercase tracking-widest mb-2 border-t border-neutral-700 pt-3 mt-3">Objectives</div>
                 <ul className="space-y-1.5">
                   {getChapterTodos(currentChapter).map(t => (
                     <li key={t.id} className={`flex items-center gap-2 text-sm ${t.done ? 'text-green-400' : 'text-neutral-300'}`}>
                       <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-black/50 border border-neutral-700">
                         {t.done ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <span className="text-neutral-500">○</span>}
                       </span>
                       <span className={t.done ? 'line-through opacity-80' : ''}>{String(t.label)}</span>
                     </li>
                   ))}
                 </ul>
              </div>
            )}

            {gameState === 'EPILOGUE' && (
              <div className="bg-black/50 p-4 rounded-xl border border-fuchsia-700/50 mb-6 inline-block text-left w-full max-w-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-5 md:h-6 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
                    <div className="h-full w-full bg-gradient-to-r from-fuchsia-600 to-purple-500 rounded-full" />
                  </div>
                  <span className="text-lg font-black text-fuchsia-400 tabular-nums">100%</span>
                </div>
                <p className="text-sm text-neutral-400">Campaign complete. You are the true Sik San!</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowShop(true)} className={`w-1/3 py-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold text-lg md:text-xl uppercase tracking-widest text-orange-400 transition-transform active:scale-95 shadow-lg border border-neutral-700 flex items-center justify-center gap-2`}>
                <ShoppingCart size={24} /> Shop
              </button>
              <button onClick={gameState === 'EPILOGUE' ? quitToMenu : continueStory} className={`flex-1 py-4 ${gameState === 'EPILOGUE' ? 'bg-fuchsia-600 hover:bg-fuchsia-500' : 'bg-orange-600 hover:bg-orange-500'} rounded-xl font-bold text-lg md:text-xl uppercase tracking-widest text-white transition-transform active:scale-95 shadow-lg`}>
                {gameState === 'EPILOGUE' ? 'Return to Menu' : (currentChapter === 0 ? 'Start Prep Phase!' : 'Continue Campaign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NPC ENCOUNTER --- */}
      {gameState === 'NPC_ENCOUNTER' && npcEncounter && !showShop && !showRecipes && (
        <div className="flex-1 flex items-center justify-center bg-neutral-950/95 absolute inset-0 z-50 p-4">
          <div className={`text-center bg-neutral-900 p-6 md:p-12 rounded-3xl border-2 ${NPC_CHARACTERS[npcEncounter.npc].border} max-w-2xl w-full shadow-2xl relative overflow-hidden`}>
            <div className={`absolute inset-0 bg-gradient-to-b ${NPC_CHARACTERS[npcEncounter.npc].bg} to-transparent opacity-30 pointer-events-none`} />
            
            <div className="relative z-10">
              {/* Turkey vs Bull Tong comic panels (Ch5: The Heart of Wok Hei) */}
              {npcEncounter.id === 'turkey_ch5' && (
                <div className="flex gap-2 mb-6 justify-center flex-wrap">
                  {[1, 2, 3].map((n) => (
                    <img
                      key={n}
                      src={`/panels/turkey_bull_panel${n}.png`}
                      alt={`Scene panel ${n}`}
                      className="flex-1 min-w-0 max-w-[180px] md:max-w-[220px] rounded-xl border-2 border-neutral-700 shadow-lg object-cover object-top"
                    />
                  ))}
                </div>
              )}
              {NPC_IMAGES[npcEncounter.npc] ? (
                <div className="mb-4 flex justify-center">
                  <img
                    src={NPC_IMAGES[npcEncounter.npc]}
                    alt={NPC_CHARACTERS[npcEncounter.npc].name}
                    className="max-h-48 md:max-h-64 w-auto rounded-2xl border-2 border-neutral-700 shadow-[0_10px_30px_rgba(0,0,0,0.6)] object-contain"
                  />
                </div>
              ) : (
                <div className="text-6xl md:text-7xl mb-4 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]">{String(NPC_CHARACTERS[npcEncounter.npc].icon)}</div>
              )}
              <h3 className={`text-sm md:text-base font-bold uppercase tracking-[0.3em] ${NPC_CHARACTERS[npcEncounter.npc].color} mb-1`}>
                {String(NPC_CHARACTERS[npcEncounter.npc].name)} <span className="opacity-60">{String(NPC_CHARACTERS[npcEncounter.npc].chName)}</span>
              </h3>
              <h2 className="text-2xl md:text-4xl font-black mb-6 text-white leading-tight">{String(npcEncounter.title)}</h2>
              
              {npcEncounter.phase === 'dialog' ? (
                <>
                  <div className="space-y-3 mb-8 text-left bg-black/40 p-5 md:p-6 rounded-xl border border-neutral-800">
                    {npcEncounter.dialog.map((line, i) => (
                      <p key={i} className={i === 0 ? 'text-yellow-300 italic font-bold text-base md:text-lg' : i === 1 ? 'text-neutral-500 text-sm italic' : 'text-neutral-300 text-sm md:text-base leading-relaxed'}>
                        {String(line)}
                      </p>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {npcEncounter.choices.map(choice => {
                      const locked = choice.requiresSoul && soul < choice.requiresSoul;
                      return (
                        <button 
                          key={choice.id}
                          onClick={() => handleEncounterChoice(npcEncounter, choice)}
                          disabled={locked}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${locked ? 'border-neutral-800 bg-neutral-900 opacity-40 cursor-not-allowed' : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 active:scale-[0.98]'}`}
                        >
                          <div className="font-bold text-white text-sm md:text-lg mb-1">{String(choice.label)}</div>
                          <div className="text-xs text-neutral-400 leading-relaxed">{String(choice.desc)}</div>
                          {locked && <div className="text-xs text-cyan-400 mt-1 flex items-center gap-1"><Heart size={10} fill="currentColor" /> Requires {choice.requiresSoul} Soul (you have {soul})</div>}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-black/40 p-6 rounded-xl border border-neutral-800 mb-6">
                    <p className="text-yellow-300 italic font-bold text-lg md:text-xl mb-4">{String(npcEncounter.responseText)}</p>
                    <div className="text-sm text-green-400 bg-green-900/20 rounded-lg px-4 py-2 border border-green-800/50 inline-block">{String(npcEncounter.chosenDesc)}</div>
                  </div>
                  <button
                    onClick={proceedFromEncounter}
                    className="w-full py-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 rounded-xl font-bold text-lg uppercase tracking-widest text-white transition-transform active:scale-95 shadow-lg"
                  >
                    Continue
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- PREP MINIGAME --- */}
      {gameState === 'PREP' && !showShop && !showRecipes && (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#2c1e16] absolute inset-0 z-50 p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#4a3221] to-[#1a120c]">
           <div className="text-center mb-8">
             <h2 className="text-4xl font-black text-orange-400 uppercase tracking-widest mb-2 drop-shadow-md">Mise en Place</h2>
             <p className="text-neutral-300">Chop ingredients perfectly to earn a shift-long buff!</p>
           </div>
           
           {prepItems.length > 0 && currentPrepIdx < prepItems.length && (
             <div className="flex flex-col items-center bg-black/40 p-8 rounded-3xl border border-[#5c3e29] shadow-2xl w-full max-w-md">
                
                <div className="flex gap-2 mb-6">
                   {prepItems.map((item, idx) => (
                      <div key={idx} className={`w-12 h-12 flex items-center justify-center rounded-lg text-2xl bg-neutral-800 border-2 ${idx === currentPrepIdx ? 'border-orange-500 scale-110' : idx < currentPrepIdx ? 'border-green-500 opacity-50' : 'border-neutral-700 opacity-50'}`}>
                         {String(ALL_ITEMS[item].icon)}
                      </div>
                   ))}
                </div>

                <div className="text-6xl mb-2 drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)]">
                  {String(ALL_ITEMS[prepItems[currentPrepIdx]].icon)}
                </div>
                <div className="text-xl font-bold text-white mb-8">
                  {String(ALL_ITEMS[prepItems[currentPrepIdx]].name)} (Chop: {prepChops}/3)
                </div>

                {/* Timing Bar */}
                <div className="w-full h-8 bg-neutral-900 rounded-full relative overflow-hidden border-2 border-neutral-700 shadow-inner">
                   <div className="absolute top-0 bottom-0 left-[30%] right-[30%] bg-yellow-500/30 border-l border-r border-yellow-500/50"></div>
                   <div className="absolute top-0 bottom-0 left-[42%] right-[42%] bg-green-500/60 border-l border-r border-green-400"></div>
                   
                   {/* Cursor */}
                   <div 
                     className="absolute top-0 bottom-0 w-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                     style={{ left: `${prepCursorPos}%`, transform: 'translateX(-50%)' }}
                   ></div>
                </div>

                <div className="h-6 mt-4 font-bold tracking-widest text-lg" style={{ color: prepFeedback?.color || 'transparent' }}>
                    {String(prepFeedback?.text || "...")}
                </div>

                <button 
                  onPointerDown={handlePrepChop}
                  className="mt-6 w-full py-4 bg-gradient-to-b from-orange-500 to-red-600 border-b-4 border-red-900 rounded-2xl font-black text-2xl uppercase tracking-widest text-white transition-transform active:scale-95 active:border-b-0 active:translate-y-1 shadow-lg flex items-center justify-center gap-2"
                >
                  <Crosshair /> CHOP!
                </button>
             </div>
           )}
        </div>
      )}

      {/* --- OVERLAYS --- */}
      {showShop && (
        <div className="flex-1 flex items-center justify-center bg-black/90 absolute inset-0 z-[100] p-4 backdrop-blur-md">
          <div className="text-center bg-neutral-900 p-6 md:p-8 rounded-3xl border-2 border-yellow-700 max-w-3xl w-full shadow-2xl relative flex flex-col max-h-[90vh]">
            <button onClick={() => setShowShop(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">✕</button>
            <h2 className="text-2xl md:text-4xl font-black text-yellow-500 mb-2 flex items-center justify-center gap-3"><ShoppingCart /> Kitchen Supplies</h2>
            <div className="text-amber-400 font-mono text-sm md:text-base mb-1" title="Score and Cash">
               Score: {Math.round(Number(score))} <span className="text-neutral-500">|</span> <span className="text-green-400">Cash: ${Number(cash).toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-neutral-500 mb-6">Spend Cash on upgrades.</p>
            
            <div className="overflow-y-auto custom-scrollbar flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-left px-2 pb-4">
               {UPGRADES.map(u => {
                  const isOwned = ownedUpgrades.includes(u.id);
                  const effectiveCost = (u.id === 'monk_spoon' && npcBuffs.masterPath === 'middle') ? u.cost * 0.5 : u.cost;
                  const canAfford = cash >= effectiveCost;
                  return (
                  <div key={u.id} className={`p-4 rounded-xl border-2 flex flex-col justify-between ${isOwned ? 'bg-green-900/20 border-green-700' : 'bg-neutral-800 border-neutral-700'}`}>
                     <div className="flex items-start gap-3 mb-4">
                        <div className="text-4xl drop-shadow-md">{String(u.icon)}</div>
                        <div>
                           <div className="font-bold text-white text-lg">{String(u.name)}</div>
                           <div className="text-xs text-neutral-400 mt-1 leading-relaxed">{String(u.desc)}</div>
                        </div>
                     </div>
                     <button 
                        onClick={() => buyUpgrade(u, effectiveCost)}
                        disabled={isOwned || !canAfford}
                        className={`w-full py-2.5 rounded-lg font-bold uppercase tracking-widest text-sm transition-transform ${isOwned ? 'bg-green-800/50 text-green-300 border border-green-700 cursor-not-allowed' : canAfford ? 'bg-yellow-600 hover:bg-yellow-50 text-neutral-950 active:scale-95' : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'}`}
                     >
                        {isOwned ? 'Owned' : `Buy ($${effectiveCost.toFixed(2)})${effectiveCost < u.cost ? ' ☯️' : ''}`}
                     </button>
                  </div>
               )})}
            </div>
            
            <button onClick={() => setShowShop(false)} className="mt-4 shrink-0 w-full py-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95">
              Back to Kitchen
            </button>
          </div>
        </div>
      )}

      {showRecipes && !showShop && (
        <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto text-left shadow-2xl relative custom-scrollbar">
            <button onClick={() => setShowRecipes(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white text-xl font-bold">✕</button>
            <h2 className="text-3xl font-black mb-6 text-green-400 flex items-center gap-2"><BookOpen /> Ledger & Recipes</h2>

            <div className="space-y-8">
              {/* Ingredients Table */}
              <div>
                <h3 className="text-xl font-bold text-white mb-3 border-b border-neutral-700 pb-2">Ingredient Costs</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.values(ALL_ITEMS).sort((a,b) => a.cost - b.cost).map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-neutral-800 p-2.5 rounded-lg border border-neutral-700 shadow-inner">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl drop-shadow-md">{String(item.icon)}</span>
                        <span className="text-xs font-bold text-neutral-300 leading-tight">{String(item.name)}</span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-red-400 font-mono text-sm font-bold">-${item.cost.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold ${item.umami >= 4 ? 'text-amber-300' : item.umami >= 2 ? 'text-amber-500' : 'text-neutral-600'}`}>旨{item.umami}</span>
                          <span className={`text-[10px] font-bold ${item.oiliness >= 4 ? 'text-yellow-300' : item.oiliness >= 2 ? 'text-yellow-600' : 'text-neutral-600'}`}>🫒{item.oiliness}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recipes Table */}
              <div>
                <h3 className="text-xl font-bold text-white mb-3 border-b border-neutral-700 pb-2">Dish Economics</h3>
                <div className="overflow-x-auto rounded-lg border border-neutral-700">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-widest border-b border-neutral-700">
                        <th className="p-3" title="Recipe name">Dish</th>
                        <th className="p-3" title="Ingredients you need to add to the wok for this recipe">Ingredients Used</th>
                        <th className="p-3 text-right" title="Money spent on ingredients (deducted from wallet when you add them)">Cost</th>
                        <th className="p-3 text-right" title="Base order value before Wok Hei, Umami, combos, or oil bonuses. Actual serve revenue is usually higher.">Base Price</th>
                        <th className="p-3 text-right" title="Base Price minus Cost. Real profit is higher with Wok Hei, good cook, and flavor combos.">Base Profit</th>
                        <th className="p-3 text-right" title="Umami (旨味): average from ingredients. Higher = flavor bonus and more revenue.">旨味</th>
                        <th className="p-3 text-right" title="Ideal oil % for this dish. Match it when serving for a bonus; too high = Too Greasy penalty.">🫒 Oil</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {RECIPES.map(recipe => {
                        const cost = recipe.requires.reduce((sum, req) => sum + ALL_ITEMS[req].cost, 0);
                        const profit = recipe.baseScore - cost;
                        return (
                          <tr key={recipe.id} className="border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors">
                            <td className="p-3 font-bold text-white flex items-center gap-2">
                              <span className="text-xl drop-shadow-md">{String(recipe.displayIcons[0])}</span> {String(recipe.name)}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {recipe.requires.map((req, i) => (
                                  <span key={req + i} className="bg-black/30 p-1 rounded-md text-sm" title={ALL_ITEMS[req].name}>{String(ALL_ITEMS[req].icon)}</span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono text-red-400 font-bold">-${cost.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono text-green-400 font-bold">${recipe.baseScore.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono text-yellow-400 font-bold">${profit.toFixed(2)}</td>
                            <td className={`p-3 text-right font-mono font-bold ${(recipe.requires.reduce((sum, req) => sum + (ALL_ITEMS[req].umami || 0), 0) / recipe.requires.length) >= 3 ? 'text-amber-300' : 'text-amber-500'}`}>
                              {(recipe.requires.reduce((sum, req) => sum + (ALL_ITEMS[req].umami || 0), 0) / recipe.requires.length).toFixed(1)}
                            </td>
                            <td className={`p-3 text-right font-mono font-bold ${recipe.idealOil >= 50 ? 'text-yellow-300' : recipe.idealOil >= 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                              {recipe.idealOil}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-neutral-500 mt-3 italic">* Note: Final profit varies greatly based on Wok Hei, Umami depth, speed tips, and hidden flavor combos!</p>
              </div>

              {/* My Recipes */}
              <div>
                <h3 className="text-xl font-bold text-amber-400 mb-3 border-b border-neutral-700 pb-2 flex items-center justify-between">
                  <span>My Recipes ({customRecipes.length})</span>
                </h3>
                {customRecipes.length === 0 ? (
                  <div className="text-neutral-500 text-sm italic py-6 text-center bg-neutral-800/30 rounded-xl border border-dashed border-neutral-700">
                    No saved recipes yet. Cook a dish and hit SAVE to remember it!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customRecipes.map(recipe => (
                      <div key={recipe.id} className="bg-neutral-800 rounded-xl p-4 border border-neutral-700 relative group">
                        <button onClick={() => deleteCustomRecipe(recipe.id)} className="absolute top-3 right-3 text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Delete recipe">
                          <Trash2 size={16} />
                        </button>
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-bold text-white text-lg">{String(recipe.name)}</div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={`font-bold ${recipe.avgUmami >= 3 ? 'text-amber-300' : 'text-amber-500'}`}>旨味 {recipe.avgUmami.toFixed(1)}</span>
                            <span className="text-red-400 font-mono">-${recipe.totalCost.toFixed(2)}</span>
                            {recipe.markup && (
                              <span className={`font-bold ${recipe.markup > 3 ? 'text-red-400' : recipe.markup > 2.5 ? 'text-yellow-400' : 'text-green-400'}`}>
                                {recipe.markup.toFixed(1)}x
                              </span>
                            )}
                            {recipe.sellingPrice && (
                              <span className="text-green-400 font-mono font-bold">${recipe.sellingPrice.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(recipe.ingredients).map(([id, count]) => (
                            <span key={id} className="bg-black/30 px-2 py-1 rounded-md text-sm flex items-center gap-1">
                              {String(ALL_ITEMS[id]?.icon || '?')} 
                              <span className="text-xs text-neutral-400">{String(ALL_ITEMS[id]?.name || id)}</span>
                              {count > 1 && <span className="text-xs text-neutral-500">x{count}</span>}
                            </span>
                          ))}
                        </div>
                        <div className="text-[10px] text-neutral-600 mt-2">{new Date(recipe.timestamp).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <button onClick={() => setShowRecipes(false)} className="mt-8 w-full py-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95 shadow-lg border border-neutral-700">
              Close Ledger
            </button>
          </div>
        </div>
      )}

      {showGuide && !showShop && !showRecipes && (
        <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto text-left shadow-2xl relative custom-scrollbar">
            <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">✕</button>
            <h2 className="text-3xl font-black mb-4 text-orange-500 flex items-center gap-2"><ChefHat /> How to Play & Win</h2>
            <div className="space-y-4 text-neutral-300 text-sm">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">1. The Basics</h3>
                <p>Read incoming tickets. Add the required ingredients using the bottom station. Cook until the green bar is full, then hit <span className="text-green-400 font-bold">SERVE</span>.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">2. High Heat & Rhythm Tossing</h3>
                <p>Control the fire with the left slider. High heat cooks fast but rapidly fills your <span className="text-red-500 font-bold">Burn</span> meter! <strong>Pro Tip: Tossing the food effectively pauses the burning process.</strong> Keep a steady tossing rhythm to safely juggle food on maximum heat.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">3. The Wok Hei Meter</h3>
                <p>Tossing food while the heat is <span className="text-orange-400 font-bold">over 80</span> builds the purple <span className="text-fuchsia-400 font-bold">WOK HEI</span> meter on the right. Maximize it before serving for big score and cash multipliers!</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">4. Bulk Merging (High Risk/Reward)</h3>
                <p>If two identical tickets appear, a flashing blue <span className="text-blue-400 font-bold">MERGE BULK</span> banner will appear. Click it to combine them! You must cook double the ingredients at once (max 25 items in the wok), but successfully serving a bulk order yields massive efficiency multipliers and huge tips!</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">5. Economy & Stats — Score, Cash, Profit, Customer Delight, Soul</h3>
                <p className="mb-2">Understanding these five numbers is key:</p>
                <ul className="list-disc list-inside space-y-1.5 text-neutral-300 mb-2">
                  <li><span className="text-amber-400 font-bold">Score</span> — Increases when you SERVE. Drives story progress and chef rank.</li>
                  <li><span className="text-green-400 font-bold">Cash</span> — Your wallet. Goes up with profit and tips; down when you buy ingredients or upgrades, spill, or GIFT.</li>
                  <li><span className="text-yellow-400 font-bold">Profit</span> — From one serve: revenue minus ingredient cost. Added to Cash.</li>
                  <li><span className="text-amber-300 font-bold">Customer Delight</span> — Bar from -10 (angry) to +10 (happy), starts at 0. +2 per good serve, -2 per failed order or burn (or -1 with Goose); game over at -10.</li>
                  <li><span className="text-cyan-400 font-bold">Soul</span> — From GIFTing dishes. Used in story NPC encounters.</li>
                </ul>
                <p>Discover hidden <span className="text-yellow-400 font-bold">Flavor Combos</span> (e.g. Mushroom + Oyster Sauce + MSG) for huge score and cash bonuses!</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">6. Umami & Custom Recipes</h3>
                <p>Every ingredient has an <span className="text-amber-400 font-bold">Umami (旨味)</span> rating from 0-5. Dishes with higher average umami earn up to <span className="text-amber-300 font-bold">+30% bonus revenue</span>! Stack MSG, soy sauce, oyster sauce, and shiitake for maximum depth. Hit <span className="text-amber-400 font-bold">SAVE</span> while cooking to name and save your own recipes to the Ledger for future reference.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">7. Oiliness & Ideal Oil</h3>
                <p>Each recipe has an <span className="text-yellow-400 font-bold">Ideal Oil</span> level shown on its ticket (🫒). Ingredients also have an <span className="text-yellow-400 font-bold">oiliness</span> rating that shifts the effective oil level. Match the ideal and get <span className="text-green-400 font-bold">Perfect Oil!</span> for a 1.25x bonus + tip. Go way over and customers will complain — <span className="text-red-400 font-bold">Too Greasy!</span> cuts your revenue and can cost you a delight 😊.</p>
              </div>
            </div>
            <button onClick={() => setShowGuide(false)} className="mt-6 w-full py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95">
              Back to the Kitchen!
            </button>
          </div>
        </div>
      )}

      {showLeaderboard && !showShop && !showRecipes && (
        <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-yellow-700 p-6 rounded-2xl max-w-lg w-full h-[80vh] flex flex-col shadow-[0_0_50px_rgba(234,179,8,0.2)] relative">
            <button onClick={() => setShowLeaderboard(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">✕</button>
            <h2 className="text-3xl font-black mb-2 text-yellow-500 flex items-center justify-center gap-3">
               <Trophy size={32} /> TOP WOK STARS
            </h2>
            <p className="text-center text-neutral-400 text-xs mb-4 uppercase tracking-widest">Global Rankings</p>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {leaderboard.length === 0 ? (
                 <div className="text-center text-neutral-500 mt-10">Waiting for first scores...</div>
              ) : (
                leaderboard.map((entry, idx) => (
                  <div key={entry.id} className={`p-3 rounded-lg flex items-center justify-between border ${user && entry.userId === user.uid ? 'bg-yellow-900/30 border-yellow-600' : 'bg-neutral-800 border-neutral-700'}`}>
                    <div className="flex items-center gap-3">
                      <div className="text-xl font-black text-neutral-500 w-6">{idx + 1}.</div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-1">
                          <User size={14} className="text-neutral-400" /> {String(entry.name || 'Anonymous')}
                        </div>
                        <div className="text-[10px] text-neutral-400 uppercase">{String(entry.title || '')}</div>
                      </div>
                    </div>
                    <div className="font-mono text-green-400 font-bold text-lg">{Math.round(Number(entry.score || 0))}</div>
                  </div>
                ))
              )}
            </div>
            
            <button onClick={() => setShowLeaderboard(false)} className="mt-4 w-full py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95">
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- OPTIONS OVERLAY --- */}
      {showOptions && !showShop && !showRecipes && (
        <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl relative">
            <button onClick={() => setShowOptions(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">✕</button>
            <h2 className="text-2xl font-black mb-6 text-blue-400 flex items-center justify-center gap-2"><Settings /> OPTIONS</h2>
            
            <div className="space-y-6 mb-8">
              <div>
                <div className="flex justify-between text-neutral-300 font-bold mb-2">
                  <span>SFX Volume</span>
                  <span>{sfxVol}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" value={sfxVol} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSfxVol(val);
                    setSfxVolume(val / 100);
                  }}
                  className="w-full accent-blue-500" 
                />
              </div>

              <div>
                <div className="flex justify-between text-neutral-300 font-bold mb-2">
                  <span>Music Volume</span>
                  <span>{musicVol}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" value={musicVol} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setMusicVol(val);
                    setMusicVolume(val / 100);
                  }}
                  className="w-full accent-blue-500" 
                />
              </div>
            </div>

            <button onClick={() => setShowOptions(false)} className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95">
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- SAVE RECIPE OVERLAY --- */}
      {showSaveRecipe && (
        <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-amber-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl relative">
            <button onClick={() => setShowSaveRecipe(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">✕</button>
            <h2 className="text-2xl font-black mb-4 text-amber-400 flex items-center justify-center gap-2"><BookOpen /> Save Recipe</h2>
            
            <div className="mb-4 bg-black/40 p-3 rounded-xl border border-neutral-800">
              <div className="text-xs text-neutral-400 uppercase tracking-widest mb-2">Ingredients in Wok</div>
              <div className="flex flex-wrap gap-1">
                {[...new Set(wokContents)].map(id => {
                  const count = wokContents.filter(x => x === id).length;
                  return (
                    <span key={id} className="bg-neutral-800 px-2 py-1 rounded-md text-sm flex items-center gap-1">
                      {String(ALL_ITEMS[id].icon)} {count > 1 && <span className="text-xs text-neutral-400">x{count}</span>}
                    </span>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 text-xs">
                <span className="text-amber-400 font-bold">旨味 Umami: {wokUmami.avg.toFixed(1)}</span>
                <span className="text-red-400 font-mono">Cost: ${wokContents.reduce((s, id) => s + (ALL_ITEMS[id]?.cost || 0), 0).toFixed(2)}</span>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 mb-4">
              <label className="text-xs font-bold text-amber-500 uppercase tracking-widest ml-1">Recipe Name</label>
              <input 
                type="text" 
                placeholder="Name your creation..." 
                value={newRecipeName} 
                onChange={e => setNewRecipeName(e.target.value)} 
                maxLength={30} 
                className="w-full p-3 rounded-lg bg-neutral-950 text-white border border-neutral-600 outline-none font-bold focus:border-amber-500 transition-colors" 
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveCustomRecipe(); }}
              />
            </div>
            
            <div className="flex gap-2">
              <button onClick={() => setShowSaveRecipe(false)} className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95">
                Cancel
              </button>
              <button onClick={saveCustomRecipe} disabled={!newRecipeName.trim()} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-neutral-950 rounded-xl font-bold uppercase tracking-widest transition-all active:scale-95">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- GAME OVER STATE --- */}
      {gameState === 'GAMEOVER' && !showGuide && !showLeaderboard && !showShop && !showRecipes && (
        <div className="flex-1 flex items-center justify-center bg-neutral-950/95 absolute inset-0 z-50">
           <div className="text-center bg-neutral-900 p-8 rounded-3xl border border-red-900 max-w-md w-full shadow-2xl relative overflow-hidden">
            <AlertTriangle size={50} className="mx-auto text-red-500 mb-2" />
            <h2 className="text-3xl font-black mb-1 text-red-500 tracking-widest">KITCHEN CLOSED</h2>
            <p className="text-neutral-400 text-sm mb-4">Customer delight hit -10 — the crowd has turned!</p>
            
            <div className="bg-black/50 p-4 rounded-xl border border-neutral-800 mb-6" title="Final score and rank">
               <div className="text-sm text-neutral-400 uppercase tracking-widest mb-1" title="Final score">Final Earnings</div>
               <div className="text-6xl font-mono text-green-400 mb-2" title="Score">{Math.round(Number(score))}</div>
               <div className="text-xs text-neutral-500 uppercase tracking-widest mt-2">Rank Achieved:</div>
               <div className={`text-xl font-black ${finalTitle.color} mt-1 drop-shadow-md`} title="Chef rank">{String(finalTitle.title)}</div>
               
               {soul > 0 && (
                 <div className="text-sm font-bold text-cyan-400 mt-3 flex items-center justify-center gap-1" title="Soul earned by Gifting dishes. Used in NPC encounters for bonuses or story choices.">
                   <Heart size={16} fill="currentColor" /> {soul} Soul Collected
                 </div>
               )}
            </div>

            {!scoreSubmitted && score > 0 ? (
              <div className="flex flex-col gap-2 mb-6 bg-neutral-800/50 p-4 rounded-xl border border-neutral-700">
                <label className="text-xs font-bold text-yellow-500 uppercase tracking-widest text-left ml-1">Chef Name:</label>
                <input 
                  type="text" 
                  placeholder="Enter Name..." 
                  value={playerName} 
                  onChange={e => setPlayerName(e.target.value)} 
                  maxLength={15} 
                  className="w-full p-3 rounded-lg bg-neutral-950 text-white border border-neutral-600 outline-none font-bold" 
                />
                <button onClick={submitScoreToLeaderboard} disabled={!playerName.trim() || scoreSubmitting} className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-neutral-700 text-neutral-950 rounded-lg font-bold uppercase transition-all">{scoreSubmitting ? 'Submitting…' : 'Submit Score'}</button>
              </div>
            ) : null}

            <button onClick={quitToMenu} className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold uppercase tracking-widest text-white transition-transform active:scale-95">Main Menu</button>
          </div>
        </div>
      )}

      {/* --- STREAK POPUP (VFX) --- */}
      {streakPopup && (
        <div key={streakPopup.id} className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] animate-streak pointer-events-none whitespace-nowrap" style={{ color: String(streakPopup.color) }}>
          <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] uppercase">
            {String(streakPopup.text)}
          </h1>
        </div>
      )}

      {/* --- MAIN GAMEPLAY UI --- */}
      <main className="flex-1 flex flex-col relative min-h-0" style={{ backgroundColor: '#0a0a0a' }}>
        {gameState === 'PLAYING' ? (
          <GameLoop currentChapter={currentChapter} score={score} cash={cash} setScore={setScore} setCash={setCash} delight={delight} setDelight={setDelight} onRecipeSaved={(recipe) => setCustomRecipes(prev => [...prev, recipe])} isSandbox={!isStoryMode} isRestaurantMode={isRestaurantMode} dailySpecialId={restaurantShiftConfig?.dailySpecialId} contracts={restaurantShiftConfig?.contracts} onShiftEnd={isRestaurantMode ? (stats) => {
            const state = loadRestaurantState() || { xp: 0, daysOperated: 0, contractProgress: {}, completedToday: [], lastPlayedDate: new Date().toDateString() };
            const contracts = restaurantShiftConfig?.contracts || [];
            let addedXP = Math.floor((stats.score || 0) / 10);
            const completedToday = [...(state.completedToday || [])];
            const contractProgress = { ...(state.contractProgress || {}) };
            const isComplete = (c, s) => {
              if (c.type === 'serve_count') return s.dishesServed >= c.target;
              if (c.type === 'earn_cash') return s.totalEarnedCash >= c.target;
              if (c.type === 'no_burn') return c.target === 1 && !s.hadBurn;
              if (c.type === 'max_combo') return s.maxCombo >= c.target;
              if (c.type === 'perfect_serve') return s.perfectServes >= c.target;
              if (c.type === 'gift_count') return s.giftsCount >= c.target;
              if (c.type === 'special_serve') return s.specialServesCount >= c.target;
              return false;
            };
            const getProgress = (c, s) => {
              if (c.type === 'serve_count') return Math.min(s.dishesServed, c.target);
              if (c.type === 'earn_cash') return Math.min(s.totalEarnedCash, c.target);
              if (c.type === 'no_burn') return s.hadBurn ? 0 : 1;
              if (c.type === 'max_combo') return Math.min(s.maxCombo, c.target);
              if (c.type === 'perfect_serve') return Math.min(s.perfectServes, c.target);
              if (c.type === 'gift_count') return Math.min(s.giftsCount, c.target);
              if (c.type === 'special_serve') return Math.min(s.specialServesCount, c.target);
              return 0;
            };
            contracts.forEach(c => {
              contractProgress[c.id] = Math.max(contractProgress[c.id] ?? 0, getProgress(c, stats));
              if (isComplete(c, stats) && !completedToday.includes(c.id)) {
                completedToday.push(c.id);
                addedXP += c.rewardXP || 0;
              }
            });
            const today = new Date().toDateString();
            saveRestaurantState({
              xp: (state.xp || 0) + addedXP,
              daysOperated: (state.daysOperated || 0) + (state.lastPlayedDate !== today ? 1 : 0),
              lastPlayedDate: today,
              contractProgress,
              completedToday,
            });
            setGameState('RESTAURANT_HUB');
            setIsRestaurantMode(false);
            setRestaurantShiftConfig(null);
          } : undefined} />
        ) : (
          <>
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none flex flex-col items-center gap-2">
          {notifications.map(n => (
            <div key={n.id} className={`px-4 py-2 rounded-full font-bold text-lg animate-bounce shadow-xl ${n.type === 'error' ? 'bg-red-600 text-white' : n.type === 'success' ? 'bg-green-500 text-neutral-900' : 'bg-neutral-700 text-white'}`}>
              {String(n.msg)}
            </div>
          ))}
        </div>

        {/* --- TICKET RAIL --- */}
        <div className="flex flex-col w-full z-10 relative">
          
          {duplicateNames.length > 0 ? (
             <div className="w-full bg-blue-900 border-b border-blue-700 py-1 px-4 flex justify-center items-center gap-2 md:gap-4 text-[10px] md:text-sm tracking-widest uppercase text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]" title="You have multiple orders for the same dish. Merge them to cook once and serve all.">
                 <span className="animate-pulse text-blue-200">Multiple similar orders detected!</span>
                 <button onClick={() => handleMergeOrders(duplicateNames[0])} className="bg-yellow-500 hover:bg-yellow-400 text-black font-black px-2 md:px-4 py-0.5 md:py-1 rounded shadow-lg active:scale-95 transition-transform flex items-center gap-1 border-b-2 border-yellow-700 active:border-b-0 active:translate-y-px" title="Merge duplicate orders into one bulk order for more profit">
                     MERGE BULK {String(duplicateNames[0]).toUpperCase()}
                 </button>
             </div>
          ) : (
             <div className={`w-full bg-neutral-950/80 border-b border-[#111] py-1 px-4 flex justify-center items-center text-xs md:text-sm tracking-widest uppercase transition-colors duration-300 ${dynPrompt.color}`} title="Current tip or status. Follow prompts to cook and serve well.">
                {String(dynPrompt.text)}
             </div>
          )}

          <div className={`shrink-0 bg-[#1a1a1c] border-b-4 border-[#111] flex overflow-x-auto shadow-inner custom-scrollbar ${viewport.isLandscape ? 'h-20 md:h-28 p-2 md:p-2.5 gap-2.5 md:gap-3' : 'h-28 md:h-36 p-2.5 md:p-3 gap-3 md:gap-4'}`}>
            <button onClick={forceNextOrder} disabled={orders.length >= 3} className={`h-full flex flex-col items-center justify-center border-2 border-dashed border-neutral-700 rounded-lg text-neutral-500 hover:text-white transition-all shrink-0 ${viewport.isLandscape ? 'min-w-[72px] md:min-w-[96px]' : 'min-w-[80px] md:min-w-[100px]'}`} title={orders.length >= 3 ? "Maximum 3 orders at once" : "Next order will appear here"}>
              <Plus className={`${viewport.isLandscape ? 'w-5 h-5 md:w-7 md:h-7' : 'w-7 h-7 md:w-9 md:h-9'}`} />
              <span className="text-[9px] md:text-[11px] uppercase font-bold text-center leading-tight">Next</span>
            </button>

            {orders.map(order => {
              const urgency = order.timeLeft / order.timeLimit;
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
                  className={`rounded-lg shadow-lg border-2 ${ticketColor} relative flex flex-row items-center shrink-0 cursor-pointer ${viewport.isLandscape ? 'min-w-[180px] md:min-w-[250px] p-2 md:p-2.5 gap-2 md:gap-3' : 'min-w-[200px] md:min-w-[280px] p-2.5 md:p-3 gap-2.5 md:gap-3'}`}
                  title={`Order: ${order.name}. Tap to bring this ticket to the front (timer stays the same).`}
                >
                  {isSpecial && !order.failed && !isMerged && (
                     <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 bg-black text-white text-[8px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 md:py-1 rounded-full border border-current z-20 flex items-center gap-1 shadow-lg transform rotate-6 whitespace-nowrap">
                        <span>{String(order.specialEvent.icon)}</span> {String(order.specialEvent.name)}
                     </div>
                  )}
                  {isMerged && !order.failed && (
                     <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 bg-yellow-500 text-black text-[8px] md:text-[10px] font-black px-2 py-0.5 md:py-1 rounded-full border border-black z-20 flex items-center gap-1 shadow-lg transform rotate-6 whitespace-nowrap">
                        BULK x{order.batchSize}
                     </div>
                  )}
                  <DishIcon type={order.dishType} icons={order.displayIcons} isLandscape={viewport.isLandscape} />
                  <div className="flex flex-col justify-center min-w-0 flex-1 text-left">
                    <div className={`font-bold leading-tight truncate w-full ${viewport.isLandscape ? 'text-xs md:text-sm mb-0' : 'text-sm md:text-base lg:text-lg mb-1'}`}>{String(order.name)}</div>
                    <div className={`flex flex-wrap bg-black/10 rounded-md w-full ${viewport.isLandscape ? 'gap-0.5 mt-0 px-1 py-0.5' : 'gap-1 mt-0.5 md:mt-1 px-1.5 py-1'}`}>
                      {order.requires.map((req, i) => (
                        <span key={req + i} className={`${viewport.isLandscape ? 'text-xs md:text-sm' : 'text-sm md:text-base'} drop-shadow-md leading-none`} title={ALL_ITEMS[req].name}>{String(ALL_ITEMS[req].icon)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 md:h-2 bg-black/20 overflow-hidden rounded-b-lg">
                    <div className={`h-full ${urgency < 0.25 ? 'bg-red-500' : isMerged ? 'bg-blue-400' : 'bg-green-500'}`} style={{ width: `${Math.max(0, urgency * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 bg-[#1a1a1c] border-b border-[#111] py-1 px-3 flex justify-center items-center text-[10px] md:text-xs text-neutral-500 tracking-wide" title="Tap any order ticket to move it to the front of the queue; its countdown stays the same so you can prioritise.">
            Tap an order to bring it to the front — timer unchanged.
          </div>
        </div>

        {/* --- MIDDLE ACTION STATION (KITCHEN) --- */}
       <div className={`flex flex-1 min-h-0 min-w-0 justify-between items-center relative ${viewport.isLandscape ? 'px-1 md:px-4 py-1 md:py-2' : 'px-2 md:px-8 lg:px-16 py-2 md:py-4'}`}>
            
          {/* Left Column: Heat & Oil */}
          <div className={`flex flex-row justify-center gap-1.5 md:gap-3 h-full z-20 shrink-0 ${viewport.isLandscape ? 'w-28 md:w-40 max-h-[90%]' : 'w-32 md:w-48 max-h-80 md:max-h-[650px] lg:max-h-[700px]'}`}>
            
            {/* Heat Slider */}
            <div className={`w-1/2 bg-neutral-900 rounded-full flex flex-col items-center border border-neutral-800 relative flex-1 min-h-0 py-4 md:py-8`} title="Drag to set burner heat. High heat cooks faster but fills the Burn meter quicker. Keep heat above 80 and toss to build Wok Hei.">
              <div className={`font-black text-[8px] md:text-xs mb-2 md:mb-6 z-10 pointer-events-none transition-colors ${heatLevel > 80 ? 'text-red-500 animate-pulse' : 'text-neutral-500'}`}>HEAT</div>
              <div className="relative flex-1 w-full flex justify-center cursor-ns-resize touch-none" onPointerDown={handleHeatPointer} onPointerMove={handleHeatPointer}>
                <div className="w-2 md:w-3 h-full bg-black rounded-full overflow-hidden relative shadow-inner pointer-events-none">
                  <div className={`absolute bottom-0 w-full transition-all duration-100 bg-gradient-to-t ${heatLevel > 80 ? 'from-red-600 to-orange-400' : 'from-orange-500 to-yellow-400'}`} style={{ height: `${heatLevel}%` }} />
                </div>
                <div className={`w-10 md:w-16 h-8 md:h-12 bg-neutral-200 rounded-lg absolute z-10 pointer-events-none transition-transform flex items-center justify-center shadow-lg ${heatLevel > 80 ? 'border-2 border-red-500 bg-white scale-110' : 'border-b-4 border-neutral-400'}`} style={{ bottom: `calc(${heatLevel}% - 16px)` }}>
                   <div className="flex flex-col gap-1 md:gap-1.5 opacity-40">
                      <div className="w-5 md:w-8 h-0.5 md:h-1 bg-neutral-800 rounded-full"></div>
                      <div className="w-5 md:w-8 h-0.5 md:h-1 bg-neutral-800 rounded-full"></div>
                      <div className="w-5 md:w-8 h-0.5 md:h-1 bg-neutral-800 rounded-full"></div>
                   </div>
                </div>
              </div>
            </div>

            {/* Oil Squeeze Bottle */}
            <div className={`w-1/2 bg-neutral-900/60 rounded-full flex flex-col items-center border border-yellow-900/50 relative flex-1 min-h-0 py-4 md:py-8 shadow-[inset_0_0_20px_rgba(234,179,8,0.05)]`} title="Oil level. Hold the bottle button below to add oil. Needed for Wok Hei and to avoid dry burn.">
              <div className={`font-black text-[8px] md:text-xs mb-2 md:mb-6 z-10 pointer-events-none transition-colors ${oilLevel < 20 ? 'text-red-500 animate-pulse' : oilLevel > 75 ? 'text-orange-400' : 'text-yellow-500'}`}>OIL</div>
              <div className="relative flex-1 w-full flex justify-center">
                <div className="w-2 md:w-3 h-full bg-black rounded-full overflow-hidden relative shadow-inner">
                  <div className={`absolute bottom-0 w-full transition-all duration-100 bg-gradient-to-t from-yellow-600 to-yellow-300 ${oilLevel > 75 ? 'animate-pulse' : ''}`} style={{ height: `${oilLevel}%` }} />
                </div>
                {orders?.[0]?.idealOil != null && !orders?.[0]?.failed && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-none"
                    style={{ bottom: `calc(${Math.max(0, Math.min(100, orders[0].idealOil))}% - 1px)` }}
                    title={`Optimal oil for "${String(orders[0].name)}": ${Math.round(orders[0].idealOil)}%`}
                  >
                    <div className="w-2 md:w-3 h-[2px] bg-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.6)] rounded-full" />
                    <div className="ml-1 text-[7px] md:text-[9px] font-black text-cyan-200 whitespace-nowrap drop-shadow-sm">
                      OPT {Math.round(orders[0].idealOil)}%{oilLevel < orders[0].idealOil ? ` (+${Math.round(orders[0].idealOil - oilLevel)}%)` : ''}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Squeeze Action Button */}
              <button 
                 onPointerDown={() => setIsOiling(true)} 
                 onPointerUp={() => setIsOiling(false)} 
                 onPointerLeave={() => setIsOiling(false)} 
                 className={`absolute bottom-2 md:bottom-4 w-10 md:w-16 h-10 md:h-16 rounded-full flex items-center justify-center transition-all shadow-xl border-b-4 active:border-b-0 active:translate-y-1 ${oilLevel < 20 ? 'bg-red-900 border-red-950 animate-pulse' : oilLevel > 75 ? 'bg-orange-800 border-orange-950' : 'bg-yellow-600 border-yellow-800 hover:bg-yellow-500'}`}
                 title="Hold to add oil to the wok. Adds about 6% per second."
              >
                  <Droplets className={`w-4 h-4 md:w-6 md:h-6 ${oilLevel < 20 ? 'text-red-400' : 'text-yellow-100'}`} />
              </button>
            </div>

          </div>

          <div className="flex-1 h-full min-h-0 min-w-0 flex flex-col items-center justify-center relative mx-1 md:mx-2">
            <div className="absolute top-0 w-full flex justify-between items-start px-2 md:px-8 z-20 pointer-events-none transition-opacity duration-300" style={{ opacity: wokContents.length > 0 ? 1 : 0}}>
              <div className={`w-20 md:w-40 bg-black/60 rounded-lg border border-neutral-800 backdrop-blur-md ${viewport.isLandscape ? 'p-1.5 md:p-2' : 'p-2 md:p-3'}`} title="Cook progress. Serve when this is high (green) and Burn is low. High heat + tossing fills it faster.">
                <div className="flex justify-between text-[8px] md:text-xs mb-0.5 md:mb-1 font-bold uppercase tracking-wider text-neutral-400">
                  <span>Cook</span>
                  <span className={cookProgress > 90 ? 'text-green-400' : 'text-white'}>{Math.floor(cookProgress)}%</span>
                </div>
                <div className="h-1 md:h-2 bg-neutral-900 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all duration-100" style={{ width: `${cookProgress}%` }} />
                </div>
              </div>

              <div className={`bg-black/60 rounded-lg border backdrop-blur-md flex flex-col items-center ${wokUmami.avg >= 3 ? 'border-amber-700/60' : 'border-neutral-800'} ${viewport.isLandscape ? 'p-1 md:p-1.5' : 'p-1.5 md:p-2'}`} title="Umami (旨味). Average from your ingredients. Higher = flavor bonus and revenue boost.">
                <div className="text-[7px] md:text-[10px] font-black uppercase tracking-wider text-amber-500">旨味</div>
                <div className={`text-sm md:text-lg font-mono font-black ${wokUmami.avg >= 3 ? 'text-amber-300' : wokUmami.avg >= 2 ? 'text-amber-400' : 'text-neutral-500'}`}>
                  {wokUmami.avg.toFixed(1)}
                </div>
              </div>

              <div className={`w-20 md:w-40 bg-black/60 rounded-lg border border-neutral-800 backdrop-blur-md ${viewport.isLandscape ? 'p-1.5 md:p-2' : 'p-2 md:p-3'}`} title="Burn meter. Don't let it hit 100% or the dish is ruined. Toss regularly and avoid max heat + lots of oil to slow burn.">
                <div className="flex justify-between text-[8px] md:text-xs mb-0.5 md:mb-1 font-bold uppercase tracking-wider text-neutral-400">
                  <span>Burn</span>
                  <span className={burnProgress > 75 ? 'text-red-500 animate-pulse' : 'text-white'}>{Math.floor(burnProgress)}%</span>
                </div>
                <div className="h-1 md:h-2 bg-neutral-900 rounded-full overflow-hidden">
                  <div className="h-full bg-red-600 transition-all duration-100" style={{ width: `${burnProgress}%` }} />
                </div>
              </div>
            </div>

            <div className={`absolute right-0 flex flex-col items-center z-20 ${viewport.isLandscape ? 'top-[5%] bottom-[5%]' : 'top-1/2 -translate-y-1/2'}`} title="Wok Hei. Build by tossing at high heat (80+) with oil. Boosts revenue when high. Drops if you stop tossing.">
              <div 
                className={`text-[8px] md:text-[10px] font-black mb-1 md:mb-2 text-fuchsia-500 tracking-widest ${wokHei > 80 ? 'animate-pulse drop-shadow-[0_0_5px_rgba(217,70,239,0.8)]' : 'opacity-50'}`} 
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                WOK HEI
              </div>
              <div className={`bg-black/50 border border-neutral-800 rounded-full overflow-hidden shadow-2xl flex flex-col justify-end backdrop-blur-sm transition-colors flex-1 min-h-0 ${viewport.isLandscape ? 'w-4 md:w-8 h-full' : 'w-6 md:w-10 h-80 md:h-[650px] lg:h-[700px]'} ${wokHei > 80 ? 'border-fuchsia-500/50 shadow-[0_0_30px_rgba(217,70,239,0.4)]' : ''}`}>
                <div className="w-full transition-all duration-200 bg-gradient-to-t from-indigo-900 to-fuchsia-400 relative" style={{ height: `${wokHei}%` }}>
                  {wokHei > 80 && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
                </div>
              </div>
            </div>

            <div className="flex flex-1 min-w-0 w-full flex-row items-center justify-center gap-2 md:gap-4">
              <div className="flex-1 min-w-0 h-full flex items-center justify-center">
            <canvas ref={canvasRef} width={400} height={400} className="w-full h-full max-w-[65vw] md:max-w-none object-contain block drop-shadow-2xl z-10" />
              </div>
              {orders?.[0] && !orders[0].failed && (() => {
                const order = orders[0];
                const reqMap = {};
                order.requires.forEach(req => { reqMap[req] = (reqMap[req] || 0) + 1; });
                const wokFreq = {};
                wokContents.forEach(id => { wokFreq[id] = (wokFreq[id] || 0) + 1; });
                const totalRemaining = Object.keys(reqMap).reduce((sum, id) => sum + Math.max(0, (reqMap[id] || 0) - (wokFreq[id] || 0)), 0);
                return (
                  <div className="shrink-0 bg-black/70 rounded-xl border border-neutral-700 p-4 md:p-6 max-h-[85%] overflow-y-auto custom-scrollbar z-10" title="Ingredients needed for current order. ✓ enough added, ✗ over-added.">
                    <div className="text-xs md:text-sm font-black text-neutral-400 uppercase tracking-wider mb-2">Current order</div>
                    <div className="text-sm md:text-base text-amber-400 font-bold mb-3 truncate max-w-[270px] md:max-w-[360px]" title={order.name}>{order.name}</div>
                    <div className="text-xs md:text-sm text-neutral-300 font-bold mb-4">Remaining: <span className={totalRemaining === 0 ? 'text-green-400' : 'text-amber-400'}>{totalRemaining}</span></div>
                    <ul className="space-y-2">
                      {Object.entries(reqMap).map(([id, needed]) => {
                        const current = wokFreq[id] || 0;
                        const remaining = Math.max(0, needed - current);
                        const isSufficient = current >= needed;
                        const isOver = current > needed;
                        const item = ALL_ITEMS[id];
                        if (!item) return null;
                        return (
                          <li key={id} className="flex items-center gap-3 text-sm md:text-base">
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
          </div>

          {/* Right Column: Rockers & Serve */}
          <div className={`flex flex-col justify-center z-20 shrink-0 h-full ${viewport.isLandscape ? 'gap-1.5 w-40 md:w-56 max-h-[90%]' : 'gap-2 md:gap-4 w-40 md:w-64 max-h-72 md:max-h-[550px] lg:max-h-[600px]'}`}>
            
            {/* 2D Elliptical Toss Pad */}
            <div className={`flex flex-col flex-1 bg-neutral-900/80 rounded-[40px] border border-blue-900/50 relative shadow-[inset_0_0_20px_rgba(59,130,246,0.05)] min-h-0 py-4 md:py-6 px-1.5 md:px-3`} title="Drag to toss the wok. Tossing slows the Burn meter and builds Wok Hei when heat is above 80. Toss regularly to avoid burning.">
                <div className={`font-black text-[8px] md:text-xs mb-1 md:mb-2 z-10 pointer-events-none text-center transition-colors ${toss.x !== 0 || toss.y !== 0 ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]' : 'text-neutral-500'}`}>TOSS</div>
                
                <div 
                   className="relative flex-1 w-full flex justify-center items-center cursor-move touch-none"
                   onPointerDown={handleTossPointer}
                   onPointerMove={handleTossPointer}
                   onPointerUp={handleTossRelease}
                   onPointerLeave={handleTossRelease}
                >
                    {/* The elliptical track boundary */}
                    <div className="w-full h-[90%] bg-black/50 rounded-[40px] overflow-hidden relative shadow-inner border-2 border-neutral-800 pointer-events-none">
                        {/* Center Crosshairs */}
                        <div className="absolute top-1/2 w-full h-px bg-neutral-700/50 transform -translate-y-1/2"></div>
                        <div className="absolute left-1/2 h-full w-px bg-neutral-700/50 transform -translate-x-1/2"></div>
                    </div>
                    
                    {/* The Thumb Grip */}
                    <div 
                       className={`w-10 md:w-14 h-10 md:h-14 bg-neutral-200 rounded-full absolute z-10 pointer-events-none transition-transform flex items-center justify-center shadow-[0_10px_20px_rgba(0,0,0,0.5)] border-b-4 border-neutral-400`}
                       style={{ 
                           left: `calc(50% + ${toss.x * 35}%)`, 
                           top: `calc(50% + ${toss.y * 35}%)`, 
                           transform: `translate(-50%, -50%) scale(${toss.x === 0 && toss.y === 0 ? 1 : 1.15})` 
                       }}
                    >
                        <div className="w-4 md:w-6 h-4 md:w-6 bg-blue-500 rounded-full opacity-60 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)]"></div>
                    </div>
                </div>
            </div>

            {/* Standardized 2x2 Tactile Action Grid (Forced equal widths) */}
            <div className={`grid grid-cols-2 w-full shrink-0 min-w-0 ${viewport.isLandscape ? 'gap-1.5 md:gap-2 h-14 md:h-16' : 'gap-2 md:gap-3 h-16 md:h-20'}`}>
              <button onClick={handleTrash} className="w-full min-w-0 h-full bg-neutral-800 hover:bg-neutral-700 border-black border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-red-500 flex flex-col items-center justify-center transition-all text-[9px] md:text-xs shadow-lg tracking-wider overflow-hidden" title="Discard everything in the wok. Resets your combo. Use when you burn or need to start over.">
                <Trash2 className="w-4 h-4 md:w-5 md:h-5 mb-0.5 shrink-0" /> TRASH
              </button>
              <button onPointerDown={() => { if(wokContents.length === 0) setIsCleaning(true); }} onPointerUp={handleCleanRelease} onPointerLeave={handleCleanRelease} disabled={wokContents.length > 0} className="w-full min-w-0 h-full bg-blue-800 hover:bg-blue-700 border-blue-950 border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-white flex flex-col items-center justify-center transition-all text-[9px] md:text-xs disabled:opacity-30 shadow-lg tracking-wider overflow-hidden" title="Clean the wok with water. Only works when the wok is empty. Reduces residue.">
                <Droplets className="w-4 h-4 md:w-5 md:h-5 mb-0.5 shrink-0" /> CLEAN
              </button>
            </div>
            
            <div className={`grid grid-cols-2 w-full shrink-0 min-w-0 ${viewport.isLandscape ? 'gap-1.5 md:gap-2 h-14 md:h-16' : 'gap-2 md:gap-3 h-16 md:h-20'}`}>
              <button onClick={() => serveDish(true)} className={`w-full min-w-0 h-full bg-cyan-800 hover:bg-cyan-700 border-cyan-950 border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-cyan-100 flex flex-col items-center justify-center transition-all shadow-xl text-[9px] md:text-xs tracking-wider overflow-hidden`} title="Gift: Donate the dish for Soul instead of cash. No order match required. Costs ingredient value.">
                <Heart className="w-4 h-4 md:w-5 md:h-5 mb-0.5 shrink-0" /> GIFT
              </button>
              <button onClick={() => serveDish(false)} className={`w-full min-w-0 h-full bg-green-600 hover:bg-green-500 border-green-900 border-b-4 active:border-b-0 active:translate-y-1 rounded-xl font-bold text-white flex flex-col items-center justify-center transition-all shadow-xl text-[9px] md:text-xs tracking-wider overflow-hidden`} title="Serve the dish to a matching order for cash. Match the ticket ingredients and cook well for best pay.">
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5 mb-0.5 shrink-0" /> SERVE
              </button>
            </div>

            {wokContents.length > 0 && (
              <button onClick={() => { setNewRecipeName(''); setShowSaveRecipe(true); }} className={`w-full shrink-0 bg-amber-900/80 hover:bg-amber-800 border-amber-950 border-b-2 active:border-b-0 active:translate-y-0.5 rounded-xl font-bold text-amber-200 flex items-center justify-center gap-1 transition-all shadow-lg text-[8px] md:text-[10px] tracking-wider ${viewport.isLandscape ? 'h-8' : 'h-9 md:h-10'}`} title="Save current wok contents as a custom recipe for quick re-cook later.">
                <BookOpen className="w-3 h-3 md:w-4 md:h-4" /> SAVE
              </button>
            )}

          </div>
        </div>

        {/* --- INGREDIENT STATION --- */}
        <div className={`shrink-0 bg-[#151517] border-t-4 border-[#0a0a0c] w-full z-20 relative shadow-[0_-10px_30px_rgba(0,0,0,0.8)] ${viewport.isLandscape ? 'p-1' : 'p-2'}`}>
          <div className="flex flex-wrap justify-center items-stretch gap-1 md:gap-2 max-w-7xl mx-auto">
            {CATEGORIES.map(cat => (
              <div key={cat.id} className="flex flex-col bg-neutral-900/40 rounded-xl p-1 md:p-1.5 border border-neutral-800/60 shadow-inner" title={`Click an ingredient to add it to the wok. Cost and umami shown on hover.`}>
                <div className="text-[7px] md:text-[9px] text-neutral-500 font-black uppercase tracking-widest text-center mb-1">
                  {cat.name}
                </div>
                <div className="flex flex-wrap justify-center gap-1 md:gap-1.5">
                  {cat.items.map(itemId => {
                    const item = ALL_ITEMS[itemId];
                    return (
                      <button 
                        key={item.id} 
                        onClick={() => addIngredient(item.id)} 
                        disabled={!isUnlocked(item.id) || wokContents.length >= 25 || burnProgress >= 100} 
                        title={`${item.name} $${item.cost.toFixed(2)} | Umami ${item.umami}/5`}
                        className={`rounded-lg flex flex-col items-center justify-center transition-all bg-black ${item.text || 'text-neutral-100'} border-2 md:border-[3px] shadow-md ${viewport.isLandscape ? 'w-[53px] md:w-[73px] h-8 md:h-12' : 'w-[64px] md:w-[87px] h-10 md:h-14'} ${item.color ? item.color.replace('bg-', 'border-') : 'border-neutral-600'} ${!isUnlocked(item.id) ? 'opacity-20 grayscale' : 'disabled:opacity-30 disabled:grayscale hover:brightness-110 active:translate-y-1'}`}
                      >
                        <span className={`${viewport.isLandscape ? 'text-lg md:text-2xl' : 'text-xl md:text-3xl'} leading-none filter drop-shadow-sm`}>
                          {String(item.icon)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}