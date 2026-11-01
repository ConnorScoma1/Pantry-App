# PROJECT: AI-Powered Smart Kitchen & Grocery Planning Platform

## YOUR ROLE

You are a senior full-stack software engineer, mobile application developer, AI architect, database engineer, and product designer.

I want you to help me build a production-quality cross-platform application for iOS, Android, desktop web, and mobile web.

You are responsible for designing the architecture, creating the project structure, writing working code, implementing the database, building the frontend, and connecting the backend.

Do not simply create mockups. I want a functional application that can eventually be launched commercially.

Work incrementally, explaining major architectural decisions. Prioritize clean, maintainable, scalable code.

## 1. PRODUCT VISION

Build an intelligent kitchen assistant that helps households:

- Spend less money on groceries.
- Reduce food waste.
- Cook better meals.
- Eat healthier according to their preferences.
- Use ingredients they already own.
- Discover genuinely delicious, highly rated recipes.
- Plan meals for an entire week.
- Generate accurate, consolidated grocery lists.
- Compare grocery prices where authorized retailer data is available.
- Learn cooking techniques ranging from beginner to advanced fine dining.

The application should feel like having a personal chef, grocery budget manager, and kitchen inventory assistant working together.

**CORE PRODUCT PRINCIPLE:**

The AI should not simply generate random meals. It should recommend meals that users will genuinely enjoy, want to cook again, and can afford.

## 2. TECHNOLOGY STACK

Use the following architecture:

**Frontend**
- Next.js with React and TypeScript for desktop and mobile web.
- React Native with Expo for iOS and Android.
- Tailwind CSS for web.
- NativeWind for mobile.
- Shared design tokens and reusable logic.
- Responsive layouts.

**Backend**
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Supabase Storage.
- Secure server-side API endpoints.
- Row-level security.

**AI**
- Claude API for recommendations, ingredient interpretation, meal planning, substitutions, and cooking assistance.
- Structured JSON outputs with schema validation.
- Retrieval-augmented generation for recipes from approved sources.
- Server-side AI requests only.

**Architecture**
- Turborepo monorepo.
- Shared TypeScript types.
- Shared validation schemas.
- Shared recipe, inventory, and pricing logic.
- Modular provider integrations.

Create the following basic structure:

```text
apps/
  web/
  mobile/
packages/
  ui-tokens/
  database/
  shared-types/
  validation/
  meal-planner/
  grocery-pricing/
  recipe-engine/
  inventory-engine/
  ai/
  integrations/
supabase/
  migrations/
```

Use current stable, mutually compatible package versions.

## 3. DESIGN AND USER EXPERIENCE

Use the attached screenshots of TapCook as inspiration for the overall user experience.

Do not copy its branding, exact layouts, or proprietary assets.

I want a clean, premium, minimalistic design with:

- White backgrounds.
- Soft neutral cards.
- Rounded corners.
- Large readable typography.
- Intuitive buttons.
- Subtle animations.
- Beautiful food photography.
- Easy-to-understand pricing.
- Simple navigation.
- Dark mode support.

Mobile navigation should contain:

1. Home
2. My Kitchen
3. Meal Plan
4. Grocery List
5. Profile

Desktop navigation should use a responsive sidebar or top navigation.

The application should feel polished and premium, not like a generic AI chatbot.

## 4. USER ONBOARDING

When someone first opens the application, guide them through an interactive questionnaire.

Use a multi-step onboarding flow with progress indicators.

### Step 1: Household

Ask:

- ZIP code.
- Country.
- Number of adults.
- Number of children.
- Number of people being cooked for.
- Number of dinners per week.
- Whether they want breakfast, lunch, dinner, or snacks included.

Allow different portion requirements for individual meals.

### Step 2: Grocery budget

Ask:

"What is your weekly grocery budget?"

Allow a dollar amount and budget period.

Examples:

- $75/week
- $125/week
- $200/week
- No strict budget

Ask whether the budget includes breakfast, lunch, dinner, snacks, drinks, and household items.

Allow users to select their priority:

- Spend as little as possible.
- Balance cost and quality.
- Prioritize quality ingredients.
- Premium cooking regardless of cost.

### Step 3: Cooking goals

Allow multiple selections:

