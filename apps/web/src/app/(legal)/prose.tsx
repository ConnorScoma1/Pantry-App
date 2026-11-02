import type { ReactNode } from "react";

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 text-[22px] font-bold tracking-tight">{children}</h2>;
}
export function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[16px] leading-relaxed text-foreground/90">{children}</p>;
}
export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-foreground/90">{children}</ul>;
}
export function Contact({ email }: { email: string | null }) {
  return email ? (
    <a href={`mailto:${email}`} className="font-semibold underline underline-offset-4">{email}</a>
  ) : (
    <span className="rounded bg-warning/15 px-1.5 font-semibold">[contact email not set — add NEXT_PUBLIC_CONTACT_EMAIL]</span>
  );
}
