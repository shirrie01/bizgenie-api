-- Derived immutable read model. social_dispatches remains the sole platform-confirmation authority.
begin;
create view public.verified_campaign_publications with(security_invoker=true,security_barrier=true) as
 select d.dispatch_id,d.tenant_id,d.project_id,d.brand_id,d.campaign_id,d.content_item_id,d.variant_id,d.revision_id,d.approval_id,d.schedule_id,d.connection_id,
 n.platform,n.account_id destination_account,d.publication_id provider_publication_id,d.publication_url,d.published_at,d.updated_at confirmed_at,
 'platform_api'::text evidence_kind,'confirmed'::text reconciliation_status,
 a.preview_id,dna.dna_id
 from public.social_dispatches d join public.social_connections n on(n.connection_id,n.tenant_id,n.project_id,n.brand_id)=(d.connection_id,d.tenant_id,d.project_id,d.brand_id)
 join public.campaign_approval_events a on(a.approval_id,a.tenant_id,a.project_id,a.campaign_id,a.variant_id,a.revision_id)=(d.approval_id,d.tenant_id,d.project_id,d.campaign_id,d.variant_id,d.revision_id)
 left join public.creative_content_dna dna on dna.revision_id=d.revision_id
 where d.state='published' and d.publication_id is not null and d.publication_url is not null and d.published_at is not null;
revoke all on public.verified_campaign_publications from public,anon,authenticated,service_role;
commit;
