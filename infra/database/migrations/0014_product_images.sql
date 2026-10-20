-- Product photos uploaded by sellers, stored in object storage (ADR-017). The bytes never live in the database.
ALTER TABLE products
  ADD COLUMN image_key          text        CHECK (image_key ~ '^product-images/'),
  ADD COLUMN image_content_type text        CHECK (image_content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN image_updated_at   timestamptz,
  ADD CONSTRAINT products_image_complete
    CHECK ((image_key IS NULL) = (image_content_type IS NULL) AND (image_key IS NULL) = (image_updated_at IS NULL));
