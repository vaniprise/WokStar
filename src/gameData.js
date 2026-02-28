// --- Story Campaign Data ---
export const STORY_CHAPTERS = [
  { target: 0, chapter: 0, title: "Chapter 1: The Fall of the Emperor", desc: "You were the arrogant 'Emperor of Eats'. But your evil apprentice framed you! Grab a rusty wok and start grinding out cheap fried rice to survive!", goal: "Reach a score of 150 to buy a decent chef's knife.", color: "text-blue-400", border: "border-blue-900" },
  { target: 150, chapter: 1, title: "Chapter 2: Temple Street Triads", desc: "You invent dishes so incredible the local triad bosses demand them! But now they want a hefty cut of your profits.", goal: "Reach a score of 500 to pay off the local gangs.", color: "text-green-400", border: "border-green-900" },
  { target: 500, chapter: 2, title: "Chapter 3: The 18 Bronze Chefs", desc: "You must master the ancient Dragon-Subduing Wok Tosses inside a giant brass bell at the Shaolin Culinary Monastery!", goal: "Reach a score of 1,200 to graduate from Shaolin.", color: "text-yellow-400", border: "border-yellow-900" },
  { target: 1200, chapter: 3, title: "Chapter 4: The Mega-Laser Wok", desc: "You only have your iron pan and your newfound Shaolin inner peace against Bullhorn's high-tech Mega-Laser Wok. Show them the true meaning of Wok Hei!", goal: "Reach a score of 2,500 to expose the sabotage.", color: "text-orange-500", border: "border-orange-900" },
  { target: 2500, chapter: 4, title: "Chapter 5: The Sorrowful Rice", desc: "Treachery! Bullhorn destroyed your premium ingredients! You must pour your soul into the legendary 'Sorrowful Rice'.", goal: "Reach a score of 5,000 to ascend as the God of Cookery.", color: "text-red-500", border: "border-red-900" },
  { target: 5000, chapter: 5, title: "EPILOGUE: Ascension", desc: "A divine light beams from the heavens. You are officially recognized by the celestial courts. You are the true SIK SAN!", goal: "Endless Glory.", color: "text-fuchsia-400", border: "border-fuchsia-900" }
];

export const getScoreTitle = (score) => {
  if (score >= 5000) return { title: "Sik San (God of Cookery) 食神", color: "text-fuchsia-400" };
  if (score >= 2500) return { title: "Wok Hei Dragon 鑊氣神龍", color: "text-red-500" };
  if (score >= 1200) return { title: "Executive Chef 行政總廚", color: "text-orange-400" };
  if (score >= 500) return { title: "Da Ho (Line Chef) 打荷", color: "text-yellow-400" };
  if (score >= 150) return { title: "Apprentice Cook 學徒", color: "text-green-400" };
  return { title: "Sai Wun Gung (Wok Washer) 洗碗工", color: "text-blue-300" };
};

// --- Economic Engine (Prices scaled to cents) ---
export const INGREDIENTS = {
  RICE: { id: 'rice', name: 'Day-Old Rice', color: 'bg-yellow-50', icon: '🍚', cost: 1.50, rarity: 1, umami: 1, oiliness: 0 },
  EGG: { id: 'egg', name: 'Beaten Egg', color: 'bg-yellow-400', icon: '🥚', cost: 1.80, rarity: 1, umami: 2, oiliness: 2 },
  SCALLION: { id: 'scallion', name: 'Scallions', color: 'bg-green-500', icon: '🌿', cost: 0.70, rarity: 1, umami: 1, oiliness: 0 },
  BEEF: { id: 'beef', name: 'Velvet Beef', color: 'bg-red-800', icon: '🥩', cost: 11.50, rarity: 3, umami: 3, oiliness: 3 },
  CHAR_SIU: { id: 'char_siu', name: 'Char Siu', color: 'bg-red-900', icon: '🍖', text: 'text-white', cost: 85.00, rarity: 4, umami: 3, oiliness: 4 },
  NOODLE: { id: 'noodle', name: 'Ho Fun', color: 'bg-orange-100', icon: '🍜', cost: 2.20, rarity: 1, umami: 1, oiliness: 1 },
  SHRIMP: { id: 'shrimp', name: 'Fresh Prawn', color: 'bg-pink-200', icon: '🦐', cost: 25.00, rarity: 3, umami: 3, oiliness: 1 },
  GAI_LAN: { id: 'gai_lan', name: 'Gai Lan', color: 'bg-emerald-600', icon: '🥬', text: 'text-white', cost: 3.50, rarity: 2, umami: 1, oiliness: 0 },
  MUSHROOM: { id: 'mushroom', name: 'Shiitake', color: 'bg-stone-700', icon: '🍄', text: 'text-white', cost: 9.50, rarity: 2, umami: 4, oiliness: 1 },
  CHILI: { id: 'chili', name: 'Birdseye Chili', color: 'bg-red-600', icon: '🌶️', text: 'text-white', cost: 1.20, rarity: 2, umami: 1, oiliness: 0 },
  GARLIC: { id: 'garlic', name: 'Garlic', color: 'bg-amber-100', icon: '🧄', cost: 0.40, rarity: 1, umami: 2, oiliness: 1 },
  GINGER: { id: 'ginger', name: 'Ginger', color: 'bg-yellow-200', icon: '🫚', cost: 0.60, rarity: 1, umami: 1, oiliness: 0 },
};

