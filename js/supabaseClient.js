// Loads the Supabase library straight from a CDN — no npm install, no build step.
// This is the "traditional" way: a <script type="module"> importing a URL directly.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
