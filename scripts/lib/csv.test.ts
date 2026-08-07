import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvRecords } from './csv'
import { parseDepensesCsv, parseDevisCsv, parseFacturesCsv } from './csv-source'

describe('parseCsv', () => {
  it('splits simple comma-separated quoted fields', () => {
    expect(parseCsv('"a","b","c"\n"1","2","3"')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('keeps commas embedded inside quoted fields intact', () => {
    const rows = parseCsv('"N°","Description"\n"FAC-1","Balisage Villa Yenma - GA4, Google Ads via GTM"')
    expect(rows[1]).toEqual(['FAC-1', 'Balisage Villa Yenma - GA4, Google Ads via GTM'])
  })

  it('unescapes doubled quotes inside a quoted field', () => {
    const rows = parseCsv('"Note"\n"Il a dit ""bonjour"""')
    expect(rows[1]).toEqual(['Il a dit "bonjour"'])
  })

  it('strips a leading UTF-8 BOM so the first header key matches cleanly', () => {
    // A BOM (U+FEFF) prepended to the first field, exactly as found in the real export files —
    // without stripping it, header lookups like record['N°'] silently return undefined.
    const rows = parseCsv('\uFEFF"N°","Client"\n"FAC-1","Acme"')
    expect(rows[0]).toEqual(['N°', 'Client'])
  })
})

describe('parseCsvRecords', () => {
  it('keys rows by header', () => {
    const records = parseCsvRecords('"N°","Client"\n"FAC-1","Acme"')
    expect(records).toEqual([{ 'N°': 'FAC-1', Client: 'Acme' }])
  })
})

describe('parseFacturesCsv (real header shape)', () => {
  const sample = [
    '"N°","Client","Email","Description","Montant HT","TVA%","TTC","Devise","Date","Échéance","Statut"',
    '"FAC-2026-020","Sébastien Bollet EI","sebastien.bollet@myceliumgmt.com","Balisage Villa Yenma - GA4, Google Ads via GTM","150","0","150","EUR","2026-06-12","2026-06-19","payée"',
  ].join('\n')

  it('parses a row with an embedded comma in the description correctly', () => {
    const rows = parseFacturesCsv(sample)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      number: 'FAC-2026-020',
      client: 'Sébastien Bollet EI',
      email: 'sebastien.bollet@myceliumgmt.com',
      description: 'Balisage Villa Yenma - GA4, Google Ads via GTM',
      montantHt: 150,
      tvaPct: 0,
      ttc: 150,
      currency: 'EUR',
      date: '2026-06-12',
      dueOrValidity: '2026-06-19',
      statut: 'payée',
    })
  })
})

describe('parseDevisCsv (no email column)', () => {
  const sample = [
    '"N°","Client","Description","Montant HT","TVA%","TTC","Devise","Date","Validité","Statut"',
    '"DEV-2026-009","AIS","Pubs sur un réseau","250","0","250","EUR","2026-06-18","2026-07-18","converti"',
  ].join('\n')

  it('parses with email always null', () => {
    const rows = parseDevisCsv(sample)
    expect(rows[0]).toMatchObject({ number: 'DEV-2026-009', client: 'AIS', email: null, montantHt: 250, statut: 'converti' })
  })
})

describe('parseDepensesCsv', () => {
  const sample = [
    '"Fournisseur","Description","Catégorie","Montant","Devise","Date début","Récurrence","Date fin"',
    '"Claude","Plan Pro","Logiciels/Abonnements","20","USD","2026-03-07","mensuelle",""',
    '"Fastclick","Casque Logitech H390","Matériel","1790","MUR","2026-03-12","",""',
  ].join('\n')

  it('parses a recurring expense', () => {
    const rows = parseDepensesCsv(sample)
    expect(rows[0]).toMatchObject({ supplier: 'Claude', categorie: 'Logiciels/Abonnements', montant: 20, currency: 'USD', recurrence: 'mensuelle', dateFin: null })
  })

  it('parses a one-off expense with empty recurrence/date_fin as null', () => {
    const rows = parseDepensesCsv(sample)
    expect(rows[1]).toMatchObject({ supplier: 'Fastclick', montant: 1790, currency: 'MUR', recurrence: null, dateFin: null })
  })
})
