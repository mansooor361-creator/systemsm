'use strict';

async function checkForKbUpdates(store) {
  const url = store.get('updateUrl');
  if (!url) return { ok: true, updates: [] };
  const { net } = require('electron');
  const res = await net.fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const manifest = await res.json();

  const known = store.get('kbVersions', {});
  const updates = (manifest.kb || []).filter(entry => {
    const prev = known[entry.id];
    return !prev || prev.version !== entry.version;
  });

  if (updates.length) {
    const next = { ...known };
    updates.forEach(u => { next[u.id] = { version: u.version, seenAt: Date.now() }; });
    store.set('kbVersions', next);
  }

  return { ok: true, updates, manifest };
}

module.exports = { checkForKbUpdates };
