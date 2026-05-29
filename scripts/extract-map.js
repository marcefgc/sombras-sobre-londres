const fs = require('fs');
const path = require('path');

async function main() {
  const { pdf } = await import('pdf-to-img');
  const src = path.join(__dirname, '..', 'whitechapel_map_08.pdf');
  const out = path.join(__dirname, '..', 'public', 'assets', 'mapa.png');
  const doc = await pdf(src, { scale: 3 });
  for await (const page of doc) {
    fs.writeFileSync(out, page);
    console.log('Mapa escrito en', out);
    break; // solo la primera página
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
