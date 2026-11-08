/* Behaviour for the browse interface.

   All data arrives from the server once, as JSON inside #boot-data, and after
   that from the HTTP API:
     GET    /api/watchlist      -> {count, entries: [...]}   (500 {error})
     POST   /api/watchlist      -> 201 {entry} | 400/500 {error}
     DELETE /api/watchlist/<id> -> 200 {deleted: id} | 404 | 500 {error}
     GET    /api/status         -> status object (always 200)

   Security rule for the whole file: data from the API or from localStorage is
   only ever written with textContent / createElement, never with innerHTML, so
   a title containing markup cannot inject it into the page. */

'use strict';

(function () {
  /* ---------- Constants ---------- */
  var STORAGE_PROFILES = 'watchlist_profiles';
  var STORAGE_ACTIVE = 'watchlist_active_profile';
  var DEFAULT_PROFILE = 'Member 1';
  var MAX_PROFILE_LENGTH = 100;
  var STATUS_INTERVAL_MS = 10000;    // how often the status indicator is refreshed
  var ENTRIES_INTERVAL_MS = 30000;   // keep My List fresh without hammering the DB
  var TOAST_MS = 2500;
  var ARROW_SCROLL_RATIO = 0.8;      // one arrow click moves 80% of the row width
  var FALLBACK_STATUS = {
    connected: false,
    message: 'Database connection FAILED',
    deployment_env: '',
    db_host: '',
    db_engine: null,
    error: null
  };

  /* ---------- Application state (single source of truth) ---------- */
  var state = {
    status: FALLBACK_STATUS,
    catalog: [],
    entries: [],
    profiles: [],
    activeProfile: '',
    featured: null,
    modalTitle: '',
    entriesAvailable: true
  };

  var toastTimer = null;
  var lastFocusedElement = null;

  /* =======================================================================
   * Tiny helpers
   * ===================================================================== */

  function byId(id) {
    return document.getElementById(id);
  }

  /** Create an element in one line; text always goes through textContent. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function scrollBehavior() {
    return prefersReducedMotion() ? 'auto' : 'smooth';
  }

  /** Deterministic hash so a title always gets the same colour and match %. */
  function hashString(text) {
    var hash = 0;
    var value = String(text || '');
    for (var i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) % 1000003;
    }
    return hash;
  }

  function hueFor(text) {
    return hashString(text) % 360;
  }

  /** Fake "xx% Match" between 80 and 99, stable for a given title. */
  function matchFor(text) {
    return 80 + (hashString(text + '#match') % 20);
  }

  function posterGradient(title) {
    var hue = hueFor(title);
    return 'linear-gradient(135deg, hsl(' + hue + ', 60%, 38%) 0%, hsl(' +
      ((hue + 38) % 360) + ', 55%, 22%) 100%)';
  }

  function heroGradient(title) {
    var hue = hueFor(title);
    return 'radial-gradient(120% 150% at 12% 15%, hsl(' + hue + ', 62%, 34%) 0%, hsl(' +
      ((hue + 30) % 360) + ', 55%, 18%) 45%, #141414 100%)';
  }

  function avatarColor(name) {
    return 'hsl(' + hueFor(name) + ', 52%, 42%)';
  }

  function firstLetter(name) {
    var trimmed = String(name || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  }

  /* =======================================================================
   * Toast
   * ===================================================================== */

  function toast(message) {
    var node = byId('toast');
    if (!node) {
      return;
    }
    node.textContent = message;
    node.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      node.classList.remove('show');
    }, TOAST_MS);
  }

  function toastPlayback() {
    toast('Playback is not part of this demo');
  }

  /* =======================================================================
   * Boot data + localStorage
   * ===================================================================== */

  function readBootData() {
    var node = byId('boot-data');
    if (!node) {
      return { status: FALLBACK_STATUS, catalog: [], entries: [] };
    }
    try {
      var parsed = JSON.parse(node.textContent || '{}');
      return {
        status: parsed.status && typeof parsed.status === 'object' ? parsed.status : FALLBACK_STATUS,
        catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
        entries: Array.isArray(parsed.entries) ? parsed.entries : []
      };
    } catch (error) {
      return { status: FALLBACK_STATUS, catalog: [], entries: [] };
    }
  }

  function loadProfiles() {
    try {
      var raw = window.localStorage.getItem(STORAGE_PROFILES);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          var cleaned = [];
          parsed.forEach(function (name) {
            if (typeof name === 'string' && name.trim() && cleaned.indexOf(name.trim()) === -1) {
              cleaned.push(name.trim());
            }
          });
          if (cleaned.length) {
            return cleaned;
          }
        }
      }
    } catch (error) {
      // Private mode / disabled storage: fall back to the default profile.
    }
    return [DEFAULT_PROFILE];
  }

  function saveProfiles(list) {
    try {
      window.localStorage.setItem(STORAGE_PROFILES, JSON.stringify(list));
    } catch (error) {
      // Storage is a convenience only; the app still works without it.
    }
  }

  function loadActiveProfile() {
    try {
      return window.localStorage.getItem(STORAGE_ACTIVE) || '';
    } catch (error) {
      return '';
    }
  }

  function saveActiveProfile(name) {
    try {
      window.localStorage.setItem(STORAGE_ACTIVE, name);
    } catch (error) {
      // Ignore: the profile still lives in memory for this page view.
    }
  }

  /* =======================================================================
   * Watchlist helpers
   * ===================================================================== */

  function isInMyList(title) {
    return state.entries.some(function (entry) {
      return entry.user_name === state.activeProfile && entry.title === title;
    });
  }

  /** Catalog entry for a saved title (saved rows may predate the catalog). */
  function catalogItemFor(title) {
    for (var i = 0; i < state.catalog.length; i += 1) {
      if (state.catalog[i].title === title) {
        return state.catalog[i];
      }
    }
    return { title: title, genre: '' };
  }

  /** The active profile's titles, newest first, without duplicates. */
  function myListItems() {
    var seen = {};
    var items = [];
    state.entries.forEach(function (entry) {
      if (entry.user_name !== state.activeProfile || seen[entry.title]) {
        return;
      }
      seen[entry.title] = true;
      items.push(catalogItemFor(entry.title));
    });
    return items;
  }

  function genreList() {
    var genres = [];
    state.catalog.forEach(function (item) {
      if (item.genre && genres.indexOf(item.genre) === -1) {
        genres.push(item.genre);
      }
    });
    return genres;
  }

  /* =======================================================================
   * Screen 1: profile gate
   * ===================================================================== */

  function renderProfiles() {
    var list = byId('profile-list');
    if (!list) {
      return;
    }
    list.textContent = '';

    state.profiles.forEach(function (name) {
      var tile = el('button', 'profile-tile');
      tile.type = 'button';

      var avatar = el('span', 'avatar', firstLetter(name));
      avatar.style.background = avatarColor(name);

      tile.appendChild(avatar);
      tile.appendChild(el('span', 'profile-name', name));

      if (name === state.activeProfile) {
        tile.classList.add('is-active');
      }

      tile.addEventListener('click', function () {
        chooseProfile(name);
      });

      list.appendChild(tile);
    });
  }

  function showGate() {
    var gate = byId('profile-gate');
    var appRoot = byId('app-root');
    if (gate) {
      gate.hidden = false;
    }
    if (appRoot) {
      appRoot.hidden = true;
    }
    closeAddProfilePanel();
    renderProfiles();
  }

  function chooseProfile(name) {
    state.activeProfile = name.trim();
    saveActiveProfile(state.activeProfile);

    var gate = byId('profile-gate');
    var appRoot = byId('app-root');
    if (gate) {
      gate.hidden = true;
    }
    if (appRoot) {
      appRoot.hidden = false;
    }

    buildApp();
    window.scrollTo(0, 0);
  }

  function openAddProfilePanel() {
    var panel = byId('add-profile-panel');
    var input = byId('new-profile-name');
    var error = byId('profile-error');
    if (!panel) {
      return;
    }
    panel.hidden = false;
    if (error) {
      error.textContent = '';
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function closeAddProfilePanel() {
    var panel = byId('add-profile-panel');
    var error = byId('profile-error');
    if (panel) {
      panel.hidden = true;
    }
    if (error) {
      error.textContent = '';
    }
  }

  function saveNewProfile() {
    var input = byId('new-profile-name');
    var error = byId('profile-error');
    if (!input) {
      return;
    }

    // Trim, then collapse inner runs of spaces so "A   B" and "A B" match.
    var name = input.value.trim().replace(/\s+/g, ' ');

    if (!name || name.length > MAX_PROFILE_LENGTH) {
      if (error) {
        error.textContent = 'Please use a name between 1 and 100 characters.';
      }
      return;
    }
    if (state.profiles.indexOf(name) !== -1) {
      if (error) {
        error.textContent = 'That profile already exists.';
      }
      return;
    }

    state.profiles.push(name);
    saveProfiles(state.profiles);
    closeAddProfilePanel();
    chooseProfile(name);
  }

  /* =======================================================================
   * Screen 2: navbar, banner, hero
   * ===================================================================== */

  function buildNavbar() {
    var avatar = byId('nav-avatar');
    var name = byId('nav-profile-name');
    if (avatar) {
      avatar.textContent = firstLetter(state.activeProfile);
      avatar.style.background = avatarColor(state.activeProfile);
    }
    if (name) {
      name.textContent = state.activeProfile;
    }
  }

  function renderBanner(status) {
    var banner = byId('db-banner');
    var label = byId('banner-label');
    var message = byId('banner-message');
    var details = byId('banner-details');
    if (!banner) {
      return;
    }

    var connected = Boolean(status && status.connected);

    banner.classList.toggle('ok', connected);
    banner.classList.toggle('fail', !connected);

    // At rest the pill only shows this two-word label. The full message plus
    // the environment/host/engine appear when it is hovered, focused or tapped.
    if (label) {
      label.textContent = connected ? 'DB connected' : 'DB offline';
    }

    if (message) {
      message.textContent = (status && status.message) ||
        (connected ? 'Connected' : 'Database connection FAILED');
    }
    if (details) {
      var parts = [];
      if (status && status.deployment_env) {
        parts.push(status.deployment_env);
      }
      if (status && status.db_host) {
        parts.push(status.db_host);
      }
      if (status && status.db_engine) {
        parts.push(status.db_engine);
      }
      details.textContent = parts.join(' \u00B7 ');
    }
  }

  function buildHero() {
    var hero = byId('hero');
    var titleNode = byId('hero-title');
    var genreNode = byId('hero-genre');
    if (!hero || !titleNode || !state.catalog.length) {
      return;
    }

    var pick = state.catalog[Math.floor(Math.random() * state.catalog.length)];
    state.featured = pick;

    titleNode.textContent = pick.title;
    if (genreNode) {
      genreNode.textContent = pick.genre || '';
    }
    hero.style.background = heroGradient(pick.title);

    updateHeroAddButton();
  }

  function updateHeroAddButton() {
    var button = byId('hero-add-btn');
    if (!button || !state.featured) {
      return;
    }

    var inList = isInMyList(state.featured.title);

    button.textContent = '';
    var icon = el('span', 'btn-icon', inList ? '\u2713' : '+');
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    button.appendChild(document.createTextNode(inList ? ' In My List' : ' My List'));

    button.classList.toggle('in-list', inList);
    button.setAttribute('aria-pressed', inList ? 'true' : 'false');
    button.setAttribute('aria-label', inList ? 'Remove from My List' : 'Add to My List');
    button.setAttribute('title', inList ? 'Remove from My List' : 'Add to My List');
  }

  /* =======================================================================
   * Cards and rows
   * ===================================================================== */

  function buildCard(item, showRemove) {
    var card = el('article', 'card');
    card.dataset.title = item.title;

    // Poster = a button, so keyboard users can open the modal with Enter.
    var poster = el('button', 'card-poster');
    poster.type = 'button';
    poster.style.background = posterGradient(item.title);
    poster.setAttribute('aria-label', item.title + ' - open details');
    poster.appendChild(el('span', 'card-title', item.title));
    poster.addEventListener('click', function () {
      openModal(item);
    });

    // Hover panel: play, add/added, info.
    var info = el('div', 'card-info');

    var actions = el('div', 'card-actions');

    var play = el('button', 'icon-btn icon-btn-play', '\u25B6');
    play.type = 'button';
    play.setAttribute('aria-label', 'Play ' + item.title);
    play.addEventListener('click', toastPlayback);

    // "+" is a toggle: it adds when the title is missing and removes when the
    // active profile already has it. The icon and label below say which.
    var alreadySaved = isInMyList(item.title);
    var add = el('button', 'icon-btn icon-btn-add', alreadySaved ? '\u2713' : '+');
    add.type = 'button';
    add.classList.toggle('in-list', alreadySaved);
    add.setAttribute('aria-label', alreadySaved ? 'Remove from My List' : 'Add to My List');
    add.setAttribute('title', alreadySaved ? 'Remove from My List' : 'Add to My List');
    add.addEventListener('click', function () {
      toggleListItem(item, add);
    });

    var infoButton = el('button', 'icon-btn icon-btn-info', '\u24D8');
    infoButton.type = 'button';
    infoButton.setAttribute('aria-label', 'More about ' + item.title);
    infoButton.addEventListener('click', function () {
      openModal(item);
    });

    actions.appendChild(play);
    actions.appendChild(add);
    actions.appendChild(infoButton);

    var meta = el('div', 'card-meta');
    meta.appendChild(el('span', 'match', matchFor(item.title) + '% Match'));
    meta.appendChild(el('span', 'badge-16', '16+'));

    info.appendChild(actions);
    info.appendChild(meta);
    info.appendChild(el('p', 'card-genre', item.genre || ''));

    // Cards inside the My List row also get their own "x" button, so a title
    // can be removed without opening the hover panel first.
    if (showRemove) {
      var remove = el('button', 'card-remove', '\u2715');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove from My List');
      remove.setAttribute('title', 'Remove from My List');
      remove.addEventListener('click', function () {
        removeFromMyList(item, remove);
      });
      card.appendChild(remove);
    }

    card.appendChild(poster);
    card.appendChild(info);
    return card;
  }

  /** One horizontally scrolling row. `emptyText` shows when there is no card. */
  function buildRow(title, rowId, items, emptyText, showRemove) {
    var section = el('section', 'row');
    if (rowId) {
      section.id = rowId;
    }

    var head = el('div', 'row-head');
    head.appendChild(el('h2', 'row-title', title));
    section.appendChild(head);

    var wrap = el('div', 'row-wrap');

    var left = el('button', 'row-arrow row-arrow-left', '\u2039');
    left.type = 'button';
    left.setAttribute('aria-label', 'Scroll ' + title + ' left');

    var strip = el('div', 'row-strip');
    strip.setAttribute('tabindex', '0');
    strip.setAttribute('aria-label', title + ' row, use the arrow keys to scroll');

    var right = el('button', 'row-arrow row-arrow-right', '\u203A');
    right.type = 'button';
    right.setAttribute('aria-label', 'Scroll ' + title + ' right');

    if (items.length) {
      items.forEach(function (item) {
        strip.appendChild(buildCard(item, Boolean(showRemove)));
      });
    } else if (emptyText) {
      strip.appendChild(el('p', 'row-empty', emptyText));
    }

    function scrollRow(direction) {
      strip.scrollBy({
        left: Math.round(strip.clientWidth * ARROW_SCROLL_RATIO) * direction,
        behavior: scrollBehavior()
      });
    }

    left.addEventListener('click', function () { scrollRow(-1); });
    right.addEventListener('click', function () { scrollRow(1); });

    strip.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollRow(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollRow(-1);
      }
    });

    wrap.appendChild(left);
    wrap.appendChild(strip);
    wrap.appendChild(right);
    section.appendChild(wrap);
    return section;
  }

  function myListEmptyText() {
    if (!state.entriesAvailable || !state.status || !state.status.connected) {
      return 'Database unavailable';
    }
    return 'Your list is empty. Add titles with the + button.';
  }

  function buildRows() {
    var rows = byId('rows');
    if (!rows) {
      return;
    }
    rows.textContent = '';

    rows.appendChild(buildRow('My List', 'row-mylist', myListItems(), myListEmptyText(), true));
    rows.appendChild(buildRow('Trending Now', 'row-trending', state.catalog.slice(), ''));

    genreList().forEach(function (genre) {
      var items = state.catalog.filter(function (item) {
        return item.genre === genre;
      });
      rows.appendChild(buildRow(genre, null, items, ''));
    });
  }

  /** Rebuild only the My List row, e.g. right after an add. */
  function refreshMyListRow() {
    var old = byId('row-mylist');
    if (!old) {
      return;
    }
    old.replaceWith(buildRow('My List', 'row-mylist', myListItems(), myListEmptyText(), true));
  }

  /** Sync every "+" / "✓" indicator with the current list state. */
  function updateListIndicators() {
    var cards = document.querySelectorAll('#rows .card');
    for (var i = 0; i < cards.length; i += 1) {
      var card = cards[i];
      var button = card.querySelector('.icon-btn-add');
      if (!button) {
        continue;
      }
      var inList = isInMyList(card.dataset.title);
      button.textContent = inList ? '\u2713' : '+';
      button.classList.toggle('in-list', inList);
      button.setAttribute('aria-label', inList ? 'Remove from My List' : 'Add to My List');
      button.setAttribute('title', inList ? 'Remove from My List' : 'Add to My List');
    }
    updateHeroAddButton();
    updateModalAddButton();
  }

  /* =======================================================================
   * Adding a title
   * ===================================================================== */

  /** The id of the active profile's saved row for a title, or null. */
  function entryIdFor(title) {
    for (var i = 0; i < state.entries.length; i += 1) {
      var entry = state.entries[i];
      if (entry.user_name === state.activeProfile && entry.title === title) {
        return entry.id;
      }
    }
    return null;
  }

  /** Drop one id from local state once the server confirmed it is gone. */
  function dropLocalEntry(entryId) {
    state.entries = state.entries.filter(function (entry) {
      return entry.id !== entryId;
    });
  }

  /** Single entry point for the card and hero buttons: add or remove. */
  function toggleListItem(item, button) {
    if (isInMyList(item.title)) {
      removeFromMyList(item, button);
    } else {
      addToMyList(item, button);
    }
  }

  function addToMyList(item, button) {
    // Safety net: the toggle normally routes this case to removeFromMyList.
    if (isInMyList(item.title)) {
      removeFromMyList(item, button);
      return;
    }

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }

    window.fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        user_name: state.activeProfile,
        title: item.title,
        genre: item.genre || null
      })
    })
      .then(function (response) {
        return response.json()
          .catch(function () { return {}; })
          .then(function (data) {
            return { ok: response.ok, status: response.status, data: data };
          });
      })
      .then(function (result) {
        if (result.status === 201 && result.data && result.data.entry) {
          // Newest first, exactly like GET /api/watchlist orders its rows.
          state.entries.unshift(result.data.entry);
          state.entriesAvailable = true;
          toast('Added to My List');
          refreshMyListRow();
          updateListIndicators();
          renderBanner(state.status);
          return;
        }

        var detail = result.data && typeof result.data.error === 'string'
          ? result.data.error
          : 'Could not save that title';
        toast(detail);

        // A 500 means the database is unreachable: flip the banner right away
        // instead of waiting for the next 10 second poll.
        if (result.status >= 500) {
          refreshStatus();
        }
      })
      .catch(function () {
        toast('Could not reach the server');
      })
      .finally(function () {
        if (button) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      });
  }

  function removeFromMyList(item, button) {
    var entryId = entryIdFor(item.title);
    if (entryId === null) {
      // Local state already forgot it, so there is nothing to ask the server.
      toast('Already removed');
      refreshMyListRow();
      updateListIndicators();
      return;
    }

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }

    window.fetch('/api/watchlist/' + encodeURIComponent(entryId), {
      method: 'DELETE',
      headers: { Accept: 'application/json' }
    })
      .then(function (response) {
        return response.json()
          .catch(function () { return {}; })
          .then(function (data) {
            return { status: response.status, data: data };
          });
      })
      .then(function (result) {
        if (result.status === 200) {
          dropLocalEntry(entryId);
          toast('Removed from My List');
          refreshMyListRow();
          updateListIndicators();
          return;
        }

        if (result.status === 404) {
          // Gone on the server (second tab or a retry): drop it here too, so
          // the UI cannot keep showing a row that no longer exists.
          dropLocalEntry(entryId);
          toast('Already removed');
          refreshMyListRow();
          updateListIndicators();
          return;
        }

        var detail = result.data && typeof result.data.error === 'string'
          ? result.data.error
          : 'Could not remove that title';
        toast(detail);

        if (result.status >= 500) {
          refreshStatus();
        }
      })
      .catch(function () {
        toast('Could not reach the server');
      })
      .finally(function () {
        if (button) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      });
  }

  /* =======================================================================
   * Detail modal
   * ===================================================================== */

  function updateModalAddButton() {
    var button = byId('modal-add-btn');
    if (!button || !state.modalTitle) {
      return;
    }
    var inList = isInMyList(state.modalTitle);
    button.textContent = '';
    var icon = el('span', 'btn-icon', inList ? '\u2713' : '+');
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    button.appendChild(document.createTextNode(inList ? ' In My List' : ' My List'));
    button.classList.toggle('in-list', inList);
    button.setAttribute('aria-pressed', inList ? 'true' : 'false');
    button.setAttribute('aria-label', inList ? 'Remove from My List' : 'Add to My List');
    button.setAttribute('title', inList ? 'Remove from My List' : 'Add to My List');
  }

  function openModal(item) {
    var modal = byId('modal');
    var content = byId('modal-content');
    if (!modal || !content) {
      return;
    }

    state.modalTitle = item.title;
    lastFocusedElement = document.activeElement;
    content.textContent = '';

    var banner = el('div', 'modal-banner');
    banner.style.background = posterGradient(item.title);
    banner.appendChild(el('p', 'modal-banner-title', item.title));

    var body = el('div', 'modal-body');

    var close = el('button', 'modal-close', '\u2715');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close details');

    var title = el('h2', 'modal-title', item.title);
    title.id = 'modal-title';

    var meta = el('div', 'modal-meta');
    meta.appendChild(el('span', 'match', matchFor(item.title) + '% Match'));
    meta.appendChild(el('span', 'badge-16', '16+'));
    meta.appendChild(el('span', 'card-genre', item.genre || ''));

    var description = el('p', 'modal-desc',
      'A short, generic description so the detail view has something to say: ' +
      'this title lives in the local catalogue, and only the profile\'s list is ' +
      'saved to PostgreSQL.');

    var actions = el('div', 'modal-actions');

    var play = el('button', 'btn btn-play', '');
    play.type = 'button';
    var playIcon = el('span', 'btn-icon', '\u25B6');
    playIcon.setAttribute('aria-hidden', 'true');
    play.appendChild(playIcon);
    play.appendChild(document.createTextNode(' Play'));
    play.addEventListener('click', toastPlayback);

    var add = el('button', 'btn btn-list', '');
    add.type = 'button';
    add.id = 'modal-add-btn';
    add.addEventListener('click', function () {
      toggleListItem(item, add);
    });

    actions.appendChild(play);
    actions.appendChild(add);

    body.appendChild(close);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(description);
    body.appendChild(actions);

    content.appendChild(banner);
    content.appendChild(body);

    modal.hidden = false;
    document.body.classList.add('modal-open');
    updateModalAddButton();
    close.focus();
  }

  function closeModal() {
    var modal = byId('modal');
    if (!modal || modal.hidden) {
      return;
    }
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    state.modalTitle = '';

    // Put focus back where it came from (accessibility requirement).
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  /** Keep Tab inside the modal and let Escape close it. */
  function handleModalKeydown(event) {
    var modal = byId('modal');
    if (!modal || modal.hidden) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    var focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) {
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* =======================================================================
   * Polling: status banner (10s) and watchlist (30s)
   * ===================================================================== */

  function refreshStatus() {
    return window.fetch('/api/status', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (status) {
        var wasConnected = Boolean(state.status && state.status.connected);
        state.status = status;
        renderBanner(status);

        // The database just came back: reload My List without a page refresh.
        if (!wasConnected && status.connected) {
          refreshEntries();
        }
      })
      .catch(function () {
        // The API itself is down (not just the DB).
        state.status = {
          connected: false,
          message: 'Server unreachable',
          deployment_env: state.status && state.status.deployment_env ? state.status.deployment_env : '',
          db_host: state.status && state.status.db_host ? state.status.db_host : '',
          db_engine: null,
          error: 'The Flask API did not answer.'
        };
        renderBanner(state.status);
        refreshMyListRow();
      });
  }

  function refreshEntries() {
    return window.fetch('/api/watchlist', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.json()
          .catch(function () { return {}; })
          .then(function (data) {
            return { ok: response.ok, data: data };
          });
      })
      .then(function (result) {
        if (result.ok && Array.isArray(result.data.entries)) {
          state.entries = result.data.entries;
          state.entriesAvailable = true;
        } else {
          state.entriesAvailable = false;
        }
        refreshMyListRow();
        updateListIndicators();
      })
      .catch(function () {
        state.entriesAvailable = false;
        refreshMyListRow();
      });
  }

  /* =======================================================================
   * Wiring + boot
   * ===================================================================== */

  function buildApp() {
    buildNavbar();
    renderBanner(state.status);
    buildHero();
    buildRows();
    updateListIndicators();
  }

  function wireEvents() {
    var navMyList = byId('nav-mylist');
    if (navMyList) {
      navMyList.addEventListener('click', function (event) {
        var row = byId('row-mylist');
        if (row) {
          event.preventDefault();
          row.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
        }
      });
    }

    var switchButton = byId('switch-profile-btn');
    if (switchButton) {
      switchButton.addEventListener('click', showGate);
    }

    var addProfileButton = byId('add-profile-btn');
    if (addProfileButton) {
      addProfileButton.addEventListener('click', openAddProfilePanel);
    }

    var saveProfileButton = byId('save-profile-btn');
    if (saveProfileButton) {
      saveProfileButton.addEventListener('click', saveNewProfile);
    }

    var cancelProfileButton = byId('cancel-profile-btn');
    if (cancelProfileButton) {
      cancelProfileButton.addEventListener('click', closeAddProfilePanel);
    }

    var profileInput = byId('new-profile-name');
    if (profileInput) {
      profileInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveNewProfile();
        } else if (event.key === 'Escape') {
          closeAddProfilePanel();
        }
      });
    }

    var heroPlay = byId('hero-play-btn');
    if (heroPlay) {
      heroPlay.addEventListener('click', toastPlayback);
    }

    var heroAdd = byId('hero-add-btn');
    if (heroAdd) {
      heroAdd.addEventListener('click', function () {
        if (state.featured) {
          toggleListItem(state.featured, heroAdd);
        }
      });
    }

    // Touch screens have no hover, so a tap opens the status pill instead.
    var banner = byId('db-banner');
    if (banner) {
      banner.addEventListener('click', function () {
        var open = banner.classList.toggle('is-open');
        banner.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      banner.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          banner.click();
        }
      });
    }

    var modal = byId('modal');
    if (modal) {
      modal.addEventListener('click', function (event) {
        // The backdrop carries data-close="true"; the card itself does not.
        if (event.target && event.target.dataset && event.target.dataset.close === 'true') {
          closeModal();
        }
      });
      modal.addEventListener('keydown', handleModalKeydown);
    }

    // Navbar becomes solid after 10px of scrolling.
    var navbar = byId('navbar');
    if (navbar) {
      var updateNavbar = function () {
        navbar.classList.toggle('solid', window.scrollY > 10);
      };
      window.addEventListener('scroll', updateNavbar, { passive: true });
      updateNavbar();
    }
  }

  function init() {
    var boot = readBootData();

    state.status = boot.status;
    state.catalog = boot.catalog;
    state.entries = boot.entries;
    state.entriesAvailable = Boolean(boot.status && boot.status.connected);
    state.profiles = loadProfiles();

    var stored = loadActiveProfile();
    state.activeProfile = state.profiles.indexOf(stored) !== -1 ? stored : state.profiles[0];
    saveProfiles(state.profiles);

    renderBanner(state.status);
    renderProfiles();
    showGate();
    wireEvents();

    window.setInterval(refreshStatus, STATUS_INTERVAL_MS);
    window.setInterval(function () {
      if (state.activeProfile) {
        refreshEntries();
      }
    }, ENTRIES_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
