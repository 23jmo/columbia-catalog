-- =============================================================================
-- 0029_vergil_contributions.sql — signed-in Vergil schedule contributions
--
-- The Chrome extension never sends credentials. It contributes only the
-- sanitized result of a completed full-term scan. Uploads are staged in small
-- chunks, then finalized by one service-role-only transaction that refuses to
-- replace newer or more complete meeting data.
-- =============================================================================

alter table meetings
  add column if not exists source text not null default 'catalog_ingest',
  add column if not exists observed_at timestamptz not null default now();

comment on column meetings.source is
  'Provenance for this meeting observation. Vergil contributions use vergil_extension.';
comment on column meetings.observed_at is
  'When the source observed this meeting, not when Columbia Catalog received it.';

create index if not exists idx_meetings_observed_at on meetings (observed_at desc);

create table if not exists vergil_contributions (
  contribution_id       uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users (user_id) on delete cascade,
  term_code             text not null references terms (term_code) on delete restrict,
  payload_hash          text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  schema_version        integer not null check (schema_version = 1),
  source                text not null check (
                          source = 'Vergil course search via Columbia Catalog Chrome extension'
                        ),
  status                text not null default 'uploading' check (
                          status in ('uploading', 'accepted', 'partial', 'rejected')
                        ),
  expected_sections     integer not null check (expected_sections between 1 and 20000),
  expected_meetings     integer not null check (expected_meetings between 0 and 300000),
  expected_locations    integer not null check (
                          expected_locations between 0 and expected_meetings
                        ),
  received_sections     integer not null default 0 check (received_sections >= 0),
  accepted_sections     integer not null default 0 check (accepted_sections >= 0),
  unmatched_sections    integer not null default 0 check (unmatched_sections >= 0),
  lower_quality_sections integer not null default 0 check (lower_quality_sections >= 0),
  stale_sections        integer not null default 0 check (stale_sections >= 0),
  meetings_written      integer not null default 0 check (meetings_written >= 0),
  locations_written     integer not null default 0 check (locations_written >= 0),
  scan_page             integer not null check (scan_page > 0),
  scan_pages            integer not null check (scan_pages > 0),
  scanned_courses       integer not null check (scanned_courses > 0),
  total_courses         integer not null check (total_courses > 0),
  scan_started_at       timestamptz not null,
  scan_completed_at     timestamptz not null,
  observed_from         timestamptz not null,
  observed_to           timestamptz not null,
  exported_at           timestamptz not null,
  finalized_at          timestamptz,
  rejection_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, payload_hash),
  check (scan_page = scan_pages),
  check (scanned_courses = total_courses),
  check (observed_to >= observed_from),
  check (scan_completed_at >= scan_started_at)
);

comment on table vergil_contributions is
  'Account-bound audit ledger for sanitized, full-term Vergil extension uploads.';

create index if not exists idx_vergil_contributions_term_status
  on vergil_contributions (term_code, status, finalized_at desc);
create index if not exists idx_vergil_contributions_user_created
  on vergil_contributions (user_id, created_at desc);

create table if not exists vergil_contribution_sections (
  contribution_id uuid not null references vergil_contributions (contribution_id) on delete cascade,
  section_key     text not null,
  section_payload jsonb not null check (jsonb_typeof(section_payload) = 'object'),
  created_at      timestamptz not null default now(),
  primary key (contribution_id, section_key)
);

alter table vergil_contributions enable row level security;
alter table vergil_contribution_sections enable row level security;

drop policy if exists vergil_contributions_select_own on vergil_contributions;
create policy vergil_contributions_select_own on vergil_contributions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table vergil_contributions from anon, authenticated;
revoke all on table vergil_contribution_sections from anon, authenticated;
grant select on table vergil_contributions to authenticated;

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
     or p_source <> 'Vergil course search via Columbia Catalog Chrome extension'
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

