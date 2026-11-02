/** Contact address shown on the privacy policy and account-deletion pages (NEXT_PUBLIC_CONTACT_EMAIL). */
export const contactEmail = (process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "").trim() || null;

/** Date the privacy policy text last changed — update it whenever the policy changes. */
export const privacyUpdated = "2 November 2026";

/** Date the terms of use last changed. */
export const termsUpdated = "2 November 2026";
