import Ionicons from "@expo/vector-icons/Ionicons";
import { libraryOf } from "@kitchen-pantry/recipe-engine";
import { authenticityLevels, labelFor, recipeVariants, type Recipe } from "@kitchen-pantry/shared-types";
import { Text, View } from "react-native";
import { useThemeColors } from "@/lib/theme";

/** Same rules as the web app: never call a recipe tested unless a person tested it. */
export function statusLabel(recipe: Recipe): { label: string; tone: "good" | "neutral" | "ai" | "idea"; detail: string } {
  const s = libraryOf(recipe).status;
  if (s === "idea") return { label: "Dish idea", tone: "idea", detail: "No full recipe yet — just the dish." };
  if (recipe.source.kind === "ai_generated") return { label: "AI draft · not reviewed", tone: "ai", detail: "Written by AI for your household and checked automatically (amounts, food safety, allergens). Nobody has tested it." };
  if (s === "tested") return { label: "Kitchen-tested", tone: "good", detail: "Cooked and checked by a person." };
  if (s === "reviewed") return { label: "Reviewed", tone: "good", detail: "A person checked the amounts, steps and food safety." };
  return { label: "Not yet reviewed", tone: "neutral", detail: "Complete and checked automatically; a person hasn't reviewed it yet." };
}

export function StatusBadge({ recipe }: { recipe: Recipe }) {
  const c = useThemeColors();
  const s = statusLabel(recipe);
  const icon = s.tone === "good" ? "checkmark-circle-outline" : s.tone === "ai" ? "sparkles-outline" : s.tone === "idea" ? "bulb-outline" : "flask-outline";
  const bg = s.tone === "good" ? "bg-accent-soft" : s.tone === "ai" ? "bg-warning/15" : "bg-surface-strong";
  return (
    <View accessibilityLabel={`${s.label}. ${s.detail}`} className={`flex-row items-center gap-1 rounded-full px-2.5 py-0.5 ${bg}`}>
      <Ionicons name={icon} size={13} color={s.tone === "neutral" ? c.muted : c.foreground} />
      <Text className={`text-[13px] font-semibold ${s.tone === "neutral" ? "text-muted" : "text-foreground"}`}>{s.label}</Text>
    </View>
  );
}

export function AuthenticityBadge({ recipe }: { recipe: Recipe }) {
  const lib = libraryOf(recipe);
  const parts = [lib.authenticity ? labelFor(authenticityLevels, lib.authenticity) : null, lib.region, lib.variant !== "classic" ? labelFor(recipeVariants, lib.variant) : null].filter(Boolean);
  if (!parts.length) return null;
  return (
    <View className="rounded-full border border-border px-2.5 py-0.5">
      <Text className="text-[13px] font-medium text-foreground">{parts.join(" · ")}</Text>
    </View>
  );
}

export function SafetyNote({ recipe }: { recipe: Recipe }) {
  const c = useThemeColors();
  const note = libraryOf(recipe).safetyNote;
  if (!note) return null;
  return (
    <View accessibilityRole="summary" className="flex-row gap-3 rounded-card border border-warning/40 bg-warning/10 p-4">
      <Ionicons name="shield-outline" size={20} color={c.warning} />
      <Text className="flex-1 text-[15px] leading-5 text-foreground">
        <Text className="font-semibold">Food safety: </Text>
        {note}
      </Text>
    </View>
  );
}

export function StorageNote({ recipe }: { recipe: Recipe }) {
  const storage = libraryOf(recipe).storage;
  if (!storage) return null;
  return (
    <Text className="text-[15px] leading-5 text-foreground">
      <Text className="font-semibold">Leftovers: </Text>
      {storage}
    </Text>
  );
}

export function sourceText(recipe: Recipe): string {
  const lib = libraryOf(recipe);
  const licence = lib.license === "public-domain" ? " · Public domain" : lib.license.startsWith("licensed:") ? " · Used under licence" : lib.license.startsWith("cc-") ? ` · ${lib.license.toUpperCase().replace("CC-BY-SA-4.0", "CC BY-SA 4.0").replace("CC-BY-4.0", "CC BY 4.0")}` : "";
  const by = recipe.source.kind === "original" ? "Original recipe by " : recipe.source.kind === "ai_generated" ? "AI draft by " : "Source: ";
  return `${by}${recipe.source.name}${licence}${recipe.source.attribution ? ` · ${recipe.source.attribution}` : ""}. ${statusLabel(recipe).detail}`;
}
