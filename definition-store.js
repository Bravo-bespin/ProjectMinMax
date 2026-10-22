import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

// Cache only public manifest definitions, never profile data or credentials.
export function createDefinitionStore({ file, fetchDefinition, maxAge = 86_400_000, concurrency = 6, now = Date.now }) {
  const cached = new Map();
  const pending = new Map();
  const queues = [[], []];
  let running = 0;
  let timer;
  let dirty = false;
  let saving;
  const ready = readFile(file, 'utf8').then((text) => {
    const data = JSON.parse(text);
    if (data.version !== 1 || !Array.isArray(data.entries)) return;
    for (const [key, entry] of data.entries) {
      if (entry?.value && now() - entry.savedAt < maxAge) cached.set(key, entry);
    }
  }).catch(() => {}); // A missing/corrupt cache must not prevent startup.

  function pump() {
    while (running < concurrency) {
      const job = queues[0].shift() ?? queues[1].shift();
      if (!job) break;
      running++;
      Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
  }
  async function flush() {
    clearTimeout(timer);
    await ready;
    if (saving) await saving.catch(() => {});
    if (!dirty) return;
    dirty = false;
    const entries = [...cached].slice(-4000);
    saving = (async () => {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, entries }));
      await rename(temporary, file);
    })();
    try { await saving; }
    catch { dirty = true; }
    finally { saving = undefined; }
  }
  function scheduleSave() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, 1000);
    timer.unref?.();
  }
  async function get(type, hash, { background = false } = {}) {
    await ready;
    const key = `${type}:${hash}`;
    const entry = cached.get(key);
    if (entry && now() - entry.savedAt < maxAge) return entry.value;
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise((resolve, reject) => {
      queues[background ? 1 : 0].push({ resolve, reject, run: async () => {
        const value = await fetchDefinition(type, hash);
        cached.set(key, { value, savedAt: now() });
        if (cached.size > 4000) cached.delete(cached.keys().next().value);
        scheduleSave();
        return value;
      } });
      pump();
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  return { get, flush };
}
