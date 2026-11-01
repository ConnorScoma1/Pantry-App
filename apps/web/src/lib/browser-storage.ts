"use client";

import type { KeyValueStorage } from "@kitchen-pantry/database";

/** Browser localStorage behind the shared key-value interface (preview mode). */
export const browserStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};
