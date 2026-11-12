// The demo desk's key: read forgivingly, never repeated, and the same three accounts from every way of
// pasting it. The server code never logs anything.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { concat, hexToBytes, keccak256, stringToBytes } from "viem";
import { privateKeyToAddress } from "viem/accounts";

import { BAD_KEY, LABELS, NO_KEY, cleanKey, deriveAll, deriveKey, keyProblem } from "../../lib/demo-key.ts";

const HEX = "4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";

test("the key is read forgivingly", () => {
  const spellings = [HEX, "0x" + HEX, "0X" + HEX.toUpperCase(), ` "${HEX}" `, `'0x${HEX}'`, `\`${HEX}\``, `0x${HEX.slice(0, 32)} ${HEX.slice(32)}\n`];
  for (const s of spellings) {
    assert.equal(keyProblem(s), "", JSON.stringify(s));
    assert.equal(cleanKey(s), "0x" + HEX);
  }
  const first = deriveAll(spellings[0]);
  for (const s of spellings) assert.deepEqual(deriveAll(s), first, "one key, one set of accounts");
});

test("an unusable key says exactly why, in words that never repeat it", () => {
  assert.equal(keyProblem(undefined), NO_KEY);
  assert.equal(keyProblem(""), NO_KEY);
  assert.equal(keyProblem('""'), NO_KEY);
  for (const bad of ["key", "0x1234", HEX + "00", "zz" + HEX.slice(2)]) {
    assert.equal(keyProblem(bad), BAD_KEY);
    assert.equal(deriveAll(bad), null);
    if (bad.length > 6) assert.ok(!BAD_KEY.includes(bad));
  }
});

test("three distinct accounts: keccak256 of the key's bytes and a label", () => {
  const all = deriveAll(HEX);
  assert.deepEqual(Object.keys(all).sort(), [...LABELS].sort());
  const addresses = new Set(Object.values(all).map((a) => a.address));
  assert.equal(addresses.size, 3);
  for (const label of LABELS) {
    const expected = keccak256(concat([hexToBytes("0x" + HEX), stringToBytes(label)]));
    assert.equal(deriveKey(HEX, label), expected);
    assert.equal(all[label].address, privateKeyToAddress(expected).toLowerCase());
    assert.notEqual(all[label].key, "0x" + HEX, "a derived key is never the key itself");
  }
});

test("the demo server and its routes never log, and answer with public addresses only", () => {
  for (const f of ["../../lib/demo-server.ts", "../../app/api/demo/status/route.ts", "../../app/api/demo/open/route.ts", "../../app/api/demo/join/route.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /console\./, f);
  }
  const server = readFileSync(new URL("../../lib/demo-server.ts", import.meta.url), "utf8");
  assert.equal((server.match(/process\.env\.DEMO_KEY/g) ?? []).length, 2, "the key is read in two places only");
  assert.doesNotMatch(server, /key:\s*a\[/, "no answer carries a derived key");
});
