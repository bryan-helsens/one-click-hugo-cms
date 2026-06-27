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
  const PROTECTED_FLAGS = ["favorite", "shiny", "lucky", "shadow", "legendary"];

  let inventory = Storage.load();

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
    pokedexList: $("#pokedex-list"),
    screenshotInput: $("#screenshot-input"),
    ocrDrop: $("#ocr-drop"),
    ocrStatus: $("#ocr-status"),
    ocrPreview: $("#ocr-preview"),
    fName: $("#f-name"),
    fCp: $("#f-cp"),
    fHp: $("#f-hp"),
    exportBtn: $("#btn-export"),
    importFile: $("#import-file")
  };

  // ---- Init ----
  function init() {
    populatePokedexDatalist();
    bindEvents();
    render();
  }

  function populatePokedexDatalist() {
    const frag = document.createDocumentFragment();
    POKEDEX_NAMES.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      frag.appendChild(opt);
    });
    els.pokedexList.appendChild(frag);
  }

  // ---- Derived data: which entries are duplicates / transfer suggestions ----
  function computeFlags(list) {
    const byName = {};
    list.forEach((p) => {
      const key = normalizeName(p.name);
      (byName[key] = byName[key] || []).push(p);
    });

    const dupIds = new Set();
    const transferIds = new Set();

    Object.values(byName).forEach((group) => {
      if (group.length < 2) return;
      group.forEach((p) => dupIds.add(p.id));

      // Keep the highest-CP copy; suggest transferring weaker, unprotected dupes.
      const sorted = [...group].sort((a, b) => (b.cp || 0) - (a.cp || 0));
      sorted.slice(1).forEach((p) => {
        const isProtected = PROTECTED_FLAGS.some((f) => p[f]);
        if (!isProtected) transferIds.add(p.id);
      });
    });

    return { dupIds, transferIds };
  }

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

    els.invCount.textContent = inventory.length;
    els.emptyState.hidden = inventory.length !== 0;

    els.inventory.innerHTML = list
      .map((p) => cardHTML(p, dupIds.has(p.id), transferIds.has(p.id)))
      .join("");

    if (inventory.length > 0 && list.length === 0) {
      els.inventory.innerHTML =
        '<p class="empty-state">No Pokémon match your search/filter.</p>';
    }
  }

  function applyControls(list, dupIds, transferIds) {
    const q = els.search.value.trim().toLowerCase();
    const tag = els.filterTag.value;
    const sort = els.sortBy.value;

    let out = list.filter((p) => {
      if (q) {
        const hay = (p.name + " " + (p.notes || "")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
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
      "name-asc": (a, b) => a.name.localeCompare(b.name),
      "name-desc": (a, b) => b.name.localeCompare(a.name)
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

    return `
      <article class="${classes.join(" ")}" data-id="${p.id}">
        <div class="poke-name">${escapeHTML(p.name)}</div>
        <div class="poke-stats">
          <span>CP <b>${p.cp || "—"}</b></span>
          <span>HP <b>${p.hp || "—"}</b></span>
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
    [els.search, els.filterTag, els.sortBy].forEach((el) =>
      el.addEventListener("input", render)
    );

    // OCR: file input + drag & drop
    els.screenshotInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleScreenshot(e.target.files[0]);
    });
    setupDragDrop();

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
  }

  function onAddSubmit(e) {
    e.preventDefault();
    const data = readFormData(els.addForm);
    if (!data.name) return;

    // Auto-tag legendaries we recognise.
    if (isLegendaryName(data.name)) data.legendary = true;

    inventory.push({ id: Storage.newId(), added: Date.now(), ...data });
    Storage.save(inventory);
    els.addForm.reset();
    clearOcrUI();
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
    els.editModal.hidden = false;
  }

  function closeModal() {
    els.editModal.hidden = true;
  }

  function onEditSubmit(e) {
    e.preventDefault();
    const id = els.editForm.elements.id.value;
    const idx = inventory.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const data = readFormData(els.editForm);
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
        const cleaned = data
          .filter((p) => p && p.name)
          .map((p) => ({ id: p.id || Storage.newId(), added: p.added || Date.now(), ...p }));
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
