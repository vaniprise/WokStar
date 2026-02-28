// A zero-dependency procedural synthesizer for Wok Star
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

// Initial volume levels
let sfxVolumeLevel = 0.5;
let musicVolumeLevel = 0.5;

export const setSfxVolume = (val) => {
  sfxVolumeLevel = val;
  if (sfxGain && audioCtx) {
    sfxGain.gain.setTargetAtTime(val, audioCtx.currentTime, 0.1);
  }
};

export const setMusicVolume = (val) => {
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

export const initAudio = () => {
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

    // Dedicated buses for UI Volume Control
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

export const updateSizzle = (heatLevel, hasFood) => {
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

export const updateBurner = (heatLevel, isWhoosh) => {
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

export const updateClean = (isCleaning) => {
  if (!audioCtx || !cleanGain) return;
  cleanGain.gain.setTargetAtTime(isCleaning ? 0.35 : 0, audioCtx.currentTime, 0.1);
};

// --- TRANSIENT EFFECTS (All routed to SFX bus) ---
export const playChop = () => {
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

export const playDing = (isPerfect) => {
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

export const playTrash = () => {
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

export const playTossShhh = () => {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  if (playTossShhh.lastPlayedAt != null && now - playTossShhh.lastPlayedAt < 0.22) return;
  playTossShhh.lastPlayedAt = now;

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
playTossShhh.lastPlayedAt = null;

export const playFoodImpact = () => {
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

export const playIngredientAdd = (ingId) => {
  if (!audioCtx || !sfxGain) return;
  const now = audioCtx.currentTime;

  const isWet = ['egg', 'beef', 'shrimp', 'char_siu'].includes(ingId);
  const isLiquid = ['soy_sauce', 'oyster_sauce', 'wine', 'xo_sauce'].includes(ingId);
  const isDry = ['scallion', 'gai_lan', 'mushroom', 'chili'].includes(ingId);
  const isHeavy = ['rice', 'noodle'].includes(ingId);
  
  const noise = audioCtx.createBufferSource();
  noise.buffer = getNoiseBuffer();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);

  if (isWet) {
    // Wet, squishy thud
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
    // Splash
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    noise.start(now); noise.stop(now + 0.25);

  } else if (isDry) {
    // Crisp rustle
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4000, now);
    filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    noise.start(now); noise.stop(now + 0.1);

  } else if (isHeavy) {
    // Heavy thud
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
    // Default soft powder
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(5000, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    noise.start(now); noise.stop(now + 0.15);
  }
};