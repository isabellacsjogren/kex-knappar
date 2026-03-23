(function () {
  'use strict';

  const STORAGE_KEY = 'knappstudie_all_data';
  const HEADERS = ['session_id', 'trial', 'left_color', 'left_shape', 'right_color', 'right_shape', 'pair_sv', 'chosen', 'chosen_color', 'chosen_shape', 'chosen_sv', 'against_sv', 'rt_s'];

  const VARIANT_KEYS = ['red-rounded', 'red-sharp', 'green-rounded', 'green-sharp', 'blue-rounded', 'blue-sharp'];
  const LABELS = {
    'red-rounded': 'Röd rundad',
    'red-sharp': 'Röd kantig',
    'green-rounded': 'Grön rundad',
    'green-sharp': 'Grön kantig',
    'blue-rounded': 'Blå rundad',
    'blue-sharp': 'Blå kantig'
  };

  function getStoredData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function setStoredData(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  /** Delar en CSV-rad med hänsyn till citattecken (fält med komma). */
  function parseCSVLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(function (ln) { return ln.length > 0; });
    if (lines.length < 2) return [];
    const header = parseCSVLine(lines[0]).map(function (h) { return h.trim(); });
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      const row = {};
      header.forEach(function (h, j) {
        row[h] = parts[j] != null ? String(parts[j]).trim() : '';
      });
      rows.push(row);
    }
    return rows;
  }

  function rowToKey(row) {
    if (row.chosen_color && row.chosen_shape) {
      return row.chosen_color + '-' + row.chosen_shape;
    }
    return row.chosen === 'left'
      ? row.left_color + '-' + row.left_shape
      : row.right_color + '-' + row.right_shape;
  }

  function getSummaryFromRows(rows) {
    const counts = {};
    const sumMs = {};
    const nTimed = {};
    VARIANT_KEYS.forEach(function (k) {
      counts[k] = 0;
      sumMs[k] = 0;
      nTimed[k] = 0;
    });
    rows.forEach(function (row) {
      const key = rowToKey(row);
      if (counts[key] === undefined) return;
      counts[key] += 1;
      const ms = reactionMsFromRow(row);
      if (ms != null) {
        sumMs[key] += ms;
        nTimed[key] += 1;
      }
    });
    return VARIANT_KEYS.map(function (k) {
      const n = counts[k];
      const nt = nTimed[k];
      const meanS = nt > 0 ? sumMs[k] / nt / 1000 : null;
      return { key: k, label: LABELS[k], count: n, meanS: meanS };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  function overallMeanTimeS(rows) {
    let sum = 0;
    let n = 0;
    rows.forEach(function (row) {
      const ms = reactionMsFromRow(row);
      if (ms != null) {
        sum += ms;
        n += 1;
      }
    });
    return n > 0 ? sum / n / 1000 : null;
  }

  function formatMeanS(meanS) {
    if (meanS == null || isNaN(meanS)) return '–';
    return meanS.toFixed(2).replace('.', ',') + ' s';
  }

  function countSessions(rows) {
    const ids = new Set();
    rows.forEach(function (r) { ids.add(r.session_id); });
    return ids.size;
  }

  function renderAggregateSummary(rows) {
    const container = document.getElementById('aggregate-summary');
    const statsEl = document.getElementById('stored-stats');
    const btnDownload = document.getElementById('btn-download-all');
    if (!container || !statsEl) return;

    if (rows.length === 0) {
      statsEl.textContent = 'Inga resultat sparade ännu.';
      container.classList.add('hidden');
      container.innerHTML = '';
      if (btnDownload) btnDownload.disabled = true;
      return;
    }

    const sessions = countSessions(rows);
    const overallMean = overallMeanTimeS(rows);
    let statsText = sessions + ' sessioner.';
    if (overallMean != null) {
      statsText += ' Genomsnittlig tid för alla val med tidsdata: ' + formatMeanS(overallMean) + '.';
    } else {
      statsText += ' Ingen tidsdata (rt_s) hittades – kontrollera att CSV innehåller kolumnen rt_s.';
    }
    statsEl.textContent = statsText;

    const summary = getSummaryFromRows(rows);
    container.innerHTML = '<p class="summary-title">Sammanställning (alla deltagare)</p><p class="summary-hint">Tid = medel av <code>rt_s</code> (sekunder) för val där den knappen valdes. Importerade rader får <code>reaction_ms</code> från <code>rt_s</code>.</p><table class="summary-table"><thead><tr><th>Knapp</th><th>Antal val</th><th>Medel tid (s)</th></tr></thead><tbody>' +
      summary.map(function (s) {
        return '<tr><td>' + s.label + '</td><td>' + s.count + '</td><td>' + formatMeanS(s.meanS) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
    container.classList.remove('hidden');
    if (btnDownload) btnDownload.disabled = false;
  }

  function addData(newRows) {
    const valid = newRows.filter(function (r) {
      return r.session_id != null && r.chosen != null && r.left_color != null;
    });
    if (valid.length === 0) return 0;
    const stored = getStoredData();
    const combined = stored.concat(valid);
    setStoredData(combined);
    return valid.length;
  }

  function showMessage(msg, type) {
    const el = document.getElementById('import-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'message ' + (type || '');
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result != null ? reader.result.toString() : '');
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Sätter reaction_ms (millisekunder) från rt_s (sekunder med decimaler), äldre rt (ms) eller reaction_ms.
   */
  function normalizeImportedRow(r) {
    if (r.reaction_ms != null && r.reaction_ms !== '') {
      r.reaction_ms = Math.round(Number(r.reaction_ms));
      return r;
    }
    if (r.rt_s != null && r.rt_s !== '') {
      const s = parseFloat(String(r.rt_s).replace(',', '.'), 10);
      if (!isNaN(s)) r.reaction_ms = Math.round(s * 1000);
      return r;
    }
    if (r.rt != null && r.rt !== '') {
      const v = parseFloat(String(r.rt).replace(',', '.'), 10);
      if (!isNaN(v)) {
        if (v > 20) r.reaction_ms = Math.round(v);
        else r.reaction_ms = Math.round(v * 1000);
      }
    }
    return r;
  }

  function labelFromColorShape(c, s) {
    if (!c || !s) return '';
    var COL = { red: 'Röd', green: 'Grön', blue: 'Blå' };
    var SH = { rounded: 'rundad', sharp: 'kantig' };
    return COL[c] + ' ' + SH[s];
  }

  function pairSvFromRow(r) {
    if (r.pair_sv != null && String(r.pair_sv).trim() !== '') return String(r.pair_sv).trim();
    var a = labelFromColorShape(r.left_color, r.left_shape);
    var b = labelFromColorShape(r.right_color, r.right_shape);
    if (a && b) return a + ' vs ' + b;
    return '';
  }

  function chosenSvFromRow(r) {
    if (r.chosen_sv != null && String(r.chosen_sv).trim() !== '') return String(r.chosen_sv).trim();
    if (r.chosen_color && r.chosen_shape) return labelFromColorShape(r.chosen_color, r.chosen_shape);
    if (r.chosen === 'left') return labelFromColorShape(r.left_color, r.left_shape);
    if (r.chosen === 'right') return labelFromColorShape(r.right_color, r.right_shape);
    return '';
  }

  function againstSvFromRow(r) {
    if (r.against_sv != null && String(r.against_sv).trim() !== '') return String(r.against_sv).trim();
    if (r.chosen === 'left') return labelFromColorShape(r.right_color, r.right_shape);
    if (r.chosen === 'right') return labelFromColorShape(r.left_color, r.left_shape);
    return '';
  }

  function reactionMsFromRow(r) {
    if (r.reaction_ms != null && r.reaction_ms !== '') {
      const n = Number(r.reaction_ms);
      return isNaN(n) ? null : n;
    }
    if (r.rt_s != null && r.rt_s !== '') {
      const s = parseFloat(String(r.rt_s).replace(',', '.'), 10);
      return !isNaN(s) ? Math.round(s * 1000) : null;
    }
    if (r.rt != null && r.rt !== '') {
      const v = parseFloat(String(r.rt).replace(',', '.'), 10);
      if (isNaN(v)) return null;
      if (v > 20) return Math.round(v);
      return Math.round(v * 1000);
    }
    return null;
  }

  function doImportRows(rows) {
    if (!rows || rows.length === 0) {
      showMessage('Kunde inte läsa några rader. Kontrollera CSV-formatet.', 'error');
      return;
    }
    rows = rows.map(normalizeImportedRow);
    const added = addData(rows);
    renderAggregateSummary(getStoredData());
    showMessage(added + ' rader lades till.', 'success');
  }

  function importFromFileList(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    if (files.length === 0) {
      showMessage('Inga filer att importera.', 'error');
      return;
    }
    Promise.all(files.map(function (f) {
      return readFileAsText(f);
    })).then(function (texts) {
      let allRows = [];
      texts.forEach(function (text) {
        allRows = allRows.concat(parseCSV(text));
      });
      doImportRows(allRows);
    }).catch(function () {
      showMessage('Kunde inte läsa en eller flera filer.', 'error');
    });
  }

  function downloadAll() {
    const rows = getStoredData();
    if (rows.length === 0) return;
    function csvCell(r, h) {
      if (h === 'rt_s') {
        const ms = reactionMsFromRow(r);
        return ms != null ? (ms / 1000).toFixed(2) : '';
      }
      if (h === 'pair_sv') return pairSvFromRow(r);
      if (h === 'chosen_sv') return chosenSvFromRow(r);
      if (h === 'against_sv') return againstSvFromRow(r);
      return r[h] != null ? r[h] : '';
    }
    const csv = HEADERS.join(',') + '\n' + rows.map(function (r) {
      return HEADERS.map(function (h) { return csvCell(r, h); }).join(',');
    }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alla_resultat.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearData() {
    if (!confirm('Vill du verkligen rensa all sparad data? Detta går inte att ångra.')) return;
    setStoredData([]);
    renderAggregateSummary([]);
    showMessage('Sparad data är rensad.', 'success');
  }

  function bindDropZone(dropZone) {
    let dragCounter = 0;

    dropZone.addEventListener('dragenter', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter += 1;
      dropZone.classList.add('drop-zone--dragover');
    });

    dropZone.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter -= 1;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropZone.classList.remove('drop-zone--dragover');
      }
    });

    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    });

    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      dropZone.classList.remove('drop-zone--dragover');
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        importFromFileList(dt.files);
      }
    });
  }

  function init() {
    renderAggregateSummary(getStoredData());

    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      bindDropZone(dropZone);
    }

    const btnDownload = document.getElementById('btn-download-all');
    if (btnDownload) btnDownload.addEventListener('click', downloadAll);

    const btnClear = document.getElementById('btn-clear');
    if (btnClear) btnClear.addEventListener('click', clearData);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
