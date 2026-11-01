-- Small (480px) version of each photo for the product grid; the full image (path) loads only in the
-- product viewer. Null for photos uploaded before thumbnails existed, which fall back to path.
alter table public.product_images add column thumb_path text;
