# Pantry App — Smart Cart Checkout Feature

> Received 2026-11-01 from the product owner. Kept verbatim; see docs/ARCHITECTURE.md for how it maps onto the build.

Implement a Smart Cart Checkout feature that allows users to convert their AI-generated grocery lists into online grocery orders through supported retailer integrations.

## User experience

* After creating a meal plan, users can select "Build My Cart."
* Allow users to select a preferred grocery retailer and store location.
* Automatically consolidate duplicate ingredients and subtract available pantry inventory.
* Match ingredients to real retailer products using approved APIs.
* Show brand, package size, quantity, current price, and availability when supported.
* Let users review product matches and approve substitutions before adding items to their retailer cart.
* Display an estimated cart total, clearly distinguishing it from the retailer's final checkout total.
* Let users select their preferred fulfillment method: curbside pickup or delivery, where available.
* Transfer the selected products into the retailer's cart using authorized integrations.
* Redirect users to the retailer's supported cart or checkout destination to choose a fulfillment time and complete payment.

## Retailer integrations

* Design a modular retailer integration architecture.
* Research official integrations for Kroger, Walmart, and Instacart.
* Prioritize a retailer with accessible, documented cart functionality.
* Use secure OAuth authentication when required.
* Do not scrape protected retailer checkout systems or automate purchases through unsupported methods.
* If direct cart creation isn't supported, provide a clearly labeled fallback such as a retailer shopping link or exportable grocery list.
* Never claim that a cart has been populated unless the retailer API confirms success.

## Household integration

* Support grocery lists shared between household members.
* Allow the household to review the finalized cart before transferring products to a retailer.
* Prevent duplicate cart transfers when a user retries.
* Track shopping-list status separately from actual retailer purchase status.

## Technical requirements

* Integrate with the existing Next.js web app, Expo mobile app, and Supabase backend.
* Keep retailer credentials and API secrets on the server.
* Never collect or store retailer payment card details.
* Create reusable retailer adapters for future integrations.
* Handle out-of-stock items, substitutions, API errors, quantity mismatches, and expired authorizations.
* Do not deploy migrations or enable live purchases automatically.
* Start by building the interface and a mock retailer adapter, then implement a real integration only after API access is verified.

Goal: Reduce the time between meal planning and grocery checkout while keeping the user in control of product selection, substitutions, fulfillment, and payment.
