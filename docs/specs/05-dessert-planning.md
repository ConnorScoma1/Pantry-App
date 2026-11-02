# Dessert Planning (optional)

> Received 2026-11-01 from the product owner. Kept verbatim; see docs/ARCHITECTURE.md for how it maps onto the build.

Add an optional Dessert Planning feature to Pantry App.

Requirements:

- Add dessert preferences to onboarding and user settings.
- Options: Never automatically, once weekly, twice weekly, weekends only, and special occasions only.
- Default to once weekly, but allow users to skip desserts entirely.
- Add a manual "Add Dessert" button to the weekly meal planner.
- Support dessert difficulty levels from beginner through professional pastry.
- Allow dessert difficulty to differ from the user's regular cooking skill.
- Include desserts in grocery budget calculations, shopping lists, and pantry ingredient reuse.
- Avoid purchasing duplicate ingredients when dessert and meal recipes overlap.
- Let users choose dessert categories such as cookies, cakes, pastries, frozen desserts, and plated desserts.
- Allow users to save favorite desserts.
- Account for preparation and chilling times when scheduling desserts.
- Ensure desserts are not automatically generated every day.
- Maintain compatibility with the existing Next.js, Expo, and Supabase architecture.
- Review existing database schemas before proposing migrations. Do not deploy automatically.

Prioritize a simple, intuitive experience without making onboarding unnecessarily long.
