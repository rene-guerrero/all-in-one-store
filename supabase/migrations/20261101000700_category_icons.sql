-- Icon chosen by an admin for a category (a key of ICON_LIBRARY in docs/catalog.js).
-- SoftCell categories keep their built-in icons; admins can only set icons on their own categories
-- (the existing update policy already limits edits to source = 'manual').
alter table public.categories add column icon text;
