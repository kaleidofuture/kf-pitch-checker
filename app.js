/* ============================================================
   KF-PitchChecker — Real-time Pitch Detection
   Web Audio API + Autocorrelation
   ============================================================ */

// --- i18n ---
const I18N = {
  ja: {
    app_name: "ピッチチェッカー",
    app_tagline: "楽器練習の音程をリアルタイムで可視化",
    start: "開始",
    stop: "停止",
    cents: "セント",
    reference_pitch: "基準ピッチ",
    session_title: "練習セッション",
    session_duration: "経過時間",
    notes_detected: "検出ノート数",
    avg_accuracy: "平均精度",
    accuracy_histogram: "音程精度ヒストグラム",
    download_csv: "CSVダウンロード",
    about_title: "このアプリについて",
    about_description: "楽器練習の上達が分からないという悩みを解決するピッチチェッカーです。Web Audio APIで音声をリアルタイム解析し、音名とセント単位のずれを表示します。",
    tech_title: "使用技術",
    mic_error: "マイクにアクセスできません。ブラウザの設定を確認してください。",
    mic_prompt: "マイクへのアクセスを許可してください",
    silent_mode_warning: "※ iPhoneのマナーモード（消音モード）がオンの場合、正しく動作しないことがあります。",
    play_reference: "基準音を鳴らす",
    stop_reference: "基準音を停止",
    direction_sharp: "高い",
    direction_flat: "低い",
    direction_in_tune: "正確",
    instrument_preset: "楽器プリセット",
    preset_custom: "カスタム",
    preset_clarinet_bb: "Bbクラリネット",
    preset_trumpet: "トランペット",
    preset_flute: "フルート",
    preset_oboe: "オーボエ",
    preset_tuba: "チューバ",
  },
  en: {
    app_name: "Pitch Checker",
    app_tagline: "Visualize your pitch accuracy in real time",
    start: "Start",
    stop: "Stop",
    cents: "cents",
    reference_pitch: "Reference Pitch",
    session_title: "Practice Session",
    session_duration: "Duration",
    notes_detected: "Notes Detected",
    avg_accuracy: "Avg Accuracy",
    accuracy_histogram: "Pitch Accuracy Histogram",
    download_csv: "Download CSV",
    about_title: "About This App",
    about_description: "A pitch checker for musicians who want to track their improvement. Uses Web Audio API for real-time pitch detection and displays note names with cent deviations.",
    tech_title: "Technologies Used",
    mic_error: "Cannot access microphone. Please check browser settings.",
    mic_prompt: "Please allow microphone access",
    silent_mode_warning: "Note: On iPhone, this may not work correctly if silent mode (mute switch) is on.",
    play_reference: "Play Reference Tone",
    stop_reference: "Stop Reference Tone",
    direction_sharp: "Sharp",
    direction_flat: "Flat",
    direction_in_tune: "In Tune",
    instrument_preset: "Instrument Preset",
    preset_custom: "Custom",
    preset_clarinet_bb: "Bb Clarinet",
    preset_trumpet: "Trumpet",
    preset_flute: "Flute",
    preset_oboe: "Oboe",
    preset_tuba: "Tuba",
  }
};

let currentLang = localStorage.getItem("kf-pc-lang") || "ja";

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("kf-pc-lang", lang);
  document.getElementById("lang-select").value = lang;
  document.documentElement.lang = lang;
  applyI18n();
}

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || key;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // Update start/stop button text based on state
  const btn = document.getElementById("start-btn");
  if (btn) {
    btn.querySelector("span").textContent = isListening ? t("stop") : t("start");
  }
  // Update reference tone button text
  const refBtn = document.getElementById("ref-tone-btn");
  if (refBtn) {
    refBtn.textContent = isPlayingRefTone ? t("stop_reference") : t("play_reference");
  }
  // Update direction indicator
  updateDirectionIndicator(lastDetectedCents);
}

// --- Instrument Presets ---
const INSTRUMENT_PRESETS = {
  custom: { freq: null },
  clarinet_bb: { freq: 466.16 },
  trumpet: { freq: 466.16 },
  flute: { freq: 440 },
  oboe: { freq: 440 },
  tuba: { freq: 440 },
};

function selectPreset(presetKey) {
  const preset = INSTRUMENT_PRESETS[presetKey];
  if (preset && preset.freq !== null) {
    referenceA4 = preset.freq;
    document.getElementById("reference-value").textContent = referenceA4;
    // Stop reference tone if playing (frequency changed)
    if (isPlayingRefTone) stopReferenceTone();
  }
}

// --- Note names & frequencies ---
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let referenceA4 = 440;

