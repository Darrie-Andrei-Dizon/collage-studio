// Minimal stand-in for expo-file-system's File/Paths when running in Node.
const fs = require('fs');
const path = require('path');
class File {
  constructor(dir, name) {
    this.path = path.join(dir.p, name);
    this.uri = 'file://' + this.path;
  }
  create() { fs.writeFileSync(this.path, ''); }
  async write(bytes) { fs.writeFileSync(this.path, Buffer.from(bytes)); }
}
module.exports = { File, Paths: { cache: { p: process.env.OUT_DIR } } };
