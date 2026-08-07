import pdfMakeBuild from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'

// pdfmake's browser build ships as a UMD bundle whose whole module.exports object becomes the
// default import under Vite's CJS interop — {vfs, fonts, createPdf, ...}. vfs_fonts.js exports
// the font-file map directly (not the older `{ pdfMake: { vfs } }` shape some tutorials show),
// so this assignment must be the map itself.
pdfMakeBuild.vfs = pdfFonts as unknown as Record<string, string>

// Known limitation, verified during this build: the bundled Roboto's "fi"/"fl" ligature glyphs
// have a broken ToUnicode mapping, so copy-pasted or programmatically extracted text loses the
// "i"/"l" ("Bénéficiaire" → "Bénéfciaire") — common in French. The *visual* PDF renders every
// character correctly, which is what actually goes out to clients and the MRA, so this is left
// alone rather than "fixed": inserting a zero-width non-joiner to break the ligature was tried
// and made it worse — that codepoint has no glyph in this font and rendered as a visible tofu
// box, and scrambled word order in the extracted text besides. A real fix means bundling a
// different font family via pdfMake.fonts, which is a deliberate follow-up, not a quick patch.
export const pdfMake = pdfMakeBuild
