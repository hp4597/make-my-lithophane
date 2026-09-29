// Duplicate only wrap-seam vertices in the display mesh; printable topology stays welded.
export function unwrapPreviewUVs(data) {
  const { uvs, positions, colors } = data,
    indices = data.indices.slice(),
    extra = [],
    map = new Map();
  for (let k = 0; k < indices.length; k += 3) {
    const ids = [indices[k], indices[k + 1], indices[k + 2]],
      us = ids.map((i) => uvs[i * 2]);
    if (Math.min(...us) < 0 || Math.max(...us) - Math.min(...us) <= 0.5)
      continue;
    for (let j = 0; j < 3; j++)
      if (us[j] < 0.5) {
        const id = ids[j];
        let next = map.get(id);
        if (next === undefined) {
          next = positions.length / 3 + extra.length;
          extra.push(id);
          map.set(id, next);
        }
        indices[k + j] = next;
      }
  }
  if (!extra.length) return data;
  const p = new Float32Array(positions.length + extra.length * 3),
    c = new Float32Array(p.length),
    u = new Float32Array(uvs.length + extra.length * 2);
  p.set(positions);
  c.set(colors);
  u.set(uvs);
  extra.forEach((id, j) => {
    const n = positions.length / 3 + j;
    p.set(positions.subarray(id * 3, id * 3 + 3), n * 3);
    c.set(colors.subarray(id * 3, id * 3 + 3), n * 3);
    u.set([uvs[id * 2] + 1, uvs[id * 2 + 1]], n * 2);
  });
  return { ...data, positions: p, colors: c, uvs: u, indices };
}
