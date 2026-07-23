// Master schedule of men's international cricket series/tournaments in 2026
// between the 12 ICC Full Member nations, sourced from Wikipedia's season
// overview pages (International cricket in 2025-26 / 2026 / 2026-27) since
// CricAPI's /matches listing proved to be an incomplete "current window" feed
// rather than a full-year schedule (see git history for the investigation).
//
// This list is schedule metadata ONLY — nations, formats, and an approximate
// date range for discovery/display. It intentionally carries no scores or
// results, and it is not itself shown to the user as ground truth: each entry
// is resolved to a real CricAPI series (via search) and hydrated with exact
// per-match dates/scores at fetch time, the same way WTC_SERIES ids are used
// in src/api/wtc.js. Entries with unresolvable/ambiguous CricAPI matches are
// skipped gracefully rather than showing wrong data.
//
// Excluded: associate-nation-only series (e.g. the 2024-26 Cricket World Cup
// League 2 tri-nation rounds among Namibia/Oman/Nepal/UAE/Scotland/USA/Canada/
// Netherlands), women's cricket, domestic/franchise leagues, youth cricket —
// consistent with this app's existing 12-nation scope (see INTL_NATIONS).
//
// Series that start in 2026 but run past Dec 31 (e.g. the Ashes) are kept —
// the per-match year filter applied after hydration trims any 2027 matches.

