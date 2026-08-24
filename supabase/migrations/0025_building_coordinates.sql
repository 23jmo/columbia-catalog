-- ---------------------------------------------------------------------------
-- 0025 — building coordinates from OpenStreetMap
--
-- Spec §11 says "Buildings are geocoded once", and spec line 638 already names
-- OSM as the source for Columbia's footprints. Until now `lat`/`lng` were NULL
-- on all 60 rows, so every within-campus walk fell back to a flat per-zone
-- rate: Mudd->Havemeyer and Mudd->Lerner returned the same number though one is
-- about 90 seconds and the other closer to six minutes.
--
-- ── Provenance ────────────────────────────────────────────────────────────
--
-- Centroids of named building footprints from OpenStreetMap, fetched via the
-- Overpass API. Data (c) OpenStreetMap contributors, ODbL 1.0 — which permits
-- storage and redistribution with attribution, unlike the geocoder terms that
-- ruled out option 2 in BLOCKERS #13.
--
-- ── Why only 51 of 60 ─────────────────────────────────────────────────────
--
-- Every value here is a matched OSM footprint. Nothing is interpolated,
-- averaged, or recalled. Nine buildings had no confident match and are left
-- NULL on purpose: a wrong coordinate does not look wrong, it renders as a
-- confident walking time on a student's schedule, and `walkMinutesBetween`
-- already falls back to the zone estimate wherever a pair is missing.
--
-- Left NULL: Engineering Terrace, Journalism Building, Teachers College,
-- Lehman Hall, Alumni Auditorium (it is a room inside another building),
-- Allan Rosenfield Building, and the three off-campus sites — Baker Athletics
-- Complex, Lamont-Doherty Earth Observatory, Nevis Laboratories.
--
-- Each match was checked against a bounding box for its campus zone before
-- being accepted, so a same-named building in the wrong part of Manhattan
-- could not be silently adopted.
-- ---------------------------------------------------------------------------

update buildings set lat = 40.808267, lng = -73.960944
 where building_id = 'avery' and lat is null;  -- OSM: Avery Hall
update buildings set lat = 40.807701, lng = -73.961422
 where building_id = 'buell' and lat is null;  -- OSM: Buell Hall
update buildings set lat = 40.806367, lng = -73.963191
 where building_id = 'butler' and lat is null;  -- OSM: Butler Library
update buildings set lat = 40.809623, lng = -73.960787
 where building_id = 'cepsr' and lat is null;  -- OSM: Schapiro Center (CEPSR)
update buildings set lat = 40.809626, lng = -73.962282
 where building_id = 'chandler' and lat is null;  -- OSM: Chandler Hall
update buildings set lat = 40.809024, lng = -73.959905
 where building_id = 'cs-building' and lat is null;  -- OSM: Computer Science
update buildings set lat = 40.807973, lng = -73.963189
 where building_id = 'dodge' and lat is null;  -- OSM: Dodge Hall
update buildings set lat = 40.808592, lng = -73.962697
 where building_id = 'earl' and lat is null;  -- OSM: Earl Hall
update buildings set lat = 40.809088, lng = -73.960403
 where building_id = 'fairchild' and lat is null;  -- OSM: Fairchild Hall
update buildings set lat = 40.808065, lng = -73.960469
 where building_id = 'fayerweather' and lat is null;  -- OSM: Fayerweather Hall
update buildings set lat = 40.806803, lng = -73.961676
 where building_id = 'hamilton' and lat is null;  -- OSM: Hamilton Hall
update buildings set lat = 40.809288, lng = -73.962169
 where building_id = 'havemeyer' and lat is null;  -- OSM: Havemeyer Hall
update buildings set lat = 40.807508, lng = -73.959774
 where building_id = 'iab' and lat is null;  -- OSM: Columbia School of International and Public Affairs
update buildings set lat = 40.805883, lng = -73.962368
 where building_id = 'john-jay' and lat is null;  -- OSM: John Jay Hall
update buildings set lat = 40.807214, lng = -73.961399
 where building_id = 'kent' and lat is null;  -- OSM: Kent Hall
update buildings set lat = 40.811949, lng = -73.961836
 where building_id = 'knox' and lat is null;  -- OSM: Knox Hall
update buildings set lat = 40.806874, lng = -73.964038
 where building_id = 'lerner' and lat is null;  -- OSM: Alfred Lerner Hall
update buildings set lat = 40.808391, lng = -73.963193
 where building_id = 'lewisohn' and lat is null;  -- OSM: Lewisohn Hall
update buildings set lat = 40.808224, lng = -73.961835
 where building_id = 'low' and lat is null;  -- OSM: Low Memorial Library
update buildings set lat = 40.809017, lng = -73.962732
 where building_id = 'mathematics' and lat is null;  -- OSM: Mathematics
