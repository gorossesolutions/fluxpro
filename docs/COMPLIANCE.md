# Compliance

Every rule below is implemented in the schema/app, not left as a convention. Where a rule rests
on an assumption this codebase had to make without a definitive source, that's called out
explicitly — treat those as open items for Guillaume's accountant, not settled law.

## 3.1 — Mauritian personal income tax (progressive bands, Finance Act 2025)

**Rule.** The flat 15% regime is gone. Since 1 July 2025: 0% up to MUR 500,000, 10% from
500,001–1,000,000, 20% above 1,000,000 — marginal, band by band. Plus a Fair Share Contribution
(FSC) of 15% on leviable income above MUR 12,000,000, for income years 1 July 2025 – 30 June 2028.
The Mauritian fiscal year runs 1 July → 30 June, not calendar year.

**Implementation.** `tax_bands` (`fiscal_year_start`, `band_order`, `lower_bound`, `upper_bound`,
`rate_pct`) and `tax_config` (`fsc_threshold`, `fsc_rate`, `fsc_active`,
`vat_registration_threshold`) — seeded in `0004_seed_reference_data.sql` for
`fiscal_year_start = 2025-07-01` **and** `2026-07-01` (today, 2026-08-07, falls in the FY2026-27
window, so both need real data — seeding only the historical year would have silently left the
current year's calculator with nothing to read). Rates are never hardcoded in TS; the calculator
(built in a later step) reads these tables and renders the required band-by-band breakdown.

**⚠ Open item — FSC base.** The brief specifies FSC on "leviable income," the progressive bands
on "chargeable income." Mauritian FSC law defines leviable income with some exclusions that may
differ from chargeable income. This schema/calculator will apply FSC to the same
chargeable-income base as the bands until confirmed otherwise — **get this confirmed by an
accountant before the FSC number is relied on**, especially for a fiscal year where income
actually approaches MUR 12M.

**Budget 2026-2027 note.** A proposal to replace the FSC with a 35% top marginal band has been
announced but is **not enacted**. The app applies the enacted Finance Act 2025 regime only; the
Fiscalité page renders this as a dismissible info banner, not a blocking modal, once built.

**Source.** Finance Act 2025 (Mauritius), in force 1 July 2025.

## 3.2 — VAT

**Rule.** Standard rate 15%. Compulsory registration threshold MUR 3,000,000 annual turnover
(lowered from 6,000,000, effective 1 October 2025). Consultants and certain other professions may
be required to register **irrespective of turnover** under the Tenth Schedule of the VAT Act —
whether this specific consultancy falls in that category is unconfirmed.

**Implementation.** `tax_config.vat_registration_threshold`; `business_identity.vat_registered` +
`vat_number`. When `vat_registered = false`, invoices must carry no VAT line for domestic supplies
and must state the business is not VAT-registered (enforced in the invoice PDF template, a later
build step). A turnover-watch widget (rolling 12-month vs. threshold, amber at 80%, red above) is
planned for the Fiscalité page.

**⚠ Open item.** The app never silently assumes "not registered" — `vat_registered` defaults to
`false` at the schema level but the onboarding flow (later step) must force an explicit choice,
with the Tenth Schedule caveat shown once, not just defaulted past.

**Source.** Mauritius VAT Act; Tenth Schedule; threshold change effective 1 October 2025.

## 3.3 — Exported services (zero-rating)

**Rule.** Services to non-resident clients abroad are zero-rated; the invoice must print "Zero-rated
supply" or risk MRA reclassification at 15% on audit.

**Implementation.** `invoices.supply_treatment` (`domestic` | `zero_rated_export`), computed from
the client's `country_code`: `MU` → `domestic`, anything else → `zero_rated_export`. Computed, not
typed — overridable with a logged reason via the audit trail, not a free-text field. The PDF
template (later step) renders "Zero-rated supply" whenever `supply_treatment = zero_rated_export`.

**Source.** Mauritius VAT Act, zero-rating of exported services.

## 3.4 — France reverse charge

**Rule.** A Mauritian (non-EU) supplier invoicing a French business must issue the invoice
**without VAT**, carrying: *"Autoliquidation — TVA due par le preneur (Article 283-2 du CGI)"* —
not the intra-community "Article 196" wording, which applies to EU-established suppliers only.

**Implementation.** `country_rules` (`country_code = 'FR'`), `mention_fr`/`mention_en`,
`reverse_charge = true`. The invoice PDF pulls this automatically from the client's country;
editable in Paramètres (later step) since `country_rules` is reference data, not a hardcoded string.

**⚠ Open item — legal citation confidence.** This is the exact wording given in the build brief
and has been implemented verbatim. It has **not** been independently re-verified against the
current CGI by this codebase — confirm with a France-side accountant before the first real
invoice carrying it goes out.

**Also seeded, same caveat, weaker confidence: Belgium.** BE is an EU member state under the same
Directive 2006/112/CE Article 44 mechanism as FR, so a parallel reverse-charge mention was seeded
for BE — but the exact Belgian citation was not given in the brief and is **explicitly marked
"à confirmer avec un comptable belge"** in the seed data itself (`country_rules.mention_fr` for
BE). Don't strip that caveat text without getting it confirmed first.

**⚠ Deliberately not seeded: CH, AE, CA, ZA reverse-charge/self-assessment mentions.** All four
have real self-assessment or "imported services" mechanisms in their own VAT law (Swiss
*Bezugsteuer*, UAE reverse charge under Federal Decree-Law No. 8 of 2017, Canadian
imported-taxable-supply rules, South African VAT Act s.7(1)(c)) — but this codebase does not
assert a specific article citation for any of them, because none was confirmed with enough
certainty to print on a legal document. Those four countries currently ship with the general
"Zero-rated supply" export treatment (§3.3) only, `reverse_charge = false`. **Before invoicing
CH/AE/CA/ZA clients at volume, get the correct local mention confirmed and add it to
`country_rules` — don't assume zero-rating alone is sufficient in every one of those
jurisdictions.**

**Source.** Article 283-2 CGI (France); Directive 2006/112/CE Article 44 (general EU rule).

**French e-invoicing (2026/2027).** Out of scope — that reform applies to businesses established
in France. A Mauritian supplier stays out of scope and may keep sending PDF invoices by email.
The data model (structured line items, tax breakdown, party identifiers) is Factur-X/EN
16931-mappable anyway, so a future export would be a serialiser, not a migration.

## 3.5 — Invoice immutability

**Rule.** No deleting issued invoices. Sequential, gapless numbering (Art. 242 nonies A CGI;
Mauritius likewise). Corrections only via credit notes. 5-year retention.

**Implementation, layered:**

- **Numbering**: `fn_allocate_document_number(prefix, year)` (SECURITY DEFINER), backed by
  `document_sequences` with its primary key as the serialisation point — no client ever composes
  a number, and a number is allocated **only at issuance**, never at draft creation, so an
  abandoned draft never burns one.
- **Locking**: `invoices.locked` and `credit_notes.locked`. The `fn_guard_invoice_immutability()` /
  `fn_guard_invoice_lines_immutability()` / `fn_guard_credit_note_immutability()` triggers raise
  on any UPDATE of a financial field or any DELETE once `locked = true`. A small whitelist
  (status, status_override, due_date, notes, the reserved EBS columns, updated_at) stays editable.
  This is enforced by a Postgres trigger, not app-layer validation — even a compromised or buggy
  client cannot bypass it.
- **Corrections**: `credit_notes.parent_invoice_id` (`on delete restrict` — a credit note always
  keeps its parent invoice reachable), mandatory `reason`, own `AV-YYYY-NNN` sequence.
- **Gap detection**: `v_number_gaps` view, `security_invoker = true` so it respects the calling
  user's own RLS rather than the view owner's — surfaced as a red banner on the Fiscalité page
  (later step).
- **Retention**: nothing is hard-deleted after issuance. `expenses`/`documents` use soft delete
  (`deleted_at`).

All of the above was functionally verified against a real (non-Supabase) PostgreSQL instance
during this build step — see `docs/SCHEMA.md`'s validation section for exactly what was tested.

**Source.** Art. 242 nonies A CGI (France, sequential numbering); French 2018 anti-fraud rules
(inalterability/security/conservation/archiving); Mauritius sequential numbering + 5-year retention
requirement.

## 3.6 — Mandatory invoice mentions

**Rule.** See brief §3.6 for the full list (issuer identity, client identity, dates, line items,
totals, currency, frozen FX rate + date, payment terms, bank details, country mention,
zero-rating where applicable, legal mentions).

**Implementation.** Every field on that list has a column: `business_identity`/`bank_accounts`
(issuer + bank), `clients`/`invoices.client_snapshot` (client, frozen at issuance),
`invoices.number`/`issue_date`/`due_date`, `invoice_lines`, `invoices.subtotal`/`tax_amount`/
`total`/`currency`, `fx_rate_to_mur`/`fx_rate_date`, `payment_terms`, `bank_account_id`,
`country_mention`, `supply_treatment`, `business_identity.legal_mentions`. Rendering these into
the actual PDF is a later build step (§17); the schema already carries every field it needs to.

## 3.7 — FX and bookkeeping currency

**Rule.** Books and MRA filings are in MUR. The FX rate is frozen at issuance and never
recalculated — historic reporting always uses the frozen rate, never today's.

**Implementation.** `fx_rate_to_mur`, `fx_rate_date`, `fx_source` on `invoices`, `quotes`,
`credit_notes`, `payments`, `expenses` — each document/transaction carries its own frozen rate.
`fx_rates` is the proprietary daily history table (spec §11) a later Edge Function will populate;
nothing in the schema ever overwrites a document's own frozen columns from it. FX gain/loss
between a payment's rate and its invoice's frozen rate is captured separately
(`payments.fx_gain_loss_mur`, spec §16.12) rather than silently distorting revenue.

**Source.** Mauritius Revenue Authority bookkeeping-currency expectations; general accounting
practice for functional-currency reporting.

## 3.8 — Data protection

**Rule.** GDPR (FR/BE clients), Mauritius Data Protection Act 2017 (controller), POPIA (ZA
contacts). RLS everywhere, private Storage, minimal PII, ≥5-year retention for financial records.

**Implementation.** RLS is enabled on every table (`0002_rls.sql`) — verified by functional test,
not just declared. Storage buckets `documents` and `logos` are created **private**
(`public = false`) with owner-prefix RLS policies on `storage.objects`
(`(storage.foldername(name))[1] = auth.uid()::text`) — the app will serve files only via
short-lived signed URLs, never public links. Retention: see §3.5 (nothing hard-deleted after
issuance).

**⚠ Open item — Supabase region.** The brief calls for an EU Supabase region. This build step has
no live Supabase project to configure — when the real project is created, **pick an EU region
explicitly**; it cannot be changed after the fact without a full data migration.

**Source.** GDPR; Mauritius Data Protection Act 2017; POPIA (South Africa).

## 3.9 — EBS / e-invoicing readiness (not active)

**Rule.** The MRA Electronic Billing System applies above ~MUR 80,000,000 turnover — far above
scope. Reserve columns now, build nothing.

**Implementation.** `invoices.irn`, `qr_payload`, `ebs_transaction_type`, `ebs_submitted_at` —
nullable, untouched by any trigger or app code. No integration exists or is planned before that
threshold becomes realistic.

---

## How to keep this document honest

Every time a compliance-relevant rule changes in the schema (a new country mention, a new tax
band, a changed threshold), update the corresponding section above in the same commit — this file
is the audit trail's audit trail. If you're ever unsure whether something here is still accurate,
treat the migrations as the source of truth and this document as potentially stale narration of
them, not the other way around.