export const CONDIMENTS = {
  SOY_SAUCE: { id: 'soy_sauce', name: 'Soy Sauce', color: 'bg-stone-800', icon: '🫖', text: 'text-stone-200', cost: 0.50, rarity: 1, umami: 4, oiliness: 0 },
  OYSTER_SAUCE: { id: 'oyster_sauce', name: 'Oyster Sauce', color: 'bg-amber-900', icon: '🫙', text: 'text-amber-200', cost: 1.80, rarity: 2, umami: 4, oiliness: 1 },
  XO_SAUCE: { id: 'xo_sauce', name: 'XO Sauce', color: 'bg-orange-800', icon: '🥫', text: 'text-orange-100', cost: 45.00, rarity: 4, umami: 5, oiliness: 4 },
  WINE: { id: 'wine', name: 'Shaoxing Wine', color: 'bg-amber-700', icon: '🍶', text: 'text-amber-100', cost: 2.50, rarity: 2, umami: 1, oiliness: 0 },
  MSG: { id: 'msg', name: 'M.S.G.', color: 'bg-slate-200', icon: '✨', text: 'text-slate-800', cost: 0.80, rarity: 1, umami: 5, oiliness: 0 },
  WHITE_PEPPER: { id: 'white_pepper', name: 'White Pepper', color: 'bg-stone-200', icon: '⚪️', text: 'text-stone-800', cost: 1.20, rarity: 1, umami: 1, oiliness: 0 },
  FIVE_SPICE: { id: 'five_spice', name: 'Five Spice', color: 'bg-amber-900', icon: '🌰', text: 'text-amber-100', cost: 1.50, rarity: 2, umami: 1, oiliness: 0 },
  SALT: { id: 'salt', name: 'Salt', color: 'bg-gray-100', icon: '🧂', text: 'text-gray-800', cost: 0.10, rarity: 1, umami: 2, oiliness: 0 },
  SUGAR: { id: 'sugar', name: 'Sugar', color: 'bg-sky-50', icon: '🧊', text: 'text-sky-900', cost: 0.20, rarity: 1, umami: 0, oiliness: 0 },
};

export const ALL_ITEMS = { ...INGREDIENTS, ...CONDIMENTS };

export const FLAVOR_COMBOS = [
  { name: "Umami Bomb", items: ['mushroom', 'oyster_sauce', 'msg'], mult: 1.5 },
  { name: "Spicy & Numbing", items: ['chili', 'white_pepper'], mult: 1.3 },
  { name: "Drunken Seafood", items: ['wine', 'shrimp'], mult: 1.4 },
  { name: "Emperor's Indulgence", items: ['xo_sauce', 'beef'], mult: 1.6 },
  { name: "Classic Wok Hei", items: ['soy_sauce', 'scallion', 'egg'], mult: 1.2 },
];

// Target 25-30% margins on Base Scores
export const RECIPES = [
  { id: 'spicy_beef_rice', chapter: 0, dishType: 'bowl', displayIcons: ['🍚', '🌶️'], name: 'Spicy Beef Fried Rice', requires: ['beef', 'rice', 'egg', 'chili', 'soy_sauce'], baseScore: 22.00, timeLimit: 55, idealOil: 35 },
  { id: 'beef_chow_fun', chapter: 1, dishType: 'plate', displayIcons: ['🍜', '🥩'], name: 'Beef Chow Fun', requires: ['beef', 'noodle', 'scallion', 'soy_sauce', 'oyster_sauce'], baseScore: 22.50, timeLimit: 50, idealOil: 50 },
  { id: 'braised_shiitake', chapter: 1, dishType: 'plate', displayIcons: ['🍄', '🥬'], name: 'Braised Shiitake', requires: ['mushroom', 'gai_lan', 'oyster_sauce', 'wine'], baseScore: 23.50, timeLimit: 48, idealOil: 30 },
  { id: 'beef_gailan', chapter: 2, dishType: 'plate', displayIcons: ['🥩', '🥬'], name: 'Beef & Gai Lan', requires: ['beef', 'gai_lan', 'oyster_sauce', 'wine'], baseScore: 26.00, timeLimit: 50, idealOil: 45 },
  { id: 'fried_rice', chapter: 2, dishType: 'bowl', displayIcons: ['🍚', '🦐'], name: 'Yangzhou Fried Rice', requires: ['egg', 'rice', 'scallion', 'shrimp', 'msg'], baseScore: 40.00, timeLimit: 60, idealOil: 35 },
  { id: 'drunken_shrimp_noodle', chapter: 3, dishType: 'bowl', displayIcons: ['🍜', '🦐'], name: 'Drunken Shrimp Noodle', requires: ['shrimp', 'noodle', 'scallion', 'wine', 'white_pepper'], baseScore: 42.50, timeLimit: 45, idealOil: 40 },
  { id: 'xo_seafood_noodle', chapter: 4, dishType: 'plate', displayIcons: ['🍜', '🦐'], name: 'XO Seafood Noodles', requires: ['shrimp', 'noodle', 'scallion', 'xo_sauce'], baseScore: 98.00, timeLimit: 45, idealOil: 55 },
  { id: 'char_siu_rice', chapter: 4, dishType: 'bowl', displayIcons: ['🍚', '🍖'], name: 'Sorrowful Rice (Char Siu)', requires: ['char_siu', 'rice', 'egg', 'scallion', 'soy_sauce'], baseScore: 120.00, timeLimit: 40, idealOil: 40 },
];