create or replace function append_vergil_contribution_chunk(
  p_user_id uuid,
  p_contribution_id uuid,
  p_sections jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_contribution vergil_contributions%rowtype;
  v_section jsonb;
  v_meeting jsonb;
  v_section_key text;
  v_observed_at timestamptz;
  v_received integer;
begin
  select * into v_contribution
    from vergil_contributions
   where contribution_id = p_contribution_id and user_id = p_user_id
   for update;

  if not found then
    raise exception 'vergil_contribution_not_found' using errcode = 'no_data_found';
  end if;
  if v_contribution.status <> 'uploading' then
    return jsonb_build_object(
      'contributionId', v_contribution.contribution_id,
      'status', v_contribution.status,
      'receivedSections', v_contribution.received_sections,
      'expectedSections', v_contribution.expected_sections
    );
  end if;
  if jsonb_typeof(p_sections) <> 'array'
     or jsonb_array_length(p_sections) < 1
     or jsonb_array_length(p_sections) > 250 then
    raise exception 'vergil_contribution_invalid_chunk'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_section in select value from jsonb_array_elements(p_sections)
  loop
    if jsonb_typeof(v_section) <> 'object'
       or not (v_section ?& array[
         'sectionKey', 'termCode', 'courseId', 'sectionCode', 'callNumber',
         'meetings', 'observedAt', 'provenance'
       ])
       or v_section - array[
         'sectionKey', 'termCode', 'courseId', 'sectionCode', 'callNumber',
         'meetings', 'observedAt', 'provenance'
       ] <> '{}'::jsonb then
      raise exception 'vergil_contribution_invalid_section_shape'
        using errcode = 'invalid_parameter_value';
    end if;

    v_section_key := v_section ->> 'sectionKey';
    if v_section ->> 'termCode' <> v_contribution.term_code
       or v_section_key <> concat(
         v_section ->> 'termCode', v_section ->> 'courseId', v_section ->> 'sectionCode'
       )
       or v_section ->> 'courseId' !~ '^[A-Z&]{2,6}[0-9]{1,5}[A-Z]{0,3}$'
       or v_section ->> 'sectionCode' !~ '^[A-Z0-9]{1,5}$'
       or v_section ->> 'callNumber' !~ '^[0-9]{1,10}$'
       or v_section ->> 'provenance' <> 'Vergil course search'
       or jsonb_typeof(v_section -> 'meetings') <> 'array'
       or jsonb_array_length(v_section -> 'meetings') > 28 then
      raise exception 'vergil_contribution_invalid_section_identity'
        using errcode = 'invalid_parameter_value';
    end if;

    begin
      v_observed_at := (v_section ->> 'observedAt')::timestamptz;
    exception when others then
      raise exception 'vergil_contribution_invalid_observation_time'
        using errcode = 'invalid_datetime_format';
    end;

    if v_observed_at < v_contribution.scan_started_at - interval '15 minutes'
       or v_observed_at > v_contribution.scan_completed_at + interval '15 minutes' then
      raise exception 'vergil_contribution_observation_outside_scan'
        using errcode = 'invalid_datetime_format';
    end if;

    for v_meeting in select value from jsonb_array_elements(v_section -> 'meetings')
    loop
      if jsonb_typeof(v_meeting) <> 'object'
         or not (v_meeting ?& array[
           'weekday', 'startMinute', 'endMinute', 'buildingName', 'room'
         ])
         or v_meeting - array[
           'weekday', 'startMinute', 'endMinute', 'buildingName', 'room'
         ] <> '{}'::jsonb
         or v_meeting ->> 'weekday' not in ('Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa')
         or (v_meeting ->> 'startMinute')::integer not between 0 and 1439
         or (v_meeting ->> 'endMinute')::integer not between 1 and 1440
         or (v_meeting ->> 'endMinute')::integer <= (v_meeting ->> 'startMinute')::integer
         or length(coalesce(v_meeting ->> 'buildingName', '')) > 160
         or length(coalesce(v_meeting ->> 'room', '')) > 80 then
        raise exception 'vergil_contribution_invalid_meeting'
          using errcode = 'invalid_parameter_value';
      end if;
    end loop;

    if exists (
      select 1
        from jsonb_array_elements(v_section -> 'meetings') meeting
       group by
         meeting ->> 'weekday',
         meeting ->> 'startMinute',
         meeting ->> 'endMinute',
         coalesce(meeting ->> 'room', '')
      having count(*) > 1
    ) then
      raise exception 'vergil_contribution_duplicate_meeting'
        using errcode = 'unique_violation';
    end if;

    insert into vergil_contribution_sections (contribution_id, section_key, section_payload)
    values (p_contribution_id, v_section_key, v_section)
    on conflict (contribution_id, section_key) do nothing;

    if not exists (
      select 1 from vergil_contribution_sections
       where contribution_id = p_contribution_id
         and section_key = v_section_key
         and section_payload = v_section
    ) then
      raise exception 'vergil_contribution_conflicting_section'
        using errcode = 'unique_violation';
    end if;
  end loop;

  select count(*) into v_received
    from vergil_contribution_sections
   where contribution_id = p_contribution_id;

  if v_received > v_contribution.expected_sections then
    raise exception 'vergil_contribution_too_many_sections'
      using errcode = 'program_limit_exceeded';
  end if;

  update vergil_contributions
     set received_sections = v_received, updated_at = now()
   where contribution_id = p_contribution_id;

  return jsonb_build_object(
    'contributionId', p_contribution_id,
    'status', 'uploading',
    'receivedSections', v_received,
    'expectedSections', v_contribution.expected_sections
  );
end;
$$;

create or replace function finalize_vergil_contribution(
  p_user_id uuid,
  p_contribution_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_contribution vergil_contributions%rowtype;
  v_previous vergil_contributions%rowtype;
  v_received integer;
  v_meetings integer;
  v_locations integer;
  v_matched integer;
  v_unmatched integer;
  v_lower integer;
  v_stale integer;
  v_accepted integer;
  v_written integer;
  v_locations_written integer;
  v_status text;
  v_reason text;
begin
  select * into v_contribution
    from vergil_contributions
   where contribution_id = p_contribution_id and user_id = p_user_id
   for update;

  if not found then
    raise exception 'vergil_contribution_not_found' using errcode = 'no_data_found';
  end if;

  if v_contribution.status <> 'uploading' then
    return jsonb_build_object(
      'contributionId', v_contribution.contribution_id,
      'status', v_contribution.status,
      'acceptedSections', v_contribution.accepted_sections,
      'unmatchedSections', v_contribution.unmatched_sections,
      'lowerQualitySections', v_contribution.lower_quality_sections,
      'staleSections', v_contribution.stale_sections,
      'meetingsWritten', v_contribution.meetings_written,
      'locationsWritten', v_contribution.locations_written,
      'rejectionReason', v_contribution.rejection_reason,
      'idempotent', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtext('vergil:' || v_contribution.term_code));

  select count(*),
         coalesce(sum(jsonb_array_length(section_payload -> 'meetings')), 0),
         coalesce(sum((
           select count(*)
             from jsonb_array_elements(section_payload -> 'meetings') meeting
            where nullif(btrim(coalesce(meeting ->> 'buildingName', '')), '') is not null
                  and lower(btrim(meeting ->> 'buildingName')) <> 'to be announced'
               or nullif(btrim(coalesce(meeting ->> 'room', '')), '') is not null
                  and lower(btrim(meeting ->> 'room')) <> 'to be announced'
         )), 0)
    into v_received, v_meetings, v_locations
    from vergil_contribution_sections
   where contribution_id = p_contribution_id;

  if v_received <> v_contribution.expected_sections
     or v_meetings <> v_contribution.expected_meetings
     or v_locations <> v_contribution.expected_locations then
    v_reason := 'staged_counts_do_not_match_completed_scan';
    update vergil_contributions
       set status = 'rejected', rejection_reason = v_reason,
           received_sections = v_received, finalized_at = now(), updated_at = now()
     where contribution_id = p_contribution_id;
    return jsonb_build_object(
      'contributionId', p_contribution_id, 'status', 'rejected',
      'rejectionReason', v_reason, 'idempotent', false
    );
  end if;

  select * into v_previous
    from vergil_contributions
   where term_code = v_contribution.term_code
     and status in ('accepted', 'partial')
     and contribution_id <> p_contribution_id
   order by finalized_at desc
   limit 1;

  if found and (
       v_received < ceil(v_previous.expected_sections * 0.90)
       or v_meetings < ceil(v_previous.expected_meetings * 0.80)
       or v_locations < ceil(v_previous.expected_locations * 0.80)
     ) then
    v_reason := 'aggregate_coverage_regression';
    update vergil_contributions
       set status = 'rejected', rejection_reason = v_reason,
           finalized_at = now(), updated_at = now()
     where contribution_id = p_contribution_id;
    return jsonb_build_object(
      'contributionId', p_contribution_id, 'status', 'rejected',
      'rejectionReason', v_reason, 'idempotent', false
    );
  end if;

  create temporary table if not exists vergil_quality_work (
    section_id text primary key,
    section_payload jsonb not null,
    incoming_meetings integer not null,
    incoming_locations integer not null,
    existing_meetings integer not null,
    existing_locations integer not null,
    incoming_observed_at timestamptz not null,
    existing_observed_at timestamptz
  ) on commit drop;
  truncate table vergil_quality_work;

  insert into vergil_quality_work (
    section_id, section_payload,
    incoming_meetings, incoming_locations,
    existing_meetings, existing_locations,
    incoming_observed_at, existing_observed_at
  )
  select s.section_id,
         staged.section_payload,
         jsonb_array_length(staged.section_payload -> 'meetings'),
         (
           select count(*)
             from jsonb_array_elements(staged.section_payload -> 'meetings') meeting
            where (
              nullif(btrim(coalesce(meeting ->> 'buildingName', '')), '') is not null
              and lower(btrim(meeting ->> 'buildingName')) <> 'to be announced'
            ) or (
              nullif(btrim(coalesce(meeting ->> 'room', '')), '') is not null
              and lower(btrim(meeting ->> 'room')) <> 'to be announced'
            )
         ),
         coalesce(existing.meeting_count, 0),
         coalesce(existing.location_count, 0),
         (staged.section_payload ->> 'observedAt')::timestamptz,
         existing.latest_observed_at
    from vergil_contribution_sections staged
    join sections s
      on s.section_id = staged.section_key
     and s.term_code = staged.section_payload ->> 'termCode'
     and s.course_id = staged.section_payload ->> 'courseId'
     and s.section_code = staged.section_payload ->> 'sectionCode'
     and s.call_number = staged.section_payload ->> 'callNumber'
    left join lateral (
      select count(*) as meeting_count,
             count(*) filter (where
               (nullif(btrim(coalesce(m.building_name, '')), '') is not null
                and lower(btrim(m.building_name)) <> 'to be announced')
               or (nullif(btrim(coalesce(m.room, '')), '') is not null
                   and lower(btrim(m.room)) <> 'to be announced')
             ) as location_count,
             max(m.observed_at) as latest_observed_at
        from meetings m
       where m.section_id = s.section_id
    ) existing on true
   where staged.contribution_id = p_contribution_id;

  select count(*) into v_matched from vergil_quality_work;
  v_unmatched := v_received - v_matched;

  select count(*) into v_lower
    from vergil_quality_work
   where incoming_meetings < existing_meetings
      or incoming_locations < existing_locations;

  select count(*) into v_stale
    from vergil_quality_work
   where existing_observed_at is not null
     and incoming_observed_at < existing_observed_at;

  v_accepted := v_matched - (
    select count(*) from vergil_quality_work
     where incoming_meetings < existing_meetings
        or incoming_locations < existing_locations
        or (existing_observed_at is not null and incoming_observed_at < existing_observed_at)
  );

  if v_matched = 0 then
    v_reason := 'no_sections_matched_catalog_identity';
    update vergil_contributions
       set status = 'rejected', rejection_reason = v_reason,
           unmatched_sections = v_unmatched, finalized_at = now(), updated_at = now()
     where contribution_id = p_contribution_id;
    return jsonb_build_object(
      'contributionId', p_contribution_id, 'status', 'rejected',
      'unmatchedSections', v_unmatched, 'rejectionReason', v_reason, 'idempotent', false
    );
  end if;

  delete from meetings m
   using vergil_quality_work quality
   where m.section_id = quality.section_id
     and quality.incoming_meetings > 0
     and quality.incoming_meetings >= quality.existing_meetings
     and quality.incoming_locations >= quality.existing_locations
     and (quality.existing_observed_at is null
          or quality.incoming_observed_at >= quality.existing_observed_at);

  insert into meetings (
    section_id, weekday, start_minute, end_minute,
    building_id, building_name, room, source, observed_at
  )
  select quality.section_id,
         (meeting ->> 'weekday')::weekday_code,
         (meeting ->> 'startMinute')::integer,
         (meeting ->> 'endMinute')::integer,
         resolve_building(
           case when lower(btrim(coalesce(meeting ->> 'buildingName', ''))) = 'to be announced'
                then null else nullif(btrim(meeting ->> 'buildingName'), '') end
         ),
         case when lower(btrim(coalesce(meeting ->> 'buildingName', ''))) = 'to be announced'
              then null else nullif(btrim(meeting ->> 'buildingName'), '') end,
         case when lower(btrim(coalesce(meeting ->> 'room', ''))) = 'to be announced'
              then null else nullif(btrim(meeting ->> 'room'), '') end,
         'vergil_extension',
         quality.incoming_observed_at
    from vergil_quality_work quality
    cross join lateral jsonb_array_elements(quality.section_payload -> 'meetings') meeting
   where quality.incoming_meetings > 0
     and quality.incoming_meetings >= quality.existing_meetings
     and quality.incoming_locations >= quality.existing_locations
     and (quality.existing_observed_at is null
          or quality.incoming_observed_at >= quality.existing_observed_at)
  on conflict do nothing;

  get diagnostics v_written = row_count;

  select count(*) into v_locations_written
    from meetings m
    join vergil_quality_work quality on quality.section_id = m.section_id
   where m.source = 'vergil_extension'
     and m.observed_at = quality.incoming_observed_at
     and (
       (nullif(btrim(coalesce(m.building_name, '')), '') is not null
        and lower(btrim(m.building_name)) <> 'to be announced')
       or (nullif(btrim(coalesce(m.room, '')), '') is not null
           and lower(btrim(m.room)) <> 'to be announced')
     );

  v_status := case
    when v_unmatched = 0 and v_lower = 0 and v_stale = 0 then 'accepted'
    else 'partial'
  end;

  update vergil_contributions
     set status = v_status,
         accepted_sections = v_accepted,
         unmatched_sections = v_unmatched,
         lower_quality_sections = v_lower,
         stale_sections = v_stale,
         meetings_written = v_written,
         locations_written = v_locations_written,
         finalized_at = now(),
         updated_at = now()
   where contribution_id = p_contribution_id;

  return jsonb_build_object(
    'contributionId', p_contribution_id,
    'status', v_status,
    'acceptedSections', v_accepted,
    'unmatchedSections', v_unmatched,
    'lowerQualitySections', v_lower,
    'staleSections', v_stale,
    'meetingsWritten', v_written,
    'locationsWritten', v_locations_written,
    'rejectionReason', null,
    'idempotent', false
  );
end;
$$;

revoke all on function start_vergil_contribution(
  uuid, text, integer, text, text, integer, integer, integer, integer, integer,
  integer, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function append_vergil_contribution_chunk(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function finalize_vergil_contribution(uuid, uuid)
  from public, anon, authenticated;

grant execute on function start_vergil_contribution(
  uuid, text, integer, text, text, integer, integer, integer, integer, integer,
  integer, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) to service_role;
grant execute on function append_vergil_contribution_chunk(uuid, uuid, jsonb) to service_role;
grant execute on function finalize_vergil_contribution(uuid, uuid) to service_role;

