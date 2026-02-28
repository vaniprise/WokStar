import React, { useState, useEffect, useMemo } from 'react';
import { RECIPES, getDailySpecialRecipeId, getDailyContracts, getRestaurantLevel, getXPProgress } from './gameData';
import { ChefHat, Target, Calendar, Sparkles, Play } from 'lucide-react';

const STORAGE_KEY = 'wokstar_restaurant';

function loadRestaurantState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const today = new Date().toDateString();
    if (data.lastPlayedDate !== today) {
      data.completedToday = [];
      data.lastPlayedDate = today;
    }
    return data;
  } catch {
    return null;
  }
}

function saveRestaurantState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export default function RestaurantHub({ onStartShift }) {
  const [state, setState] = useState(() => loadRestaurantState() || { xp: 0, daysOperated: 0, contractProgress: {}, completedToday: [], lastPlayedDate: new Date().toDateString() });
  const [dailySpecialId, setDailySpecialId] = useState(getDailySpecialRecipeId);
  const dailyContracts = useMemo(() => getDailyContracts(), []);
  const recipe = useMemo(() => RECIPES.find(r => r.id === dailySpecialId) || RECIPES[0], [dailySpecialId]);
  const { level, xpIntoLevel, xpForNextLevel, progress } = getXPProgress(state.xp || 0);

  useEffect(() => {
    setDailySpecialId(getDailySpecialRecipeId());
  }, []);

  useEffect(() => {
    saveRestaurantState(state);
  }, [state]);

  const contractsWithProgress = dailyContracts.map(c => ({
    ...c,
    progress: state.contractProgress?.[c.id] ?? 0,
    completed: state.completedToday?.includes(c.id) ?? false,
  }));

  return (
    <div className="flex flex-col h-full min-h-0 bg-gradient-to-b from-amber-950/40 to-neutral-950 text-white overflow-y-auto">
      <div className="p-4 md:p-6 max-w-lg mx-auto w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-black flex items-center justify-center gap-2 text-amber-400">
            <ChefHat size={28} />
            My Restaurant
          </h1>
          <p className="text-neutral-400 text-sm mt-1">Run shifts, complete contracts, level up.</p>
        </div>

        {/* Level & XP */}
        <div className="bg-neutral-900/80 rounded-2xl border border-amber-800/50 p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-amber-400 font-bold">Level {level}</span>
            <span className="text-neutral-500 text-sm">{(state.xp || 0)} XP</span>
          </div>
          <div className="h-2.5 bg-black/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">{xpIntoLevel} / {xpForNextLevel} XP to next level</p>
        </div>

        {/* Days operated (streak) */}
        <div className="flex items-center justify-center gap-2 bg-neutral-900/60 rounded-xl py-2 px-4 border border-neutral-700">
          <Calendar size={18} className="text-amber-500" />
          <span className="font-bold text-amber-200">{state.daysOperated || 0}</span>
          <span className="text-neutral-400 text-sm">days operated</span>
        </div>

        {/* Daily Special */}
        <div className="bg-amber-950/30 rounded-2xl border-2 border-amber-600/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={18} className="text-amber-400" />
            <span className="text-amber-300 font-black uppercase tracking-wider text-sm">Today's Special</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{recipe.displayIcons?.[0] || '🍲'}</span>
            <div>
              <p className="font-bold text-white">{recipe.name}</p>
              <p className="text-amber-400/90 text-xs">+25% cash when served this shift!</p>
            </div>
          </div>
        </div>

        {/* Today's Contracts */}
        <div className="bg-neutral-900/80 rounded-2xl border border-neutral-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={18} className="text-green-400" />
            <span className="text-green-300 font-bold uppercase tracking-wider text-sm">Today's Contracts</span>
          </div>
          <p className="text-neutral-500 text-xs mb-3">Complete during your shift for bonus XP & cash.</p>
          <div className="space-y-2">
            {contractsWithProgress.map(c => (
              <div
                key={c.id}
                className={`flex justify-between items-center rounded-lg px-3 py-2 border ${c.completed ? 'bg-green-900/30 border-green-700' : 'bg-neutral-800/50 border-neutral-700'}`}
              >
                <span className={`text-sm font-medium ${c.completed ? 'text-green-300 line-through' : 'text-white'}`}>{c.name}</span>
                <div className="flex items-center gap-2">
                  {!c.completed && (
                    <span className="text-xs text-neutral-400">
                      {c.type === 'serve_count' && `${c.progress}/${c.target}`}
                      {c.type === 'earn_cash' && `$${c.progress}/${c.target}`}
                      {c.type === 'no_burn' && (c.progress >= c.target ? 'Done!' : '—')}
                      {c.type === 'max_combo' && `${c.progress}/${c.target}`}
                      {c.type === 'perfect_serve' && `${c.progress}/${c.target}`}
                      {c.type === 'gift_count' && `${c.progress}/${c.target}`}
                      {c.type === 'special_serve' && `${c.progress}/${c.target}`}
                    </span>
                  )}
                  {c.completed && <span className="text-green-400 text-xs font-bold">✓</span>}
                  <span className="text-amber-400 text-[10px]">+{c.rewardXP} XP</span>
                  {c.rewardCash > 0 && <span className="text-green-400 text-[10px]">+${c.rewardCash}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Start Shift */}
        <button
          onClick={() => onStartShift({ dailySpecialId, contracts: dailyContracts })}
          className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-neutral-900 shadow-lg shadow-amber-900/30 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
        >
          <Play size={24} /> Start Shift
        </button>

        <p className="text-center text-neutral-500 text-xs">No delight penalty in Restaurant mode. End your shift anytime to bank progress.</p>
      </div>
    </div>
  );
}

export { loadRestaurantState, saveRestaurantState, STORAGE_KEY };
