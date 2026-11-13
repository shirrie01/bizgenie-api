-- Reconciled source: Instagram-feed video is excluded; proposal remains NOT PROVISIONABLE.
-- BG-LAUNCH-002: launch image/video preview profiles. Insert-only and idempotent; adds no table, column, grant or policy.
-- Hashes are the registry's own profile hash (src/campaigns/previewRegistry.js profileHash) so the in-code and durable registries agree.
insert into public.campaign_preview_profiles
  (profile_id, profile_version, platform, placement, format, renderer_version, profile_hash, status)
values
  ('facebook.feed.image', 1, 'facebook', 'feed', 'image', 'bizgenie-preview-renderer.v1', '0b67e2c138ac0319b418e763556f408fcaefd7b9fc71b82fcf76361fd680ce0b', 'active'),
  ('facebook.feed.video', 1, 'facebook', 'feed', 'video', 'bizgenie-preview-renderer.v1', '50ae92c7ce015dade3b07b13820e79ee4c85d9ad6d5e2d20ead7623b0c003077', 'active'),
  ('linkedin.feed.image', 1, 'linkedin', 'feed', 'image', 'bizgenie-preview-renderer.v1', 'fa5d58c31d6f15a72ce352b41733b3b48e19ad5c11dc31de723c21484db01569', 'active'),
  ('linkedin.feed.video', 1, 'linkedin', 'feed', 'video', 'bizgenie-preview-renderer.v1', 'bdb0fa1cea7f17680c3f0003c82e59f6da64ba594d8be6efb92c2e3350cde7aa', 'active')
on conflict (profile_id, profile_version) do nothing;
