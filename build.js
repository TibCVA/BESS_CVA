// Assembles the single-file index.html from src/: template + styles + fonts + logo + data + app.
// Usage: node build.js
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const logoB64 = fs.readFileSync(path.join(__dirname, 'assets/logo-datako.png')).toString('base64');
const markB64 = fs.readFileSync(path.join(__dirname, 'assets/icon-180.png')).toString('base64');
const demo = read('src/demo-data.js');
let html = read('src/index.template.html');
html = html
  .replace('/*__FONTS__*/', () => read('src/fonts.css'))
  .replace('/*__STYLES__*/', () => read('src/styles.css'))
  .replace('/*__DATA__*/', () => demo)
  .replace('/*__APP__*/', () => read('src/app.js'))
  .replace(/__LOGO_B64__/g, () => logoB64)
  .replace(/__MARK_B64__/g, () => markB64);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`index.html written (${kb} KB)`);
