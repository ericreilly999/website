/* Consent and Google Analytics for ericreilly.com. Reads window.SITE_CONFIG
   (site-config.js) and nothing else. gtag.js loads only when a valid id is
   set, the hostname is allowlisted and consent permits. */
(function () {
  'use strict';
  var w = window, d = document;
  w.siteAnalytics = { track: function () {} };

  var cfg = w.SITE_CONFIG || {};
  var id = typeof cfg.gaMeasurementId === 'string' && /^G-[A-Z0-9]{4,}$/.test(cfg.gaMeasurementId) ? cfg.gaMeasurementId : '';
  var hosts = Array.isArray(cfg.gaHostnames) ? cfg.gaHostnames : [];
  if (!id || hosts.indexOf(location.hostname) < 0) return;

  var KEY = 'analyticsConsent', OFF = 'ga-disable-' + id;
  var active = false, loaded = false, banner = null, opener = null;

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function gtag() { w.dataLayer.push(arguments); }

  // Experiment params ride along only when the hero shown is the stored assignment.
  function assignment() {
    try {
      var h = w.heroExperiment, ok = /^[a-z0-9-]{1,32}$/;
      if (h) return h.assigned ? { experiment: h.id, variant: h.shown } : null;
      var s = JSON.parse(localStorage.getItem('heroExperiment'));
      if (s && ok.test(s.id) && ok.test(s.variant)) return { experiment: s.id, variant: s.variant };
    } catch (e) {}
    return null;
  }

  function track(name, params) {
    try {
      if (!active) return;
      var p = {}, k, a = assignment();
      for (k in params) p[k] = params[k];
      if (a) { p.experiment = a.experiment; p.variant = a.variant; }
      p.transport_type = 'beacon';
      gtag('event', name, p);
    } catch (e) {}
  }

  function activate() {
    active = true;
    w[OFF] = false;
    if (loaded) return;
    loaded = true;
    w.dataLayer = w.dataLayer || [];
    gtag('js', new Date());
    gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = d.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    d.head.appendChild(s);
    if (w.heroExperiment && w.heroExperiment.assigned) track('ab_exposure', {});
  }

  // Withdrawal: stop collection on this page at once and drop the GA cookies.
  function withdraw() {
    active = false;
    if (loaded) w[OFF] = true;
    try {
      var host = location.hostname, parent = host.split('.').slice(-2).join('.');
      d.cookie.split(';').forEach(function (c) {
        var n = c.split('=')[0].trim();
        if (!/^_ga(_|$)/.test(n)) return;
        ['', '; domain=' + host, '; domain=.' + parent].forEach(function (dom) {
          d.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + dom;
        });
      });
    } catch (e) {}
  }

  function choose(v) {
    write(v);
    banner.remove();
    banner = null;
    if (v === 'granted') activate(); else withdraw();
    if (opener) opener.focus();
    opener = null;
  }

  function button(label, v) {
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'choice-btn';
    b.textContent = label;
    b.addEventListener('click', function () { choose(v); });
    return b;
  }

  function showBanner(from) {
    if (!banner) {
      banner = d.createElement('div');
      banner.className = 'consent-banner';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'Analytics choice');
      var p = d.createElement('p'), a = d.createElement('a'), row = d.createElement('div');
      p.textContent = 'I use Google Analytics to see which pages people read. Nothing loads unless you accept. ';
      a.setAttribute('href', '/privacy');
      a.textContent = 'privacy';
      p.appendChild(a);
      row.className = 'consent-actions';
      row.appendChild(button('Decline', 'denied'));
      row.appendChild(button('Accept', 'granted'));
      banner.appendChild(p);
      banner.appendChild(row);
      d.body.appendChild(banner);
    }
    if (from) { opener = from; banner.querySelector('button').focus(); }
  }

  w.siteAnalytics = { track: track };

  if (cfg.consent === 'none') { activate(); return; }

  // Banner mode: show the privacy choices controls (and the wrapper that holds their separator).
  Array.prototype.forEach.call(d.querySelectorAll('[data-privacy-choices]'), function (b) {
    b.hidden = false;
    b.parentNode.hidden = false;
    b.addEventListener('click', function () { showBanner(b); });
  });
  var c = read();
  if (c === 'granted') activate(); else if (c !== 'denied') showBanner();
})();
