/**
 * gallery.js — Hecatomb Endbringer's Compendium
 *
 * Hecatomb-specific CSV columns (case-insensitive):
 *   name        — card name                           (required)
 *   type        — Minion | Fate | Relic | God
 *   doom        — corruption | deceit | destruction | greed
 *   cost        — mana cost (integer)
 *   strength    — minion combat strength
 *   subtype     — e.g. Beast, Cultist, Animate, Aztecal…
 *   set         — Base Set | Last Hallow's Eve | Blanket of Lies | Promo
 *   abilities   — rules / ability text
 *   flavor      — flavor text
 *   image       — URL to card art
 *   emoji       — fallback art emoji
 *   rarity      — common | uncommon | rare (optional, not a core Hecatomb field but supported)
 *
 * Any extra columns are stored and shown in the detail modal.
 */

(function () {
  "use strict";

  /* ══════════════════════════════════════════
     STATE
  ══════════════════════════════════════════ */
  let allCards = [];
  let filteredCards = [];
  let deck = {};
  let viewMode = "grid";
  let editingId = null;
  let focusedIdx = -1;

  const DOOM_ORDER = { corruption: 0, deceit: 1, destruction: 2, greed: 3 };
  const TYPE_ORDER = { Minion: 0, Fate: 1, Relic: 2, God: 3 };

  /* ══════════════════════════════════════════
     DOOM EMOJI MAP
  ══════════════════════════════════════════ */
  const DOOM_EMOJI = {
    corruption: "🦠",
    deceit: "👁️",
    destruction: "💀",
    greed: "💰",
  };
  const TYPE_EMOJI = {
    Minion: "👹",
    Fate: "⚡",
    Relic: "🔮",
    God: "☠️",
  };
  const SUBTYPE_EMOJI = {
    beast: "🐉",
    aztecal: "🗿",
    cultist: "🧿",
    animate: "🤖",
    demon: "😈",
    elder: "📖",
    ghost: "👻",
    vampire: "🧛",
    werewolf: "🐺",
    witch: "🧙",
    alien: "👽",
    zombie: "🧟",
    deity: "⛧",
    god: "☠️",
  };

  /* ══════════════════════════════════════════
     DOM REFS
  ══════════════════════════════════════════ */
  const gallery = document.getElementById("gallery");
  const csvInput = document.getElementById("csv-input");
  const searchInput = document.getElementById("search");
  const filterSet = document.getElementById("filter-set");
  const sortBy = document.getElementById("sort-by");
  const groupToggle = document.getElementById("group-toggle");
  const groupBy = document.getElementById("group-by");
  const cardCount = document.getElementById("card-count");
  const dropZone = document.getElementById("drop-zone");
  const statsBar = document.getElementById("stats-bar");
  const viewGrid = document.getElementById("view-grid");
  const viewList = document.getElementById("view-list");
  const exportBtn = document.getElementById("export-btn");
  const addCardBtn = document.getElementById("add-card-btn");
  const rangeStr = document.getElementById("range-str");
  const rangeCost = document.getElementById("range-cost");
  const rangeStrVal = document.getElementById("range-str-val");
  const rangeCostVal = document.getElementById("range-cost-val");
  const doomChips = document.querySelectorAll(".doom-chip");
  const typeChips = document.querySelectorAll(".type-chip");

  // modal
  const modalOverlay = document.getElementById("modal-overlay");
  const modalEl = document.getElementById("modal");
  const modalClose = document.getElementById("modal-close");
  const modalArt = document.getElementById("modal-art");
  const modalArtPh = document.getElementById("modal-art-ph");
  const modalName = document.getElementById("modal-name");
  const modalMeta = document.getElementById("modal-meta");
  const modalDesc = document.getElementById("modal-desc");
  const modalAbils = document.getElementById("modal-abilities");
  const modalStats = document.getElementById("modal-stats");
  const modalExtra = document.getElementById("modal-extra");
  const modalDeckBtn = document.getElementById("modal-deck-btn");

  // form
  const formOverlay = document.getElementById("form-overlay");
  const formClose = document.getElementById("form-close");
  const formCancel = document.getElementById("form-cancel");
  const formSave = document.getElementById("form-save");
  const formTitle = document.getElementById("form-title");

  // deck
  const deckPanel = document.getElementById("deck-panel");
  const deckToggle = document.getElementById("deck-toggle");
  const deckBadge = document.getElementById("deck-badge");
  const deckList = document.getElementById("deck-list");
  const deckHcount = document.getElementById("deck-hcount");
  const deckClear = document.getElementById("deck-clear");
  const deckExpCsv = document.getElementById("deck-export-csv");
  const deckExpTxt = document.getElementById("deck-export-txt");

  // toast / stats
  const toast = document.getElementById("toast");
  const statTotal = document.getElementById("stat-total");

  /* ══════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════ */
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normDoom(raw) {
    const d = (raw || "").toLowerCase().trim();
    return ["corruption", "deceit", "destruction", "greed"].includes(d)
      ? d
      : "corruption";
  }

  function normType(raw) {
    const t = (raw || "").trim();
    const tl = t.toLowerCase();
    if (tl === "minion") return "Minion";
    if (tl === "fate") return "Fate";
    if (tl === "relic") return "Relic";
    if (tl === "god") return "God";
    return t || "Minion";
  }

  function cardEmoji(card) {
    if (card.emoji) return card.emoji;
    // try subtype first
    const sub = (card.subtype || "").toLowerCase().split(/[,\s]/)[0];
    if (SUBTYPE_EMOJI[sub]) return SUBTYPE_EMOJI[sub];
    // type
    const t = normType(card.type);
    if (TYPE_EMOJI[t]) return TYPE_EMOJI[t];
    // doom
    return DOOM_EMOJI[normDoom(card.doom)] || "⛧";
  }

  function cardId(card) {
    return card._id || (card._id = Math.random().toString(36).slice(2));
  }

  /* ══════════════════════════════════════════
     CSV PARSING
  ══════════════════════════════════════════ */
  function splitLine(line) {
    const fields = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        fields.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  }

  function parseCSV(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2)
      return { cards: [], warnings: ["File has no data rows."] };

    const headers = splitLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, "_"),
    );
    const warnings = [];
    if (!headers.includes("name")) warnings.push("No 'name' column found.");

    const cards = lines.slice(1).map((line, i) => {
      const vals = splitLine(line);
      const obj = {};
      headers.forEach((h, j) => {
        obj[h] = vals[j] !== undefined ? vals[j] : "";
      });
      cardId(obj);
      if (!obj.name) warnings.push(`Row ${i + 2}: missing name.`);
      return obj;
    });

    return { cards, warnings };
  }

  /* ══════════════════════════════════════════
     STATS
  ══════════════════════════════════════════ */
  function updateStats() {
    if (!allCards.length) {
      statsBar.classList.remove("visible");
      return;
    }
    statsBar.classList.add("visible");

    statTotal.textContent = `${allCards.length} Card${allCards.length !== 1 ? "s" : ""}`;

    const dc = { corruption: 0, deceit: 0, destruction: 0, greed: 0 };
    const tc = { Minion: 0, Fate: 0, Relic: 0, God: 0 };
    allCards.forEach((c) => {
      const d = normDoom(c.doom);
      dc[d] = (dc[d] || 0) + 1;
      const t = normType(c.type);
      tc[t] = (tc[t] || 0) + 1;
    });
    document.getElementById("sn-c").textContent = dc.corruption;
    document.getElementById("sn-d").textContent = dc.deceit;
    document.getElementById("sn-x").textContent = dc.destruction;
    document.getElementById("sn-g").textContent = dc.greed;
    document.getElementById("sn-m").textContent = tc.Minion;
    document.getElementById("sn-f").textContent = tc.Fate;
    document.getElementById("sn-r").textContent = tc.Relic;
    document.getElementById("sn-go").textContent = tc.God;
  }

  /* ══════════════════════════════════════════
     SET FILTER
  ══════════════════════════════════════════ */
  function populateSetFilter() {
    const cur = filterSet.value;
    const sets = [
      ...new Set(allCards.map((c) => (c.set || "").trim()).filter(Boolean)),
    ].sort();
    filterSet.innerHTML = `<option value="">All Sets</option>`;
    sets.forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      if (s === cur) o.selected = true;
      filterSet.appendChild(o);
    });
  }

  /* ══════════════════════════════════════════
     RANGE MAXIMA
  ══════════════════════════════════════════ */
  function updateRangeMaxima() {
    let maxStr = 0,
      maxCost = 0;
    allCards.forEach((c) => {
      const s = parseFloat(c.strength);
      if (!isNaN(s)) maxStr = Math.max(maxStr, s);
      const co = parseFloat(c.cost);
      if (!isNaN(co)) maxCost = Math.max(maxCost, co);
    });
    rangeStr.max = Math.max(maxStr, 20);
    rangeCost.max = Math.max(maxCost, 10);
  }

  /* ══════════════════════════════════════════
     ACTIVE FILTER SETS
  ══════════════════════════════════════════ */
  function activeDoomSet() {
    const s = new Set();
    doomChips.forEach((c) => {
      if (c.classList.contains("active")) s.add(c.dataset.d);
    });
    return s;
  }
  function activeTypeSet() {
    const s = new Set();
    typeChips.forEach((c) => {
      if (c.classList.contains("active")) s.add(c.dataset.t);
    });
    return s;
  }

  /* ══════════════════════════════════════════
     FILTER + SORT
  ══════════════════════════════════════════ */
  function applyFiltersAndSort() {
    const query = searchInput.value.toLowerCase().trim();
    const setVal = filterSet.value;
    const dooms = activeDoomSet();
    const types = activeTypeSet();
    const minStr = parseInt(rangeStr.value, 10);
    const minCost = parseInt(rangeCost.value, 10);

    filteredCards = allCards.filter((card) => {
      const doom = normDoom(card.doom);
      const type = normType(card.type);

      if (!dooms.has(doom)) return false;
      if (!types.has(type)) return false;
      if (setVal && (card.set || "") !== setVal) return false;

      if (minStr > 0) {
        const s = parseFloat(card.strength);
        if (isNaN(s) || s < minStr) return false;
      }
      if (minCost > 0) {
        const c = parseFloat(card.cost);
        if (isNaN(c) || c < minCost) return false;
      }

      if (query) {
        return (
          (card.name || "").toLowerCase().includes(query) ||
          (card.subtype || "").toLowerCase().includes(query) ||
          (card.abilities || "").toLowerCase().includes(query) ||
          (card.flavor || "").toLowerCase().includes(query) ||
          doom.includes(query) ||
          type.toLowerCase().includes(query)
        );
      }
      return true;
    });

    // sort
    const [field, dir] = sortBy.value.split("-");
    filteredCards.sort((a, b) => {
      if (field === "name") {
        const va = (a.name || "").toLowerCase(),
          vb = (b.name || "").toLowerCase();
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (field === "cost") {
        const va = parseFloat(a.cost) || 0,
          vb = parseFloat(b.cost) || 0;
        return dir === "asc" ? va - vb : vb - va;
      }
      if (field === "strength") {
        return (parseFloat(b.strength) || 0) - (parseFloat(a.strength) || 0);
      }
      if (field === "doom") {
        return (
          (DOOM_ORDER[normDoom(a.doom)] || 0) -
          (DOOM_ORDER[normDoom(b.doom)] || 0)
        );
      }
      if (field === "type") {
        return (
          (TYPE_ORDER[normType(a.type)] || 0) -
          (TYPE_ORDER[normType(b.type)] || 0)
        );
      }
      return 0;
    });
  }

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  function renderGallery() {
    applyFiltersAndSort();
    gallery.innerHTML = "";

    if (!filteredCards.length) {
      gallery.innerHTML = !allCards.length
        ? `<div class="state-message">
             <div class="sigil">☽⛧☾</div>
             <h2>The Apocalypse Awaits</h2>
             <p>Import a CSV of your Hecatomb collection to begin.<br/>
             Expected columns: <em>name, type, doom, cost, strength, subtype, set, abilities, flavor, image</em><br/>
             Or drag &amp; drop a CSV file anywhere on the page.</p>
           </div>`
        : `<div class="state-message">
             <div class="sigil">🔍</div>
             <h2>No Cards Found</h2>
             <p>Try adjusting your search or filters.</p>
           </div>`;
      cardCount.textContent = "";
      return;
    }

    const isList = viewMode === "list";
    const doGroup = groupToggle.checked;
    const gField = groupBy.value; // doom | type | set
    gallery.classList.toggle("list-view", isList);

    const frag = document.createDocumentFragment();

    if (doGroup) {
      const groups = {};
      filteredCards.forEach((card) => {
        let key;
        if (gField === "doom") key = normDoom(card.doom);
        else if (gField === "type") key = normType(card.type);
        else key = (card.set || "Unknown Set").trim();
        if (!groups[key]) groups[key] = [];
        groups[key].push(card);
      });

      // sort group keys
      let keys = Object.keys(groups);
      if (gField === "doom")
        keys.sort((a, b) => (DOOM_ORDER[a] || 0) - (DOOM_ORDER[b] || 0));
      else if (gField === "type")
        keys.sort((a, b) => (TYPE_ORDER[a] || 0) - (TYPE_ORDER[b] || 0));
      else keys.sort();

      keys.forEach((key) => {
        const hdr = document.createElement("div");
        hdr.className = "group-header";
        if (gField === "doom") {
          hdr.classList.add(`gh-${key}`);
          hdr.textContent = `${key.charAt(0).toUpperCase() + key.slice(1)} (${groups[key].length})`;
        } else {
          hdr.classList.add("gh-neutral");
          hdr.textContent = `${key} (${groups[key].length})`;
        }
        frag.appendChild(hdr);
        groups[key].forEach((card, i) =>
          frag.appendChild(buildCard(card, i, isList)),
        );
      });
    } else {
      filteredCards.forEach((card, i) =>
        frag.appendChild(buildCard(card, i, isList)),
      );
    }

    gallery.appendChild(frag);
    cardCount.textContent = `${filteredCards.length} of ${allCards.length} card${allCards.length !== 1 ? "s" : ""}`;
    focusedIdx = -1;
  }

  /* ══════════════════════════════════════════
     BUILD CARD ELEMENT
  ══════════════════════════════════════════ */
  function buildCard(card, index, isList) {
    const doom = normDoom(card.doom);
    const type = normType(card.type);
    const name = card.name || "Unknown Card";
    const subtype = card.subtype || "";
    const cost = card.cost !== undefined && card.cost !== "" ? card.cost : "?";
    const strength = card.strength || "";
    const set = card.set || "";
    const abilities = card.abilities || "";
    const flavor = card.flavor || card.description || card.desc || "";
    const emoji = cardEmoji(card);

    const el = document.createElement("div");
    el.className = isList ? "card list-card" : "card";
    el.dataset.doom = doom;
    el.dataset.ctype = type;
    el.dataset.id = cardId(card);
    el.style.animationDelay = `${Math.min(index, 40) * 33}ms`;
    el.tabIndex = 0;

    // art
    let artHTML;
    if (card.image && card.image.startsWith("http")) {
      artHTML = `<img class="card-art" src="${esc(card.image)}" alt="${esc(name)}"
                      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
                 <div class="card-art-placeholder" style="display:none">${emoji}</div>`;
    } else {
      artHTML = `<div class="card-art-placeholder">${emoji}</div>`;
    }

    // bottom stat row
    let bottomHTML = "";
    if (type === "Minion" && strength !== "") {
      bottomHTML = `<div class="card-bottom">
        <span class="strength-label">STR</span>
        <span class="strength-val">${esc(String(strength))}</span>
        ${set ? `<span class="set-label">${esc(set)}</span>` : ""}
      </div>`;
    } else if (set) {
      bottomHTML = `<div class="card-bottom"><span class="set-label" style="margin-left:0">${esc(set)}</span></div>`;
    }

    const textSnippet = abilities || flavor;

    el.innerHTML = `
      <div class="card-topbar"></div>
      <div class="card-corner"></div>
      ${artHTML}
      <div class="card-body">
        <div class="card-header-row">
          <div class="card-name" title="${esc(name)}">${esc(name)}</div>
          <div class="card-cost">${esc(String(cost))}</div>
        </div>
        <div class="card-meta">
          <span class="card-type-badge ${type}">${type}</span>
          ${subtype ? `<span class="card-subtype">${esc(subtype)}</span>` : ""}
          <span class="card-doom-badge ${doom}">${doom.charAt(0).toUpperCase() + doom.slice(1)}</span>
        </div>
        ${textSnippet ? `<div class="card-divider"></div><div class="card-text">${esc(textSnippet)}</div>` : ""}
        ${bottomHTML}
      </div>
      <button class="deck-add-btn" title="Add to deck">＋</button>`;

    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("deck-add-btn")) {
        addToDeck(card);
        return;
      }
      openModal(card);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(card);
      }
    });
    el.querySelector(".deck-add-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      addToDeck(card);
    });

    return el;
  }

  /* ══════════════════════════════════════════
     MODAL
  ══════════════════════════════════════════ */
  let modalCard = null;

  function openModal(card) {
    modalCard = card;
    const doom = normDoom(card.doom);
    const type = normType(card.type);
    const name = card.name || "Unknown Card";
    const subtype = card.subtype || "";
    const cost = card.cost !== undefined && card.cost !== "" ? card.cost : "?";
    const strength = card.strength || "";
    const set = card.set || "";
    const abilities = card.abilities || "";
    const flavor = card.flavor || card.description || card.desc || "";
    const emoji = cardEmoji(card);

    modalEl.dataset.doom = doom;
    modalEl.dataset.ctype = type;
    modalName.textContent = name;

    // meta row
    modalMeta.innerHTML = `
      <span class="card-type-badge ${type}">${type}</span>
      ${subtype ? `<span style="font-size:.8rem;color:var(--muted);font-style:italic">${esc(subtype)}</span>` : ""}
      <span class="card-doom-badge ${doom}" style="font-size:.74rem">${doom.charAt(0).toUpperCase() + doom.slice(1)}</span>
      ${set ? `<span style="font-size:.74rem;color:var(--muted);margin-left:auto;font-style:italic">${esc(set)}</span>` : ""}`;

    // flavor (italic)
    modalDesc.textContent = flavor;
    modalDesc.style.display = flavor ? "block" : "none";
    // abilities (normal text)
    modalAbils.textContent = abilities;
    modalAbils.style.display = abilities ? "block" : "none";

    // art
    if (card.image && card.image.startsWith("http")) {
      modalArt.src = card.image;
      modalArt.style.display = "block";
      modalArtPh.style.display = "none";
      modalArt.onerror = () => {
        modalArt.style.display = "none";
        modalArtPh.style.display = "flex";
        modalArtPh.textContent = emoji;
      };
    } else {
      modalArt.style.display = "none";
      modalArtPh.style.display = "flex";
      modalArtPh.textContent = emoji;
    }

    // stats
    const statDefs = [
      { label: "Cost", value: cost },
      { label: "Strength", value: strength },
    ].filter((s) => s.value !== "");
    modalStats.innerHTML = statDefs
      .map(
        (s) =>
          `<div class="m-stat"><label>${esc(s.label)}</label><span>${esc(String(s.value))}</span></div>`,
      )
      .join("");
    modalStats.style.display = statDefs.length ? "flex" : "none";

    // extra columns
    const known = new Set([
      "name",
      "type",
      "doom",
      "cost",
      "strength",
      "subtype",
      "set",
      "abilities",
      "flavor",
      "description",
      "desc",
      "image",
      "emoji",
      "_id",
    ]);
    const extras = Object.entries(card).filter(([k, v]) => !known.has(k) && v);
    modalExtra.innerHTML = extras.length
      ? extras
          .map(
            ([k, v]) =>
              `<span style="color:var(--muted)">${esc(k.replace(/_/g, " "))}:</span> <span>${esc(v)}</span>`,
          )
          .join(" &nbsp;·&nbsp; ")
      : "";
    modalExtra.style.display = extras.length ? "block" : "none";

    modalDeckBtn.textContent = "⛧ Add to Deck";
    modalOverlay.classList.add("open");
  }

  function closeModal() {
    modalOverlay.classList.remove("open");
    modalCard = null;
  }

  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  modalDeckBtn.addEventListener("click", () => {
    if (modalCard) {
      addToDeck(modalCard);
      modalDeckBtn.textContent = "✓ Added!";
    }
  });

  /* ══════════════════════════════════════════
     DECK
  ══════════════════════════════════════════ */
  function addToDeck(card) {
    const id = cardId(card);
    if (deck[id]) deck[id].count++;
    else deck[id] = { card, count: 1 };
    saveDeck();
    renderDeck();
    showToast(`${card.name || "Card"} added to deck`);
  }

  function changeDeckCount(id, delta) {
    if (!deck[id]) return;
    deck[id].count += delta;
    if (deck[id].count <= 0) {
      delete deck[id];
    }
    saveDeck();
    renderDeck();
  }

  function renderDeck() {
    const entries = Object.values(deck);
    const total = entries.reduce((s, e) => s + e.count, 0);
    deckBadge.textContent = total;
    deckBadge.classList.toggle("visible", total > 0);
    deckHcount.textContent = `${total} card${total !== 1 ? "s" : ""}`;

    if (!entries.length) {
      deckList.innerHTML = `<div class="deck-empty">Add cards to build your deck</div>`;
      return;
    }

    deckList.innerHTML = "";
    entries
      .sort((a, b) => (a.card.name || "").localeCompare(b.card.name || ""))
      .forEach(({ card, count }) => {
        const id = cardId(card);
        const div = document.createElement("div");
        div.className = "deck-entry";
        div.innerHTML = `
        <span class="deck-entry-emoji">${cardEmoji(card)}</span>
        <div class="deck-entry-info">
          <div class="deck-entry-name">${esc(card.name || "Unknown")}</div>
          <div class="deck-entry-sub">${esc(normType(card.type))} · ${esc(normDoom(card.doom))}</div>
        </div>
        <div class="deck-count-ctrl">
          <button class="dm">−</button>
          <span class="deck-count-num">${count}</span>
          <button class="dp">＋</button>
        </div>`;
        div
          .querySelector(".dm")
          .addEventListener("click", () => changeDeckCount(id, -1));
        div
          .querySelector(".dp")
          .addEventListener("click", () => changeDeckCount(id, +1));
        deckList.appendChild(div);
      });
  }

  deckToggle.addEventListener("click", () =>
    deckPanel.classList.toggle("collapsed"),
  );
  deckClear.addEventListener("click", () => {
    deck = {};
    saveDeck();
    renderDeck();
    showToast("Deck cleared");
  });

  /* ══════════════════════════════════════════
     ADD / EDIT FORM
  ══════════════════════════════════════════ */
  function openForm(card = null) {
    editingId = card ? cardId(card) : null;
    formTitle.textContent = card ? "⛧ Edit Card" : "⛧ Summon New Card";
    document.getElementById("f-name").value = card ? card.name || "" : "";
    document.getElementById("f-type").value = card
      ? normType(card.type)
      : "Minion";
    document.getElementById("f-doom").value = card
      ? normDoom(card.doom)
      : "corruption";
    document.getElementById("f-cost").value = card ? card.cost || "" : "";
    document.getElementById("f-strength").value = card
      ? card.strength || ""
      : "";
    document.getElementById("f-subtype").value = card ? card.subtype || "" : "";
    document.getElementById("f-set").value = card
      ? card.set || "Base Set"
      : "Base Set";
    document.getElementById("f-emoji").value = card ? card.emoji || "" : "";
    document.getElementById("f-image").value = card ? card.image || "" : "";
    document.getElementById("f-abilities").value = card
      ? card.abilities || ""
      : "";
    document.getElementById("f-flavor").value = card ? card.flavor || "" : "";
    formOverlay.classList.add("open");
    document.getElementById("f-name").focus();
  }

  function closeForm() {
    formOverlay.classList.remove("open");
    editingId = null;
  }

  formSave.addEventListener("click", () => {
    const name = document.getElementById("f-name").value.trim();
    if (!name) {
      showToast("Name is required");
      return;
    }

    const newCard = {
      name,
      type: document.getElementById("f-type").value,
      doom: document.getElementById("f-doom").value,
      cost: document.getElementById("f-cost").value.trim(),
      strength: document.getElementById("f-strength").value.trim(),
      subtype: document.getElementById("f-subtype").value.trim(),
      set: document.getElementById("f-set").value,
      emoji: document.getElementById("f-emoji").value.trim(),
      image: document.getElementById("f-image").value.trim(),
      abilities: document.getElementById("f-abilities").value.trim(),
      flavor: document.getElementById("f-flavor").value.trim(),
    };

    if (editingId) {
      const idx = allCards.findIndex((c) => cardId(c) === editingId);
      if (idx !== -1) {
        newCard._id = editingId;
        allCards[idx] = newCard;
        if (deck[editingId]) deck[editingId].card = newCard;
        showToast(`${name} updated`);
      }
    } else {
      cardId(newCard);
      allCards.push(newCard);
      showToast(`${name} summoned`);
    }

    saveCollection();
    populateSetFilter();
    updateRangeMaxima();
    updateStats();
    renderGallery();
    renderDeck();
    closeForm();
  });

  addCardBtn.addEventListener("click", () => openForm());
  formClose.addEventListener("click", closeForm);
  formCancel.addEventListener("click", closeForm);
  formOverlay.addEventListener("click", (e) => {
    if (e.target === formOverlay) closeForm();
  });

  /* ══════════════════════════════════════════
     CSV IMPORT
  ══════════════════════════════════════════ */
  // True when the gallery still shows the built-in defaults
  // (nothing has been saved to localStorage yet).
  function isUsingDefaults() {
    try {
      return !localStorage.getItem("hcg_collection");
    } catch (_) {
      return true;
    }
  }

  function importText(text, filename) {
    const { cards, warnings } = parseCSV(text);
    if (!cards.length) {
      showToast("No cards found in " + filename);
      return;
    }

    // First real import replaces defaults; subsequent imports merge.
    allCards = isUsingDefaults() ? cards : [...allCards, ...cards];
    saveCollection();
    populateSetFilter();
    updateRangeMaxima();
    updateStats();
    renderGallery();

    let msg = `Imported ${cards.length} card${cards.length !== 1 ? "s" : ""} from ${filename}`;
    if (warnings.length) {
      msg += ` (${warnings.length} warning${warnings.length > 1 ? "s" : ""})`;
      console.warn("[Hecatomb]", warnings);
    }
    showToast(msg, warnings.length ? 4000 : 2500);
  }

  csvInput.addEventListener("change", (e) => {
    Array.from(e.target.files).forEach((file) => {
      const r = new FileReader();
      r.onload = (ev) => {
        e.target.value = "";
        importText(ev.target.result, file.name);
      };
      r.onerror = () => showToast("Could not read " + file.name);
      r.readAsText(file);
    });
  });

  // drag & drop
  let dragCtr = 0;
  document.addEventListener("dragenter", (e) => {
    if (e.dataTransfer.types.includes("Files")) {
      dragCtr++;
      dropZone.classList.add("active");
    }
  });
  document.addEventListener("dragleave", () => {
    if (--dragCtr <= 0) {
      dragCtr = 0;
      dropZone.classList.remove("active");
    }
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCtr = 0;
    dropZone.classList.remove("active");
    Array.from(e.dataTransfer.files).forEach((file) => {
      if (!file.name.endsWith(".csv")) {
        showToast(`${file.name} is not a CSV`);
        return;
      }
      const r = new FileReader();
      r.onload = (ev) => importText(ev.target.result, file.name);
      r.onerror = () => showToast("Could not read " + file.name);
      r.readAsText(file);
    });
  });

  /* ══════════════════════════════════════════
     EXPORT
  ══════════════════════════════════════════ */
  function toCSV(cards) {
    if (!cards.length) return "";
    const coreKeys = [
      "name",
      "type",
      "doom",
      "cost",
      "strength",
      "subtype",
      "set",
      "abilities",
      "flavor",
      "image",
      "emoji",
    ];
    const extraKeys = [
      ...new Set(
        cards.flatMap((c) =>
          Object.keys(c).filter((k) => !coreKeys.includes(k) && k !== "_id"),
        ),
      ),
    ];
    const allKeys = [...coreKeys, ...extraKeys];
    const rows = cards.map((c) =>
      allKeys
        .map((k) => {
          const v = String(c[k] || "").replace(/"/g, '""');
          return v.includes(",") || v.includes('"') || v.includes("\n")
            ? `"${v}"`
            : v;
        })
        .join(","),
    );
    return [allKeys.join(","), ...rows].join("\r\n");
  }

  function dl(text, filename, mime = "text/csv") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  exportBtn.addEventListener("click", () => {
    if (!filteredCards.length) {
      showToast("No cards to export");
      return;
    }
    dl(toCSV(filteredCards), "hecatomb_export.csv");
    showToast(`Exported ${filteredCards.length} cards`);
  });

  deckExpCsv.addEventListener("click", () => {
    const cards = Object.values(deck).flatMap(({ card, count }) =>
      Array(count).fill(card),
    );
    if (!cards.length) {
      showToast("Deck is empty");
      return;
    }
    dl(toCSV(cards), "hecatomb_deck.csv");
    showToast("Deck exported as CSV");
  });

  deckExpTxt.addEventListener("click", () => {
    const entries = Object.values(deck);
    if (!entries.length) {
      showToast("Deck is empty");
      return;
    }
    const total = entries.reduce((s, e) => s + e.count, 0);
    const lines = [`Hecatomb Deck — ${total} cards`, "─".repeat(32)];
    entries
      .sort((a, b) => (a.card.name || "").localeCompare(b.card.name || ""))
      .forEach(({ card, count }) =>
        lines.push(
          `${count}x  ${card.name || "Unknown"}  [${normType(card.type)} · ${normDoom(card.doom)}${card.strength ? " · STR " + card.strength : ""}]`,
        ),
      );
    dl(lines.join("\n"), "hecatomb_deck.txt", "text/plain");
    showToast("Deck exported as text");
  });

  /* ══════════════════════════════════════════
     KEYBOARD NAV
  ══════════════════════════════════════════ */
  document.addEventListener("keydown", (e) => {
    if (
      formOverlay.classList.contains("open") ||
      modalOverlay.classList.contains("open")
    ) {
      if (e.key === "Escape") {
        closeModal();
        closeForm();
      }
      return;
    }
    const cards = gallery.querySelectorAll(".card");
    if (!cards.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, cards.length - 1);
      cards[focusedIdx].focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
      cards[focusedIdx].focus();
    }
  });

  /* ══════════════════════════════════════════
     FILTER / VIEW EVENTS
  ══════════════════════════════════════════ */
  viewGrid.addEventListener("click", () => {
    viewMode = "grid";
    viewGrid.classList.add("active");
    viewList.classList.remove("active");
    renderGallery();
  });
  viewList.addEventListener("click", () => {
    viewMode = "list";
    viewList.classList.add("active");
    viewGrid.classList.remove("active");
    renderGallery();
  });

  searchInput.addEventListener("input", renderGallery);
  filterSet.addEventListener("change", renderGallery);
  sortBy.addEventListener("change", renderGallery);
  groupToggle.addEventListener("change", renderGallery);
  groupBy.addEventListener("change", renderGallery);

  doomChips.forEach((c) =>
    c.addEventListener("click", () => {
      c.classList.toggle("active");
      renderGallery();
    }),
  );
  typeChips.forEach((c) =>
    c.addEventListener("click", () => {
      c.classList.toggle("active");
      renderGallery();
    }),
  );

  rangeStr.addEventListener("input", () => {
    const v = parseInt(rangeStr.value, 10);
    rangeStrVal.textContent = v === 0 ? "Any" : v;
    renderGallery();
  });
  rangeCost.addEventListener("input", () => {
    const v = parseInt(rangeCost.value, 10);
    rangeCostVal.textContent = v === 0 ? "Any" : v;
    renderGallery();
  });

  /* ══════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════ */
  let toastTimer = null;
  function showToast(msg, dur = 2500) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), dur);
  }

  /* ══════════════════════════════════════════
     LOCALSTORAGE
  ══════════════════════════════════════════ */
  function saveCollection() {
    try {
      localStorage.setItem("hcg_collection", JSON.stringify(allCards));
    } catch (_) {}
  }
  function saveDeck() {
    try {
      localStorage.setItem("hcg_deck", JSON.stringify(deck));
    } catch (_) {}
  }

  function loadFromStorage() {
    try {
      const s = localStorage.getItem("hcg_collection");
      if (s) {
        allCards = JSON.parse(s);
        allCards.forEach((c) => cardId(c));
      }
    } catch (_) {}
    try {
      const s = localStorage.getItem("hcg_deck");
      if (s) deck = JSON.parse(s);
    } catch (_) {}
  }

  /* ══════════════════════════════════════════
     DEFAULT CARD DATA (sample_hecatomb.csv)
     Loaded automatically when no saved
     collection exists in localStorage.
  ══════════════════════════════════════════ */
  const DEFAULT_CSV = `name,type,doom,cost,strength,subtype,set,abilities,flavor,image,emoji
Great Cthulhu,God,destruction,5,,Elder God,Base Set,"When Great Cthulhu enters play, deal 3 damage to each opponent's abomination. Continuous: Your destruction minions get +1 strength.","In his house at R'lyeh, dead Cthulhu waits dreaming.",,☠️
Dagon,God,deceit,4,,Elder God,Base Set,"When Dagon enters play, you may return a minion from your graveyard to your hand. Continuous: Your deceit minions cannot be targeted by opponent's abilities.","Father of the Deep Ones, herald of the outer dark.",,👁️
Wendigo,Minion,destruction,2,3,Beast,Base Set,Rager (+1): This abomination gets +1 strength while attacking.,"Its hunger is without end — it devours flesh and soul alike.",,🐺
Night Gaunt,Minion,deceit,1,2,Beast,Base Set,Evader (destruction): Cannot be blocked by destruction abominations.,"Silent and faceless, they serve masters spoken of only in dreams.",,🦇
Colour Out of Space,Fate,corruption,3,,,Base Set,"Target abomination loses 2 strength until end of turn. If that abomination has 0 or less strength, destroy it.","It was not from any world known to man.",,🌈
Necronomicon,Relic,corruption,4,,,Base Set,"Tap: Search your deck for a minion with doom Corruption and put it into your hand. Shuffle your deck.","The book of dead names, written in the blood of the damned.",,📖
Serpent Man,Minion,deceit,2,2,Humanoid,Base Set,"When you play Serpent Man onto an abomination of doom Deceit, draw a card.","They wear the skins of men, but their hearts are cold as scales.",,🐍
Deep One,Minion,greed,1,1,Aquatic,Base Set,Regenerator: When this minion would be destroyed by combat damage, return it to its owner's hand instead.,"From the depths they rise, hungry and ancient.",,🐟
Elder Thing,Minion,corruption,3,4,Alien,Base Set,Host: You can only play this minion as a new abomination.,"Older than mankind, older than the Earth itself.",,🦑
Shoggoth,Minion,destruction,4,6,Beast,Base Set,"When Shoggoth attacks, it deals 1 damage to each of the defender's minions in addition to normal combat damage.","Tekeli-li! Tekeli-li!",,🫧
Mi-Go Brain Cylinder,Relic,greed,2,,,Base Set,"Tap: Look at the top three cards of your deck. Put one into your hand and the rest on the bottom in any order.","They harvest minds as men harvest wheat.",,🧠
Hastur,God,deceit,6,,Outer God,Last Hallow's Eve,"When Hastur enters play, each opponent discards two cards. Continuous: At the start of each opponent's turn, they discard a card.","He Who Must Not Be Named waits in Carcosa.",,👑
The King in Yellow,Fate,deceit,2,,,Last Hallow's Eve,"Target player discards their hand and draws four cards.","When the Yellow Sign is revealed, sanity is forfeit.",,📜
Black Goat of the Woods,God,corruption,5,,Outer God,Last Hallow's Eve,"When Black Goat of the Woods enters play, put three 1-strength Beast Corruption minion tokens into play. Continuous: Your Beast minions get +1 strength.","A thousand young, and none of them kind.",,🐐
Flying Polyp,Minion,destruction,3,3,Ancient,Last Hallow's Eve,Guardian: This abomination cannot attack. Nemesis (greed): Cannot be targeted by greed abilities.,"Half-visible horrors from the dawn of time.",,💨
Yith Mind Swap,Fate,greed,1,,,Last Hallow's Eve,"Gain control of target minion until end of turn. It gains Haste and must attack this turn if able.","They reach across time itself to claim what they desire.",,🧩
Dimensional Shambler,Minion,deceit,2,2,Alien,Last Hallow's Eve,Fanatic: This abomination can attack even if you played a minion on it this turn.,"It tears holes between worlds with its bare hands.",,🌀
Cthugha,God,destruction,4,,Flame God,Last Hallow's Eve,"When Cthugha enters play, deal 2 damage to each abomination. Continuous: Fire-based abilities you control deal 1 extra damage.","Living fire from the depths of Fomalhaut.",,🔥
Grey Alien Scout,Minion,greed,1,1,Alien,Blanket of Lies,"When Grey Alien Scout deals combat damage, look at the top card of that player's deck.","They have watched us since before we learned to count the stars.",,👽
Men in Black,Minion,deceit,2,2,Humanoid,Blanket of Lies,Nemesis (corruption): Cannot be targeted by corruption abilities. Follower: Cannot be a new abomination.,"They don't exist. That's how you know they're everywhere.",,🕴️
Cattle Mutilator,Fate,destruction,2,,,Blanket of Lies,"Destroy target 3-strength or less minion. Its controller gains 1 soul.","The evidence is always cleaned up before morning.",,🐄
Crop Circle Array,Relic,greed,3,,,Blanket of Lies,"Tap: Each opponent with fewer souls than you loses 1 soul.","Messages written in wheat and silence.",,🔵
Hybrid Cultist,Minion,corruption,1,1,Cultist,Base Set,"When you play Hybrid Cultist onto an abomination, that abomination reaps +1 soul on its next successful attack.","Half-born, half-mad, wholly devoted.",,🧿
Star Vampire,Minion,greed,2,3,Undead,Base Set,Soulbound: When this minion would be destroyed by combat, you may stitch it onto another of your abominations instead.,"It feeds on stars as well as men.",,🦇`;

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */
  function init() {
    loadFromStorage();

    // If nothing was saved, load the built-in default card list
    if (allCards.length === 0) {
      const { cards } = parseCSV(DEFAULT_CSV);
      allCards = cards;
      // Don't save to localStorage so it stays as a "fresh" default
      // (importing a real CSV will then overwrite it)
    } else {
      showToast(`Restored ${allCards.length} cards from last session`, 2800);
    }

    populateSetFilter();
    updateRangeMaxima();
    updateStats();
    renderGallery();
    renderDeck();
  }

  init();
})();
