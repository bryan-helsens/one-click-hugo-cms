/**
 * app.js
 * Wires everything together: OCR intake, the add/edit forms, rendering the
 * inventory, the collection summary, search/filter/sort, transfer suggestions,
 * and JSON export/import.
 */

(function () {
  "use strict";

  const TAG_META = {
    shiny: { emoji: "✨", label: "Shiny" },
    lucky: { emoji: "🍀", label: "Lucky" },
    shadow: { emoji: "🌑", label: "Shadow" },
    favorite: { emoji: "⭐", label: "Favorite" },
    legendary: { emoji: "👑", label: "Legendary" }
  };
  // Pure inventory logic lives in logic.js (shared with the test suite).
  const { ivPercent, computeFlags, sanitizeImport } = Logic;

  let inventory = Storage.load();
  const selected = new Set(); // ids of bulk-selected Pokémon
  let lastShown = []; // the currently filtered/sorted list on screen
  let lastTransferIds = new Set();
  let lastFocused = null; // element to restore focus to when the modal closes

  // ---- Element refs ----
  const $ = (sel) => document.querySelector(sel);
  const els = {
    summary: $("#summary"),
    addForm: $("#add-form"),
    editForm: $("#edit-form"),
    editModal: $("#edit-modal"),
    inventory: $("#inventory"),
    emptyState: $("#empty-state"),
    invCount: $("#inv-count"),
    search: $("#search"),
    filterTag: $("#filter-tag"),
    sortBy: $("#sort-by"),
    filterIvMin: $("#filter-iv-min"),
    filterCpMin: $("#filter-cp-min"),
    filterCpMax: $("#filter-cp-max"),
    btnSelectTransfer: $("#btn-select-transfer"),
    btnSelectShown: $("#btn-select-shown"),
    btnResetFilters: $("#btn-reset-filters"),
    bulkBar: $("#bulk-bar"),
    bulkCount: $("#bulk-count"),
    bulkClear: $("#bulk-clear"),
    pokedexList: $("#pokedex-list"),
    screenshotInput: $("#screenshot-input"),
    ocrDrop: $("#ocr-drop"),
    ocrStatus: $("#ocr-status"),
    ocrPreview: $("#ocr-preview"),
    fName: $("#f-name"),
    fCp: $("#f-cp"),
    fHp: $("#f-hp"),
    addIv: $("#add-iv"),
    editIv: $("#edit-iv"),
    ivInput: $("#iv-input"),
    ivScanStatus: $("#iv-scan-status"),
    exportBtn: $("#btn-export"),
    importFile: $("#import-file")
  };

  // ---- Init ----
  function init() {
    populatePokedexDatalist();
    buildIvPicker(els.addIv);
    buildIvPicker(els.editIv);
    bindEvents();
    render();
  }

  // ---- IV picker (clickable 15-segment bars for Atk / Def / HP) ----
  const IV_STATS = [
    ["atk", "ATK"],
    ["def", "DEF"],
    ["sta", "HP"]
  ];

  function buildIvPicker(root) {
    if (!root) return;
    const rows = IV_STATS.map(([key, label]) => {
      // Decorative segments; the bar itself is the accessible slider control.
      const segs = Array.from(
        { length: 15 },
        (_, i) => `<span class="iv-seg" data-val="${i + 1}" aria-hidden="true"></span>`
      ).join("");
      return (
        `<div class="iv-row"><span class="iv-label" id="iv-${key}-${root.id}">${label}</span>` +
        `<div class="iv-bar" data-stat="${key}" data-value="0" role="slider" tabindex="0" ` +
        `aria-labelledby="iv-${key}-${root.id}" aria-valuemin="0" aria-valuemax="15" ` +
        `aria-valuenow="0" aria-valuetext="0 of 15">${segs}</div>` +
        `<span class="iv-val" aria-hidden="true">0</span></div>`
      );
    }).join("");
    root.innerHTML =
      rows +
      '<div class="iv-percent">IV: <b class="iv-total" aria-live="polite">—</b>' +
      '<button type="button" class="clear-iv">clear</button></div>';

    // Mouse/touch: click a segment to set the value (click the filled tip to drop one).
    root.addEventListener("click", (e) => {
      const seg = e.target.closest(".iv-seg");
      if (seg) {
        const bar = seg.closest(".iv-bar");
        const val = parseInt(seg.dataset.val, 10);
        const cur = parseInt(bar.dataset.value, 10);
        commitBar(root, bar, cur === val ? val - 1 : val);
      } else if (e.target.closest(".clear-iv")) {
        resetIvPicker(root);
      }
    });

    // Keyboard: the bar behaves as an ARIA slider.
    root.addEventListener("keydown", (e) => {
      const bar = e.target.closest(".iv-bar");
      if (!bar) return;
      const cur = parseInt(bar.dataset.value, 10);
      let next = cur;
      switch (e.key) {
        case "ArrowRight": case "ArrowUp": case "+": next = cur + 1; break;
        case "ArrowLeft": case "ArrowDown": case "-": next = cur - 1; break;
        case "PageUp": next = cur + 3; break;
        case "PageDown": next = cur - 3; break;
        case "Home": next = 0; break;
        case "End": next = 15; break;
        default: return;
      }
      e.preventDefault();
      commitBar(root, bar, next);
    });
  }

  /** Apply a new bar value, mark the picker touched, refresh the percentage. */
  function commitBar(root, bar, value) {
    setBar(bar, value);
    root.dataset.touched = "1";
    updatePercent(root);
  }

  function setBar(bar, value) {
    value = Math.max(0, Math.min(15, value));
    bar.dataset.value = value;
    bar.setAttribute("aria-valuenow", value);
    bar.setAttribute("aria-valuetext", `${value} of 15`);
    bar.querySelectorAll(".iv-seg").forEach((s, i) => {
      const on = i < value;
      s.classList.toggle("filled", on);
      s.classList.toggle("perfect", on && value === 15);
    });
    const valEl = bar.parentElement.querySelector(".iv-val");
    if (valEl) valEl.textContent = value;
  }

  function setIvPicker(root, vals) {
    let any = false;
    IV_STATS.forEach(([stat]) => {
      const bar = root.querySelector(`.iv-bar[data-stat="${stat}"]`);
      if (!bar) return;
      const v = vals[stat];
      setBar(bar, v || 0);
      if (v != null) any = true;
    });
    root.dataset.touched = any ? "1" : "0";
    updatePercent(root);
  }

  function resetIvPicker(root) {
    IV_STATS.forEach(([stat]) => {
      const bar = root.querySelector(`.iv-bar[data-stat="${stat}"]`);
      if (bar) setBar(bar, 0);
    });
    root.dataset.touched = "0";
    updatePercent(root);
  }

  function updatePercent(root) {
    const totalEl = root.querySelector(".iv-total");
    if (!totalEl) return;
    if (root.dataset.touched !== "1") {
      totalEl.textContent = "—";
      return;
    }
    const sum = IV_STATS.reduce((acc, [stat]) => {
      const bar = root.querySelector(`.iv-bar[data-stat="${stat}"]`);
      return acc + (bar ? parseInt(bar.dataset.value, 10) : 0);
    }, 0);
    totalEl.textContent = `${Math.round((sum / 45) * 100)}% (${sum}/45)`;
  }

  /** Read IV values from a picker, or nulls if the user never touched it. */
  function readIvPicker(root) {
    if (!root || root.dataset.touched !== "1") {
      return { ivAtk: null, ivDef: null, ivSta: null };
    }
    const get = (stat) => {
      const bar = root.querySelector(`.iv-bar[data-stat="${stat}"]`);
      return bar ? parseInt(bar.dataset.value, 10) : null;
    };
    return { ivAtk: get("atk"), ivDef: get("def"), ivSta: get("sta") };
  }

  /** IV percentage for a stored Pokémon, or null if IVs are unknown. */
  function populatePokedexDatalist() {
    const frag = document.createDocumentFragment();
    POKEDEX_NAMES.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      frag.appendChild(opt);
    });
    els.pokedexList.appendChild(frag);
  }

  // Duplicate / transfer-suggestion detection lives in logic.js (computeFlags).

  // ---- Rendering ----
  function render() {
    const { dupIds, transferIds } = computeFlags(inventory);
    renderSummary(transferIds);
    renderInventory(dupIds, transferIds);
  }

  function renderSummary(transferIds) {
    const total = inventory.length;
    const count = (f) => inventory.filter((p) => p[f]).length;
    const cards = [
      { value: total, label: "Total Pokémon" },
      { value: count("shiny"), label: "✨ Shiny" },
      { value: count("legendary"), label: "👑 Legendary" },
      { value: count("lucky"), label: "🍀 Lucky" },
      { value: count("shadow"), label: "🌑 Shadow" },
      { value: transferIds.size, label: "🗑️ Can transfer" }
    ];
    els.summary.innerHTML = cards
      .map(
        (c) =>
          `<div class="stat-card"><span class="stat-value">${c.value}</span>` +
          `<span class="stat-label">${c.label}</span></div>`
      )
      .join("");
  }

  function renderInventory(dupIds, transferIds) {
    const list = applyControls(inventory, dupIds, transferIds);
    lastShown = list;
    lastTransferIds = transferIds;

    // Drop selections that no longer exist.
    const ids = new Set(inventory.map((p) => p.id));
    [...selected].forEach((id) => {
      if (!ids.has(id)) selected.delete(id);
    });

    els.invCount.textContent = inventory.length;
    els.emptyState.hidden = inventory.length !== 0;

    els.inventory.innerHTML = list
      .map((p) => cardHTML(p, dupIds.has(p.id), transferIds.has(p.id)))
      .join("");

    if (inventory.length > 0 && list.length === 0) {
      els.inventory.innerHTML =
        '<p class="empty-state">No Pokémon match your search/filter.</p>';
    }
    updateBulkBar();
  }

  function applyControls(list, dupIds, transferIds) {
    const q = els.search.value.trim().toLowerCase();
    const tag = els.filterTag.value;
    const sort = els.sortBy.value;
    const ivMin = numberOrNull(els.filterIvMin.value);
    const cpMin = numberOrNull(els.filterCpMin.value);
    const cpMax = numberOrNull(els.filterCpMax.value);

    let out = list.filter((p) => {
      if (q) {
        const hay = ((p.name || "") + " " + (p.notes || "")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (ivMin != null) {
        const iv = ivPercent(p);
        if (iv == null || iv < ivMin) return false;
      }
      if (cpMin != null && (p.cp || 0) < cpMin) return false;
      if (cpMax != null && (p.cp || 0) > cpMax) return false;
      if (tag === "duplicate") return dupIds.has(p.id);
      if (tag === "transfer") return transferIds.has(p.id);
      if (tag) return !!p[tag];
      return true;
    });

    const cmp = {
      "added-desc": (a, b) => (b.added || 0) - (a.added || 0),
      "added-asc": (a, b) => (a.added || 0) - (b.added || 0),
      "cp-desc": (a, b) => (b.cp || 0) - (a.cp || 0),
      "cp-asc": (a, b) => (a.cp || 0) - (b.cp || 0),
      "iv-desc": (a, b) => (ivPercent(b) ?? -1) - (ivPercent(a) ?? -1),
      "name-asc": (a, b) => (a.name || "").localeCompare(b.name || ""),
      "name-desc": (a, b) => (b.name || "").localeCompare(a.name || "")
    }[sort];
    return cmp ? out.sort(cmp) : out;
  }

  function cardHTML(p, isDup, isTransfer) {
    const tags = [];
    Object.keys(TAG_META).forEach((f) => {
      if (p[f]) tags.push(`<span class="tag">${TAG_META[f].emoji} ${TAG_META[f].label}</span>`);
    });
    if (isDup) tags.push('<span class="tag duplicate">🔁 Duplicate</span>');
    if (isTransfer) tags.push('<span class="tag transfer">🗑️ Transfer?</span>');

    const classes = ["poke-card"];
    if (isTransfer) classes.push("is-transfer");
    if (p.favorite) classes.push("is-favorite");
    if (selected.has(p.id)) classes.push("is-selected");

    return `
      <article class="${classes.join(" ")}" data-id="${p.id}">
        <input type="checkbox" class="poke-select" data-id="${p.id}" ${selected.has(p.id) ? "checked" : ""} aria-label="Select ${escapeHTML(p.name || "unnamed")}" />
        <div class="poke-name">${escapeHTML(p.name || "❓ Unnamed")}</div>
        <div class="poke-stats">
          <span>CP <b>${p.cp || "—"}</b></span>
          <span>HP <b>${p.hp || "—"}</b></span>
          ${ivPercent(p) != null ? `<span class="poke-iv">IV <b>${ivPercent(p)}%</b></span>` : ""}
        </div>
        ${tags.length ? `<div class="poke-tags">${tags.join("")}</div>` : ""}
        ${p.notes ? `<div class="poke-notes">${escapeHTML(p.notes)}</div>` : ""}
        <div class="poke-card-actions">
          <button class="icon-btn" data-action="edit">✏️ Edit</button>
          <button class="icon-btn danger" data-action="delete">🗑️ Remove</button>
        </div>
      </article>`;
  }

  // ---- Form helpers ----
  function readFormData(form) {
    const fd = new FormData(form);
    return {
      name: (fd.get("name") || "").toString().trim(),
      cp: numberOrNull(fd.get("cp")),
      hp: numberOrNull(fd.get("hp")),
      shiny: fd.get("shiny") === "on",
      lucky: fd.get("lucky") === "on",
      shadow: fd.get("shadow") === "on",
      favorite: fd.get("favorite") === "on",
      legendary: fd.get("legendary") === "on",
      notes: (fd.get("notes") || "").toString().trim()
    };
  }

  // ---- Events ----
  function bindEvents() {
    els.addForm.addEventListener("submit", onAddSubmit);
    els.editForm.addEventListener("submit", onEditSubmit);
    els.inventory.addEventListener("click", onInventoryClick);
    els.inventory.addEventListener("change", onSelectChange);
    [
      els.search, els.filterTag, els.sortBy,
      els.filterIvMin, els.filterCpMin, els.filterCpMax
    ].forEach((el) => el.addEventListener("input", render));

    // Bulk selection + actions
    els.btnSelectTransfer.addEventListener("click", () => selectIds(lastTransferIds));
    els.btnSelectShown.addEventListener("click", () =>
      selectIds(new Set(lastShown.map((p) => p.id)))
    );
    els.btnResetFilters.addEventListener("click", resetFilters);
    els.bulkClear.addEventListener("click", clearSelection);
    els.bulkBar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bulk]");
      if (btn) applyBulk(btn.dataset.bulk);
    });

    // OCR: file input + drag & drop
    els.screenshotInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleScreenshot(e.target.files[0]);
    });
    setupDragDrop();

    // IV appraisal scan
    els.ivInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleIvScan(e.target.files[0]);
    });

    // Export / import
    els.exportBtn.addEventListener("click", exportJSON);
    els.importFile.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
    });

    // Modal close
    document.querySelectorAll("[data-close-modal]").forEach((b) =>
      b.addEventListener("click", closeModal)
    );
    els.editModal.addEventListener("click", (e) => {
      if (e.target === els.editModal) closeModal();
    });
    document.addEventListener("keydown", onModalKeydown);
  }

  function onAddSubmit(e) {
    e.preventDefault();
    const data = { ...readFormData(els.addForm), ...readIvPicker(els.addIv) };
    if (!data.name) return;

    // Auto-tag legendaries we recognise.
    if (isLegendaryName(data.name)) data.legendary = true;

    inventory.push({ id: Storage.newId(), added: Date.now(), ...data });
    Storage.save(inventory);
    els.addForm.reset();
    resetIvPicker(els.addIv);
    clearOcrUI();
    if (els.ivScanStatus) els.ivScanStatus.textContent = "";
    render();
    els.fName.focus();
  }

  function onInventoryClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const card = e.target.closest("[data-id]");
    const id = card && card.dataset.id;
    const p = inventory.find((x) => x.id === id);
    if (!p) return;

    if (btn.dataset.action === "delete") {
      if (confirm(`Remove ${p.name} from your inventory?`)) {
        inventory = inventory.filter((x) => x.id !== id);
        Storage.save(inventory);
        render();
      }
    } else if (btn.dataset.action === "edit") {
      openEditModal(p);
    }
  }

  // ---- Bulk selection + actions ----
  function onSelectChange(e) {
    const box = e.target.closest(".poke-select");
    if (!box) return;
    const id = box.dataset.id;
    if (box.checked) selected.add(id);
    else selected.delete(id);
    const card = box.closest(".poke-card");
    if (card) card.classList.toggle("is-selected", box.checked);
    updateBulkBar();
  }

  function selectIds(idSet) {
    idSet.forEach((id) => selected.add(id));
    render();
  }

  function clearSelection() {
    selected.clear();
    render();
  }

  function updateBulkBar() {
    const n = selected.size;
    els.bulkBar.hidden = n === 0;
    els.bulkCount.textContent = `${n} selected`;
  }

  function resetFilters() {
    els.search.value = "";
    els.filterTag.value = "";
    els.filterIvMin.value = "";
    els.filterCpMin.value = "";
    els.filterCpMax.value = "";
    render();
  }

  function applyBulk(action) {
    const ids = [...selected];
    if (!ids.length) return;

    if (action === "delete") {
      if (!confirm(`Delete ${ids.length} selected Pokémon? This can't be undone.`)) return;
      const drop = new Set(ids);
      inventory = inventory.filter((p) => !drop.has(p.id));
      selected.clear();
      Storage.save(inventory);
      render();
      return;
    }

    if (action === "copy") {
      copyTransferList(ids);
      return;
    }

    const setFlag = { favorite: ["favorite", true], unfavorite: ["favorite", false], shiny: ["shiny", true] }[action];
    if (setFlag) {
      const [flag, val] = setFlag;
      const sel = new Set(ids);
      inventory.forEach((p) => {
        if (sel.has(p.id)) p[flag] = val;
      });
      Storage.save(inventory);
      render();
    }
  }

  function copyTransferList(ids) {
    const sel = new Set(ids);
    const lines = inventory
      .filter((p) => sel.has(p.id))
      .map((p) => {
        const iv = ivPercent(p);
        return `${p.name} — CP ${p.cp || "?"}${iv != null ? ` · IV ${iv}%` : ""}`;
      });
    const text = lines.join("\n");
    const done = () => alert(`Copied ${lines.length} Pokémon to the clipboard:\n\n${text}`);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      done();
    }
  }

  function openEditModal(p) {
    const f = els.editForm;
    f.elements.id.value = p.id;
    f.elements.name.value = p.name;
    f.elements.cp.value = p.cp || "";
    f.elements.hp.value = p.hp || "";
    f.elements.notes.value = p.notes || "";
    Object.keys(TAG_META).forEach((flag) => {
      f.elements[flag].checked = !!p[flag];
    });
    setIvPicker(els.editIv, { atk: p.ivAtk, def: p.ivDef, sta: p.ivSta });
    lastFocused = document.activeElement;
    els.editModal.hidden = false;
    f.elements.name.focus();
  }

  function closeModal() {
    els.editModal.hidden = true;
    // Return focus to whatever opened the modal (keyboard users don't get lost).
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
    lastFocused = null;
  }

  /** Keep Tab focus inside the open modal; Escape closes it. */
  function onModalKeydown(e) {
    if (els.editModal.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = [
      ...els.editModal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
          'select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ].filter((el) => el.offsetParent !== null); // visible/focusable only
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onEditSubmit(e) {
    e.preventDefault();
    const id = els.editForm.elements.id.value;
    const idx = inventory.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const data = { ...readFormData(els.editForm), ...readIvPicker(els.editIv) };
    if (!data.name) return;
    inventory[idx] = { ...inventory[idx], ...data };
    Storage.save(inventory);
    closeModal();
    render();
  }

  // ---- OCR flow ----
  async function handleScreenshot(file) {
    showPreview(file);
    setStatus(
      'Reading screenshot… <div class="progress-bar"><span id="ocr-bar"></span></div>',
      ""
    );
    try {
      const { parsed } = await OCR.readImage(file, (p) => {
        const bar = document.getElementById("ocr-bar");
        if (bar) bar.style.width = Math.round(p * 100) + "%";
      });
      applyParsedToForm(parsed);
    } catch (err) {
      setStatus("⚠️ " + err.message, "error");
    }
  }

  // ---- IV appraisal scan flow ----
  async function handleIvScan(file) {
    const status = els.ivScanStatus;
    if (status) status.textContent = "Scanning bars…";
    try {
      const iv = await IVScan.scan(file);
      if (iv.atk == null || iv.def == null || iv.sta == null) {
        if (status) {
          status.textContent =
            "Couldn't read the bars — set them by tapping below.";
        }
        return;
      }
      setIvPicker(els.addIv, iv);
      if (status) {
        const pct = Math.round(((iv.atk + iv.def + iv.sta) / 45) * 100);
        status.textContent =
          `Read ~${pct}% (${iv.atk}/${iv.def}/${iv.sta}) — please double-check.`;
      }
    } catch (err) {
      if (status) status.textContent = "⚠️ " + err.message;
    } finally {
      els.ivInput.value = "";
    }
  }

  function applyParsedToForm(parsed) {
    const found = [];
    if (parsed.name) {
      els.fName.value = parsed.name;
      if (isLegendaryName(parsed.name)) {
        els.addForm.elements.legendary.checked = true;
      }
      found.push(`name (${parsed.name})`);
    }
    if (parsed.cp != null) {
      els.fCp.value = parsed.cp;
      found.push("CP " + parsed.cp);
    }
    if (parsed.hp != null) {
      els.fHp.value = parsed.hp;
      found.push("HP " + parsed.hp);
    }

    if (found.length) {
      const weak = parsed.name && parsed.nameScore < 0.85;
      setStatus(
        `✅ Read ${found.join(", ")}.` +
          (weak ? " (Double-check the name — low confidence.)" : "") +
          " Review the fields, then add.",
        "success"
      );
    } else {
      setStatus(
        "Couldn't read the fields confidently. Try a clearer, cropped screenshot of the Pokémon's detail screen — or enter the values manually.",
        "error"
      );
    }
  }

  function showPreview(file) {
    const url = URL.createObjectURL(file);
    els.ocrPreview.src = url;
    els.ocrPreview.hidden = false;
    els.ocrPreview.onload = () => URL.revokeObjectURL(url);
  }

  function setStatus(html, kind) {
    els.ocrStatus.hidden = false;
    els.ocrStatus.className = "ocr-status" + (kind ? " " + kind : "");
    els.ocrStatus.innerHTML = html;
  }

  function clearOcrUI() {
    els.ocrStatus.hidden = true;
    els.ocrPreview.hidden = true;
    els.ocrPreview.removeAttribute("src");
    els.screenshotInput.value = "";
  }

  function setupDragDrop() {
    const zone = els.ocrDrop;
    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
      })
    );
    zone.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) handleScreenshot(file);
    });
  }

  // ---- Export / Import ----
  function exportJSON() {
    if (!inventory.length) {
      alert("Nothing to export yet.");
      return;
    }
    const blob = new Blob([JSON.stringify(inventory, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pokeinventory-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("Not a valid backup file.");
        const merge = confirm(
          "OK = merge with your current inventory.\nCancel = replace it entirely."
        );
        // sanitizeImport keeps any record with real data — including scans
        // whose name didn't OCR (name null) — so they can be fixed in the
        // editor instead of being lost.
        const cleaned = sanitizeImport(data, Storage.newId, () => Date.now());
        inventory = merge ? inventory.concat(cleaned) : cleaned;
        Storage.save(inventory);
        render();
        alert(`Imported ${cleaned.length} Pokémon.`);
      } catch (err) {
        alert("Couldn't import that file: " + err.message);
      } finally {
        els.importFile.value = "";
      }
    };
    reader.readAsText(file);
  }

  // ---- Utils ----
  function numberOrNull(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  function escapeHTML(str) {
    return (str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  init();
})();
