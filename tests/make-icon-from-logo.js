'use strict';

/* Builds build/icon.png from the official DaAIx logo mark:
 * center-crops to square and resizes to 1024x1024 (electron-builder
 * auto-generates ico/icns from a >=256px png). */

const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

(async () => {
  const src = path.join(__dirname, '..', 'renderer', 'assets', 'logo-mark.png');
  const out = path.join(__dirname, '..', 'build', 'icon.png');

  const img = await Jimp.read(src);
  img.autocrop({ tolerance: 0.002, cropOnlyFrames: false });
  const side = Math.min(img.getWidth(), img.getHeight());
  const x = Math.round((img.getWidth() - side) / 2);
  const y = Math.round((img.getHeight() - side) / 2);
  img.crop(x, y, side, side);
  const canvas = new Jimp(1024, 1024, 0x00000000);
  const inner = Math.round(1024 * 0.97);
  img.resize(inner, Jimp.AUTO);
  if (img.getHeight() > inner) img.resize(inner, inner);
  canvas.composite(img, Math.round((1024 - img.getWidth()) / 2), Math.round((1024 - img.getHeight()) / 2));
  await canvas.writeAsync(out);

  const size = fs.statSync(out).size;
  console.log('wrote', out, (size / 1024).toFixed(0) + 'KB');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
