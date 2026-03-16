(function () {
  'use strict';

  const STORAGE_KEY = 'knappstudie_all_data';
  const HEADERS = ['session_id', 'trial', 'left_color', 'left_shape', 'right_color', 'right_shape', 'chosen', 'reaction_ms'];

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

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(function (h) { return h.trim(); });
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const row = {};
      header.forEach(function (h, j) {
        row[h] = parts[j] != null ? String(parts[j]).trim() : '';
      });
      rows.push(row);
    }
    return rows;
  }

  function rowToKey(row) {
    return row.chosen === 'left'
      ? row.left_color + '-' + row.left_shape
      : row.right_color + '-' + row.right_shape;
  }

  function getSummaryFromRows(rows) {
    const counts = {};
    VARIANT_KEYS.forEach(function (k) {
      counts[k] = { label: LABELS[k], count: 0 };
    });
    rows.forEach(function (row) {
      const key = rowToKey(row);
      if (counts[key]) counts[key].count += 1;
    });
    return VARIANT_KEYS.map(function (k) {
      return { key: k, label: counts[k].label, count: counts[k].count };
    }).sort(function (a, b) { return b.count - a.count; });
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
    statsEl.textContent = sessions + ' sessioner.';

    const summary = getSummaryFromRows(rows);
    container.innerHTML = '<p class="summary-title">Sammanställning (alla deltagare)</p><table class="summary-table"><thead><tr><th>Knapp</th><th>Antal val</th></tr></thead><tbody>' +
      summary.map(function (s) {
        return '<tr><td>' + s.label + '</td><td>' + s.count + '</td></tr>';
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

  function handleImport() {
    const fileInput = document.getElementById('csv-file');
    const pasteEl = document.getElementById('csv-paste');
    const pastedText = (pasteEl && pasteEl.value.trim()) || '';

    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      let filesLeft = fileInput.files.length;
      let allRows = [];
      function onFileDone() {
        filesLeft--;
        if (filesLeft > 0) return;
        if (pastedText) {
          allRows = allRows.concat(parseCSV(pastedText));
        }
        doImportRows(allRows);
      }
      for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        const reader = new FileReader();
        reader.onload = (function (idx) {
          return function () {
            const text = (reader.result && reader.result.toString()) || '';
            allRows = allRows.concat(parseCSV(text));
            onFileDone();
          };
        })(i);
        reader.readAsText(file, 'UTF-8');
      }
      return;
    }

    if (pastedText) {
      doImport(parseCSV(pastedText));
    } else {
      showMessage('Klistra in CSV eller välj en eller flera filer.', 'error');
    }
  }

  function doImportRows(rows) {
    if (!rows || rows.length === 0) {
      showMessage('Kunde inte läsa några rader. Kontrollera CSV-formatet.', 'error');
      return;
    }
    const added = addData(rows);
    renderAggregateSummary(getStoredData());
    showMessage(added + ' rader lades till.', 'success');
    const pasteEl = document.getElementById('csv-paste');
    if (pasteEl) pasteEl.value = '';
    const fileInput = document.getElementById('csv-file');
    if (fileInput) fileInput.value = '';
  }

  function doImport(rows) {
    doImportRows(rows);
  }

  function downloadAll() {
    const rows = getStoredData();
    if (rows.length === 0) return;
    const csv = HEADERS.join(',') + '\n' + rows.map(function (r) {
      return HEADERS.map(function (h) { return r[h] != null ? r[h] : ''; }).join(',');
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

  function init() {
    renderAggregateSummary(getStoredData());

    const btnImport = document.getElementById('btn-import');
    if (btnImport) btnImport.addEventListener('click', handleImport);

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
