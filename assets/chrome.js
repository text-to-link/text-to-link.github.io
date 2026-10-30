/* Shared by all pages: theme toggle, language menu, analytics consent, service worker. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  function effectiveTheme() {
    return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function init() {
    $('theme-toggle').addEventListener('click', function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      store.set('ttl-theme', next);
    });

    var lang = $('lang-menu');
    document.addEventListener('click', function (e) {
      if (lang.open && !lang.contains(e.target)) lang.open = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lang.open) { lang.open = false; lang.querySelector('summary').focus(); }
    });

    var banner = $('consent');
    if (!store.get('ttl-consent')) banner.hidden = false;
    function choose(value) {
      store.set('ttl-consent', value);
      banner.hidden = true;
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', { analytics_storage: value === 'granted' ? 'granted' : 'denied' });
      }
    }
    $('consent-accept').addEventListener('click', function () { choose('granted'); });
    $('consent-decline').addEventListener('click', function () { choose('denied'); });

    // the same choice can be changed later on the privacy page
    Array.prototype.forEach.call(document.querySelectorAll('[data-consent]'), function (btn) {
      btn.addEventListener('click', function () {
        choose(btn.getAttribute('data-consent'));
        var status = $('consent-status');
        if (status) status.textContent = '✓ ' + btn.textContent;
      });
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () { /* offline mode is optional */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
