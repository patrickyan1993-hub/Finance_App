// GenAI Finance course, starter scaffold.
// This file intentionally does very little. Build on it during class.
//
// No API keys are stored in this file. Both the Twelve Data key and the
// OpenRouter key are entered in the form fields at run time, so nothing secret
// is ever committed to your public repo or shipped in the source.

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const ticker = document.getElementById('ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim();
  const openRouterKey = document.getElementById('openrouter-key').value.trim();

  results.innerHTML = '<p>Loading...</p>';

  try {
    const priceData = await fetchPriceData(ticker, twelveDataKey);
    const note = await getResearchNote(ticker, priceData, openRouterKey);
    renderResults(ticker, priceData, note);
  } catch (err) {
    results.innerHTML = `<p class="error">Something went wrong: ${err.message}</p>`;
  }
});

// Twelve Data daily price history.
// This endpoint sends CORS headers, so it works directly from the browser.
// The free plan covers all US equities and ETFs (no ticker whitelist).
// Returns an array of daily bars sorted oldest to newest, each shaped as
// { date, open, high, low, close, volume } with numeric values.
// Replace or extend with moving average, MACD, RSI calculations from Day 1.
async function fetchPriceData(ticker, apiKey) {
  // outputsize is the number of most-recent bars. ~63 trading days is about
  // 3 months; 90 leaves a little headroom. Max allowed is 5000.
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=90&apikey=${apiKey}`;
  const response = await fetch(url);

  // Read the body as text first, then parse it safely, so an unexpected
  // non-JSON response gives a readable error instead of "Unexpected token".
  const body = await response.text();
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(body.trim() || 'Price fetch failed');
  }

  // Twelve Data reports problems as { code, status: "error", message }.
  if (raw && raw.status === 'error') throw new Error(raw.message || 'Price fetch failed');
  if (!response.ok) throw new Error('Price fetch failed');

  // Successful responses look like { meta, values: [ { datetime, open, ... } ] },
  // newest first. Normalize to numbers and sort oldest to newest so indicator
  // math (moving averages, RSI, ...) reads left to right.
  const values = raw.values ?? [];
  if (!values.length) throw new Error(`No price data returned for ${ticker}`);

  return values
    .map((b) => ({
      date: b.datetime,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// OpenRouter call. The price data above is summarized and handed to the model
// so the note reflects the actual numbers you fetched. Replace the model,
// prompt, and system prompt with whatever you designed in the Prompt
// Engineering session.
async function getResearchNote(ticker, priceData, apiKey) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;

  const summary =
    `${ticker} daily closes from ${first.date} to ${latest.date}: ` +
    `start $${first.close.toFixed(2)}, latest $${latest.close.toFixed(2)}, ` +
    `change ${pctChange.toFixed(1)}% over ${priceData.length} trading days.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      // Sonnet 5 is a reasoning model. If max_tokens is too small to also cover
      // its reasoning tokens, the request is rejected with a 400 "Provider
      // returned error". This note is short, so turn reasoning off and leave
      // comfortable headroom for the reply.
      max_tokens: 2000,
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: 'You are a financial research assistant. Be concise and factual.' },
        { role: 'user', content: `${summary}\n\nWrite a one paragraph research note for ${ticker} based on this recent price action.` }
      ]
    })
  });
  // Surface what OpenRouter actually said, so a failed call tells you the real
  // reason (bad key, no credits, rate limit, provider error) instead of a
  // generic message you cannot act on.
  if (!response.ok) throw new Error(`OpenRouter call failed. ${await readOpenRouterError(response)}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No response.';
}

// Pulls the useful part out of an OpenRouter error response: the HTTP status,
// a plain-language hint for the common cases, and the message OpenRouter (or
// the upstream provider) actually returned.
async function readOpenRouterError(response) {
  let message = '';
  try {
    const body = await response.json();
    const err = body.error ?? body;
    message = err.message || '';
    // On a "Provider returned error", the provider's own message is under
    // metadata rather than the top-level message field.
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {
    // Response body was not JSON; the status code below still says something.
  }
  const hint = {
    401: 'Your API key looks invalid or missing',
    402: 'This model is paid and your OpenRouter account is out of credits',
    429: 'Rate limited, wait a moment and try again'
  }[response.status];
  return [`(HTTP ${response.status})`, hint, message].filter(Boolean).join(' ');
}

function renderResults(ticker, priceData, note) {
  // priceData is sorted oldest to newest, so the last bar is the most recent.
  const latest = priceData[priceData.length - 1];

  results.innerHTML = `
    <h2>${ticker}</h2>
    <p class="price">Latest close (${latest.date}): $${latest.close.toFixed(2)}</p>
    <p class="note">${note}</p>
  `;
}

// Background Candy Rain Effect
(function initCandyRain() {
  const canvas = document.getElementById('candy-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const candies = ['🍬', '🍭', '🍫', '🍩', '🧁', '🍪', '🍰', '🍡', '🍿', '🍨', '🍦', '🎂', '🍬', '🍭', '🍒', '🍓', '🍇'];
  const particleCount = 50;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height - height,
      size: 22 + Math.random() * 24,
      speedY: 1.2 + Math.random() * 2.8,
      speedX: (Math.random() - 0.5) * 1.2,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.04,
      swayOffset: Math.random() * Math.PI * 2,
      swaySpeed: 0.01 + Math.random() * 0.02,
      emoji: candies[Math.floor(Math.random() * candies.length)]
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.y += p.speedY;
      p.swayOffset += p.swaySpeed;
      p.x += Math.sin(p.swayOffset) * 0.8 + p.speedX;
      p.rotation += p.rotationSpeed;

      if (p.y > height + 60) {
        p.y = -60;
        p.x = Math.random() * width;
        p.emoji = candies[Math.floor(Math.random() * candies.length)];
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.font = `${p.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    }

    requestAnimationFrame(render);
  }

  render();
})();

