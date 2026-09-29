import { Zip, ZipDeflate, strToU8 } from "fflate";
const xmlEscape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll(">", "&gt;");
export function threeMF(parts, title = "Lithophane", options = {}) {
  const chunks = [];
  let failure;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else chunks.push(data);
  });
  const modelFile = new ZipDeflate("3D/3dmodel.model", { level: 3 });
  zip.add(modelFile);
  const emit = (text) => modelFile.push(strToU8(text), false);
  emit(
    `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Make My Lithophane</metadata><metadata name="Designer">Make My Lithophane</metadata><metadata name="Title">${xmlEscape(title)}</metadata><resources><basematerials id="1">`,
  );
  emit(
    parts
      .map(
        (p) =>
          `<base name="${xmlEscape(p.name)}" displaycolor="${p.color || "#FFFFFFFF"}"/>`,
      )
      .join(""),
  );
  emit("</basematerials>");
  parts.forEach((part, j) => {
    const { positions: p, indices: i } = part.mesh;
    const shift = part.translation || [0, 0, 0];
    emit(
      `<object id="${j + 2}" type="model" name="${xmlEscape(part.name)}" pid="1" pindex="${j}"><mesh><vertices>`,
    );
    let buffer = "";
    for (let k = 0; k < p.length; k += 3) {
      buffer += `<vertex x="${(p[k] + shift[0]).toFixed(5)}" y="${(p[k + 1] + shift[1]).toFixed(5)}" z="${(p[k + 2] + shift[2]).toFixed(5)}"/>`;
      if (k % 6144 === 0) {
        emit(buffer);
        buffer = "";
      }
    }
    emit(buffer + "</vertices><triangles>");
    buffer = "";
    for (let k = 0; k < i.length; k += 3) {
      buffer += `<triangle v1="${i[k]}" v2="${i[k + 1]}" v3="${i[k + 2]}"/>`;
      if (k % 6144 === 0) {
        emit(buffer);
        buffer = "";
      }
    }
    emit(buffer + "</triangles></mesh></object>");
  });
  const assembly = parts.length + 2;
  emit(
    `<object id="${assembly}" type="model" name="${xmlEscape(title)}"><components>${parts.map((_, j) => `<component objectid="${j + 2}"/>`).join("")}</components></object></resources><build><item objectid="${assembly}"/></build></model>`,
  );
  modelFile.push(new Uint8Array(), true);
  const metadata = {
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
  };
  // Keep the true generator identity. Bambu preserves part metadata on import;
  // global process hints still require user verification for third-party models.
  if (options.bambu) {
    const slots = { Cyan: 1, Magenta: 2, Yellow: 3, White: 4 };
    metadata["Metadata/model_settings.config"] =
      `<?xml version="1.0" encoding="UTF-8"?><config><object id="${assembly}"><metadata key="name" value="${xmlEscape(title)}"/><metadata key="layer_height" value="${options.layer}"/><metadata key="sparse_infill_density" value="100%"/>${parts.map((p, j) => `<part id="${j + 2}" subtype="normal_part"><metadata key="name" value="${xmlEscape(p.name)}"/><metadata key="extruder" value="${p.extruder || slots[p.name] || 4}"/></part>`).join("")}</object></config>`;
    metadata["Metadata/project_settings.config"] = JSON.stringify({
      layer_height: String(options.layer),
      initial_layer_print_height: String(options.firstLayer || options.layer),
      sparse_infill_density: "100%",
      sparse_infill_pattern: "rectilinear",
      filament_colour: ["#00BCD4", "#DC267F", "#F2D53C", "#FFFFFF"],
      filament_type: ["PLA", "PLA", "PLA", "PLA"],
    });
  }
  for (const [name, text] of Object.entries(metadata)) {
    const f = new ZipDeflate(name, { level: 3 });
    zip.add(f);
    f.push(strToU8(text), true);
  }
  zip.end();
  if (failure) throw failure;
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
