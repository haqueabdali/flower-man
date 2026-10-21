-- A photo of the proposed bouquet on custom-request offers (ADR-025). Bytes live in object storage.
ALTER TABLE custom_offers
  ADD COLUMN image_key          text        CHECK (image_key ~ '^offer-images/'),
  ADD COLUMN image_content_type text        CHECK (image_content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN image_updated_at   timestamptz,
  ADD CONSTRAINT custom_offers_image_complete
    CHECK ((image_key IS NULL) = (image_content_type IS NULL) AND (image_key IS NULL) = (image_updated_at IS NULL));
