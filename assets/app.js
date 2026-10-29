(function () {
  'use strict';

  var T = window.TTL;
  var I = window.TTL_I18N || {};
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; });
  }

  /* ---------- state ---------- */

  var mode = 'single';
  var fmt = 'html';
  var current = null; // {text, html, url} of the last valid result
  var statusTimer = 0;
  var suppressSave = false; // examples must not overwrite the visitor's saved options
  var setFmtTab = function () {};

  var OPTION_IDS = ['o-newtab', 'o-nofollow', 'o-sponsored', 'o-ugc', 'o-hash', 'o-shorten', 'o-list'];

  function readOptions() {
    return {
      newTab: $('o-newtab').checked,
      nofollow: $('o-nofollow').checked,
      sponsored: $('o-sponsored').checked,
      ugc: $('o-ugc').checked,
      title: mode === 'single' ? $('o-title').value : '',
      params: $('o-params').value,
      hash: $('o-hash').checked,
      shorten: $('o-shorten').checked,
      list: $('o-list').checked
    };
  }

  function saveSettings() {
    if (suppressSave) return;
    var s = { fmt: fmt, params: $('o-params').value };
    OPTION_IDS.forEach(function (id) { s[id] = $(id).checked; });
    store.set('ttl-settings', JSON.stringify(s));
  }

  function loadSettings() {
    var s = null;
    try { s = JSON.parse(store.get('ttl-settings')); } catch (e) { /* ignore corrupt value */ }
    if (!s || typeof s !== 'object') return;
    OPTION_IDS.forEach(function (id) { if (typeof s[id] === 'boolean') $(id).checked = s[id]; });
    if (['keep', 'tracking', 'all'].indexOf(s.params) !== -1) $('o-params').value = s.params;
    if (document.querySelector('[data-fmt="' + s.fmt + '"]')) fmt = s.fmt;
  }

  /* ---------- tabs ---------- */

  function wireTabs(container, attr, onSelect) {
    var tabs = Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tab.focus();
      onSelect(tab.getAttribute(attr));
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        var rtl = root.dir === 'rtl';
        if (e.key === 'ArrowRight') next = tabs[(i + (rtl ? -1 : 1) + tabs.length) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i + (rtl ? 1 : -1) + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    return function setActive(value) {
      var tab = container.querySelector('[' + attr + '="' + value + '"]');
      if (tab) select(tab, false);
    };
  }

  function applyModeVisibility() {
    document.querySelectorAll('[data-modes]').forEach(function (el) {
      el.hidden = el.getAttribute('data-modes').split(' ').indexOf(mode) === -1;
    });
  }

  /* ---------- highlights ---------- */

  var MAX_HIGHLIGHTS = 10;

  function addHighlight() {
    var list = $('hl-list');
    if (list.children.length >= MAX_HIGHLIGHTS) return;
    list.appendChild($('hl-template').content.cloneNode(true));
    $('hl-add').hidden = list.children.length >= MAX_HIGHLIGHTS || $('hl-add').closest('[data-modes]').hidden;
  }

  function readHighlights() {
    return Array.prototype.map.call($('hl-list').children, function (row) {
      return {
        start: row.querySelector('.hl-start').value,
        until: row.querySelector('.hl-until').value,
        prefix: row.querySelector('.hl-prefix').value,
        suffix: row.querySelector('.hl-suffix').value
      };
    });
  }

  /* ---------- rendering ---------- */

  function setStatus(msg, isError) {
    var el = $('status');
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(function () { el.textContent = ''; }, 3000);
  }

  function showUrlError(msg) {
    var err = $('url-error');
    err.hidden = !msg;
    err.textContent = msg || '';
    $('in-url').setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function showWarning(msg) {
    var el = $('warn');
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  function update() {
    var o = readOptions();
    var text = '';      // output in the chosen format
    var html = '';      // same result as HTML (for preview and rich copy)
    var url = '';       // single mode only
    var warning = '';
    var info = '';

    showUrlError('');

    if (mode === 'single') {
      var raw = $('in-url').value;
      var n = T.normalizeUrl(raw);
      if (n.error === 'invalid') showUrlError(I.err_url_invalid);
      if (!n.error) {
        url = T.cleanUrl(n.url, o);
        url = T.applyDirective(url, T.buildDirective(readHighlights()));
        var label = $('in-text').value;
        text = T.formatLink(fmt, label, url, o);
        html = T.formatLink('html', label, url, o);
      }
    } else if (mode === 'linkify') {
      var src = $('in-paste').value;
      var r = T.linkify(src, fmt, o);
      if (r.count) {
        text = r.output;
        html = fmt === 'html' ? r.output : T.linkify(src, 'html', o).output;
        info = fill(I.count_label, { n: r.count });
      } else if (src.trim()) {
        warning = I.no_links;
      }
    } else {
      var b = T.parseBulk($('in-bulk').value, o);
      if (b.items.length) {
        text = T.formatBulk(b.items, fmt, o);
        html = T.formatBulk(b.items, 'html', o);
        info = fill(I.count_label, { n: b.items.length });
      }
      if (b.errors.length) warning = fill(I.bulk_errors, { lines: b.errors.join(', ') });
    }

    var out = $('out');
    var has = !!text;
    out.textContent = has ? text : T.formatLink(fmt, I.example_text, 'https://example.com/', o);
    out.classList.toggle('is-placeholder', !has);
    $('fmt-hint').textContent = (has ? '' : (I.example_note || '') + ' ') + ((I.fmt_hint && I.fmt_hint[fmt]) || '');
    showWarning(warning);
    if (info) setStatus(info);

    current = has ? { text: text, html: html, url: url } : null;
    $('btn-copy').disabled = !has;
    $('btn-copy-rich').disabled = !has;
    $('btn-test').disabled = !url;
    $('btn-qr').disabled = !url;

    var preview = $('preview');
    $('preview-wrap').hidden = !has;
    if (has) {
      preview.innerHTML = html; // html is built from escaped text and validated URLs
      Array.prototype.forEach.call(preview.querySelectorAll('a'), function (a) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
    } else {
      preview.textContent = '';
    }

    if (!$('qr-panel').hidden) renderQr();
  }

  /* ---------- clipboard ---------- */

  function copyText(str) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(str);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* fall through */ }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function copyRich(html, plain) {
    if (navigator.clipboard && window.ClipboardItem) {
      var item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' })
      });
      return navigator.clipboard.write([item]);
    }
    return new Promise(function (resolve, reject) {
      var preview = $('preview');
      var range = document.createRange();
      range.selectNodeContents(preview);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* fall through */ }
      sel.removeAllRanges();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function doCopy() {
    if (!current) return;
    copyText(current.text).then(
      function () { setStatus(I.copied); },
      function () { setStatus(I.copy_failed, true); }
    );
  }

  function doCopyRich() {
    if (!current) return;
    copyRich(current.html, $('preview').textContent).then(
      function () { setStatus(I.copied_rich); },
      function () { setStatus(I.copy_failed, true); }
    );
  }

  /* ---------- QR code (library is loaded on first use) ---------- */

  var qrLoading = null;
  var qrData = null; // {n, dark(r,c)}

  function loadQrLib() {
    if (window.qrcode) return Promise.resolve();
    if (!qrLoading) {
      qrLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = $('btn-qr').getAttribute('data-src');
        s.onload = resolve;
        s.onerror = function () { qrLoading = null; reject(new Error('qr lib')); };
        document.head.appendChild(s);
      });
    }
    return qrLoading;
  }

  function renderQr() {
    var box = $('qr-svg');
    var msg = $('qr-msg');
    var url = current && current.url;
    $('qr-dl-svg').disabled = $('qr-dl-png').disabled = true;
    qrData = null;
    if (!url) { box.textContent = ''; msg.textContent = I.qr_need_url; return; }
    loadQrLib().then(function () {
      var q;
      try {
        window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
        q = window.qrcode(0, 'M');
        q.addData(url);
        q.make();
      } catch (e) {
        box.textContent = '';
        msg.textContent = I.qr_too_long;
        return;
      }
      var n = q.getModuleCount();
      var pad = 4;
      var d = '';
      for (var r = 0; r < n; r++) {
        var c = 0;
        while (c < n) {
          if (!q.isDark(r, c)) { c++; continue; }
          var start = c;
          while (c < n && q.isDark(r, c)) c++;
          d += 'M' + (start + pad) + ' ' + (r + pad) + 'h' + (c - start) + 'v1h-' + (c - start) + 'z';
        }
      }
      var size = n + pad * 2;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size +
        '" shape-rendering="crispEdges"><rect width="' + size + '" height="' + size + '" fill="#fff"/>' +
        '<path d="' + d + '" fill="#000"/></svg>';
      box.innerHTML = svg;
      msg.textContent = I.qr_help;
      qrData = { n: n, pad: pad, svg: svg, dark: function (r, c) { return q.isDark(r, c); } };
      $('qr-dl-svg').disabled = $('qr-dl-png').disabled = false;
    }, function () {
      msg.textContent = I.qr_error;
    });
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function downloadQrSvg() {
    if (qrData) download(new Blob([qrData.svg], { type: 'image/svg+xml' }), 'qr-code.svg');
  }

  function downloadQrPng() {
    if (!qrData) return;
    var total = qrData.n + qrData.pad * 2;
    var scale = Math.ceil(768 / total);
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = total * scale;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (var r = 0; r < qrData.n; r++) {
      for (var c = 0; c < qrData.n; c++) {
        if (qrData.dark(r, c)) ctx.fillRect((c + qrData.pad) * scale, (r + qrData.pad) * scale, scale, scale);
      }
    }
    canvas.toBlob(function (blob) { if (blob) download(blob, 'qr-code.png'); }, 'image/png');
  }

  function toggleQr() {
    var panel = $('qr-panel');
    var open = panel.hidden;
    panel.hidden = !open;
    $('btn-qr').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) renderQr();
  }

  /* ---------- misc actions ---------- */

  function clearAll() {
    var ids = { single: ['in-text', 'in-url'], linkify: ['in-paste'], bulk: ['in-bulk'] }[mode];
    ids.forEach(function (id) { $(id).value = ''; });
    if (mode === 'single') {
      $('o-title').value = '';
      $('hl-list').textContent = '';
      addHighlight();
    }
    update();
    $(ids[0]).focus();
  }

  function looksLikeUrl(s) {
    s = s.trim();
    return /^(https?:\/\/|www\.)\S+$/i.test(s) && !T.normalizeUrl(s).error;
  }

  /* ---------- paste, clear, examples ---------- */

  function fireInput(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }

  function clearField(id) {
    var el = $(id);
    el.value = '';
    fireInput(el);
    el.focus();
  }

  function pasteField(btn) {
    var id = btn.getAttribute('data-paste');
    var el = $(id);
    function fallback() {
      el.focus();
      var label = btn.textContent;
      btn.textContent = I.paste_fallback;
      setTimeout(function () { btn.textContent = label; }, 2500);
    }
    if (!(navigator.clipboard && navigator.clipboard.readText)) return fallback();
    navigator.clipboard.readText().then(function (text) {
      text = text || '';
      if (!text.trim()) return fallback();
      if (id === 'in-text') {
        if (looksLikeUrl(text) && !$('in-url').value.trim()) $('in-url').value = text.trim();
        else el.value = text.replace(/\s+/g, ' ').trim();
      } else if (id === 'in-url') {
        el.value = text.trim();
      } else {
        el.value = text;
      }
      fireInput(el);
      el.focus();
    }, fallback);
  }

  function applyExample(ex) {
    suppressSave = true;
    [['o-newtab', 'newTab'], ['o-nofollow', 'nofollow'], ['o-sponsored', 'sponsored'], ['o-ugc', 'ugc'],
     ['o-hash', 'hash'], ['o-shorten', 'shorten'], ['o-list', 'list']].forEach(function (pair) {
      $(pair[0]).checked = !!ex[pair[1]];
    });
    $('o-params').value = ex.params || 'keep';
    $('o-title').value = ex.title || '';

    if (mode === 'single') {
      $('in-text').value = ex.text || '';
      $('in-url').value = ex.url || '';
      $('hl-list').textContent = '';
      (ex.hl && ex.hl.length ? ex.hl : [{}]).forEach(function (h) {
        addHighlight();
        var row = $('hl-list').lastElementChild;
        row.querySelector('.hl-start').value = h.start || '';
        row.querySelector('.hl-until').value = h.until || '';
        row.querySelector('.hl-prefix').value = h.prefix || '';
        row.querySelector('.hl-suffix').value = h.suffix || '';
      });
    } else if (mode === 'linkify') {
      $('in-paste').value = ex.text || '';
    } else {
      $('in-bulk').value = ex.text || '';
    }

    if (ex.newTab || ex.nofollow || ex.sponsored || ex.ugc || ex.hash || ex.shorten || ex.list ||
        ex.params || ex.title || ex.hl) {
      $('advanced').open = true;
    }
    setFmtTab(ex.fmt || 'html'); // re-renders
    suppressSave = false;
  }

  function renderExamples() {
    var box = $('examples');
    box.textContent = '';
    ((I.examples || {})[mode] || []).forEach(function (ex) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = ex.label;
      b.addEventListener('click', function () { applyExample(ex); });
      box.appendChild(b);
    });
  }

  /* ---------- prefill from the address: ?url=&text=&title=&fmt= (also the PWA share target) ---------- */

  function prefillFromQuery() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var url = (q.get('url') || '').trim();
    var text = (q.get('text') || '').trim();
    var title = (q.get('title') || '').trim();
    var f = q.get('fmt');
    if (f && document.querySelector('[data-fmt="' + f + '"]')) fmt = f;
    if (!url && !text && !title) return;
    if (!url) {
      // share sheets often put the page address into "text"
      var found = T.splitUrls(text + ' ' + title).filter(function (p) { return p.type === 'url'; })[0];
      if (!found) {
        $('in-text').value = (title || text).replace(/\s+/g, ' ');
        return;
      }
      url = found.value;
      text = text.replace(url, '').replace(/\s+/g, ' ').trim();
      title = title.replace(url, '').replace(/\s+/g, ' ').trim();
    }
    $('in-url').value = url;
    $('in-text').value = (title || text).replace(/\s+/g, ' ');
  }

  /* ---------- init ---------- */

  function init() {
    loadSettings();
    prefillFromQuery();
    addHighlight();

    var setMode = wireTabs(document.querySelector('.modes'), 'data-mode', function (m) {
      mode = m;
      applyModeVisibility();
      $('hl-add').hidden = $('hl-list').children.length >= MAX_HIGHLIGHTS;
      if (m !== 'single') { $('qr-panel').hidden = true; $('btn-qr').setAttribute('aria-expanded', 'false'); }
      showUrlError('');
      renderExamples();
      update();
    });
    var setFmt = wireTabs(document.querySelector('.formats'), 'data-fmt', function (f) {
      fmt = f;
      saveSettings();
      update();
    });
    setFmtTab = setFmt;
    setMode('single');
    setFmt(fmt);

    var tool = $('tool');
    tool.addEventListener('input', update);
    tool.addEventListener('change', function () { saveSettings(); update(); });
    tool.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doCopy(); }
    });

    tool.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-paste], [data-clear]');
      if (!btn) return;
      if (btn.hasAttribute('data-clear')) clearField(btn.getAttribute('data-clear'));
      else pasteField(btn);
    });

    $('hl-add').addEventListener('click', function () { addHighlight(); update(); });
    $('hl-list').addEventListener('click', function (e) {
      var btn = e.target.closest('.hl-remove');
      if (!btn) return;
      btn.closest('.hl-row').remove();
      $('hl-add').hidden = false;
      update();
    });

    $('in-text').addEventListener('paste', function (e) {
      var data = e.clipboardData && e.clipboardData.getData('text');
      if (data && looksLikeUrl(data) && !$('in-url').value.trim() && !$('in-text').value.trim()) {
        e.preventDefault();
        $('in-url').value = data.trim();
        $('in-text').focus();
        update();
      }
    });

    $('btn-copy').addEventListener('click', doCopy);
    $('btn-copy-rich').addEventListener('click', doCopyRich);
    $('btn-test').addEventListener('click', function () {
      if (current && current.url) window.open(current.url, '_blank', 'noopener,noreferrer');
    });
    $('btn-qr').addEventListener('click', toggleQr);
    $('qr-dl-svg').addEventListener('click', downloadQrSvg);
    $('qr-dl-png').addEventListener('click', downloadQrPng);
    $('btn-clear').addEventListener('click', clearAll);

    update();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
