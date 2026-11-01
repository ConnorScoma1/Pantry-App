"use client";

import { createLocalKitchenRepository } from "@kitchen-pantry/database";
import { browserStorage } from "@/lib/browser-storage";

/** PREVIEW MODE kitchen: same validation and behaviour as the Supabase store. */
export const previewKitchenRepository = createLocalKitchenRepository(browserStorage);
