#!/usr/bin/env node
// Issue a hand-made Glance Pro licence (testers, partners, press), or test the
// whole paid path before Stripe is switched on.
//
//   LICENSE_SECRET=<same value as in Netlify> node scripts/issue-comp-license.js you@example.com
//
// Prints the key to give the person and the SQL to run once in the Supabase
// SQL editor (project zjquktirlrhbqcnkfaok). The key is not stored anywhere;
// only its hash goes in the table.
const path = require('path');
const core = require(path.join(__dirname, '..', 'flow-landing', 'netlify', 'functions', 'verify-license', 'license-core.js'));

const email = String(process.argv[2] || '').trim().toLowerCase();
const secret = process.env.LICENSE_SECRET;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !secret) {
  console.error('Usage: LICENSE_SECRET=... node scripts/issue-comp-license.js person@example.com');
  process.exit(1);
}
const key = core.deriveKey(secret, 'comp|' + email + '|' + Date.now());
console.log('Licence key (give this to ' + email + '):\n  ' + key + '\n');
console.log('Run once in the Supabase SQL editor:\n');
console.log("  insert into public.licenses (key_hash, email, status) values ('" + core.hashKey(key) + "', '" + email.replace(/'/g, "''") + "', 'comp');");
