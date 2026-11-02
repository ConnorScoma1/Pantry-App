-- =============================================================================
-- Surprise Me (spec 02 §5).
--
-- Review before applying. Changes one check constraint; nothing is deleted.
--   * recommendation_events.surface also allows 'surprise', so ideas shown by
--     Surprise Me are remembered and not repeated for two weeks (unless they
--     are favourites). The rest of Surprise Me needs no new tables: it uses
--     the household's ratings, cooking history and recommendation events.
-- =============================================================================

alter table public.recommendation_events drop constraint if exists recommendation_events_surface_check;
alter table public.recommendation_events
  add constraint recommendation_events_surface_check check (surface in ('home', 'recipes', 'detail', 'plan', 'surprise'));
