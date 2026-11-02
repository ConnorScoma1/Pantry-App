# Seasonal Cooking Preferences

> Received 2026-11-01 from the product owner. Kept verbatim; see docs/ARCHITECTURE.md for how it maps onto the build.

Automatic Seasonal Detection and Transitions

Automatically determine the current season based on the user's ZIP code, geographic region, and current date.

Automatically transition between spring, summer, fall, and winter throughout the year without requiring users to manually select or update their season.

Enable seasonal recipe recommendations by default during onboarding.

Preselect seasonal produce, seasonal meals, seasonal desserts, and seasonal recipe suggestions.

Allow users to disable seasonal recommendations or customize their seasonal preferences at any time.

Account for regional differences in growing seasons and ingredient availability, including Northern and Southern Hemisphere locations.

Add a Seasonal Cooking Preferences feature to Pantry App.

The feature should be enabled by default, with sensible seasonal preferences already selected during onboarding.

Onboarding and settings

Add an "Enjoy seasonal recipes" toggle, enabled by default.

Preselect Seasonal Produce, Seasonal Meals, Seasonal Desserts, and Holiday/Occasion Recipes.

Offer Seasonal Grocery Deals as an additional opt-in option.

Let users customize these settings at any time.

Use the user's ZIP code or selected region to determine the appropriate seasonal calendar.

Support Northern and Southern Hemisphere seasons.

Meal planning

Give seasonal recipes a recommendation boost rather than excluding nonseasonal recipes.

Recommend seasonal produce and appropriate cooking styles.

Keep seasonal recommendations within the household's grocery budget.

Prioritize pantry ingredients before suggesting new purchases.

Use actual retailer pricing when available; do not invent prices or assume in-season produce is always cheaper.

Allow users to override seasonal recommendations.

Desserts

Apply seasonal preferences to optional dessert planning.

Examples include strawberry shortcake in summer, apple crisp in fall, and gingerbread in winter.

Respect the user's existing dessert frequency and dessert skill preferences.

Holiday planning

Support optional seasonal holiday and celebration menus.

Do not assume which holidays a household celebrates.

Let users enable or disable specific holiday suggestions.

Technical requirements

Integrate with the existing Next.js, Expo, and Supabase architecture.

Store preferences per user and allow household-level overrides where appropriate.

Use existing onboarding and preference structures where possible.

Review migrations before making database changes.

Do not automatically deploy database migrations.

Keep onboarding lightweight and use sensible defaults so users can proceed without answering additional questions.

Use seasonal ingredients to influence AI-generated meal plans, grocery lists, and optional desserts.

Prioritize verified local grocery prices, current promotions, and existing pantry inventory when recommending seasonal ingredients.

Never restrict users to seasonal recipes; seasonal preferences should influence recommendations, not limit their choices.

Add an optional "In Season This Week" section to the home dashboard highlighting seasonal ingredients and recommended recipes.

Automatically refresh seasonal recommendations as the calendar changes, without requiring the user to update their preferences.

Important: Seasonal detection should work automatically in the background. Users should not have to configure their season every few months. Keep the experience simple and intuitive across both the web and mobile applications.
