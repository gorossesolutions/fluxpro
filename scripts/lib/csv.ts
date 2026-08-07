/** Minimal RFC4180-ish CSV parser — handles quoted fields, embedded commas, and escaped
 * quotes ("") since several description fields in the source exports contain commas inside
 * quotes (e.g. "Balisage Villa Yenma - GA4, Google Ads via GTM"). No external dependency for
 * something this contained. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Strip a leading UTF-8 BOM (EF BB BF -> U+FEFF once decoded) — without this the first
  // header key silently gets a leading U+FEFF character glued onto it (so "N°" reads
  // as something else entirely) and every lookup against it returns undefined with no
  // error, which is exactly what happened on the real export files.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const normalized = withoutBom.replace(/\r\n/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    const next = normalized[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

/** Parses a CSV into header-keyed row objects. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  const [header, ...rest] = rows
  if (!header) return []
  return rest.map((row) => {
    const record: Record<string, string> = {}
    header.forEach((key, i) => {
      record[key] = row[i] ?? ''
    })
    return record
  })
}
