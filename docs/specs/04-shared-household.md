# Shared Household

> Received 2026-11-01 from the product owner. Kept verbatim; see docs/ARCHITECTURE.md for how it maps onto the build.

Add a **Shared Household** feature to Pantry App.

Users should be able to create a household and invite up to five members through an email invitation or secure invite link.

Requirements:
- All household members can access and edit a shared grocery list.
- Grocery list changes synchronize in real time using Supabase Realtime.
- Members can add, edit, remove, and check off grocery items.
- Display who added each item and who marked it as purchased.
- Allow members to share pantry inventory and weekly meal plans.
- Household owners can invite and remove members.
- Use Supabase Auth and Row Level Security to ensure only authorized household members can access household data.
- Invitation tokens must be securely generated, expire, and cannot grant access without authentication.
- Support household membership roles (owner and member).
- Keep individual user preferences, including cooking skill and dietary restrictions, separate from household-shared data.
- Design the feature to work on both the Next.js web app and Expo mobile app using shared business logic.
- Create migrations for the new database tables and policies without deleting existing data.
- Include tests for household permissions, invitations, and real-time synchronization.

Build the feature incrementally, starting with the shared grocery list and household invitations. Do not deploy database migrations automatically without review.
