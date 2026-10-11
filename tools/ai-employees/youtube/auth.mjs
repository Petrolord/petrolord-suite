#!/usr/bin/env node
// One-time Google OAuth consent for the YouTube channel manager.
//   node tools/ai-employees/youtube/auth.mjs [--port 8765]
// 1. Prints a consent URL. Open it, sign in as the channel owner, allow.
// 2. The browser lands on http://127.0.0.1:<port>/?code=... and shows an
//    error page (nothing listens there). Copy that whole address.
// 3. Paste it here. The refresh token is saved to /root/.youtube-oauth-token.json
//    (mode 600) and the authorised channel's title and id are printed.
// Tokens are never printed.
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  readClient, pkcePair, consentUrl, parseRedirect, exchangeCode, saveRefreshToken, tokenProvider, CLIENT_FILE, TOKEN_FILE,
} from './lib/oauth.mjs';
import { createYouTubeClient } from './lib/youtube.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};

async function main() {
  const client = readClient(CLIENT_FILE);
  const port = Number(arg('port', '8765'));
  const redirectUri = `http://127.0.0.1:${port}/`;
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = pkcePair();

  console.log('\nOpen this URL in a browser signed in as the Petrolord channel owner:\n');
  console.log(consentUrl({ client, redirectUri, state, challenge }));
  console.log(`\nAfter you allow access the browser goes to ${redirectUri}?code=... and shows an error page. That is expected.`);
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const pasted = await rl.question('\nPaste the full address from the browser bar here: ');
  rl.close();

  const code = parseRedirect(pasted, state);
  const token = await exchangeCode({ client, code, verifier, redirectUri });
  if (!token.refresh_token) throw new Error('Google returned no refresh token. Remove the app at myaccount.google.com/permissions and run this again.');
  saveRefreshToken(token, TOKEN_FILE);
  console.log(`\nSaved the refresh token to ${TOKEN_FILE} (mode 600).`);

  const yt = createYouTubeClient({ getToken: tokenProvider() });
  const res = await yt.channelsMine('snippet');
  const ch = res?.items?.[0];
  if (!ch) console.log('Authorised, but this Google account has no YouTube channel.');
  else console.log(`Authorised channel: ${ch.snippet?.title} (${ch.id})`);
}

main().catch((e) => {
  console.error(`auth failed: ${e.message}`);
  process.exit(1);
});
