// GenAI Finance course, starter scaffold.
// This file intentionally does very little. Build on it during class.
//
// No API keys are stored in this file. Both the Twelve Data key and the
// OpenRouter key are entered in the form fields at run time, so nothing secret
// is ever committed to your public repo or shipped in the source.

import Chart from 'chart.js/auto';

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');

let maChartInstance = null;
let macdChartInstance = null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const ticker = document.getElementById('ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim();
  const openRouterKey = document.getElementById('openrouter-key').value.trim();

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '🦄 Analyzing...';
  }

  results.innerHTML = `
    <div class="unicorn-loader-box">
      <div class="unicorn-track">
        <div class="rainbow-road"></div>
        <div class="unicorn-runner">🦄</div>
      </div>
      <p class="unicorn-loading-text">Galloping through market data... 🌈✨</p>
    </div>
  `;

  try {
    const priceData = await fetchPriceData(ticker, twelveDataKey);
    const note = await getResearchNote(ticker, priceData, openRouterKey);
    renderResults(ticker, priceData, note);
  } catch (err) {
    results.innerHTML = `<p class="error">Something went wrong: ${err.message}</p>`;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Analyze';
    }
  }
});

// Twelve Data daily price history.
async function fetchPriceData(ticker, apiKey) {
  // outputsize=300 ensures enough historical daily bars for accurate 200-day MA & MACD calculation
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=300&apikey=${apiKey}`;
  const response = await fetch(url);

  const body = await response.text();
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(body.trim() || 'Price fetch failed');
  }

  if (raw && raw.status === 'error') throw new Error(raw.message || 'Price fetch failed');
  if (!response.ok) throw new Error('Price fetch failed');

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

// Indicator Calculation Functions
function calculateSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j].close;
      }
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(values, period) {
  const k = 2 / (period + 1);
  const result = [];
  let ema = null;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val === null || val === undefined) {
      result.push(null);
      continue;
    }
    if (ema === null) {
      ema = val;
    } else {
      ema = val * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

function calculateMACD(data) {
  const closes = data.map((d) => d.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine.push(ema12[i] - ema26[i]);
    } else {
      macdLine.push(null);
    }
  }

  const signalLine = calculateEMA(macdLine, 9);

  const histogram = [];
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram.push(macdLine[i] - signalLine[i]);
    } else {
      histogram.push(null);
    }
  }

  return { macdLine, signalLine, histogram };
}

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
      max_tokens: 2000,
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: 'You are a financial research assistant. Be concise and factual.' },
        { role: 'user', content: `${summary}\n\nWrite a one paragraph research note for ${ticker} based on this recent price action.` }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenRouter call failed. ${await readOpenRouterError(response)}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No response.';
}

async function readOpenRouterError(response) {
  let message = '';
  try {
    const body = await response.json();
    const err = body.error ?? body;
    message = err.message || '';
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {}
  const hint = {
    401: 'Your API key looks invalid or missing',
    402: 'This model is paid and your OpenRouter account is out of credits',
    429: 'Rate limited, wait a moment and try again'
  }[response.status];
  return [`(HTTP ${response.status})`, hint, message].filter(Boolean).join(' ');
}

function renderResults(ticker, priceData, note) {
  const latest = priceData[priceData.length - 1];

  // Calculate Moving Averages and MACD across all available historical bars
  const sma50Full = calculateSMA(priceData, 50);
  const sma200Full = calculateSMA(priceData, 200);
  const macdFull = calculateMACD(priceData);

  // Slice the last 120 trading days for clear, responsive plotting
  const sliceCount = Math.min(120, priceData.length);
  const plottedData = priceData.slice(-sliceCount);
  const plottedSMA50 = sma50Full.slice(-sliceCount);
  const plottedSMA200 = sma200Full.slice(-sliceCount);
  const plottedMACD = macdFull.macdLine.slice(-sliceCount);
  const plottedSignal = macdFull.signalLine.slice(-sliceCount);
  const plottedHist = macdFull.histogram.slice(-sliceCount);

  // Calculate MACD Crossover Signals (BUY when MACD line crosses above Signal line, SELL when MACD crosses below)
  const buySignalsMACD = [];
  const sellSignalsMACD = [];
  const buySignalsPrice = [];
  const sellSignalsPrice = [];
  const signalEvents = [];

  let latestSignal = null;

  for (let i = 0; i < plottedData.length; i++) {
    if (i === 0 || plottedMACD[i] === null || plottedSignal[i] === null || plottedMACD[i - 1] === null || plottedSignal[i - 1] === null) {
      buySignalsMACD.push(null);
      sellSignalsMACD.push(null);
      buySignalsPrice.push(null);
      sellSignalsPrice.push(null);
      continue;
    }

    const prevMacd = plottedMACD[i - 1];
    const prevSig = plottedSignal[i - 1];
    const currMacd = plottedMACD[i];
    const currSig = plottedSignal[i];

    // Bullish Crossover (BUY)
    if (prevMacd < prevSig && currMacd >= currSig) {
      buySignalsMACD.push(currMacd);
      sellSignalsMACD.push(null);
      buySignalsPrice.push(plottedData[i].close);
      sellSignalsPrice.push(null);

      const evt = { type: 'BUY', date: plottedData[i].date, price: plottedData[i].close, macd: currMacd };
      signalEvents.push(evt);
      latestSignal = evt;
    }
    // Bearish Crossover (SELL)
    else if (prevMacd > prevSig && currMacd <= currSig) {
      buySignalsMACD.push(null);
      sellSignalsMACD.push(currMacd);
      buySignalsPrice.push(null);
      sellSignalsPrice.push(plottedData[i].close);

      const evt = { type: 'SELL', date: plottedData[i].date, price: plottedData[i].close, macd: currMacd };
      signalEvents.push(evt);
      latestSignal = evt;
    } else {
      buySignalsMACD.push(null);
      sellSignalsMACD.push(null);
      buySignalsPrice.push(null);
      sellSignalsPrice.push(null);
    }
  }

  // Latest indicator values
  const lastSMA50 = plottedSMA50[plottedSMA50.length - 1];
  const lastSMA200 = plottedSMA200[plottedSMA200.length - 1];
  const lastMACD = plottedMACD[plottedMACD.length - 1];
  const lastSignal = plottedSignal[plottedSignal.length - 1];

  const crossBadge =
    lastSMA50 && lastSMA200
      ? lastSMA50 >= lastSMA200
        ? `<span class="badge badge-bullish">Golden Cross 🚀</span>`
        : `<span class="badge badge-bearish">Death Cross 📉</span>`
      : '';

  const macdBadge =
    lastMACD !== null && lastSignal !== null
      ? lastMACD >= lastSignal
        ? `<span class="badge badge-bullish">Bullish Momentum 📈</span>`
        : `<span class="badge badge-bearish">Bearish Momentum 📉</span>`
      : '';

  const latestSignalBadge = latestSignal
    ? `<span class="badge ${latestSignal.type === 'BUY' ? 'badge-bullish' : 'badge-bearish'}">Latest Signal: ${latestSignal.type} (${latestSignal.date})</span>`
    : '';

  // Render Signal Log Table rows (most recent first)
  const recentEvents = [...signalEvents].reverse().slice(0, 5);
  const signalRows = recentEvents.length
    ? recentEvents
        .map(
          (evt) => `
      <tr class="signal-row ${evt.type === 'BUY' ? 'row-buy' : 'row-sell'}">
        <td><strong>${evt.date}</strong></td>
        <td><span class="badge ${evt.type === 'BUY' ? 'badge-bullish' : 'badge-bearish'}">${evt.type === 'BUY' ? '🟢 BUY' : '🔴 SELL'}</span></td>
        <td>$${evt.price.toFixed(2)}</td>
        <td>${evt.macd.toFixed(3)}</td>
      </tr>
    `
        )
        .join('')
    : `<tr><td colspan="4" style="text-align:center; color:#8e52a8;">No crossovers detected in the plotted window</td></tr>`;

  results.innerHTML = `
    <div class="result-header">
      <h2>${ticker}</h2>
      <p class="price">Latest close (${latest.date}): <strong>$${latest.close.toFixed(2)}</strong></p>
    </div>

    <p class="note">${note}</p>

    <!-- Price & Moving Averages Chart -->
    <div class="chart-container">
      <div class="chart-header">
        <h3 class="chart-title">Price & Moving Averages (50D & 200D)</h3>
        <div class="indicator-badges">
          ${lastSMA50 ? `<span class="badge badge-ma50">50D MA: $${lastSMA50.toFixed(2)}</span>` : ''}
          ${lastSMA200 ? `<span class="badge badge-ma200">200D MA: $${lastSMA200.toFixed(2)}</span>` : ''}
          ${crossBadge}
        </div>
      </div>
      <div class="canvas-wrapper">
        <canvas id="ma-chart"></canvas>
      </div>
    </div>

    <!-- MACD Chart -->
    <div class="chart-container">
      <div class="chart-header">
        <h3 class="chart-title">MACD (12, 26, 9) & Buy/Sell Signals</h3>
        <div class="indicator-badges">
          ${lastMACD !== null ? `<span class="badge badge-macd">MACD: ${lastMACD.toFixed(2)}</span>` : ''}
          ${macdBadge}
          ${latestSignalBadge}
        </div>
      </div>
      <div class="canvas-wrapper">
        <canvas id="macd-chart"></canvas>
      </div>
    </div>

    <!-- MACD Signal History Table -->
    <div class="signal-log-container">
      <h3 class="signal-log-title">🎯 MACD Crossover Buy & Sell Signals History</h3>
      <div class="signal-table-wrapper">
        <table class="signal-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Signal</th>
              <th>Stock Price</th>
              <th>MACD Line</th>
            </tr>
          </thead>
          <tbody>
            ${signalRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Destroy previous chart instances if re-analyzing
  if (maChartInstance) {
    maChartInstance.destroy();
    maChartInstance = null;
  }
  if (macdChartInstance) {
    macdChartInstance.destroy();
    macdChartInstance = null;
  }

  const labels = plottedData.map((d) => d.date);

  // Render Moving Averages Chart with Buy/Sell Signal Overlays
  const maCtx = document.getElementById('ma-chart').getContext('2d');
  maChartInstance = new Chart(maCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Close Price',
          data: plottedData.map((d) => d.close),
          borderColor: '#ff2a85',
          backgroundColor: 'rgba(255, 42, 133, 0.08)',
          fill: true,
          tension: 0.15,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5
        },
        {
          label: '50-Day SMA',
          data: plottedSMA50,
          borderColor: '#ffcf00',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2
        },
        {
          label: '200-Day SMA',
          data: plottedSMA200,
          borderColor: '#9b51e0',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2
        },
        {
          label: 'BUY Signal 🟢',
          data: buySignalsPrice,
          borderColor: 'transparent',
          backgroundColor: '#00e676',
          pointBackgroundColor: '#00e676',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointStyle: 'triangle',
          pointRadius: 8,
          pointHoverRadius: 12,
          showLine: false
        },
        {
          label: 'SELL Signal 🔴',
          data: sellSignalsPrice,
          borderColor: 'transparent',
          backgroundColor: '#ff1744',
          pointBackgroundColor: '#ff1744',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointStyle: 'triangle',
          rotation: 180,
          pointRadius: 8,
          pointHoverRadius: 12,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { font: { family: 'Quicksand, sans-serif', weight: '700' }, color: '#331045' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8e52a8', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.4)' }
        },
        y: {
          ticks: { color: '#8e52a8', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });

  // Render MACD Chart with Highlighted Crossover Points
  const macdCtx = document.getElementById('macd-chart').getContext('2d');
  macdChartInstance = new Chart(macdCtx, {
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'MACD Line',
          data: plottedMACD,
          borderColor: '#ff2a85',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2
        },
        {
          type: 'line',
          label: 'Signal Line',
          data: plottedSignal,
          borderColor: '#00d2ff',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2
        },
        {
          type: 'bar',
          label: 'Histogram',
          data: plottedHist,
          backgroundColor: plottedHist.map((val) => (val >= 0 ? '#00e676' : '#ff1744')),
          borderRadius: 2
        },
        {
          type: 'line',
          label: 'BUY Point 🟢',
          data: buySignalsMACD,
          borderColor: 'transparent',
          backgroundColor: '#00e676',
          pointBackgroundColor: '#00e676',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2.5,
          pointStyle: 'triangle',
          pointRadius: 9,
          pointHoverRadius: 13,
          showLine: false
        },
        {
          type: 'line',
          label: 'SELL Point 🔴',
          data: sellSignalsMACD,
          borderColor: 'transparent',
          backgroundColor: '#ff1744',
          pointBackgroundColor: '#ff1744',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2.5,
          pointStyle: 'triangle',
          rotation: 180,
          pointRadius: 9,
          pointHoverRadius: 13,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { font: { family: 'Quicksand, sans-serif', weight: '700' }, color: '#331045' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8e52a8', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.4)' }
        },
        y: {
          ticks: { color: '#8e52a8', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });
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

