// =======================================================
// PUBLIC config — safe to expose in the browser.
// Supabase's "anon" key and Paystack's "public" key are BOTH designed to be
// visible in frontend code; they're protected by Row Level Security / Paystack's
// own checkout flow, not by secrecy. Never put a SECRET/service_role key here.
//
// EDIT THESE THREE LINES with your real values before deploying.
// ============================================================
export const SUPABASE_URL ='https://uiwgrrfghvrcgrebxrou.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpd2dycmZnaHZyY2dyZWJ4cm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTU2NTYsImV4cCI6MjEwNTEzMTY1Nn0.tWIkGwp09EQ_vwg8J0i95tjvd5XyiJLIrQnsmypJsXo'
export const PAYSTACK_PUBLIC_KEY = 'pk_test_f521c16114a19afa3a4adc6e40b662775b7cb751'

