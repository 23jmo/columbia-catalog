-- Vergil preserves leading zeroes and some school-specific number padding that
-- the Directory parser canonicalizes away (for example BIOS0301PS vs
-- BIOS301PS). The registrar call number is unique within a term. When the
-- exact course string differs, bridge only if term + call number + section code
-- identify one existing Directory row. Keep the untouched Vergil identity for
-- audit; the finalized payload uses the catalog's canonical foreign key.

alter table vergil_contribution_sections
  add column if not exists original_section_key text,
  add column if not exists original_section_payload jsonb;

update vergil_contribution_sections
   set original_section_key = section_key,
       original_section_payload = section_payload
 where original_section_key is null or original_section_payload is null;

alter table vergil_contribution_sections
  alter column original_section_key set not null,
  alter column original_section_payload set not null;

create unique index if not exists idx_vergil_contribution_original_section
  on vergil_contribution_sections (contribution_id, original_section_key);

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
  v_stored_section jsonb;
  v_meeting jsonb;
  v_section_key text;
  v_catalog_section_id text;
  v_catalog_course_id text;
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

    v_catalog_section_id := null;
    v_catalog_course_id := null;

    select s.section_id, s.course_id
      into v_catalog_section_id, v_catalog_course_id
      from sections s
     where s.section_id = v_section_key
       and s.term_code = v_section ->> 'termCode'
       and s.course_id = v_section ->> 'courseId'
       and s.section_code = v_section ->> 'sectionCode'
       and s.call_number = v_section ->> 'callNumber';

    if not found then
      select s.section_id, s.course_id
        into v_catalog_section_id, v_catalog_course_id
        from sections s
       where s.term_code = v_section ->> 'termCode'
         and s.call_number = v_section ->> 'callNumber'
         and s.section_code = v_section ->> 'sectionCode'
       limit 1;
    end if;

    if v_catalog_section_id is not null then
      v_stored_section := jsonb_set(
        jsonb_set(v_section, '{sectionKey}', to_jsonb(v_catalog_section_id)),
        '{courseId}',
        to_jsonb(v_catalog_course_id)
      );
    else
      v_catalog_section_id := v_section_key;
      v_stored_section := v_section;
    end if;

    insert into vergil_contribution_sections (
      contribution_id, section_key, section_payload,
      original_section_key, original_section_payload
    ) values (
      p_contribution_id, v_catalog_section_id, v_stored_section,
      v_section_key, v_section
    )
    on conflict (contribution_id, original_section_key) do nothing;

    if not exists (
      select 1 from vergil_contribution_sections
       where contribution_id = p_contribution_id
         and original_section_key = v_section_key
         and original_section_payload = v_section
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

comment on column vergil_contribution_sections.original_section_payload is
  'Untouched extension record. section_payload may carry the Directory canonical course identity.';