- Save money.
- Reduce food waste.
- Eat healthier.
- Lose weight.
- Increase protein.
- Learn to cook.
- Cook more interesting meals.
- Prepare gourmet meals.
- Save time.
- Meal prep.
- Use up existing groceries.

Rank goals by priority.

### Step 4: Dietary preferences

Ask about:

- Allergies.
- Dietary restrictions.
- Foods they dislike.
- Preferred cuisines.
- Protein preferences.
- Desired nutrition targets.
- Foods they never want recommended.

Allergies must be treated as strict exclusions, including ingredient aliases and relevant cross-contact warnings. Never guarantee that a recipe is allergen-free without verifying its ingredients and preparation conditions.

### Step 5: Cooking skill

Implement a five-level cooking proficiency system.

**Level 1 — Beginner**

Simple recipes, minimal ingredients, very detailed instructions, basic equipment.

**Level 2 — Home Cook**

Everyday cooking, sauces, roasting, sautéing, and basic knife skills.

**Level 3 — Experienced Home Cook**

More advanced techniques, homemade stocks, reductions, braising, temperature control, and layered flavors.

**Level 4 — Advanced / Professional**

Restaurant-quality preparations, emulsions, compound sauces, advanced protein cookery, refined plating, and multi-component dishes.

**Level 5 — Fine Dining / Chef's Table**

High-end tasting-menu-style cooking, sophisticated French techniques, modern gastronomy, precise temperatures, complex sauces, intricate plating, and multi-stage preparations.

At Level 5, recipes may include techniques such as sous vide, gastriques, beurre blanc, consommé clarification, confit, and elaborate composed plates.

Do not imply that recipes are Michelin-starred unless they are genuinely associated with a verified Michelin-starred establishment.

Allow users to change their skill level at any time.

### Step 6: Available equipment

Ask which equipment they own:

- Stove
- Oven
- Microwave
- Air fryer
- Slow cooker
- Pressure cooker
- Grill
- Smoker
- Sous vide
- Stand mixer
- Blender
- Food processor
- Cast iron
- Dutch oven

Do not recommend recipes requiring unavailable equipment unless a viable alternative exists.

### Step 7: Grocery store

Use ZIP code to find nearby grocery stores through an appropriate authorized location provider.

Let users choose their preferred retailer and, when possible, a specific store location.

Potential retailers include:

- Walmart
- Kroger
- Meijer
- Aldi
- Target
- Costco
- Whole Foods
- Publix
- Hy-Vee

Only display retailers supported by actual location and pricing integrations.

Never fabricate retailer availability, prices, or inventory.

## 5. MY KITCHEN — SMART INVENTORY SYSTEM

Create a complete digital pantry, refrigerator, and freezer management system.

Users should be able to enter ingredients they already own.

Categories include:

- Proteins
- Produce
- Dairy
- Grains
- Pasta
- Rice
- Canned goods
- Frozen foods
- Spices
- Oils
- Sauces
- Condiments
- Baking ingredients

For each ingredient store:

- Name
- Quantity
- Unit of measurement
- Storage location
- Purchase date, if known
- Expiration or use-by date, if known
- Opened date, if known
- Estimated remaining quantity
- Optional price paid

Allow users to mark common staples in bulk rather than manually entering everything.

Support manually adding items, searching ingredients, and editing quantities.

Design the data model so barcode scanning and receipt import can be added later.

### Inventory intelligence

When the user cooks a recipe, offer to deduct consumed ingredients from inventory.

Never assume an ingredient has been consumed without the user's confirmation or a previously enabled automation preference.

When building a grocery list, subtract available usable inventory from the required ingredient quantities.

Normalize measurements and account for package sizes.

## 6. FOOD WASTE REDUCTION ENGINE

This is one of the most important product features.

Create a feature called:

**"Use It Before You Lose It"**

Users can select an ingredient that needs to be used soon.

Examples:

- Chicken thighs
- Half a bag of spinach
- Three ripe tomatoes
- Leftover cooked rice
- Mushrooms
- Opened heavy cream

The AI should recommend recipes that prioritize these ingredients.

Include an urgency system based on user-provided dates, storage conditions, and conservative food-safety guidance.

