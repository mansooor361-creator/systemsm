'use strict';

const path = require('path');
const fs = require('fs');

class Store {
  constructor() {
    const { app } = require('electron');
    this.file = path.join(app.getPath('userData'), 'config.json');
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.data = {
        language: 'ar',
        theme: 'dark',
        updateUrl: 'https://smartk-ai.com/api/kb/manifest.json',
        updateIntervalMinutes: 60,
        llm: { baseUrl: '', apiKey: '', model: 'gpt-4o-mini' }
      };
    }
  }

  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this.flush();
  }

  setMany(patch) {
    Object.assign(this.data, patch);
    this.flush();
  }

  getAll() {
    return this.data;
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch { /* ignore */ }
  }
}

module.exports = { Store };
