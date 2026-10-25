// W4 — WhatsApp Business Cloud (Coexistence). Public flags only; no secrets.
// Master build gate: when false, the worker does not poll Supabase and no card mounts.
// Per-person labs switch WHATSAPP_BUSINESS (glanceSwitches) is still required when this is true.
export const WA_BUSINESS = {
  enabled: false,
  supabaseUrl: 'https://zjquktirlrhbqcnkfaok.supabase.co',
};
