/**
 * storage.js
 * Persists the inventory to localStorage. No account, no server — the data
 * lives only in this browser, and can be exported/imported as JSON for backup
 * or moving between devices.
 */

const STORAGE_KEY = "pokeinventory.v1";

const Storage = {
  /** Load the full inventory array (newest entries first by insertion). */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("Failed to read inventory from storage:", err);
      return [];
    }
  },

  /** Persist the full inventory array. */
  save(inventory) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
      return true;
    } catch (err) {
      console.error("Failed to save inventory:", err);
      return false;
    }
  },

  /** Generate a unique id without relying on Date.now/Math.random elsewhere. */
  newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "p-" + Math.random().toString(36).slice(2) + "-" + Date.now();
  }
};
