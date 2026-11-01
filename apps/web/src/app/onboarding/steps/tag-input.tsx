"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";

/** Free-text list entry ("Leave out something else"). */
export function TagInput({
  label,
  placeholder,
  values,
  onChange,
  max = 50,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
  max?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim().slice(0, 60);
    if (!value) return;
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase()) && values.length < max) {
      onChange([...values, value]);
    }
    setDraft("");
  };

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-12 min-w-0 flex-1 rounded-full border border-border bg-background px-5 text-[16px] outline-none placeholder:text-subtle focus:border-foreground"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          aria-label={`Add to ${label}`}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-30"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
      {values.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={label}>
          {values.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[15px] font-medium text-background"
                aria-label={`Remove ${value}`}
              >
                {value}
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