function frequencyToNote(freq) {
  const semitones = 12 * Math.log2(freq / referenceA4);
  const roundedSemitones = Math.round(semitones);
  const cents = Math.round((semitones - roundedSemitones) * 100);
  const noteIndex = ((roundedSemitones % 12) + 12 + 9) % 12; // A=0 -> C=0 adjustment
  const octave = Math.floor((roundedSemitones + 9) / 12) + 4;
  return {
    name: NOTE_NAMES[noteIndex],
    octave: octave,
    cents: cents,
    frequency: freq,
  };
}

function adjustReference(delta) {
  referenceA4 = Math.max(400, Math.min(480, referenceA4 + delta));
  document.getElementById("reference-value").textContent = referenceA4;
  // Reset preset selector to custom
  const presetSelect = document.getElementById("preset-select");
  if (presetSelect) presetSelect.value = "custom";
  // If reference tone is playing, update its frequency
  if (isPlayingRefTone) {
    stopReferenceTone();
    startReferenceTone();
  }
}

// --- Reference Tone (OscillatorNode) ---
let refToneContext = null;
let refToneOscillator = null;
let refToneGain = null;
let isPlayingRefTone = false;

function toggleReferenceTone() {
  if (isPlayingRefTone) {
    stopReferenceTone();
  } else {
    startReferenceTone();
  }
}

function startReferenceTone() {
  refToneContext = new (window.AudioContext || window.webkitAudioContext)();
  refToneOscillator = refToneContext.createOscillator();
  refToneGain = refToneContext.createGain();

  refToneOscillator.type = "sine";
  refToneOscillator.frequency.value = referenceA4;
  refToneGain.gain.value = 0.3;

  refToneOscillator.connect(refToneGain);
  refToneGain.connect(refToneContext.destination);
  refToneOscillator.start();

  isPlayingRefTone = true;
  const btn = document.getElementById("ref-tone-btn");
  btn.textContent = t("stop_reference");
  btn.classList.remove("btn-outline");
  btn.classList.add("btn-stop");
}

function stopReferenceTone() {
  if (refToneOscillator) {
    refToneOscillator.stop();
    refToneOscillator = null;
  }
  if (refToneContext) {
    refToneContext.close();
    refToneContext = null;
  }
  isPlayingRefTone = false;
  const btn = document.getElementById("ref-tone-btn");
  btn.textContent = t("play_reference");
  btn.classList.remove("btn-stop");
  btn.classList.add("btn-outline");
}

// --- Direction Indicator ---
let lastDetectedCents = 0;

function updateDirectionIndicator(cents) {
  lastDetectedCents = cents;
  const arrowEl = document.getElementById("direction-arrow");
  const labelEl = document.getElementById("direction-label");
  if (!arrowEl || !labelEl) return;

  const absCents = Math.abs(cents);

  if (absCents <= 5) {
    // In tune
    arrowEl.textContent = "●";
    arrowEl.style.color = "#27ae60";
    labelEl.textContent = t("direction_in_tune");
    labelEl.style.color = "#27ae60";
  } else if (cents > 0) {
    // Sharp (too high)
    arrowEl.textContent = "↑";
    arrowEl.style.color = "#e74c3c";
    labelEl.textContent = t("direction_sharp");
    labelEl.style.color = "#e74c3c";
  } else {
    // Flat (too low)
    arrowEl.textContent = "↓";
    arrowEl.style.color = "#3498db";
    labelEl.textContent = t("direction_flat");
    labelEl.style.color = "#3498db";
  }
}

// --- Autocorrelation Pitch Detection ---
function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);

  // Not enough signal
  if (rms < 0.01) return -1;

  // Find the autocorrelation
  let r1 = 0, r2 = SIZE - 1;
  const threshold = 0.2;

  // Trim edges where signal is below threshold
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < threshold) { r2 = SIZE - i; break; }
  }

  const trimmedBuffer = buffer.slice(r1, r2);
  const trimmedSize = trimmedBuffer.length;

  // Autocorrelation
  const c = new Float32Array(trimmedSize);
  for (let i = 0; i < trimmedSize; i++) {
    for (let j = 0; j < trimmedSize - i; j++) {
      c[i] += trimmedBuffer[j] * trimmedBuffer[j + i];
    }
  }

  // Find first dip
  let d = 0;
  while (c[d] > c[d + 1] && d < trimmedSize - 1) d++;

  // Find the peak after the dip
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < trimmedSize; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }

  let T0 = maxPos;

  // Parabolic interpolation for better precision
  if (T0 > 0 && T0 < trimmedSize - 1) {
    const x1 = c[T0 - 1];
    const x2 = c[T0];
    const x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
  }

  return sampleRate / T0;
}

// --- Audio Setup ---
let audioContext = null;
let analyser = null;
let mediaStream = null;
let isListening = false;
let animFrameId = null;

// Session data
let sessionStart = null;
let sessionData = []; // { time, frequency, note, octave, cents }
let sessionTimerId = null;

async function toggleListening() {
  if (isListening) {
    stopListening();
  } else {
    await startListening();
  }
}

