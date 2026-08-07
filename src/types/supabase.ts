/**
 * Placeholder until `npm run db:types` generates the real file from the Supabase schema
 * (populated in step 2 — supabase/migrations). Regenerate after every migration.
 */
export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