Never treat appearance or smell alone as proof that food is safe.

Never recommend using food past applicable safety limits merely to reduce waste.

### Example

User has:

- 1 lb chicken thighs
- 2 cups spinach
- Half a container of cream
- Garlic
- Parmesan

The system might recommend:

Creamy Garlic Chicken with Spinach and Parmesan

It should explain:

"You already have most of the ingredients. You'll only need to purchase two additional items."

Show estimated additional cost, cooking time, and inventory usage.

Also allow users to select multiple expiring ingredients and generate several meal ideas.

## 7. AI RECIPE DISCOVERY ENGINE

I do not want generic, repetitive AI recipes.

Build a high-quality recipe discovery and recommendation system.

### Recipe sources

Use legally accessible sources such as:

- Licensed recipe APIs.
- Approved recipe databases.
- Recipe pages that permit the intended access.
- User-submitted recipes.
- Original recipes created for the application.
- Authorized culinary partners.

One culinary reference to investigate:

https://www.performancefoodservice.com/search/?metadata=%5B08d2e6b1-2656-488d-a26c-1d2d7f9e89bc%5D&page=1

This source contains foodservice culinary content and recipes developed by professional chefs.

Investigate whether recipes can be accessed through authorized APIs, licensing, or permission.

Do not assume that public accessibility permits scraping, copying, or commercial republication.

Preserve source attribution and links when appropriate.

### Recipe quality ranking

Develop a scoring system that considers:

- Verified user ratings.
- Number of ratings.
- Repeat cooking rate.
- User favorites.
- Cuisine preferences.
- Ingredient compatibility.
- Grocery cost.
- Cooking skill.
- Cooking time.
- Available equipment.
- Nutrition preferences.
- Ingredient waste reduction.

Do not invent ratings or review counts.

If reliable ratings are unavailable, label recommendations as editorial or AI suggestions rather than highly rated recipes.

### AI improvements

Use Claude to:

- Explain recipes clearly.
- Suggest reasonable substitutions.
- Scale servings.
- Convert measurements.
- Adapt techniques to skill level.
- Suggest alternative garnishes.
- Recommend complementary side dishes.
- Explain why ingredients work together.

Preserve culinary integrity. Do not automatically simplify an advanced recipe if the user selected professional-level cooking.

## 8. AUTOMATIC WEEKLY MEAL PLANNING

Create a meal-planning engine that uses all onboarding information.

Inputs include:

- Budget
- Household size
- Dietary preferences
- Cooking skill
- Equipment
- Available inventory
- Ingredients expiring soon
- Preferred grocery store
- Cooking schedule
- Cooking time
- Recipe ratings
- Cuisine preferences

The system should generate a weekly menu.

Example:

**Monday:** Honey Garlic Chicken with Broccoli

**Tuesday:** Shrimp Fajita Bowls

**Wednesday:** Beef and Broccoli

**Thursday:** Chicken Parmesan

**Friday:** Homemade Pizza

Each meal card should display:

- Recipe image
- Name
- Cooking time
- Difficulty
- Servings
- Estimated cost
- Estimated cost per serving
- Calories and macros, when calculable
- Ingredients already owned
- Ingredients that must be purchased

Users must be able to:

- Swap individual meals.
- Regenerate the entire week.
- Lock meals they want to keep.
- Save favorite recipes.
- Reuse previous meal plans.
- Adjust servings.
- Move meals between days.
- Add custom meals.
- Exclude recipes they dislike.

### Budget optimization

The meal planner should optimize the total grocery basket, not merely the theoretical cost of each recipe.

For example, if one recipe requires half a package of spinach, prioritize another recipe that uses the remaining spinach.

Consider:

- Package sizes
- Ingredient reuse
- Pantry inventory
- Leftover portions
- Retailer prices
- Waste reduction

Do not claim a plan is within budget until the complete shopping basket has been calculated.

If verified prices are unavailable, clearly identify the result as an estimate.

## 9. AUTOMATIC GROCERY LIST

Once a meal plan is generated, automatically create a consolidated grocery list.

Example:

If three recipes require garlic, combine them into one shopping-list entry.

Group groceries by department:

- Produce
- Meat and seafood
- Dairy
- Bakery
- Pantry
- Frozen foods
- Spices
- Other