async function startListening() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);

    isListening = true;
    sessionStart = Date.now();
    sessionData = [];

    const btn = document.getElementById("start-btn");
    btn.querySelector("span").textContent = t("stop");
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-stop");

    document.getElementById("session-section").style.display = "";

    // Start duration timer
    sessionTimerId = setInterval(updateSessionDuration, 1000);

    detect();
  } catch (err) {
    alert(t("mic_error"));
  }
}

function stopListening() {
  isListening = false;

  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (sessionTimerId) clearInterval(sessionTimerId);
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();

  const btn = document.getElementById("start-btn");
  btn.querySelector("span").textContent = t("start");
  btn.classList.remove("btn-stop");
  btn.classList.add("btn-primary");

  drawHistogram();
  updateSessionStats();
}

function detect() {
  if (!isListening) return;

  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);

  const freq = autoCorrelate(buffer, audioContext.sampleRate);

  if (freq > 0 && freq > 50 && freq < 4200) {
    const note = frequencyToNote(freq);
    updateDisplay(note);

    // Record data point
    sessionData.push({
      time: ((Date.now() - sessionStart) / 1000).toFixed(2),
      frequency: freq.toFixed(2),
      note: note.name,
      octave: note.octave,
      cents: note.cents,
    });

    updateSessionStats();
  }

  animFrameId = requestAnimationFrame(detect);
}

function updateDisplay(note) {
  document.getElementById("note-name").textContent = note.name;
  document.getElementById("octave").textContent = note.octave;
  document.getElementById("frequency").textContent = note.frequency.toFixed(1) + " Hz";
  document.getElementById("cent-value").textContent = (note.cents >= 0 ? "+" : "") + note.cents;

  // Update meter needle position (cents range: -50 to +50)
  const needle = document.getElementById("meter-needle");
  const pct = 50 + (note.cents / 50) * 50;
  needle.style.left = Math.max(0, Math.min(100, pct)) + "%";

  // Color based on accuracy
  const noteName = document.getElementById("note-name");
  const absCents = Math.abs(note.cents);
  if (absCents <= 5) {
    noteName.style.color = "#27ae60";
  } else if (absCents <= 15) {
    noteName.style.color = "#f39c12";
  } else {
    noteName.style.color = "#e74c3c";
  }

  // Update direction indicator
  updateDirectionIndicator(note.cents);
}

function updateSessionDuration() {
  if (!sessionStart) return;
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  document.getElementById("session-duration").textContent = m + ":" + String(s).padStart(2, "0");
}

function updateSessionStats() {
  document.getElementById("notes-count").textContent = sessionData.length;
  if (sessionData.length > 0) {
    const avgCents = sessionData.reduce((sum, d) => sum + Math.abs(d.cents), 0) / sessionData.length;
    document.getElementById("avg-accuracy").textContent = avgCents.toFixed(1) + " ct";
  }
  // Update histogram periodically
  if (sessionData.length % 20 === 0) drawHistogram();
}

// --- Histogram ---
function drawHistogram() {
  const canvas = document.getElementById("histogram");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  if (sessionData.length === 0) return;

  // Create bins: -50 to +50 in 5-cent steps = 20 bins
  const binCount = 20;
  const bins = new Array(binCount).fill(0);
  for (const d of sessionData) {
    const binIdx = Math.floor((d.cents + 50) / 5);
    const clamped = Math.max(0, Math.min(binCount - 1, binIdx));
    bins[clamped]++;
  }

  const maxBin = Math.max(...bins, 1);
  const barWidth = (W - 20) / binCount;

  for (let i = 0; i < binCount; i++) {
    const barHeight = (bins[i] / maxBin) * (H - 20);
    const x = 10 + i * barWidth;
    const y = H - 10 - barHeight;

    // Color based on distance from center
    const distFromCenter = Math.abs(i - binCount / 2);
    if (distFromCenter <= 1) {
      ctx.fillStyle = "#27ae60";
    } else if (distFromCenter <= 3) {
      ctx.fillStyle = "#f39c12";
    } else {
      ctx.fillStyle = "#e74c3c";
    }

    ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
  }

  // Center line
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H - 10);
  ctx.stroke();
  ctx.setLineDash([]);
}

// --- CSV Download ---
function downloadCSV() {
  if (sessionData.length === 0) return;

  const bom = "\uFEFF";
  let csv = "Time(s),Frequency(Hz),Note,Octave,Cents\n";
  for (const d of sessionData) {
    csv += `${d.time},${d.frequency},${d.note},${d.octave},${d.cents}\n`;
  }

  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const now = new Date();
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  a.download = "kf-pitch-session-" + dateStr + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("lang-select").value = currentLang;
  document.documentElement.lang = currentLang;
  applyI18n();
  document.getElementById("reference-value").textContent = referenceA4;
});
