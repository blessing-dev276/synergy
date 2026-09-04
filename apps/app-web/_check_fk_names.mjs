import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://rkshskzbmmrttqvcaqps.supabase.co", "sb_publishable_X9AD1O2r_R42OFpbGs6XSA_5scEKEOX");
await supabase.auth.signInWithPassword({ email: "admin@synergyteamm.com", password: "password123" });
const { data, error } = await supabase.rpc("pg_catalog_fk_lookup", {});
console.log(error?.message ?? data);
