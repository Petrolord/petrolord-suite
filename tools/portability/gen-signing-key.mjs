#!/usr/bin/env node
// Generate the .pld signing key pair (Project Portability PP5).
//
//   node tools/portability/gen-signing-key.mjs [key-id]
//
// Prints two things:
//   1. the PRIVATE JWK, to be set as an edge-function secret and never
//      committed:
//        supabase secrets set PLD_SIGNING_PRIVATE_JWK='<json>' PLD_SIGNING_KEY_ID='<key-id>'
//   2. the PUBLIC JWK, to be pasted into PUBLIC_KEYS in
//      src/lib/portability/signing.js under the same key id (committed;
//      it is public by design so packages verify offline).
// Rotation: generate a new pair with a new key id, add the public half to
// PUBLIC_KEYS (keep the old one), switch the secrets, redeploy pld-sign.

import { webcrypto } from 'node:crypto';

const keyId = process.argv[2] || `pld-${new Date().toISOString().slice(0, 7)}`;
const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
const pub = await webcrypto.subtle.exportKey('jwk', kp.publicKey);
delete pub.key_ops; delete pub.ext; delete pub.alg;

console.log(`Key id: ${keyId}\n`);
console.log('1) PRIVATE (secret, never commit):');
console.log(`supabase secrets set PLD_SIGNING_PRIVATE_JWK='${JSON.stringify(priv)}' PLD_SIGNING_KEY_ID='${keyId}'\n`);
console.log('2) PUBLIC (paste into PUBLIC_KEYS in src/lib/portability/signing.js):');
console.log(`  '${keyId}': ${JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y })},`);
