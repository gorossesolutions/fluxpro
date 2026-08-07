-- Reference data: Mauritian tax law, country mention rules, expense category taxonomy.
-- Rates live here, never hardcoded in TS (spec §3.1) — a future Finance Act is a data
-- edit (insert a new fiscal_year_start row set), not a deploy.

-- ---------------------------------------------------------------------------
-- Progressive income tax bands — Finance Act 2025, in force 1 July 2025 (spec §3.1).
-- Seeded for FY2025-26 and FY2026-27: the Budget 2026-2027 proposal to replace the FSC
-- with a 35% top band is announced but NOT enacted as of this writing, so FY2026-27
-- carries the same enacted regime until a Finance Act actually changes it.
-- ---------------------------------------------------------------------------

insert into tax_bands (fiscal_year_start, band_order, lower_bound, upper_bound, rate_pct) values
  ('2025-07-01', 1, 0,        500000,  0),
  ('2025-07-01', 2, 500001,   1000000, 10),
  ('2025-07-01', 3, 1000001,  null,    20),
  ('2026-07-01', 1, 0,        500000,  0),
  ('2026-07-01', 2, 500001,   1000000, 10),
  ('2026-07-01', 3, 1000001,  null,    20);

insert into tax_config (fiscal_year_start, fsc_threshold, fsc_rate, fsc_active, vat_registration_threshold, currency) values
  ('2025-07-01', 12000000, 15, true, 3000000, 'MUR'),
  ('2026-07-01', 12000000, 15, true, 3000000, 'MUR');

-- ---------------------------------------------------------------------------
-- Country rules — mandatory invoice mentions and identifier metadata (spec §3.3, §3.4, §6.3).
-- Only FR carries the exact statutory citation given in the brief; CH/AE/CA/ZA
-- self-assessment mechanics are real but their precise citations are NOT asserted here —
-- see docs/COMPLIANCE.md for why, and get them confirmed by local counsel before relying
-- on them. Those four ship with the general "Zero-rated supply" export treatment only.
-- ---------------------------------------------------------------------------

insert into country_rules (country_code, country_label_fr, mention_fr, mention_en, reverse_charge, identifier_label, identifier_regex, default_identifier_type) values
  ('MU', 'Maurice', null, null, false, 'BRN', '^[ICP][A-Za-z0-9]{5,}$', 'BRN'),
  ('FR', 'France',
    'Autoliquidation — TVA due par le preneur (Article 283-2 du CGI)',
    'Reverse charge — VAT due by the recipient (Article 283-2 of the French Tax Code)',
    true, 'SIRET', '^\d{14}$', 'SIRET'),
  ('BE', 'Belgique',
    'Autoliquidation — Directive 2006/112/CE, article 44 (à confirmer avec un comptable belge)',
    'Reverse charge — Directive 2006/112/EC, Article 44 (to be confirmed with a Belgian accountant)',
    true, 'Numéro de TVA', '^BE0?\d{9}$', 'BUSINESS_ID'),
  ('CH', 'Suisse', null, null, false, 'UID/TVA', '^CHE-?\d{3}\.?\d{3}\.?\d{3}(\s?(MWST|TVA|IVA))?$', 'UID_CH'),
  ('AE', 'Émirats arabes unis', null, null, false, 'TRN', '^100\d{12}$', 'TRN_AE'),
  ('CA', 'Canada', null, null, false, 'Numéro d''entreprise', '^\d{9}RT\d{4}$', 'BUSINESS_ID'),
  ('ZA', 'Afrique du Sud', null, null, false, 'CRN', '^\d{4}/\d{6}/\d{2}$', 'CRN_ZA');

-- ---------------------------------------------------------------------------
-- Expense category taxonomy — French label, key, PCG account (spec §9).
-- user_id is null: these are system-seeded, shared, read-only-by-default rows.
-- ---------------------------------------------------------------------------

insert into expense_categories (user_id, label_fr, key, pcg_code) values
  (null, 'Carburant', 'fuel', '6061'),
  (null, 'Fournitures de bureau', 'office_supplies', '6064'),
  (null, 'Mobilier & équipement', 'furniture_equipment', '2183 / 606'),
  (null, 'Matériel informatique', 'hardware', '2183'),
  (null, 'Logiciels & abonnements', 'software_subscriptions', '6065'),
  (null, 'Hébergement & noms de domaine', 'hosting_domains', '6065'),
  (null, 'Loyers & charges', 'rent', '613'),
  (null, 'Entretien & réparations', 'maintenance', '6156'),
  (null, 'Assurances', 'insurance', '616'),
  (null, 'Honoraires & sous-traitance', 'professional_fees', '6226'),
  (null, 'Publicité & marketing', 'advertising', '623'),
  (null, 'Déplacements & transport', 'travel', '6251'),
  (null, 'Repas & réceptions', 'meals_entertainment', '6257'),
  (null, 'Télécommunications & internet', 'telecom', '626'),
  (null, 'Frais bancaires', 'bank_charges', '627'),
  (null, 'Formation & conférences', 'training', '6185'),
  (null, 'Taxes & cotisations', 'taxes_dues', '63'),
  (null, 'Autre', 'other', '628');