export const INTL_CRICKET_SERIES_2026 = [
  { id: 'sl-pak-t20i-jan26',        label: 'Pakistan tour of Sri Lanka, 2026',       nations: ['Sri Lanka', 'Pakistan'],       formats: ['t20i'],               start: '2026-01-07', end: '2026-01-18' },
  { id: 'ind-nz-jan26',             label: 'New Zealand tour of India, 2026',        nations: ['India', 'New Zealand'],        formats: ['odi', 't20i'],        start: '2026-01-11', end: '2026-01-25' },
  { id: 'wi-afg-uae-jan26',         label: 'Afghanistan vs West Indies, UAE 2026',   nations: ['West Indies', 'Afghanistan'],  formats: ['t20i'],               start: '2026-01-19', end: '2026-01-25' },
  { id: 'sl-eng-jan26',             label: 'England tour of Sri Lanka, 2026',        nations: ['Sri Lanka', 'England'],        formats: ['odi', 't20i'],        start: '2026-01-22', end: '2026-02-05' },
  { id: 'sa-wi-jan26',              label: 'West Indies tour of South Africa, 2026', nations: ['South Africa', 'West Indies'], formats: ['t20i'],               start: '2026-01-27', end: '2026-02-02' },
  { id: 'pak-aus-jan26',            label: 'Australia tour of Pakistan, Jan 2026',   nations: ['Pakistan', 'Australia'],       formats: ['t20i'],               start: '2026-01-29', end: '2026-02-04' },
  { id: 't20wc-2026',               label: 'ICC Men’s T20 World Cup 2026',      nations: ['England', 'South Africa', 'Australia', 'New Zealand', 'India', 'Pakistan', 'West Indies', 'Sri Lanka', 'Bangladesh', 'Zimbabwe', 'Afghanistan', 'Ireland'], formats: ['t20i'], start: '2026-02-07', end: '2026-03-08', tournament: true },
  { id: 'ban-pak-mar26',            label: 'Pakistan tour of Bangladesh, Mar 2026',  nations: ['Bangladesh', 'Pakistan'],      formats: ['odi'],                start: '2026-03-11', end: '2026-03-17' },
  { id: 'nz-sa-mar26',              label: 'South Africa tour of New Zealand, 2026', nations: ['New Zealand', 'South Africa'], formats: ['t20i'],               start: '2026-03-15', end: '2026-03-21' },
  { id: 'ban-nz-apr26',             label: 'New Zealand tour of Bangladesh, 2026',   nations: ['Bangladesh', 'New Zealand'],   formats: ['odi', 't20i'],        start: '2026-04-17', end: '2026-05-02' },
  { id: 'ban-pak-may26',            label: 'Pakistan tour of Bangladesh, May 2026',  nations: ['Bangladesh', 'Pakistan'],      formats: ['test'],               start: '2026-05-08', end: '2026-05-20' },
  { id: 'ire-nz-may26',             label: 'New Zealand tour of Ireland, 2026',      nations: ['Ireland', 'New Zealand'],      formats: ['test'],               start: '2026-05-27', end: '2026-05-30' },
  { id: 'pak-aus-may26',            label: 'Australia tour of Pakistan, May 2026',   nations: ['Pakistan', 'Australia'],       formats: ['odi'],                start: '2026-05-30', end: '2026-06-04' },
  { id: 'wi-sl-jun26',              label: 'Sri Lanka tour of West Indies, 2026',    nations: ['West Indies', 'Sri Lanka'],    formats: ['test', 'odi', 't20i'], start: '2026-06-03', end: '2026-07-14' },
  { id: 'eng-nz-jun26',             label: 'New Zealand tour of England, 2026',      nations: ['England', 'New Zealand'],      formats: ['test'],               start: '2026-06-04', end: '2026-06-29' },
  { id: 'ind-afg-jun26',            label: 'Afghanistan tour of India, Jun 2026',    nations: ['India', 'Afghanistan'],        formats: ['test', 'odi'],        start: '2026-06-06', end: '2026-06-20' },
  { id: 'ban-aus-jun26',            label: 'Australia tour of Bangladesh, 2026',     nations: ['Bangladesh', 'Australia'],     formats: ['odi', 't20i'],        start: '2026-06-09', end: '2026-06-25' },
  { id: 'ire-ind-jun26',            label: 'India tour of Ireland, 2026',            nations: ['Ireland', 'India'],            formats: ['t20i'],               start: '2026-06-26', end: '2026-06-28' },
  { id: 'zim-ban-jun26',            label: 'Bangladesh tour of Zimbabwe, 2026',      nations: ['Zimbabwe', 'Bangladesh'],      formats: ['test', 'odi', 't20i'], start: '2026-06-28', end: '2026-07-20' },
  { id: 'eng-ind-jul26',            label: 'India tour of England, 2026',            nations: ['England', 'India'],            formats: ['odi', 't20i'],        start: '2026-07-01', end: '2026-08-05' },
  { id: 'wi-nz-jul26',              label: 'New Zealand tour of West Indies, 2026',  nations: ['West Indies', 'New Zealand'],  formats: ['odi'],                start: '2026-07-11', end: '2026-07-25' },
  { id: 'zim-ind-jul26',            label: 'India tour of Zimbabwe, 2026',           nations: ['Zimbabwe', 'India'],           formats: ['t20i'],               start: '2026-07-23', end: '2026-07-26' },
  { id: 'wi-pak-jul26',             label: 'Pakistan tour of West Indies, 2026',     nations: ['West Indies', 'Pakistan'],     formats: ['test'],               start: '2026-07-25', end: '2026-08-10' },
  { id: 'ire-afg-aug26',            label: 'Afghanistan tour of Ireland, 2026',      nations: ['Ireland', 'Afghanistan'],      formats: ['odi'],                start: '2026-08-05', end: '2026-08-15' },
  { id: 'aus-ban-aug26',            label: 'Bangladesh tour of Australia, 2026',     nations: ['Australia', 'Bangladesh'],     formats: ['test'],               start: '2026-08-13', end: '2026-08-30' },
  { id: 'sl-ind-aug26',             label: 'India tour of Sri Lanka, 2026',          nations: ['Sri Lanka', 'India'],          formats: ['test'],               start: '2026-08-15', end: '2026-09-02' },
  { id: 'eng-pak-aug26',            label: 'Pakistan tour of England, 2026',         nations: ['England', 'Pakistan'],         formats: ['test'],               start: '2026-08-19', end: '2026-09-10' },
  { id: 'ind-afg-sep26',            label: 'Afghanistan tour of India, Sep 2026',    nations: ['India', 'Afghanistan'],        formats: ['t20i'],               start: '2026-09-13', end: '2026-09-26' },
  { id: 'zim-aus-sep26',            label: 'Australia tour of Zimbabwe, 2026',       nations: ['Zimbabwe', 'Australia'],       formats: ['odi'],                start: '2026-09-15', end: '2026-09-20' },
  { id: 'eng-sl-sep26',             label: 'Sri Lanka tour of England, 2026',        nations: ['England', 'Sri Lanka'],        formats: ['odi', 't20i'],        start: '2026-09-15', end: '2026-10-05' },
  { id: 'sa-aus-sep26',             label: 'Australia tour of South Africa, 2026',   nations: ['South Africa', 'Australia'],   formats: ['odi', 'test'],        start: '2026-09-24', end: '2026-10-31' },
  { id: 'ind-wi-sep26',             label: 'West Indies tour of India, 2026',        nations: ['India', 'West Indies'],        formats: ['odi', 't20i'],        start: '2026-09-27', end: '2026-10-17' },
  { id: 'pak-sl-eng-tri-oct26',     label: 'Pakistan Tri-Nation Series, Oct 2026',   nations: ['Pakistan', 'Sri Lanka', 'England'], formats: ['odi'],           start: '2026-10-01', end: '2026-10-20', tournament: true },
  { id: 'nz-ind-oct26',             label: 'India tour of New Zealand, 2026',        nations: ['New Zealand', 'India'],        formats: ['t20i', 'odi', 'test'], start: '2026-10-22', end: '2026-12-01' },
  { id: 'ban-wi-oct26',             label: 'West Indies tour of Bangladesh, 2026',   nations: ['Bangladesh', 'West Indies'],   formats: ['test'],               start: '2026-10-28', end: '2026-11-09' },
  { id: 'aus-eng-nov26',            label: 'England tour of Australia (Ashes), 2026-27', nations: ['Australia', 'England'],    formats: ['odi', 't20i', 'test'], start: '2026-11-13', end: '2027-03-15' },
  { id: 'sa-ban-nov26',             label: 'Bangladesh tour of South Africa, 2026',  nations: ['South Africa', 'Bangladesh'],  formats: ['test', 'odi', 't20i'], start: '2026-11-15', end: '2026-12-13' },
  { id: 'aus-nz-dec26',             label: 'New Zealand tour of Australia, 2026-27', nations: ['Australia', 'New Zealand'],    formats: ['test'],               start: '2026-12-09', end: '2027-01-08' },
  { id: 'ind-sl-dec26',             label: 'Sri Lanka tour of India, 2026',          nations: ['India', 'Sri Lanka'],          formats: ['odi', 't20i'],        start: '2026-12-13', end: '2026-12-27' },
  { id: 'sa-eng-dec26',             label: 'England tour of South Africa, 2026-27',  nations: ['South Africa', 'England'],     formats: ['test', 'odi'],        start: '2026-12-17', end: '2027-01-15' },
]
