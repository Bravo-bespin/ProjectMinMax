import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefinitionStore } from '../definition-store.js';

async function withCache(run) {
  const dir = await mkdtemp(join(tmpdir(), 'minmax-definitions-'));
  try { await run(join(dir, 'cache.json')); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('concurrent duplicates fetch once; another launch uses the disk cache', () => withCache(async (file) => {
  let calls = 0;
  const store = createDefinitionStore({ file, fetchDefinition: async () => { calls++; return { name: 'Weapon' }; } });
  const values = await Promise.all(Array.from({ length: 20 }, () => store.get('Item', 1)));
  assert.equal(calls, 1); assert.equal(values.length, 20);
  await store.flush();
  const reopened = createDefinitionStore({ file, fetchDefinition: async () => assert.fail('Warm launch must not fetch') });
  assert.deepEqual(await reopened.get('Item', 1), { name: 'Weapon' });
}));
test('expired entries refresh and failed requests can retry', () => withCache(async (file) => {
  await writeFile(file, JSON.stringify({ version: 1, entries: [['Item:1', { savedAt: 0, value: { name: 'Old' } }]] }));
  let calls = 0;
  const store = createDefinitionStore({ file, now: () => 1000, maxAge: 100, fetchDefinition: async () => { if (++calls === 1) throw Error('Temporary failure'); return { name: 'New' }; } });
  await assert.rejects(store.get('Item', 1), /Temporary failure/);
  assert.deepEqual(await store.get('Item', 1), { name: 'New' });
  await store.flush();
}));
test('corrupt disk cache falls back to the network', () => withCache(async (file) => {
  await writeFile(file, 'invalid JSON');
  const store = createDefinitionStore({ file, fetchDefinition: async () => ({ good: true }) });
  assert.deepEqual(await store.get('Item', 1), { good: true });
  await store.flush();
}));
test('interactive lookups jump ahead of queued vault work and respect the concurrency limit', () => withCache(async (file) => {
  const started = [];
  const release = [];
  const store = createDefinitionStore({ file, concurrency: 1, fetchDefinition: async (_type, hash) => {
    started.push(hash); await new Promise((resolve) => release.push(resolve)); return { hash };
  } });
  const first = store.get('Item', 1, { background: true });
  while (!release.length) await new Promise((resolve) => setImmediate(resolve));
  const second = store.get('Item', 2, { background: true });
  const hover = store.get('Stat', 3);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [1]); release.shift()();
  await first;
  while (!release.length) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [1, 3]); release.shift()(); await hover;
  while (!release.length) await new Promise((resolve) => setImmediate(resolve));
  release.shift()(); await second; await store.flush();
}));

test('concurrent cache flushes handle a failed write without rejecting during shutdown', () => withCache(async (file) => {
  await mkdir(file); // Force the atomic rename to fail because the destination is a directory.
  const store = createDefinitionStore({ file, fetchDefinition: async () => ({ name: 'Weapon' }) });
  await store.get('Item', 1);
  await Promise.all([store.flush(), store.flush(), store.flush()]);
}));
