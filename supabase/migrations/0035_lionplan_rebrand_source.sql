-- =============================================================================
-- 0035_lionplan_rebrand_source.sql — product rename Columbia Catalog → LionPlan
--
-- Existing deployments applied 0029 with the old contribution `source` string.
-- The app and extension now send the LionPlan source; this migration updates
-- rows and the check / RPC so uploads keep working.
-- Fresh installs that already used the LionPlan string in 0029 are a no-op.
-- =============================================================================

-- Prefer the new product name on any rows that still carry the working title.
update vergil_contributions
   set source = 'Vergil course search via LionPlan Chrome extension'
 where source = 'Vergil course search via Columbia Catalog Chrome extension';

-- Inline checks from 0029 get auto-generated names; drop whichever one gates
-- the Vergil source string, then re-add under a stable name.
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'vergil_contributions'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%Vergil course search%'
  loop
    execute format('alter table vergil_contributions drop constraint %I', r.conname);
  end loop;
end $$;

alter table vergil_contributions
  add constraint vergil_contributions_source_check
  check (source = 'Vergil course search via LionPlan Chrome extension');

-- Mirror the new source string in the header validator used by start_*.
create or replace function start_vergil_contribution(
  p_user_id uuid,
  p_payload_hash text,
  p_schema_version integer,
  p_source text,
  p_term_code text,
  p_expected_sections integer,
  p_expected_meetings integer,
  p_expected_locations integer,
  p_scan_page integer,
  p_scan_pages integer,
  p_scanned_courses integer,
  p_total_courses integer,
  p_scan_started_at timestamptz,
  p_scan_completed_at timestamptz,
  p_observed_from timestamptz,
  p_observed_to timestamptz,
  p_exported_at timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_existing vergil_contributions%rowtype;
  v_id uuid;
begin
  if p_schema_version <> 1
     or p_source <> 'Vergil course search via LionPlan Chrome extension'
     or p_term_code !~ '^[0-9]{4}[123]$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_sections not between 1 and 20000
     or p_expected_meetings not between 0 and 300000
     or p_expected_locations not between 0 and p_expected_meetings
     or p_scan_page <= 0 or p_scan_page <> p_scan_pages
     or p_scanned_courses <= 0 or p_scanned_courses <> p_total_courses then
    raise exception 'vergil_contribution_invalid_header'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_scan_completed_at < now() - interval '48 hours'
     or p_scan_completed_at > now() + interval '10 minutes'
     or p_scan_completed_at < p_scan_started_at
     or p_observed_to < p_observed_from
     or p_observed_from < p_scan_started_at - interval '15 minutes'
     or p_observed_to > p_scan_completed_at + interval '15 minutes'
     or p_exported_at < p_scan_completed_at - interval '15 minutes'
     or p_exported_at > now() + interval '10 minutes' then
    raise exception 'vergil_contribution_invalid_time_range'
      using errcode = 'invalid_datetime_format';
  end if;

  select * into v_existing
    from vergil_contributions
   where user_id = p_user_id and payload_hash = p_payload_hash;

  if found then
    return jsonb_build_object(
      'contributionId', v_existing.contribution_id,
      'status', v_existing.status,
      'receivedSections', v_existing.received_sections,
      'expectedSections', v_existing.expected_sections,
      'idempotent', true
    );
  end if;

  if (
    select count(*)
      from vergil_contributions
     where user_id = p_user_id and created_at >= now() - interval '1 hour'
  ) >= 3 then
    raise exception 'vergil_contribution_hourly_limit'
      using errcode = 'program_limit_exceeded';
  end if;

  insert into vergil_contributions (
    user_id, payload_hash, schema_version, source, term_code,
    expected_sections, expected_meetings, expected_locations,
    scan_page, scan_pages, scanned_courses, total_courses,
    scan_started_at, scan_completed_at, observed_from, observed_to, exported_at
  ) values (
    p_user_id, p_payload_hash, p_schema_version, p_source, p_term_code,
    p_expected_sections, p_expected_meetings, p_expected_locations,
    p_scan_page, p_scan_pages, p_scanned_courses, p_total_courses,
    p_scan_started_at, p_scan_completed_at, p_observed_from, p_observed_to, p_exported_at
  ) returning contribution_id into v_id;

  return jsonb_build_object(
    'contributionId', v_id,
    'status', 'uploading',
    'receivedSections', 0,
    'expectedSections', p_expected_sections,
    'idempotent', false
  );
end;
$$;
