# Columbia Course Data & Vergil API - Technical Spec

**Version:** 1.0
**Date:** 2026-08-21
**Author:** Reverse-engineered from live traffic analysis
**Subject:** Columbia University course data sources, the Vergil/SAS API, and a viable architecture for a student-facing course-planning product

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [How This Was Determined](#2-how-this-was-determined)
3. [Data Source Layers](#3-data-source-layers)
4. [Layer 1: Public Directory of Classes](#4-layer-1-public-directory-of-classes)
5. [Layer 2: Public Bulletin](#5-layer-2-public-bulletin)
6. [Layer 3: The Vergil / SAS API](#6-layer-3-the-vergil--sas-api)
7. [Authentication Model](#7-authentication-model)
8. [Access Control Test Results](#8-access-control-test-results)
9. [Complete Endpoint Inventory](#9-complete-endpoint-inventory)
10. [Course & Class Search Reference](#10-course--class-search-reference)
11. [Data Schemas](#11-data-schemas)
12. [Constants & Code Mappings](#12-constants--code-mappings)
13. [Reference Client Implementation](#13-reference-client-implementation)
14. [Recommended Architecture](#14-recommended-architecture)
15. [Security & Compliance Rules](#15-security--compliance-rules)
16. [Known Gaps & Open Questions](#16-known-gaps--open-questions)

---

## 1. Executive Summary

Columbia's Vergil course registration system is an Angular single-page application that contains no data of its own. All reads are served by a **private OAuth2-protected API gateway** on `*.api.columbia.edu`, internally referred to as SAS (Student Administrative Systems).

### Key findings

| Finding | Detail |
|---|---|
| `vergil.columbia.edu/api/*` does not exist | Returns 403. The real API is on separate hosts. |
| The SAS API has **zero public endpoints** | All 9 tested endpoints return `401` without a bearer token. |
| No CORS grant for third-party origins | Even an authenticated student's browser cannot call it from another domain. |
| Session tokens are **write-capable** | Scopes include `create`, `update`, `delete`. Can register and drop classes. |
| A fully public alternative exists | `doc.sis.columbia.edu` is unauthenticated and serves `Access-Control-Allow-Origin: *`. |
| Meeting times are missing from the public directory | Times must be sourced from `bulletin.columbia.edu` instead. |

### Bottom line

A complete course-search and schedule-planning product **can be built with no authentication at all**, using the public Directory of Classes plus the public Bulletin. The authenticated SAS API should be treated as an optional, browser-local enhancement for personalization, never as a backend dependency.

---

## 2. How This Was Determined

Four independent techniques were used. No credentials were captured, stored, or transmitted at any point.

1. **Resource-timing capture.** `performance.getEntriesByType('resource')` was read from the live Vergil tab, filtered to `xmlhttprequest` and `fetch` initiators. This retroactively exposed 181+ network calls including every API host and query string.

2. **Live UI instrumentation.** Search filters were applied through Vergil's own interface (keyword, subject, day-of-week, open seats, credits, course level, time range, Global Core, Science requirement, school) and the resulting request URLs were captured to learn exact parameter names.

3. **Static bundle extraction.** Vergil's application bundle `main.cbb6513f76313410.js` (4,287,604 bytes) was fetched and pattern-matched to enumerate the complete filter surface, endpoint list, and all environment hostnames.

4. **Direct access probing.** Authenticated and unauthenticated GET requests were issued against candidate endpoints to determine status codes, response shapes, CORS headers, and pagination metadata.

---

## 3. Data Source Layers

```
Layer 1  PUBLIC / NO AUTH / CORS-OPEN
         doc.sis.columbia.edu
         Courses, sections, call numbers, points, instructors,
         live enrollment counts, prerequisites, descriptions
         Browser-fetchable directly

Layer 2  PUBLIC / NO AUTH / SERVER-SIDE ONLY
         bulletin.columbia.edu
         Meeting days, times, locations, degree requirements
         No CORS header, requires backend fetch

Layer 3  PRIVATE / OAUTH REQUIRED / COLUMBIA-ORIGIN ONLY
         *.api.columbia.edu  (SAS gateway)
         Everything above plus student schedule, planner,
         waitlists, eligibility validation, GPA, transfer credits
         Extension-local only

Layer 4  FUTURE / OFFICIAL
         Registered OAuth client issued by CUIT
         Supported, documented, rate-limited backend access
```

---

## 4. Layer 1: Public Directory of Classes

**Host:** `https://doc.sis.columbia.edu`
**Auth:** None
**CORS:** `Access-Control-Allow-Origin: *` on section and subject pages
**Format:** HTML

This is the single most valuable source for a third-party product because it requires no authentication and can be fetched directly from a browser.

### URL patterns

| Pattern | Purpose | Verified |
|---|---|---|
| `/` | Full department and subject index | 200, 23,184 bytes |
| `/subj/{SUBJECT}/` | Directory index for a subject | 200, 443,448 bytes |
| `/subj/{SUBJECT}/_Fall2026.html` | All sections for a subject in one term | 200, 105,003 bytes, 83 section links |
| `/subj/{SUBJECT}/{NUM}-{TERM}-{SECTION}/` | Individual section detail | 200, ~4,433 bytes |

Example section URL:
```
https://doc.sis.columbia.edu/subj/COMS/W4113-20263-001/
```

### Fields available

Confirmed present on section detail pages:

- Call Number
- Points (credits)
- Grading Mode
- Approvals Required
- Instructor(s)
- Type (LECTURE, SEMINAR, PHYSICAL EDU, etc.)
- Method of Instruction (In-Person, Online)
- Course Description, including prerequisite prose
- Department, with department homepage link
- **Enrollment**, formatted as `22 students (110 max) as of 2:06PM Friday, August 21, 2026`
- Status (for example `Full`)
- Subject, Number, Section
- Division
- Open To (which schools may enroll)
- Note (free-text registrar notes)
- Section key, for example `20263COMS4113W001`

### Verified sample extraction

From the COMS Fall 2026 subject page:

```
COMS W1002 Section 002  COMPUTING IN ART
Call Number: 13509   Points: 4
Enrollment: 18 students (60 max) as of August 21, 2026
Instructors: Adam H Cannon and Mark Santolucito
```

### Critical limitation

Meeting days and times are **not present**. Every section renders the placeholder:

```
Day, Time & Location -> "View Class Schedule & Location in Vergil"
```

Times must come from Layer 2.

### Scraping guidance

- The `_Fall2026.html` subject page returns every section in a single request. Prefer it over per-section fetches.
- Section links appear as relative hrefs matching `../../subj/COMS/W1004-20263-001/`.
- Enrollment strings carry their own timestamp, so freshness is self-documenting.
- Cache aggressively. Enrollment realistically changes on the order of minutes, not seconds.
- Review `robots.txt` and Columbia's terms of use before running at scale.

---

## 5. Layer 2: Public Bulletin

**Host:** `https://bulletin.columbia.edu`
**Auth:** None
**CORS:** None, so server-side fetch is required
**Format:** HTML

### Verified

`https://bulletin.columbia.edu/columbia-college/departments-instruction/computer-science/`
returns 200 with 301,122 bytes and **147 meeting-time patterns** such as `1:10pm - 2:25pm`.

Rows are formatted as:

```
COMS 4113 | 001/19581 | M 7:00pm - 9:30pm  142 Uris Hall | Hubertus Franke | 3.00 | 8/110
```

This gives course number, section, call number, days, times, location, instructor, points, and enrollment in a single row.

### Also useful on this host

- Degree requirement pages, for example the CS BS requirement structure
- Global Core approved-course lists
- Course catalog descriptions and prerequisite chains

### Do not use

`https://www.columbia.edu/cu/bulletin/uwb/...` is behind Cloudflare and returns `403` with a "Just a moment..." interstitial to programmatic clients.

---

## 6. Layer 3: The Vergil / SAS API

### Production hosts

| Host | Responsibility |
|---|---|
| `prod2-sas-studentrecords.api.columbia.edu` | Course/class search, enrollment, planner, validations, GPA |
| `sas-courses.api.columbia.edu` | Subjects, organizations, instructors, components |
| `sas-academic.api.columbia.edu` | Term calendars, academic years |
| `sas-class.api.columbia.edu` | Buildings, sessions by term |
| `sas-catalog.api.columbia.edu` | Academic plans, catalogs, program providers |
| `prod2-sas-persons.api.columbia.edu` | Person records, photos, term status |
| `prod2-sas-degreeaudit.api.columbia.edu` | Transfer credits, degree audit data |
| `prod2-sas-studentaccounts.api.columbia.edu` | Student financial accounts |
| `prod2-sas-eventsourcing.api.columbia.edu` | Event sourcing log |

### Non-production hosts

The bundle additionally references `dev-`, `dev2-`, `test-`, `test2-`, `stage2-`, `staging2-`, `uat-`, `uat2-`, `post-`, and `failover-prod2-` prefixed variants of each service.

**Do not send traffic to non-production environments.** They are not yours to test against and may contain real data.

### API conventions

The gateway is Django REST Framework with a JSON:API renderer.

| Concern | Convention |
|---|---|
| Content type | `application/vnd.api+json` |
| Pagination | `page[number]`, `page[size]` |
| Pagination metadata | `meta.pagination = { page, pages, count }` |
| Navigation | `links.first`, `links.last`, `links.next`, `links.prev` |
| Filtering | `filter[field]`, `filter[field__in]` |
| Django lookups | `__in`, `__gte`, `__lte`, `__range`, `__startswith`, `__isnull` |
| Sparse fieldsets | `fields[TypeName]=a,b,c` |
| Relationship inclusion | `include=relation` |
| Sorting | `sort=field` or `sort=-field` |
| Full-text search | `search=` |

Observed collection sizes: 901 subjects, 336 curricular departments, 170,353 term-calendar rows.

### Notable exception

`course_and_class_search` does **not** follow JSON:API response shape. It returns:

```json
{
  "data": {
    "courses": [ /* course objects */ ],
    "total_count": 54
  }
}
```

Sections are nested inside each course at:

```
courses[].class_data = { "classes": [...], "class_count": N, "links": {...} }
```

---

## 7. Authentication Model

**Standard:** OAuth 2.0 Authorization Code flow with PKCE, public client
**Authorization server:** `https://oauth.cc.columbia.edu`

| Endpoint | Path |
|---|---|
| Token | `/as/token.oauth2` |
| Userinfo | `/idp/userinfo.openid` |

Upstream identity is Columbia CAS with Duo multi-factor. Test and alternate issuers `oauth-test.cc.columbia.edu`, `oauth-new.cc.columbia.edu`, and `oauth-test-new.cc.columbia.edu` also appear in the bundle.

### Token storage

After login the SPA persists the following keys in `localStorage` on the `vergil.columbia.edu` origin:

```
access_token
refresh_token
expires_at
access_token_stored_at
granted_scopes
PKCE_verifier
id_token_claims_obj
nonce
session_state
```

### Request headers

```http
Authorization: Bearer <access_token>
Accept: application/vnd.api+json
```

### Granted scopes

```json
["auth-columbia","create","read","update","delete","openid","profile","email",
 "https://api.columbia.edu/scope/group"]
```

### Security implication

This is the single most important fact in this document.

**The token is not a read-only course-search key.** It carries `create`, `update`, and `delete`. The same credential that performs a course search can:

- Register the student for classes
- Drop the student from classes
- Swap sections
- Join or leave waitlists
- Read GPA, transfer credits, holds, advisors, and financial account data

Any product that moves this token off the user's device is handling a credential capable of altering an academic record.

### Ways to obtain a token

| Method | Viability | Notes |
|---|---|---|
| Read `localStorage` in a `vergil.columbia.edu` page or extension context | Works today | Token stays on device. Read-only GET usage only. |
| Register an OAuth client with CUIT | Correct long-term path | Request read-only scopes. |
| Collect user credentials directly | **Prohibited** | Would require handling CAS passwords and Duo. Never do this. |

The Vergil SPA `client_id` is present in the bundle. It is deliberately omitted from this document, and third parties should register their own client rather than reusing Columbia's first-party identifier.

---

## 8. Access Control Test Results

### Unauthenticated requests to the SAS API

All requests sent with `Accept: application/vnd.api+json` and no `Authorization` header.

| Endpoint | Status |
|---|---|
| `/v1/course_and_class_search` | 401 |
| `/v1/subjects` | 401 |
| `/v1/organizations` | 401 |
| `/v1/instructors` | 401 |
| `/v1/termcalendars` | 401 |
| `/v1/capacityrequesttracker` | 401 |
| `/v1/instructionmethods` | 401 |
| `/v1/components` | 401 |
| `/v1/catalogs` | 401 |

Uniform response body:

```json
{"errors":[{"detail":"Authentication credentials were not provided.",
            "status":"401","source":{"pointer":"/data"},
            "code":"not_authenticated"}]}
```

**There is no public tier.** Even static reference data such as the subject list is gated.

### Cross-origin browser request

A `fetch()` issued from an `https://example.com` page to `course_and_class_search` failed with a network-level `TypeError: Failed to fetch`. No CORS grant exists for third-party origins.

### Authenticated request

The same URL called from within the Vergil page context, carrying the page's own bearer token, returned `200` with a complete JSON payload.

### Public source CORS

| Source | `Access-Control-Allow-Origin` |
|---|---|
| `doc.sis.columbia.edu` section detail | `*` |
| `doc.sis.columbia.edu` subject term page | `*` |
| `doc.sis.columbia.edu` root index | `*` |
| `doc.sis.columbia.edu` directory listing | none |
| `bulletin.columbia.edu` | none |

---

## 9. Complete Endpoint Inventory

Extracted from the application bundle. All are `v1`.

### Course and catalog

```
course_and_class_search      subjects                  organizations
organization                 instructors               components
instructionmethods           catalogs                  termoffereds
programcoursesrequirement    classruleacademicprograms
catalogacademicprogramdaproviders
```

### Academic calendar and facilities

```
termcalendars                academiccalendardates     universityholidays
graduationdates              sessions_by_term_calendar buildings
```

### Registration and enrollment

```
capacityrequesttracker       preemptivevalidations     preemptivevalidationswap
enrollmentstatuses           globalregistrationvalues  banner-validations
registrationappointmentvolume                          confirmationtypes
studentregistrationtransactionlog                      validation
exceptiontype                requestreason             actionreason
```

### Student records

```
studentclasses               studentplans              studentplanhistorydetails
planner                      plannerdetail             plannerdetailclass
studenttermhours             studenttermstatus         studenttermconfirmationtype
studentprofiles              studentgroups             studentadvisors
studentappointment           studentpriordegrees       gpa
transfercredits              academicplans             academicprograms
```

### People and administrative

```
persons                      personaddresses           personphoto
personrolestatuses           personrolestatusorganizations
relations                    contacttypes              emailtypes
phonetypes                   addresstypes              countries
states                       holdstudents              holdsbyorganization
reportadmingroups            exportfiletask            wfegroups
```

### Endpoints with notable behavior

| Endpoint | Note |
|---|---|
| `buildings` | Returns `500` without required filter parameters |
| `preemptivevalidations` | Server-side eligibility engine, see below |
| `capacityrequesttracker` | Batched seat counts, ideal for monitoring |

### `preemptivevalidations`

```http
GET /v1/preemptivevalidations
  ?filter[student_pk]=<pk>
  &filter[class_id]=<class_id>
  &filter[term]=20263
  &filter[min_unit]=3
  &filter[max_unit]=3
```

Columbia already runs authoritative server-side validation for prerequisites, time conflicts, registration holds, and credit limits. A client should call this rather than reimplementing Columbia's academic rules. A companion `preemptivevalidationswap` endpoint handles section swaps.

---

## 10. Course & Class Search Reference

```http
GET https://prod2-sas-studentrecords.api.columbia.edu/v1/course_and_class_search
```

### Representative request

Captured from the live UI with keyword, subject, day, time, credit, level, open-seat, Global Core, and Science filters all applied:

```
?term=20263
&page[number]=1
&page[size]=10
&page[classes.size]=500
&sort=-_score,course_identifier2
&search=machine+learning
&course.subject.subject_id__in=539
&class.nested.meeting_details.meeting_pattern.meetingpatterndetail_set.week_day__in=Mo
&class.nested.meeting_details.meeting_pattern.meetingpatterndetail_set.from_time__time_gte=11
&class.min_unit__gte=3
&course.course_number__range=4000,9999
&class.has_open_seats=true
&has_classes=true
&course.approved_as_partial_fulfillment_for_global_core_requirement=true
&course.approved_as_partial_fulfillment_for_science_requirement=true
```

### Course-level filters

| Parameter | UI control | Meaning |
|---|---|---|
| `course.subject.subject_id__in` | Subject(s) | Numeric subject IDs, comma-separated |
| `course.course_id` | internal | Single course ID |
| `course.course_id__in` | internal | Course ID list |
| `course.course_identifier` | Course Identifier | Exact identifier |
| `course.course_identifier__in` | internal | Identifier list, for example `COMS4113W` |
| `course.course_identifier2__startswith` | Course Identifier | Prefix match |
| `course.course_number__range` | Course Level slider | Inclusive range, for example `4000,9999` |
| `course.course_official_title` | Keywords | Title match |
| `course.course_status_flag` | internal | Active status |
| `course.sustainability__in` | Sustainability | Sustainability tag IDs |
| `course.nested.course_programs.organization_code` | internal | Program organization |
| `course.nested.course_programs.program_id` | internal | Program ID |
| `course.approved_as_partial_fulfillment_for_global_core_requirement` | Global Core checkbox | Boolean |
| `course.approved_as_partial_fulfillment_for_science_requirement` | Science checkbox | Boolean |

### Class-level filters

| Parameter | UI control | Meaning |
|---|---|---|
| `class.id__in` | internal | Class ID list |
| `class.class_number` | Call Number | Registrar call number |
| `class.has_open_seats` | Open seats checkbox | Boolean |
| `class.min_unit__gte` | Credits slider (min) | Minimum credits |
| `class.max_unit__lte` | Credits slider (max) | Maximum credits |
| `class.component.id__in` | Course Type | LECTURE, SEMINAR, LAB, etc. |
| `class.method_of_instruction_id__in` | Method of Instruction | In-person, online, hybrid |
| `class.term_session.session.id__in` | Subterm | Session IDs |
| `class.nested.instructors.instructor_uni` | Instructor | Instructor UNI |
| `class.nested.course_organizations.organization_code__in` | Department(s) | For example `COMS` |
| `class.nested.course_organizations.parent_organization.organization_code__in` | Offering School(s) | For example `SEAS` |
| `class.nested.meeting_details.meeting_pattern.meetingpatterndetail_set.week_day__in` | Day(s) | `Mo,Tu,We,Th,Fr,Sa,Su` |
| `class.nested.meeting_details.meeting_pattern.meetingpatterndetail_set.from_time__time_gte` | Times Offered (from) | Hour as integer, 24-hour |
| `class.nested.meeting_details.meeting_pattern.meetingpatterndetail_set.to_time__time_lte` | Times Offered (to) | Hour as integer, 24-hour |
| `class.nested.meeting_details.room.building.building_name` | internal | Building name |

### Control parameters

| Parameter | Meaning |
|---|---|
| `term` | Term code, required |
| `has_classes` | Only return courses that have sections |
| `schedule` | `true` switches to schedule-render mode used when fetching by ID |
| `search` | Free-text keyword search |
| `sort` | Typically `-_score,course_identifier2` |
| `page[number]` | Page index |
| `page[size]` | Courses per page |
| `page[classes.size]` | Max sections returned per course, observed up to 500 |

### Bulk fetch patterns used by the SPA

```
?term=20263&page[size]=500&page[classes.size]=500&schedule=true&class.id__in=1423265,1427566,...
?term=20263&page[size]=500&page[classes.size]=500&schedule=true&course.course_id__in=73060,49206,...
```

### Supporting reference calls

```http
GET sas-courses.api.columbia.edu/v1/subjects
    ?page[size]=50&search=coms&sort=subject_name&filter[is_active]=True

GET sas-courses.api.columbia.edu/v1/organizations
    ?page[size]=50&search=computer
    &sort=organization_display_name,organization_long_name
    &filter[organization_type__organization_type_code]=DP
    &filter[is_curricular]=True

GET sas-courses.api.columbia.edu/v1/instructors
    ?page[size]=50&search=verma
    &filter[instructor_uni__isnull]=
    &sort=instructor_last_name,instructor_first_name
    &fields[Instructor]=instructor_uni,instructor_first_name,instructor_middle_name,
                        instructor_last_name,instructor_email

GET sas-academic.api.columbia.edu/v1/termcalendars
    ?page[size]=5&sort=-term_calendar_code

GET prod2-sas-studentrecords.api.columbia.edu/v1/capacityrequesttracker
    ?filter[class_id__in]=1427424,1427570,1427615
    &fields[CapacityRequestTracker]=class_id,capacity,total_enrollment
    &page[size]=500
```

---

## 11. Data Schemas

### Course object

Approximately 130 fields. Practical subset:

```
pk, course_id
course_identifier, course_identifier2, course_number
course_official_title, course_long_title, course_name, transcript_title
course_description
subject { subject_id, subject_code, subject_name, subject_short_name }
points_min, points_max
instructional_hours, lecture_hours, lab_hours
prerequisite_formula, corequisite_formula
meets_together_formula, multi_term_formula
course_requisites[], non_course_prerequisites
instruction_methods[], components[], instructors[], topics[]
course_programs[], course_associations[], owners[]
first_offered_term, last_offered_term
course_qualifier, course_suffix
available_for_repeat_enrollment, repeat_enrollment_cap
permission_required_flag, mandatory_pass_fail
course_cross_listed, course_fee_flag, course_fee_note
sustainability
class_data { classes[], class_count, links }
```

### Requirement and general-education flags

The course object also carries a large set of curriculum flags, which allows requirement tagging without a separate data source:

```
approved_as_partial_fulfillment_for_global_core_requirement
approved_as_partial_fulfillment_for_science_requirement
consider_for_science_requirement, consider_for_global_core_requirement
arts_and_humanities, social_science, science, science_with_lab
language, physical_education, first_year_seminar
recommended_for_first_years, recommended_for_non_majors_general_studies
required_for_majors, elective_for_majors
requirement_for_major_in_other_departments

Barnard "Ways of Knowing":
thinking_locally, thinking_through_global_inquiry,
thinking_about_social_difference, thinking_with_historical_perspective,
thinking_quantitatively_and_empirically, thinking_technologically_and_digitally
(each with a matching *_rationale field)

"Nine Ways of Knowing":
first_year_english, cultures_in_comparison, ethics_and_values,
historical_studies, laboratory_science, literature,
quantitative_and_deductive_reasons, social_analysis,
visual_and_performing_arts, language_under_nine_ways_of_knowing

Professional school flags:
major_writing_indicator, minor_writing_completion_indicator,
professional_responsibility, one_l_elective_indicator,
january_term_elective_indicator, master_of_law_* ,
american_bar_association_303_compliant_indicator,
american_bar_association_310_compliant_indicator,
mailman_school_policy, artificial_intelligence_content
```

### Class (section) object

Approximately 75 fields, nested at `course.class_data.classes[]`.

```
id, pk
class_identifier            e.g. "COMS4113W001"
class_number                registrar call number
section_code, class_suffix
class_description, class_active_flag

Enrollment:
enrollment_cap, enrollment_count
waitlist_cap, waitlist_count, waitlist_status, waitlist_type
waitlist_application_required, waitlist_application_text
waitlist_application_file, waitlist_deactivated_date
enrollment_status { id, enrollment_status_code, enrollment_status_description }
minimum_enrollment_count, expected_final_enrollment
past_enrollment_count, auditors_count

Credits and grading:
min_unit, max_unit, default_unit
grading_mode, grading_basis, pass_fail_permitted_code

Structure:
component, method_of_instruction, method_of_instruction_id, academic_level
term_session { session, session_start_date, session_end_date }
term_calendar_code
course_term { term_calendar, course_id, course_identifier2,
              course_official_title, transcript_title }
course_organizations[{ organization_id, organization_code, organization_name,
                       parent_organization { organization_code, organization_name } }]

Scheduling:
meeting_details[]
final_exam

People:
instructors[]

Rules:
class_rules[], prerequisite_formula, corequisite_formula
is_prerequisite_mandatory, department_permission_required_flag
allow_registration_appeals
appeal_workflow_start_date, appeal_workflow_end_date

Other:
class_cross_listings[], class_crosslisted, class_association,
class_configuration, fees[], class_fee_flag,
attendance_required_flag, combine_section_flag,
auto_enroll_component_flag, cancel_if_student_enrolled_flag,
viewable_in_schedule_flag, location_hidden_in_schedule_flag,
instructor_name_hidden_in_schedule_flag, print_topic_in_schedule_flag,
course_topic_id, course_topic_title, course_topic_description
```

### Verified live sample

```json
{
  "class_identifier": "CSEE4119W001",
  "enrollment_cap": 110,
  "enrollment_count": 88,
  "waitlist_cap": null,
  "waitlist_count": 1,
  "enrollment_status": {
    "id": 1,
    "enrollment_status_code": "O",
    "enrollment_status_description": "Open for Enrollment"
  }
}
```

### JSON:API resource sample

Standard endpoints return conventional JSON:API resources:

```json
{
  "type": "Subject",
  "id": "304",
  "attributes": {
    "subject_code": "AWRR",
    "subject_name": "ACAD WRIT/READING/RESEARCH",
    "subject_short_name": "AC WR/RD/RS",
    "is_active": true,
    "created": "2019-03-04T06:08:00-05:00",
    "modified": "2019-03-04T06:08:00-05:00"
  },
  "relationships": { "created_user": { "data": null } },
  "links": { "self": "https://sas-courses.api.columbia.edu/..." }
}
```

---

## 12. Constants & Code Mappings

### Term codes

Format is `YYYY` followed by a term digit.

| Digit | Term |
|---|---|
| 1 | Spring |
| 2 | Summer |
| 3 | Fall |

| Code | Term |
|---|---|
| `20261` | Spring 2026 |
| `20262` | Summer 2026 |
| `20263` | Fall 2026 |
| `20271` | Spring 2027 |

### Known IDs

| Entity | Value |
|---|---|
| COMS subject_id | `539` |
| COMS organization_code | `COMS` |
| SEAS organization_code | `SEAS` |
| SEAS organization_id | `309` |
| COMS organization_id | `81` |
| Full Term session | `X5`, id `216`, display name `Full Term` |
| Department organization type | `DP` |

### Enrollment status codes

| Code | Description |
|---|---|
| `O` | Open for Enrollment |

### Day codes

```
Su, Mo, Tu, We, Th, Fr, Sa
```

### Observed limits

| Limit | Value |
|---|---|
| `page[classes.size]` max | 500 |
| Vergil UI results per page | 10, 25, 50, 100 |
| Course search default sort | `-_score,course_identifier2` |

### Course identifier format

```
COMS 4113 W 001
^^^^ ^^^^ ^ ^^^
|    |    | └── section
|    |    └──── qualifier / suffix (W = InterFaculty)
|    └───────── course number
└────────────── subject code

course_identifier2 = "COMS4113W"
class_identifier   = "COMS4113W001"
section_key        = "20263COMS4113W001"
```

---

## 13. Reference Client Implementation

### Public source client, no authentication required

```ts
const DOC = 'https://doc.sis.columbia.edu';

/**
 * Fetch every section for a subject in one term.
 * Works from a browser: doc.sis.columbia.edu sends
 * Access-Control-Allow-Origin: *
 */
export async function fetchSubjectTerm(subject: string, termLabel: string) {
  const res = await fetch(`${DOC}/subj/${subject}/_${termLabel}.html`);
  if (!res.ok) throw new Error(`Directory ${res.status}`);
  return parseSubjectPage(await res.text());
}

export interface PublicSection {
  courseIdentifier: string;   // COMS4113W
  section: string;            // 001
  title: string;
  callNumber: string;
  points: number;
  enrolled: number;
  capacity: number;
  instructors: string[];
  asOf: string;               // directory-provided timestamp
  detailUrl: string;
}

// Section detail URL:
//   https://doc.sis.columbia.edu/subj/COMS/W4113-20263-001/
export function sectionUrl(subject: string, num: string, term: string, sec: string) {
  return `${DOC}/subj/${subject}/${num}-${term}-${sec}/`;
}
```

### Authenticated client, extension context only

```ts
const SR = 'https://prod2-sas-studentrecords.api.columbia.edu/v1';

/**
 * MUST run inside a vergil.columbia.edu page context.
 * The token never leaves the browser. GET only.
 */
export async function searchCourses(opts: {
  term: string;
  subjectId?: number;
  search?: string;
  openOnly?: boolean;
  minCredits?: number;
  maxCredits?: number;
  levelRange?: [number, number];
  days?: Array<'Su'|'Mo'|'Tu'|'We'|'Th'|'Fr'|'Sa'>;
  fromHour?: number;
  toHour?: number;
  school?: string;        // SEAS
  department?: string;    // COMS
  instructorUni?: string;
  globalCore?: boolean;
  scienceReq?: boolean;
  page?: number;
  size?: number;
}) {
  const q = new URLSearchParams();
  q.set('term', opts.term);
  q.set('page[number]', String(opts.page ?? 1));
  q.set('page[size]', String(opts.size ?? 50));
  q.set('page[classes.size]', '500');
  q.set('sort', '-_score,course_identifier2');
  q.set('has_classes', 'true');

  const MEET = 'class.nested.meeting_details.meeting_pattern.meetingpatterndetail_set';

  if (opts.search)        q.set('search', opts.search);
  if (opts.subjectId)     q.set('course.subject.subject_id__in', String(opts.subjectId));
  if (opts.openOnly)      q.set('class.has_open_seats', 'true');
  if (opts.minCredits)    q.set('class.min_unit__gte', String(opts.minCredits));
  if (opts.maxCredits)    q.set('class.max_unit__lte', String(opts.maxCredits));
  if (opts.levelRange)    q.set('course.course_number__range', opts.levelRange.join(','));
  if (opts.days?.length)  q.set(`${MEET}.week_day__in`, opts.days.join(','));
  if (opts.fromHour)      q.set(`${MEET}.from_time__time_gte`, String(opts.fromHour));
  if (opts.toHour)        q.set(`${MEET}.to_time__time_lte`, String(opts.toHour));
  if (opts.school)        q.set('class.nested.course_organizations.parent_organization.organization_code__in', opts.school);
  if (opts.department)    q.set('class.nested.course_organizations.organization_code__in', opts.department);
  if (opts.instructorUni) q.set('class.nested.instructors.instructor_uni', opts.instructorUni);
  if (opts.globalCore)    q.set('course.approved_as_partial_fulfillment_for_global_core_requirement', 'true');
  if (opts.scienceReq)    q.set('course.approved_as_partial_fulfillment_for_science_requirement', 'true');

  const res = await fetch(`${SR}/course_and_class_search?${q}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token')}`,
      Accept: 'application/vnd.api+json',
    },
  });
  if (!res.ok) throw new Error(`SAS ${res.status}`);

  const { data } = await res.json();
  return { total: data.total_count as number, courses: data.courses as any[] };
}

/** Batched live seat counts. */
export async function fetchSeats(classIds: number[]) {
  const q = new URLSearchParams();
  q.set('filter[class_id__in]', classIds.join(','));
  q.set('fields[CapacityRequestTracker]', 'class_id,capacity,total_enrollment');
  q.set('page[size]', '500');

  const res = await fetch(`${SR}/capacityrequesttracker?${q}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token')}`,
      Accept: 'application/vnd.api+json',
    },
  });
  return res.json();
}
```

### Normalization target

Keep a single internal model regardless of which layer supplied the data:

```ts
export interface Section {
  courseIdentifier: string;
  classIdentifier: string;
  callNumber: string;
  title: string;
  subject: string;
  courseNumber: number;
  section: string;
  credits: { min: number; max: number };
  instructors: string[];
  meetings: Array<{ days: string[]; start: string; end: string; location?: string }>;
  enrollment: { enrolled: number; capacity: number; waitlist?: number; status: string };
  term: string;
  source: 'directory' | 'bulletin' | 'sas';
  fetchedAt: string;
}
```

---

## 14. Recommended Architecture

```
                 ┌──────────────────────────────────────┐
                 │  doc.sis.columbia.edu   (no auth)    │
                 │  courses, sections, enrollment       │
                 └───────────────┬──────────────────────┘
                                 │
                 ┌───────────────▼──────────────────────┐
                 │  bulletin.columbia.edu  (no auth)    │
                 │  meeting days, times, locations      │
                 └───────────────┬──────────────────────┘
                                 │  server-side ingest + normalize + cache
                 ┌───────────────▼──────────────────────┐
                 │        Course Copilot Backend        │
                 │  search · rules engine · alerts      │
                 └───────┬──────────────────────┬───────┘
                         │                      │
             ┌───────────▼─────────┐  ┌─────────▼──────────────┐
             │   Web Application   │  │  Chrome Extension      │
             │   works for all     │  │  optional, per-student │
             │   students, no auth │  │  local SAS reads only  │
             └─────────────────────┘  └────────────────────────┘
```

### Build order

**Phase 1 - No authentication.** Ingest `doc.sis.columbia.edu` for the course and section catalog with live enrollment. Ingest `bulletin.columbia.edu` for meeting times. Join on course identifier and call number. This alone supports search, filtering, conflict detection, credit math, requirement tagging, and seat alerts for every Columbia student.

**Phase 2 - Requirement engine.** Encode degree templates. Accept manual entry of completed courses. Produce ranked schedules with explanations.

**Phase 3 - Optional extension.** Read-only import of the student's own schedule, planner, and waitlists from a `vergil.columbia.edu` page context. Optionally call `preemptivevalidations` for authoritative eligibility rather than reimplementing rules.

**Phase 4 - Official integration.** Request a registered read-only OAuth client from CUIT and migrate ingestion behind a supported contract.

### Why this ordering matters

Phase 1 has no security liability, no login friction, and works for every student immediately. Making the extension optional rather than load-bearing is both a better product decision and a dramatically better risk posture.

---

## 15. Security & Compliance Rules

### Absolute prohibitions

- Never transmit `access_token` or `refresh_token` off the user's device
- Never log, persist, or cache tokens outside page memory
- Never collect CAS passwords or Duo passcodes
- Never issue `POST`, `PATCH`, `PUT`, or `DELETE` against registration resources
- Never call non-production hosts (`dev-`, `test-`, `stage-`, `uat-`, `post-`, `failover-`)
- Never reuse Columbia's first-party Vergil `client_id`
- Never perform enrollment actions without an explicit, per-action user confirmation

### Required practices

- Read-only `GET` for all SAS calls
- Human-rate request pacing, no burst crawling
- Aggressive caching of public catalog data
- Explicit user consent before importing any personal academic data
- User-initiated deletion and export of stored personal data
- Respect `robots.txt` and Columbia terms of use on public sources

### FERPA considerations

Student-scoped endpoints return protected education records including GPA, transfer credits, holds, advisors, and enrollment history. Centralized ingestion of these records by a third party creates FERPA exposure. Keep personal data local to the student's device unless and until an official Columbia agreement is in place.

### Registration boundary

The product may:

- Show whether a section is open, full, or waitlisted
- Build and validate a proposed schedule
- Explain conflicts and alternatives
- Deep-link the student into the correct Vergil page
- Notify on seat and waitlist changes

The product may not:

- Add to cart, register, drop, swap, or waitlist programmatically
- Take any enrollment action on a schedule or timer
- Act without the student performing the final click in Vergil

---

## 16. Known Gaps & Open Questions

### Confirmed gaps

| Gap | Impact | Mitigation |
|---|---|---|
| Public directory omits meeting times | Cannot build a calendar from Layer 1 alone | Join with `bulletin.columbia.edu` |
| Bulletin has no CORS header | Cannot fetch from a browser | Server-side ingest |
| `buildings` endpoint 500s without filters | Minor | Determine required filter set |
| No documented rate limits | Risk of throttling or blocking | Conservative pacing, caching |
| API is undocumented `v1` | Contract may change without notice | Adapter pattern, contract tests |
| Future-term sections publish late | Spring sections typically appear around November | Show catalog without sections, label clearly |

### Open questions for CUIT

1. Is there an existing OAuth client-registration process for student-built applications?
2. Can a read-only scope be issued limited to `course_and_class_search`, `subjects`, `organizations`, `termcalendars`, and `capacityrequesttracker`?
3. What are the published rate limits for the SAS gateway?
4. Is there an official bulk course-catalog export or feed?
5. Is programmatic access to `doc.sis.columbia.edu` and `bulletin.columbia.edu` permitted for a student-run service, and at what request volume?
6. Is there a supported webhook or change feed for enrollment counts, or is polling the only option?

### Product questions

1. Initial scope: CS/SEAS only, all undergraduates, or all schools?
2. Is the extension worth building before an official API relationship exists?
3. Should the requirement engine be Columbia-specific or generalized for multi-university expansion?

---

## Appendix: Verification Log

| Check | Method | Result |
|---|---|---|
| `vergil.columbia.edu/api/*` | Direct fetch | 403, endpoint does not exist |
| SAS unauthenticated, 9 endpoints | Server-side fetch | 401 across the board |
| SAS cross-origin from `example.com` | Browser fetch | Network failure, no CORS |
| SAS authenticated | Page-context fetch with bearer | 200, full JSON |
| `doc.sis.columbia.edu` section page | Server-side fetch | 200, 4,433 bytes, CORS `*` |
| `doc.sis.columbia.edu` subject term page | Server-side fetch | 200, 105,003 bytes, 83 sections, CORS `*` |
| `bulletin.columbia.edu` CS page | Server-side fetch | 200, 301,122 bytes, 147 time patterns |
| `www.columbia.edu/cu/bulletin/uwb` | Server-side fetch | 403, Cloudflare interstitial |
| Filter parameter surface | Bundle extraction | 27 field paths recovered |
| Endpoint inventory | Bundle extraction | 68 `v1` endpoints recovered |
| Live section data | Authenticated fetch | CSEE4119W001 at 88/110, waitlist 1, status `O` |

No credentials were captured, stored, transmitted, or displayed during this analysis. All authenticated requests were read-only `GET` operations executed inside the user's own browser session.