Each item should include:

- Ingredient name
- Required quantity
- Suggested purchase quantity
- Selected store
- Product match, if available
- Unit price
- Package price
- Estimated or verified status
- Timestamp of the last price update

Allow users to:

- Check off purchased items.
- Add custom items.
- Remove items.
- Change quantities.
- Mark items already owned.
- Save lists.
- Share lists with household members.

Update the projected total whenever quantities or items change.

Account for taxes and applicable fees separately when supported.

## 10. REAL GROCERY PRICING SYSTEM

This is a critical feature.

Design a modular grocery pricing integration layer.

The application should attempt to retrieve prices from authorized retailer APIs, licensed data providers, or approved integrations.

Each pricing provider must support a common interface.

Data should include:

- Retailer
- Store location
- Product identifier
- Product name
- Package size
- Unit price
- Current displayed price
- Promotion information, if available
- Price retrieval timestamp
- Availability status, if available

Implement robust ingredient-to-product matching.

For example:

Recipe requires 12 oz broccoli.

Retailer sells broccoli in 1 lb packages.

The shopping list should calculate the price of the package the customer must actually buy.

Distinguish between:

1. Verified current store-specific price.
2. Recently cached store-specific price.
3. Estimated price.
4. Price unavailable.

Never present estimated pricing as verified.

Do not fabricate API endpoints or credentials.

Do not bypass retailer authentication, anti-bot protections, or terms of service.

Start with a mock pricing provider using clearly labeled sample data, then build the integration interfaces for real providers.

Implement price caching, retries, rate limiting, and provider error handling.

## 11. RECIPE COOKING MODE

When users select a recipe, provide an interactive cooking interface.

Include:

- Ingredient checklist
- Prep time
- Cook time
- Total time
- Required equipment
- Step-by-step directions
- Ingredient quantities within instructions
- Temperature guidance
- Food safety temperatures
- Cooking timers
- Photos when licensed or available
- Chef tips
- Substitution suggestions

Include a hands-free-friendly cooking mode with large text and simple navigation.

Add an AI cooking assistant that can answer questions such as:

"My sauce broke. How do I fix it?"

"My chicken is browning too quickly."

"I don't have shallots. What can I substitute?"

"How do I make this look like a fine dining dish?"

The assistant should use the current recipe and cooking step as context.

## 12. ADVANCED CHEF MODE

Create a special experience for advanced cooks.

When a user selects Level 4 or Level 5, allow access to more sophisticated recipes and techniques.

Include:

- Multi-component dishes.
- Professional mise en place.
- Detailed preparation timelines.
- Precise temperature targets.
- Sauce preparation.
- Protein cookery.
- Plating instructions.
- Garnish preparation.
- Equipment requirements.
- Optional wine pairing suggestions.

Example:

Instead of ordinary chicken breast with mashed potatoes, advanced mode could recommend:

Pan-Roasted Chicken Supreme with Pommes Purée, Glazed Baby Carrots, and Tarragon Jus.

The application should explain how to execute each component and coordinate service timing.

The recipe engine must understand that advanced cooking is not just adding expensive ingredients. It is about technique, execution, balance, and presentation.

## 13. USER FEEDBACK AND PERSONALIZATION

After a meal, allow users to rate it.

Collect:

- Overall rating
- Flavor rating
- Difficulty
- Would cook again
- Actual preparation time
- Family approval
- Optional notes

Use this feedback to improve future recommendations.

If someone repeatedly dislikes a particular ingredient or cuisine, reduce its recommendation frequency.

If someone repeatedly saves Italian recipes, incorporate that preference.

Allow users to reset their recommendations and delete their stored preferences.

## 14. HOUSEHOLD ACCOUNTS

Support shared household functionality.

Household members should be able to:

- View meal plans.
- Edit grocery lists.
- Update pantry inventory.
- Save recipes.
- See changes across devices.

Implement appropriate access controls so users can access only households they belong to.

## 15. DATABASE DESIGN

Create a normalized PostgreSQL schema with tables for:

