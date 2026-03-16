(function () {
  'use strict';

  const NUM_TRIALS = 12;
  const BUTTON_TEXT = 'Läs mer';

  const VARIANTS = [
    { color: 'red', shape: 'rounded' },
    { color: 'red', shape: 'sharp' },
    { color: 'green', shape: 'rounded' },
    { color: 'green', shape: 'sharp' },
    { color: 'blue', shape: 'rounded' },
    { color: 'blue', shape: 'sharp' }
  ];

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function variantKey(v) {
    return v.color + '-' + v.shape;
  }

  function pairKey(v1, v2) {
    return [variantKey(v1), variantKey(v2)].sort().join('|');
  }

  function pickTwoDifferent() {
    let a = randomInt(VARIANTS.length);
    let b = randomInt(VARIANTS.length);
    while (b === a) b = randomInt(VARIANTS.length);
    return [VARIANTS[a], VARIANTS[b]];
  }

  function buildTrials() {
    const trials = [];
    const usedPairs = new Set();
    while (trials.length < NUM_TRIALS) {
      const [v1, v2] = pickTwoDifferent();
      const key = pairKey(v1, v2);
      if (usedPairs.has(key)) continue;
      usedPairs.add(key);
      const order = Math.random() < 0.5 ? [v1, v2] : [v2, v1];
      trials.push({ left: order[0], right: order[1] });
    }
    return trials;
  }

  function generateSessionId() {
    return Date.now().toString(36) + '-' + randomInt(1e6);
  }

  const state = {
    sessionId: null,
    trials: [],
    currentTrial: 0,
    startTime: null,
    data: []
  };

  let dom = {};

  function initDom() {
    dom = {
      intro: document.getElementById('intro'),
      trial: document.getElementById('trial'),
      thankyou: document.getElementById('thankyou'),
    btnStart: document.getElementById('btn-start'),
    btnLeft: document.getElementById('btn-left'),
      btnRight: document.getElementById('btn-right'),
    btnDownload: document.getElementById('btn-download'),
    btnShowResults: document.getElementById('btn-show-results'),
    resultSummary: document.getElementById('result-summary'),
    btnNewTest: document.getElementById('btn-new-test')
  };
  }

  function showScreen(screen) {
    dom.intro.classList.add('hidden');
    dom.trial.classList.add('hidden');
    dom.thankyou.classList.add('hidden');
    screen.classList.remove('hidden');
  }

  function setButtonStyles(btn, variant) {
    btn.textContent = BUTTON_TEXT;
    btn.className = 'stimulus-btn btn-' + variant.color + ' btn-' + variant.shape;
  }

  function startTrial() {
    const t = state.trials[state.currentTrial];
    if (!t) return;

    setButtonStyles(dom.btnLeft, t.left);
    setButtonStyles(dom.btnRight, t.right);
    state.startTime = Date.now();
  }

  function recordChoice(chosen) {
    const t = state.trials[state.currentTrial];
    state.data.push({
      session_id: state.sessionId,
      trial: state.currentTrial + 1,
      left_color: t.left.color,
      left_shape: t.left.shape,
      right_color: t.right.color,
      right_shape: t.right.shape,
      chosen: chosen,
      reaction_ms: Date.now() - state.startTime
    });
  }

  function getSummary() {
    const counts = {};
    VARIANTS.forEach(function (v) {
      counts[variantKey(v)] = { label: variantLabel(v), count: 0 };
    });
    state.data.forEach(function (row) {
      const key = row.chosen === 'left' ? row.left_color + '-' + row.left_shape : row.right_color + '-' + row.right_shape;
      if (counts[key]) counts[key].count += 1;
    });
    return VARIANTS.map(function (v) {
      const k = variantKey(v);
      return { key: k, label: counts[k].label, count: counts[k].count };
    });
  }

  function variantLabel(v) {
    const colorNames = { red: 'Röd', green: 'Grön', blue: 'Blå' };
    const shapeNames = { rounded: 'rundad', sharp: 'kantig' };
    return colorNames[v.color] + ' ' + shapeNames[v.shape];
  }

  function renderSummary() {
    if (!dom.resultSummary) return;
    const summary = getSummary();
    summary.sort(function (a, b) { return b.count - a.count; });
    dom.resultSummary.innerHTML = '<table class="summary-table"><thead><tr><th>Knapp</th><th>Antal val</th></tr></thead><tbody>' +
      summary.map(function (s) {
        return '<tr><td>' + s.label + '</td><td>' + s.count + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  function onChoice(chosen) {
    recordChoice(chosen);
    state.currentTrial++;
    if (state.currentTrial >= NUM_TRIALS) {
      showScreen(dom.thankyou);
      hideResults();
    } else {
      startTrial();
    }
  }

  function hideResults() {
    if (dom.resultSummary) {
      dom.resultSummary.classList.add('hidden');
      dom.resultSummary.innerHTML = '';
    }
    if (dom.btnShowResults) {
      dom.btnShowResults.textContent = 'Visa mina resultat';
    }
  }

  function toggleResults() {
    if (!dom.resultSummary || !dom.btnShowResults) return;
    if (dom.resultSummary.classList.contains('hidden')) {
      renderSummary();
      dom.resultSummary.classList.remove('hidden');
      dom.btnShowResults.textContent = 'Dölj resultat';
    } else {
      dom.resultSummary.classList.add('hidden');
      dom.btnShowResults.textContent = 'Visa mina resultat';
    }
  }

  function downloadCSV() {
    if (state.data.length === 0) return;
    const headers = ['session_id', 'trial', 'left_color', 'left_shape', 'right_color', 'right_shape', 'chosen', 'reaction_ms'];
    const rows = state.data.map(function (row) {
      return headers.map(function (h) { return row[h]; }).join(',');
    });
    const csv = headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resultat.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function startExperiment() {
    state.sessionId = generateSessionId();
    state.trials = buildTrials();
    state.currentTrial = 0;
    state.data = [];
    showScreen(dom.trial);
    startTrial();
  }

  function startNewTest() {
    hideResults();
    state.data = [];
    state.currentTrial = 0;
    state.trials = [];
    state.sessionId = null;
    showScreen(dom.intro);
  }

  function init() {
    initDom();
    if (dom.btnStart) dom.btnStart.addEventListener('click', startExperiment);
    if (dom.btnLeft) dom.btnLeft.addEventListener('click', function () { onChoice('left'); });
    if (dom.btnRight) dom.btnRight.addEventListener('click', function () { onChoice('right'); });
    if (dom.btnDownload) dom.btnDownload.addEventListener('click', downloadCSV);
    if (dom.btnShowResults) dom.btnShowResults.addEventListener('click', toggleResults);
    if (dom.btnNewTest) dom.btnNewTest.addEventListener('click', startNewTest);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
