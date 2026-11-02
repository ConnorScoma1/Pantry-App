import type { SavedMenu } from "@kitchen-pantry/shared-types";
import { savedMenuSchema } from "@kitchen-pantry/validation";
import { z } from "zod";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";

/**
 * A household's saved menus (spec 08 §4). Saving goes through save_menu(),
 * which checks every recipe is one the household can read.
 */
export interface MenuRepository {
  list(): Promise<Result<SavedMenu[]>>;
  save(input: unknown): Promise<Result<{ id: string }>>;
  remove(id: unknown): Promise<Result<null>>;
}

interface MenuRow {
  id: string;
  template_code: string;
  title: string;
  guests: number;
  budget_cents: number | null;
  serve_on: string | null;
  notes: string | null;
  created_at: string;
  menu_courses: Array<{ position: number; course: SavedMenu["courses"][number]["course"]; label: string; recipe_id: string | null }>;
}

const SELECT = "id, template_code, title, guests, budget_cents, serve_on, notes, created_at, menu_courses(position, course, label, recipe_id)";
const LOAD_FAILED = "We couldn't load your menus. Please try again.";
const SAVE_FAILED = "We couldn't save that menu. Please try again.";

const toMenu = (r: MenuRow): SavedMenu => ({
  id: r.id,
  templateCode: r.template_code,
  title: r.title,
  guests: r.guests,
  budgetCents: r.budget_cents,
  serveOn: r.serve_on,
  notes: r.notes,
  createdAt: r.created_at,
  courses: [...(r.menu_courses ?? [])].sort((a, b) => a.position - b.position).map((c) => ({ course: c.course, label: c.label, recipeId: c.recipe_id })),
});

export function createSupabaseMenuRepository(db: SupabaseLike): MenuRepository {
  return {
    async list() {
      const { data, error } = await db.from("menus").select(SELECT).order("created_at", { ascending: false }).limit(200);
      if (error) return dbFailure("menus", error, LOAD_FAILED);
      return { ok: true, data: (data as MenuRow[]).map(toMenu) };
    },
    async save(input) {
      const parsed = savedMenuSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "That menu isn't complete." };
      const { data, error } = await db.rpc("save_menu", { menu: parsed.data });
      if (error) return dbFailure("save menu", error, SAVE_FAILED);
      return { ok: true, data: { id: String(data) } };
    },
    async remove(id) {
      const parsed = z.uuid().safeParse(id);
      if (!parsed.success) return { ok: false, message: "That menu no longer exists." };
      const { error } = await db.from("menus").delete().eq("id", parsed.data);
      if (error) return dbFailure("delete menu", error, SAVE_FAILED);
      return { ok: true, data: null };
    },
  };
}

export const LOCAL_MENUS_KEY = "kp-preview-menus-v1";

export function createLocalMenuRepository(storage: KeyValueStorage, options: { now?: () => Date; newId?: () => string } = {}): MenuRepository {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
  async function read(): Promise<SavedMenu[]> {
    try {
      const raw = await storage.getItem(LOCAL_MENUS_KEY);
      const value: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? (value as SavedMenu[]) : [];
    } catch {
      return [];
    }
  }
  async function write(menus: SavedMenu[]) {
    try {
      await storage.setItem(LOCAL_MENUS_KEY, JSON.stringify(menus.slice(0, 200)));
    } catch {
      // Storage unavailable.
    }
  }
  return {
    async list() {
      return { ok: true, data: await read() };
    },
    async save(input) {
      const parsed = savedMenuSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "That menu isn't complete." };
      const all = await read();
      const id = parsed.data.id ?? newId();
      const existing = all.find((m) => m.id === id);
      const menu: SavedMenu = { ...parsed.data, id, createdAt: existing?.createdAt ?? now().toISOString() } as SavedMenu;
      await write([menu, ...all.filter((m) => m.id !== id)]);
      return { ok: true, data: { id } };
    },
    async remove(id) {
      await write((await read()).filter((m) => m.id !== id));
      return { ok: true, data: null };
    },
  };
}