// Annoying & Catchy Candy Chiptune Background Soundtrack
(function initSoundtrack() {
  const toggleBtn = document.getElementById('music-toggle');
  if (!toggleBtn) return;

  let audioCtx = null;
  let isPlaying = false;
  let timerId = null;
  let step = 0;

  // Frequencies in Hz
  const NOTES = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, Rest: 0
  };

  // Upbeat, bouncy, repetitive 32-step arcade candy tune
  const melodyPattern = [
    'E5', 'G5', 'C6', 'E5', 'G5', 'C6', 'B5', 'G5',
    'A5', 'F5', 'A5', 'C6', 'G5', 'E5', 'G5', 'C6',
    'F5', 'A5', 'D6', 'F5', 'E5', 'G5', 'C6', 'E5',
    'D5', 'F5', 'B5', 'D5', 'C5', 'E5', 'G5', 'C6',

    'E5', 'G5', 'C6', 'E5', 'G5', 'C6', 'D6', 'C6',
    'B5', 'G5', 'B5', 'D6', 'C6', 'A5', 'F5', 'D5',
    'C5', 'E5', 'G5', 'C6', 'D5', 'F5', 'A5', 'D6',
    'E5', 'G5', 'C6', 'E6', 'D6', 'B5', 'C6', 'Rest'
  ];

  const bassPattern = [
    'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'E4', 'E4',
    'F4', 'F4', 'C4', 'C4', 'G4', 'G4', 'G4', 'B4',
    'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'F4', 'F4',
    'G4', 'G4', 'G4', 'G4', 'C4', 'E4', 'G4', 'C4'
  ];

  function playStep() {
    if (!isPlaying || !audioCtx) return;

    const now = audioCtx.currentTime;
    const noteName = melodyPattern[step % melodyPattern.length];
    const bassName = bassPattern[Math.floor(step / 2) % bassPattern.length];

    // Lead Pulse Synth (Bright bouncy chiptune sound)
    if (noteName && noteName !== 'Rest' && NOTES[noteName]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(NOTES[noteName], now);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
    }

    // Bass Synth (Warm bouncy backing)
    if (step % 2 === 0 && bassName && NOTES[bassName]) {
      const bassOsc = audioCtx.createOscillator();
      const bassGain = audioCtx.createGain();

      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(NOTES[bassName] / 2, now); // 1 octave lower

      bassGain.gain.setValueAtTime(0.12, now);
      bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      bassOsc.connect(bassGain);
      bassGain.connect(audioCtx.destination);

      bassOsc.start(now);
      bassOsc.stop(now + 0.23);
    }

    // Cheerful Percussion Pop on beats
    if (step % 4 === 0) {
      const popOsc = audioCtx.createOscillator();
      const popGain = audioCtx.createGain();

      popOsc.type = 'sine';
      popOsc.frequency.setValueAtTime(800, now);
      popOsc.frequency.exponentialRampToValueAtTime(150, now + 0.05);

      popGain.gain.setValueAtTime(0.08, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      popOsc.connect(popGain);
      popGain.connect(audioCtx.destination);

      popOsc.start(now);
      popOsc.stop(now + 0.06);
    }

    step++;
  }

  function startMusic() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    isPlaying = true;
    step = 0;
    toggleBtn.classList.add('playing');
    toggleBtn.innerHTML = '🎵 Background Music: ON 🎶';

    // ~140 BPM (107ms per 16th note step)
    timerId = setInterval(playStep, 107);
  }

  function stopMusic() {
    isPlaying = false;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    toggleBtn.classList.remove('playing');
    toggleBtn.innerHTML = '🔇 Background Music: OFF';
  }

  toggleBtn.addEventListener('click', () => {
    if (isPlaying) {
      stopMusic();
    } else {
      startMusic();
    }
  });
})();

