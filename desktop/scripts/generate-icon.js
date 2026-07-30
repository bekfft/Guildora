const fs = require('node:fs');
const path = require('node:path');

const sizes = [16, 24, 32, 48, 64, 128, 256];

function makeBitmap(size) {
  const maskStride = Math.ceil(size / 32) * 4;
  const pixels = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size * 0.46;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = ((size - 1 - y) * size + x) * 4;
      const inside = Math.hypot(x - center, y - center) <= radius;
      if (!inside) continue;
      const bubble = x > size * 0.22 && x < size * 0.78 && y > size * 0.25 && y < size * 0.66;
      const tail = y >= size * 0.58 && y < size * 0.76 && x > size * 0.53 && x < size * 0.68 && x > (size * 0.48 + (y - size * 0.58) * 0.55);
      const light = bubble || tail;
      pixels[offset] = light ? 245 : 231;
      pixels[offset + 1] = light ? 245 : 101;
      pixels[offset + 2] = light ? 248 : 88;
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(pixels.length, 20);
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
}

const images = sizes.map(makeBitmap);
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  directory[entry] = size === 256 ? 0 : size;
  directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});

const target = path.join(__dirname, '..', 'build', 'icon.ico');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, Buffer.concat([directory, ...images]));
console.log(`Icon mit ${sizes.length} Größen erzeugt: ${target}`);
