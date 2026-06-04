import { createClient } from '@supabase/supabase-js';

// Read environment variables (support legacy `API` var if present)
let rawUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.API;

if (!rawUrl) {
  console.warn('REACT_APP_SUPABASE_URL is not set. Check your .env(.local)');
}

// Normalize URL: remove any trailing `/rest/v1` or extra slashes that may cause
// duplicated paths like `/rest/v1/rest/v1/...` which produce 404 in the browser.
if (rawUrl) {
  rawUrl = rawUrl.replace(/\/rest\/v1\/?$/i, '');
  rawUrl = rawUrl.replace(/\/$/, '');
}

if (!supabaseAnonKey) {
  console.warn('REACT_APP_SUPABASE_ANON_KEY (or API) is not set. Public requests will fail.');
}

export const supabase = createClient(rawUrl || '', supabaseAnonKey || '');