update buildings set lat = 40.809354, lng = -73.959963
 where building_id = 'mudd' and lat is null;  -- OSM: Mudd Hall
update buildings set lat = 40.810013, lng = -73.96195
 where building_id = 'nwc' and lat is null;  -- OSM: Northwest Corner Building
update buildings set lat = 40.807439, lng = -73.960937
 where building_id = 'philosophy' and lat is null;  -- OSM: Philosophy Hall
update buildings set lat = 40.80999, lng = -73.961399
 where building_id = 'pupin' and lat is null;  -- OSM: Pupin Hall
update buildings set lat = 40.808525, lng = -73.960432
 where building_id = 'schermerhorn' and lat is null;  -- OSM: Schermerhorn Hall
update buildings set lat = 40.807859, lng = -73.960952
 where building_id = 'st-pauls' and lat is null;  -- OSM: Saint Paul's Chapel
update buildings set lat = 40.808981, lng = -73.961277
 where building_id = 'uris' and lat is null;  -- OSM: Uris Hall
update buildings set lat = 40.810081, lng = -73.963341
 where building_id = 'altschul' and lat is null;  -- OSM: Altschul Hall
update buildings set lat = 40.809143, lng = -73.963943
 where building_id = 'barnard-hall' and lat is null;  -- OSM: Barnard Hall
update buildings set lat = 40.809861, lng = -73.962966
 where building_id = 'diana' and lat is null;  -- OSM: The Diana Center
update buildings set lat = 40.810333, lng = -73.963855
 where building_id = 'elliott' and lat is null;  -- OSM: Elliott Hall
update buildings set lat = 40.810446, lng = -73.962845
 where building_id = 'milbank' and lat is null;  -- OSM: Milbank Hall
update buildings set lat = 40.809688, lng = -73.963649
 where building_id = 'milstein' and lat is null;  -- OSM: Milstein Center for Teaching and Learning
update buildings set lat = 40.808669, lng = -73.963935
 where building_id = 'sulzberger' and lat is null;  -- OSM: Sulzberger Hall
update buildings set lat = 40.816334, lng = -73.958497
 where building_id = 'forum' and lat is null;  -- OSM: The Forum
update buildings set lat = 40.81772, lng = -73.958252
 where building_id = 'geffen' and lat is null;  -- OSM: David Geffen Hall
update buildings set lat = 40.816874, lng = -73.958215
 where building_id = 'jerome-greene' and lat is null;  -- OSM: Jerome L. Greene Science Center
update buildings set lat = 40.818244, lng = -73.959524
 where building_id = 'kravis' and lat is null;  -- OSM: Henry R. Kravis Hall
update buildings set lat = 40.817234, lng = -73.958697
 where building_id = 'lenfest' and lat is null;  -- OSM: Lenfest Center for the Arts
update buildings set lat = 40.818271, lng = -73.955822
 where building_id = 'nash' and lat is null;  -- OSM: Nash Building
update buildings set lat = 40.816497, lng = -73.959554
 where building_id = 'prentis' and lat is null;  -- OSM: Prentis Hall
update buildings set lat = 40.818349, lng = -73.957849
 where building_id = 'studebaker' and lat is null;  -- OSM: Studebaker Building
update buildings set lat = 40.843409, lng = -73.94325
 where building_id = 'bard' and lat is null;  -- OSM: Bard Hall
update buildings set lat = 40.841612, lng = -73.941817
 where building_id = 'black' and lat is null;  -- OSM: William Black Building
update buildings set lat = 40.841752, lng = -73.940396
 where building_id = 'georgian' and lat is null;  -- OSM: Georgian Building
update buildings set lat = 40.84275, lng = -73.942597
 where building_id = 'hammer' and lat is null;  -- OSM: Hammer Health Sciences Center
update buildings set lat = 40.841495, lng = -73.94348
 where building_id = 'milstein-hospital' and lat is null;  -- OSM: Milstein Hospital Building
update buildings set lat = 40.842528, lng = -73.94454
 where building_id = 'nyspi' and lat is null;  -- OSM: New York State Psychiatric Institute - Herbert Pardes Building
update buildings set lat = 40.841378, lng = -73.941459
 where building_id = 'ps' and lat is null;  -- OSM: College of Physicians and Surgeons
update buildings set lat = 40.844758, lng = -73.942687
 where building_id = 'vagelos-education' and lat is null;  -- OSM: Roy and Diana Vagelos Education Center
update buildings set lat = 40.80838, lng = -73.964021
 where building_id = 'reid-hall' and lat is null;  -- OSM: Helen Reid Hall

-- Both coordinates or neither: a row with one half is worse than a row with
-- none, because code that checks only `lat is not null` would compute a
-- distance against an undefined longitude.
alter table buildings drop constraint if exists buildings_coords_paired;
alter table buildings add constraint buildings_coords_paired
  check ((lat is null) = (lng is null));
