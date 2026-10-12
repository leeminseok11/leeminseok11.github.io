/* mseok.log — 테마 전환 · 검색 · 필터 · 목차 · 코드 복사 (의존성 없음) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;

  /* ---------- 테마 ---------- */
  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var themeBtn = $('#theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  /* ---------- 맨 위로 ---------- */
  $$('.to-top').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  });

  /* ---------- 외부 링크 ---------- */
  $$('.prose a[href^="http"]').forEach(function (a) {
    if (a.hostname !== location.hostname) { a.target = '_blank'; a.rel = 'noopener'; }
  });

  /* ---------- 목차 ---------- */
  var body = $('#post-body');
  var tocNav = $('#toc');
  if (body && tocNav) {
    var heads = $$('h2, h3', body);
    if (heads.length < 2) {
      tocNav.parentNode.classList.add('is-empty');
    } else {
      var used = {};
      heads.forEach(function (h, i) {
        if (!h.id) {
          var base = h.textContent.trim().toLowerCase().replace(/[^\wㄱ-힝-]+/g, '-').replace(/^-+|-+$/g, '') || 'h-' + i;
          var id = base, n = 2;
          while (used[id] || document.getElementById(id)) { id = base + '-' + n++; }
          h.id = id;
        }
        used[h.id] = true;
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        a.className = h.tagName === 'H3' ? 'lv3' : 'lv2';
        tocNav.appendChild(a);
      });
      var links = $$('a', tocNav);
      if ('IntersectionObserver' in window) {
        var active = null;
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              active = en.target.id;
              links.forEach(function (l) { l.classList.toggle('is-active', l.getAttribute('href') === '#' + active); });
            }
          });
        }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
        heads.forEach(function (h) { io.observe(h); });
      }
    }
  }

  /* ---------- 코드 복사 ---------- */
  $$('.prose pre').forEach(function (pre) {
    var host = pre.closest('div.highlighter-rouge') || pre;
    if (host.querySelector('.copy-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'copy';
    btn.setAttribute('aria-label', '코드 복사');
    btn.addEventListener('click', function () {
      var text = pre.innerText;
      var done = function () { btn.textContent = 'copied'; setTimeout(function () { btn.textContent = 'copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta); done();
      }
    });
    host.appendChild(btn);
  });

  /* ---------- 글 목록: 카테고리 필터 ---------- */
  var catChips = $$('[data-filter-cat]');
  if (catChips.length) {
    var items = $$('[data-post-cat]');
    var apply = function (cat) {
      catChips.forEach(function (c) { c.classList.toggle('is-active', c.getAttribute('data-filter-cat') === cat); });
      items.forEach(function (it) { it.hidden = !!cat && it.getAttribute('data-post-cat') !== cat; });
      $$('.year-group').forEach(function (g) {
        var any = $$('[data-post-cat]', g).some(function (it) { return !it.hidden; });
        g.hidden = !any;
      });
      var empty = $('#posts-empty');
      if (empty) empty.hidden = items.some(function (it) { return !it.hidden; });
      var cnt = $('#posts-count');
      if (cnt) cnt.textContent = items.filter(function (it) { return !it.hidden; }).length;
    };
    catChips.forEach(function (c) {
      c.addEventListener('click', function () {
        var cat = c.getAttribute('data-filter-cat');
        apply(cat);
        var url = new URL(location.href);
        if (cat) url.searchParams.set('cat', cat); else url.searchParams.delete('cat');
        history.replaceState(null, '', url);
      });
    });
    var initial = new URL(location.href).searchParams.get('cat') || '';
    if (initial && !catChips.some(function (c) { return c.getAttribute('data-filter-cat') === initial; })) initial = '';
    apply(initial);
  }

  /* ---------- 프로젝트: 도메인 / 기술 필터 (그룹 안 OR, 그룹 간 AND) ---------- */
  var finder = $('#finder');
  if (finder) {
    var cards = $$('.project-card');
    var state = { domain: [], tech: [] };
    var update = function () {
      var shown = 0;
      cards.forEach(function (card) {
        var d = (card.getAttribute('data-domains') || '').split('|').filter(Boolean);
        var t = (card.getAttribute('data-tech') || '').split('|').filter(Boolean);
        var okD = !state.domain.length || state.domain.some(function (x) { return d.indexOf(x) >= 0; });
        var okT = !state.tech.length || state.tech.some(function (x) { return t.indexOf(x) >= 0; });
        card.hidden = !(okD && okT);
        if (!card.hidden) shown++;
      });
      var cnt = $('#finder-count');
      if (cnt) cnt.textContent = shown;
      var empty = $('#projects-empty');
      if (empty) empty.hidden = shown > 0;
      $$('[data-filter-domain], [data-filter-tech]', finder).forEach(function (chip) {
        var g = chip.hasAttribute('data-filter-domain') ? 'domain' : 'tech';
        var v = chip.getAttribute('data-filter-' + g);
        chip.classList.toggle('is-active', v ? state[g].indexOf(v) >= 0 : state[g].length === 0);
      });
    };
    finder.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-filter-domain], [data-filter-tech]');
      if (chip) {
        var g = chip.hasAttribute('data-filter-domain') ? 'domain' : 'tech';
        var v = chip.getAttribute('data-filter-' + g);
        if (!v) state[g] = [];
        else {
          var i = state[g].indexOf(v);
          if (i >= 0) state[g].splice(i, 1); else state[g].push(v);
        }
        update();
      }
      if (e.target.closest('[data-finder-reset]')) { state = { domain: [], tech: [] }; update(); }
    });
    update();
  }

  /* ---------- 검색 ---------- */
  var search = $('#search');
  if (search) {
    var input = $('#search-input');
    var list = $('#search-results');
    var data = null, loading = null, cursor = -1;
    var openBtn = $('#search-open');
    var load = function () {
      if (data) return Promise.resolve(data);
      if (!loading) {
        loading = fetch(search.getAttribute('data-search-url')).then(function (r) { return r.json(); }).then(function (j) { data = j; return j; });
      }
      return loading;
    };
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var render = function (rows, q) {
      list.innerHTML = '';
      cursor = -1;
      if (!rows.length) {
        list.innerHTML = '<li class="r-empty">' + (q ? '"' + esc(q) + '"에 맞는 결과가 없습니다.' : '검색어를 입력하세요.') + '</li>';
        return;
      }
      rows.forEach(function (r) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        var meta = [r.category, r.date].filter(Boolean).concat((r.tags || []).slice(0, 4).map(function (t) { return '#' + t; }));
        li.innerHTML = '<a href="' + esc(r.url) + '"><span><span class="r-title">' + esc(r.title) + '</span><span class="r-meta">' + meta.map(esc).join('<span aria-hidden="true">·</span>') + '</span></span><span class="r-kind">' + (r.type === 'project' ? 'PROJECT' : 'POST') + '</span></a>';
        list.appendChild(li);
      });
    };
    var score = function (r, q) {
      var hay = [r.title, r.description, r.category, (r.tags || []).join(' ')].join(' ').toLowerCase();
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return 0;
      var s = 0;
      for (var i = 0; i < terms.length; i++) {
        if (hay.indexOf(terms[i]) < 0) return 0;
        s += (r.title.toLowerCase().indexOf(terms[i]) >= 0 ? 3 : 1);
      }
      return s;
    };
    var run = function () {
      var q = input.value.trim();
      load().then(function (rows) {
        if (!q) { render(rows.slice(0, 8), ''); return; }
        var hits = rows.map(function (r) { return { r: r, s: score(r, q) }; }).filter(function (x) { return x.s > 0; })
          .sort(function (a, b) { return b.s - a.s; }).slice(0, 12).map(function (x) { return x.r; });
        render(hits, q);
      });
    };
    var open = function () {
      search.hidden = false;
      document.body.classList.add('search-open');
      input.value = '';
      run();
      setTimeout(function () { input.focus(); }, 0);
    };
    var close = function () {
      search.hidden = true;
      document.body.classList.remove('search-open');
      if (openBtn) openBtn.focus();
    };
    if (openBtn) openBtn.addEventListener('click', open);
    $$('[data-search-close]', search).forEach(function (el) { el.addEventListener('click', close); });
    input.addEventListener('input', run);
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.hidden ? open() : close(); return; }
      if (e.key === '/' && search.hidden && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); open(); return; }
      if (search.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      var opts = $$('li[role="option"]', list);
      if (!opts.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cursor = e.key === 'ArrowDown' ? Math.min(cursor + 1, opts.length - 1) : Math.max(cursor - 1, 0);
        opts.forEach(function (o, i) { o.classList.toggle('is-active', i === cursor); });
        opts[cursor].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && cursor >= 0) {
        e.preventDefault();
        location.href = $('a', opts[cursor]).href;
      }
    });
  }
})();
