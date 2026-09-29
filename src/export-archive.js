import { Zip, ZipDeflate } from "fflate";
import { binarySTL } from "./geometry.js";

// Compress each entry immediately; never retain all uncompressed STL files.
export function exportArchive() {
  const chunks = [];
  let failure;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else chunks.push(data);
  });
  function entry(name) {
    const file = new ZipDeflate(name, { level: 3 });
    zip.add(file);
    return file;
  }
  return {
    add(name, bytes) {
      const file = entry(name);
      for (let i = 0; i < bytes.length; i += 1048576)
        file.push(bytes.subarray(i, i + 1048576), false);
      file.push(new Uint8Array(), true);
    },
    stl(name, mesh) {
      const file = entry(name),
        header = new Uint8Array(84);
      new DataView(header.buffer).setUint32(80, mesh.indices.length / 3, true);
      file.push(header, false);
      for (let i = 0; i < mesh.indices.length; i += 24576) {
        const bytes = binarySTL({
          ...mesh,
          indices: mesh.indices.subarray(i, i + 24576),
        });
        file.push(bytes.subarray(84), false);
      }
      file.push(new Uint8Array(), true);
    },
    finish() {
      zip.end();
      if (failure) throw failure;
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      return bytes;
    },
  };
}