- Users
- Households
- Household memberships
- User preferences
- Dietary restrictions
- Allergies
- Kitchen equipment
- Pantry ingredients
- Pantry inventory transactions
- Recipes
- Recipe ingredients
- Recipe instructions
- Recipe sources
- Recipe ratings
- Meal plans
- Planned meals
- Grocery lists
- Grocery list items
- Retailers
- Store locations
- Retailer products
- Product price observations
- Ingredient-to-product mappings
- Cooking history
- User favorites

Use UUID primary keys, appropriate foreign keys, indexes, timestamps, and row-level security.

Include migrations and seed data.

Store ingredient quantities in normalized units where possible, while preserving original recipe units.

## 16. SECURITY AND RELIABILITY

Implement:

- Secure authentication.
- Protected API routes.
- Server-side secret management.
- Input validation.
- Rate limiting.
- AI usage controls.
- Database row-level security.
- Logging.
- Error monitoring.
- Graceful API failures.
- Accessible UI components.
- Basic automated tests.

Never expose Claude API keys, retailer credentials, or privileged Supabase keys in client-side code.

Do not let AI-generated text execute database queries or application commands directly.

Use structured outputs and validation before storing generated content.

## 17. PERFORMANCE

Optimize for:

- Fast mobile loading.
- Efficient database queries.
- Cached recipe content.
- Cached grocery prices.
- Responsive navigation.
- Lazy-loaded images.
- Minimal unnecessary AI requests.
- Reliable synchronization between web and mobile.

Design the system to support growth without prematurely introducing unnecessary infrastructure.

## 18. DEVELOPMENT PHASES

Do not attempt to implement the entire application in one enormous untested step.

### Phase 1 — Foundation

Create:

- Monorepo
- Next.js application
- Expo application
- Shared packages
- Supabase schema
- Authentication
- Design system
- Navigation
- Onboarding

### Phase 2 — Kitchen and recipes

Create:

- Pantry inventory
- Ingredient search
- Recipe database
- Recipe details
- Skill-level filtering
- Recipe ratings
- Favorite recipes

### Phase 3 — AI meal planning

Create:

- Claude integration
- Weekly meal planner
- Budget constraints
- Recipe swapping
- Ingredient reuse
- Food waste optimization

### Phase 4 — Grocery lists

Create:

- Consolidated shopping lists
- Quantity conversion
- Pantry deductions
- Store selection
- Mock pricing provider
- Price calculation engine

### Phase 5 — Real pricing

Research authorized grocery data integrations.

Implement a real provider only after verifying access, coverage, licensing, and costs.

### Phase 6 — Advanced features

Create:

- Cooking assistant
- Advanced chef mode
- Household sharing
- Expiration reminders
- Cooking history
- Personalization
- Nutrition improvements

### Phase 7 — Production readiness

Implement:

- Automated testing
- Security review
- Performance optimization
- Deployment
- iOS and Android build configuration
- Production monitoring

## 19. IMPORTANT DEVELOPMENT RULES

1. Write actual working code, not pseudocode.
2. Do not invent third-party API capabilities.
3. Use TypeScript throughout.
4. Use reusable components.
5. Keep AI logic separate from UI logic.
6. Implement real database persistence.
7. Validate AI outputs.
8. Never fabricate grocery prices.
9. Do not reproduce copyrighted recipes without permission.
10. Make the UI responsive across desktop, tablet, and mobile.
11. Build one complete feature at a time.
12. Test functionality before moving to the next phase.
13. Document environment variables and setup instructions.
14. Do not hardcode credentials.
15. Keep the project easy to maintain and extend.

## 20. START BUILDING

Begin by:

1. Reviewing the entire specification.
2. Identifying any critical architectural risks or missing decisions.
3. Proposing the final architecture.
4. Creating the monorepo structure.
5. Establishing the shared design system.
6. Creating the initial database migrations.
7. Building the onboarding experience.
8. Building the main navigation and application shell.

Use the attached screenshots as visual references for design quality and user experience.

Use mock recipe and pricing data only where necessary, clearly label it, and keep the interfaces ready for real integrations.

After completing the initial foundation, explain what was built, how to run it locally, what remains incomplete, and which feature should be implemented next.

**The end goal is a polished, commercially viable AI kitchen platform that combines excellent food recommendations, practical grocery budgeting, intelligent inventory management, and advanced culinary education.**
