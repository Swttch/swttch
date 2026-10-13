const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.SWTTCH_SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '..');

async function main() {
  for (const folder of ['symbol', 'horizontal', 'avatar', 'small']) {
    for (const filename of await fs.readdir(path.join(root, folder))) {
      if (!filename.endsWith('.svg')) continue;
      const input = path.join(root, folder, filename);
      const name = filename.slice(0, -4);
      const widths = folder === 'small' ? [16, 24, 32, 48, 64]
        : folder === 'avatar' ? [256, 512, 1024] : [1024];
      for (const width of widths) {
        await sharp(input, { density: 384 }).resize({ width })
          .png().toFile(path.join(root, folder, `${name}-${width}.png`));
      }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
