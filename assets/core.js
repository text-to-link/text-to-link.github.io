/*! text-to-link core: pure functions, no DOM access */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TTL = factory();
})(this, function () {
  'use strict';

  var TRACKING_EXACT = [
    'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid',
    'igshid', 'igsh', 'yclid', 'twclid', 'ttclid', 'li_fat_id', '_hsenc', '_hsmi', 'mkt_tok', 'ref_src',
    '_ga', '_gl', 'vero_id', 'vero_conv', 'oly_anon_id', 'oly_enc_id', 'ck_subscriber_id'
  ];
  var TRACKING_PREFIX = ['utm_', 'hsa_', 'pk_', 'mtm_', 'matomo_', 'piwik_'];

  function isTrackingParam(name) {
    name = name.toLowerCase();
    if (TRACKING_EXACT.indexOf(name) !== -1) return true;
    for (var i = 0; i < TRACKING_PREFIX.length; i++) {
      if (name.indexOf(TRACKING_PREFIX[i]) === 0) return true;
    }
    return false;
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Turns what the user typed into an absolute URL.
   * Returns {url, error} where error is '', 'empty' or 'invalid'.
   */
  function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return { url: '', error: 'empty' };
    if (/^(mailto|tel):/i.test(s)) return { url: s, error: '' };

    var scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
    if (scheme) {
      if (!/^(https?|ftp)$/i.test(scheme[1])) return { url: '', error: 'invalid' };
    } else if (s.indexOf('//') === 0) {
      s = 'https:' + s;
    } else {
      s = 'https://' + s;
    }

    var u;
    try { u = new URL(s); } catch (e) { return { url: '', error: 'invalid' }; }
    var host = u.hostname;
    if (!host || !(host.indexOf('.') > 0 || host === 'localhost' || host.charAt(0) === '[')) {
      return { url: '', error: 'invalid' };
    }
    return { url: /\s/.test(s) ? u.href : s, error: '' };
  }

  /**
   * opts.params: 'keep' | 'tracking' | 'all';  opts.hash: remove #fragment
   */
  function cleanUrl(url, opts) {
    opts = opts || {};
    if (!/^(https?|ftp):/i.test(url)) return url;
    var hashAt = url.indexOf('#');
    var hash = hashAt >= 0 ? url.slice(hashAt) : '';
    var rest = hashAt >= 0 ? url.slice(0, hashAt) : url;
    var qAt = rest.indexOf('?');
    var base = qAt >= 0 ? rest.slice(0, qAt) : rest;
    var query = qAt >= 0 ? rest.slice(qAt + 1) : '';

    if (opts.params === 'all') {
      query = '';
    } else if (opts.params === 'tracking' && query) {
      query = query.split('&').filter(function (part) {
        return part && !isTrackingParam(safeDecode(part.split('=')[0]));
      }).join('&');
    }
    if (opts.hash) hash = '';
    return base + (query ? '?' + query : '') + hash;
  }

  function encodeFragmentPart(s) {
    return encodeURIComponent(String(s).replace(/\s+/g, ' ').trim()).replace(/-/g, '%2D');
  }

  /**
   * highlights: [{start, until, prefix, suffix}] -> "text=...&text=..." (or '')
   */
  function buildDirective(highlights) {
    var parts = [];
    (highlights || []).forEach(function (h) {
      var start = String(h.start || '').trim();
      if (!start) return;
      var s = 'text=';
      if (String(h.prefix || '').trim()) s += encodeFragmentPart(h.prefix) + '-,';
      s += encodeFragmentPart(start);
      if (String(h.until || '').trim()) s += ',' + encodeFragmentPart(h.until);
      if (String(h.suffix || '').trim()) s += ',-' + encodeFragmentPart(h.suffix);
      parts.push(s);
    });
    return parts.join('&');
  }

  function applyDirective(url, directive) {
    if (!directive || !/^https?:/i.test(url)) return url;
    var hashAt = url.indexOf('#');
    var base = hashAt >= 0 ? url.slice(0, hashAt) : url;
    var hash = hashAt >= 0 ? url.slice(hashAt) : '';
    hash = hash.replace(/:~:.*$/, '');
    if (!hash) hash = '#';
    return base + hash + ':~:' + directive;
  }

  function relTokens(o) {
    var rel = [];
    ['nofollow', 'sponsored', 'ugc'].forEach(function (k) { if (o[k]) rel.push(k); });
    if (o.newTab) rel.push('noopener', 'noreferrer');
    return rel;
  }

  /**
   * fmt: html | markdown | bbcode | url | rst | asciidoc | slack | textile | org
   * o: {newTab, nofollow, sponsored, ugc, title}
   */
  function formatLink(fmt, text, url, o) {
    o = o || {};
    text = String(text || '').trim() || url;
    var title = String(o.title || '').trim();

    switch (fmt) {
      case 'html': {
        var rel = relTokens(o);
        return '<a href="' + escapeHtml(url) + '"' +
          (title ? ' title="' + escapeHtml(title) + '"' : '') +
          (o.newTab ? ' target="_blank"' : '') +
          (rel.length ? ' rel="' + rel.join(' ') + '"' : '') +
          '>' + escapeHtml(text) + '</a>';
      }
      case 'markdown': {
        var mdUrl = url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        var mdText = text.replace(/([\\\[\]])/g, '\\$1');
        return '[' + mdText + '](' + mdUrl + (title ? ' "' + title.replace(/"/g, '\\"') + '"' : '') + ')';
      }
      case 'bbcode':
        return text === url ? '[url]' + url + '[/url]' : '[url=' + url + ']' + text + '[/url]';
      case 'rst':
        return text === url ? url : '`' + text.replace(/`/g, '\\`') + ' <' + url + '>`__';
      case 'asciidoc':
        return url + '[' + text.replace(/\]/g, '\\]') + (o.newTab ? ',window=_blank' : '') + ']';
      case 'slack':
        return text === url ? '<' + slackEscape(url) + '>' : '<' + slackEscape(url) + '|' + slackEscape(text) + '>';
      case 'textile': {
        var tUrl = url.replace(/ /g, '%20');
        if (text === url) return '"' + tUrl + '":' + tUrl;
        return '"' + text.replace(/"/g, '&quot;') + (title ? ' (' + title.replace(/[()"]/g, '') + ')' : '') + '":' + tUrl;
      }
      case 'org': {
        var oUrl = url.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
        return text === url ? '[[' + oUrl + ']]' : '[[' + oUrl + '][' + text.replace(/\]\]/g, '] ]') + ']]';
      }
      default:
        return url;
    }
  }

  function slackEscape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
  var CLOSERS = { ')': '(', ']': '[', '}': '{' };

  /** Splits free text into [{type:'text'|'url', value}] */
  function splitUrls(text) {
    var out = [];
    var last = 0;
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) {
      var found = m[0];
      var tail = '';
      for (;;) {
        var c = found.charAt(found.length - 1);
        var strip = /[.,;:!?]/.test(c);
        if (!strip && CLOSERS[c]) {
          var open = found.split(CLOSERS[c]).length - 1;
          var close = found.split(c).length - 1;
          strip = close > open;
        }
        if (!strip) break;
        tail = c + tail;
        found = found.slice(0, -1);
      }
      if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
      if (found) out.push({ type: 'url', value: found });
      if (tail) out.push({ type: 'text', value: tail });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
    return out;
  }

  function shortenUrl(url) {
    return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  }

  /**
   * Replaces every URL in free text with a link in the chosen format.
   * o: link options + {params, hash, shorten}
   */
  function linkify(text, fmt, o) {
    o = o || {};
    var count = 0;
    var segs = splitUrls(String(text || ''));
    var out = segs.map(function (seg) {
      if (seg.type === 'url') {
        var href = /^www\./i.test(seg.value) ? 'https://' + seg.value : seg.value;
        href = cleanUrl(href, o);
        count++;
        if (fmt === 'url') return href + '\n';
        var shown = o.shorten ? shortenUrl(href)
          : (/^www\./i.test(seg.value) ? href.replace(/^https:\/\//i, '') : href);
        return formatLink(fmt, shown, href, o);
      }
      if (fmt === 'url') return '';
      if (fmt === 'slack') return slackEscape(seg.value);
      return fmt === 'html' ? escapeHtml(seg.value).replace(/\r?\n/g, '<br>\n') : seg.value;
    }).join('');
    return { output: fmt === 'url' ? out.replace(/\n$/, '') : out, count: count };
  }

  /**
   * Parses "text | url" lines. Returns {items:[{text,url}], errors:[lineNumber]}
   */
  function parseBulk(input, o) {
    o = o || {};
    var items = [];
    var errors = [];
    String(input || '').split(/\r?\n/).forEach(function (line, i) {
      line = line.trim();
      if (!line) return;
      var text = '';
      var rawUrl = line;
      var sep = line.indexOf('\t') >= 0 ? '\t' : (line.indexOf('|') >= 0 ? '|' : '');
      if (sep) {
        var at = line.indexOf(sep);
        var left = line.slice(0, at).trim();
        var right = line.slice(at + 1).trim();
        if (normalizeUrl(right).error && !normalizeUrl(left).error) { text = right; rawUrl = left; }
        else { text = left; rawUrl = right; }
      }
      var res = normalizeUrl(rawUrl);
      if (res.error) { errors.push(i + 1); return; }
      var url = cleanUrl(res.url, o);
      items.push({ text: text || (o.shorten ? shortenUrl(url) : url), url: url });
    });
    return { items: items, errors: errors };
  }

  function formatBulk(items, fmt, o) {
    o = o || {};
    var lines = items.map(function (it) { return formatLink(fmt, it.text, it.url, o); });
    if (!o.list) return lines.join('\n');
    switch (fmt) {
      case 'html':
        return '<ul>\n' + lines.map(function (l) { return '  <li>' + l + '</li>'; }).join('\n') + '\n</ul>';
      case 'markdown':
        return lines.map(function (l) { return '- ' + l; }).join('\n');
      case 'bbcode':
        return '[list]\n' + lines.map(function (l) { return '[*]' + l; }).join('\n') + '\n[/list]';
      case 'rst':
        return lines.map(function (l) { return '* ' + l; }).join('\n');
      case 'asciidoc':
      case 'textile':
        return lines.map(function (l) { return '* ' + l; }).join('\n');
      case 'slack':
        return lines.map(function (l) { return '\u2022 ' + l; }).join('\n');
      case 'org':
        return lines.map(function (l) { return '- ' + l; }).join('\n');
      default:
        return lines.join('\n');
    }
  }

  return {
    isTrackingParam: isTrackingParam,
    escapeHtml: escapeHtml,
    normalizeUrl: normalizeUrl,
    cleanUrl: cleanUrl,
    buildDirective: buildDirective,
    applyDirective: applyDirective,
    formatLink: formatLink,
    splitUrls: splitUrls,
    shortenUrl: shortenUrl,
    linkify: linkify,
    parseBulk: parseBulk,
    formatBulk: formatBulk
  };
});