export const SPECIAL_EVENTS = [
  { id: 'rush', name: "TRIAD RUSH!", desc: "Half time limit!", icon: "⏱️", color: "bg-red-600 text-white border-red-400", modifier: (o) => ({ ...o, timeLimit: o.timeLimit * 0.5, timeLeft: o.timeLimit * 0.5, bonusCash: 40.00 }) },
  { id: 'spicy', name: "SPICE FREAK!", desc: "Must add Chili!", icon: "🌶️", color: "bg-orange-600 text-white border-orange-400", modifier: (o) => ({ ...o, requires: [...o.requires, 'chili'], displayIcons: [...o.displayIcons, '🌶️'], bonusCombo: 1, bonusCash: 15.00 }) },
  { id: 'drunk', name: "DRUNK MASTER!", desc: "Must add Wine!", icon: "🍶", color: "bg-purple-600 text-white border-purple-400", modifier: (o) => ({ ...o, requires: [...o.requires, 'wine'], displayIcons: [...o.displayIcons, '🍶'], bonusCash: 50.00 }) },
  { id: 'wok_hei', name: "SIK SAN'S TEST!", desc: "Requires >90% Wok Hei!", icon: "🐉", color: "bg-fuchsia-600 text-white border-fuchsia-400", modifier: (o) => ({ ...o, requiresWokHei: 90, bonusCash: 80.00 }) },
];

export const UPGRADES = [
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

// --- Restaurant Minigame (retention mechanics) ---
export const RESTAURANT_CONTRACT_TEMPLATES = [
  { id: 'serve_5', name: 'Serve 5 dishes', type: 'serve_count', target: 5, rewardXP: 15, rewardCash: 10 },
  { id: 'serve_10', name: 'Serve 10 dishes', type: 'serve_count', target: 10, rewardXP: 35, rewardCash: 25 },
  { id: 'earn_100', name: 'Earn $100 in one shift', type: 'earn_cash', target: 100, rewardXP: 20, rewardCash: 15 },
  { id: 'earn_200', name: 'Earn $200 in one shift', type: 'earn_cash', target: 200, rewardXP: 45, rewardCash: 30 },
  { id: 'no_burn', name: 'Complete shift without burning', type: 'no_burn', target: 1, rewardXP: 25, rewardCash: 20 },
  { id: 'combo_5', name: 'Hit a 5-combo', type: 'max_combo', target: 5, rewardXP: 20, rewardCash: 12 },
  { id: 'combo_8', name: 'Hit an 8-combo', type: 'max_combo', target: 8, rewardXP: 40, rewardCash: 25 },
  { id: 'perfect_2', name: 'Serve 2 perfect dishes', type: 'perfect_serve', target: 2, rewardXP: 30, rewardCash: 20 },
  { id: 'gift_1', name: 'Gift 1 dish to charity', type: 'gift_count', target: 1, rewardXP: 20, rewardCash: 0 },
  { id: 'special_1', name: 'Serve 1 Chef\'s Special', type: 'special_serve', target: 1, rewardXP: 35, rewardCash: 25 },
];

const XP_PER_LEVEL = 100;
export const getRestaurantLevel = (xp) => Math.floor(xp / XP_PER_LEVEL) + 1;
export const getXPProgress = (xp) => {
  const level = getRestaurantLevel(xp);
  const xpForCurrentLevel = (level - 1) * XP_PER_LEVEL;
  const xpIntoLevel = xp - xpForCurrentLevel;
  return { level, xpIntoLevel, xpForNextLevel: XP_PER_LEVEL, progress: xpIntoLevel / XP_PER_LEVEL };
};

export const getDailySpecialRecipeId = () => {
  const today = new Date().toDateString();
  let hash = 0;
  for (let i = 0; i < today.length; i++) hash = ((hash << 5) - hash) + today.charCodeAt(i);
  const idx = Math.abs(hash) % RECIPES.length;
  return RECIPES[idx].id;
};

export const getDailyContracts = () => {
  const today = new Date().toDateString();
  let hash = 0;
  for (let i = 0; i < today.length; i++) hash = ((hash << 5) - hash) + today.charCodeAt(i);
  const rng = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  const indices = new Set();
  while (indices.size < 3) {
    indices.add(Math.floor(rng(hash + indices.size * 7) * RESTAURANT_CONTRACT_TEMPLATES.length));
  }
  return [...indices].map(i => ({ ...RESTAURANT_CONTRACT_TEMPLATES[i], progress: 0 }));
};