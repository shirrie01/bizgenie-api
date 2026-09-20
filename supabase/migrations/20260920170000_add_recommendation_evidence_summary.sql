begin;
alter table public.campaign_goal_recommendations
  add column if not exists evidence_summary text;
alter table public.campaign_goal_recommendations
  drop constraint if exists campaign_goal_recommendations_evidence_summary_check;
alter table public.campaign_goal_recommendations
  add constraint campaign_goal_recommendations_evidence_summary_check
  check (evidence_summary is null or length(evidence_summary) between 1 and 1000);
comment on column public.campaign_goal_recommendations.evidence_summary is
  'Customer-safe summary of verified outcome evidence considered by this immutable recommendation receipt.';
commit;
