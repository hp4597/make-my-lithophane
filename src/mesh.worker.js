import { buildMesh, binarySTL, meshStats } from "./geometry.js";
self.onmessage = ({ data }) => {
  try {
    const mesh = buildMesh(
      data.settings,
      data.pixels,
      data.nx,
      data.ny,
      data.rgba,
    );
    if (data.export === true) {
      const bytes = binarySTL(mesh);
      self.postMessage({ id: data.id, bytes, stats: meshStats(mesh) }, [
        bytes.buffer,
      ]);
    } else
      self.postMessage({ id: data.id, mesh, stats: meshStats(mesh) }, [
        mesh.positions.buffer,
        mesh.indices.buffer,
        mesh.colors.buffer,
        mesh.uvs.buffer,
      ]);
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
