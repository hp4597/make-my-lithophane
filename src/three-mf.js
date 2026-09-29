import { zipSync, strToU8 } from "fflate";
const xmlEscape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll(">", "&gt;");
export function threeMF(parts, title = "Lithophane") {
  let resources =
    '<basematerials id="1">' +
    parts
      .map(
        (p) =>
          `<base name="${xmlEscape(p.name)}" displaycolor="${p.color || "#FFFFFFFF"}"/>`,
      )
      .join("") +
    "</basematerials>";
  parts.forEach((part, j) => {
    const { positions: p, indices: i } = part.mesh,
      vertices = [],
      triangles = [];
    for (let k = 0; k < p.length; k += 3)
      vertices.push(
        `<vertex x="${p[k].toFixed(5)}" y="${p[k + 1].toFixed(5)}" z="${p[k + 2].toFixed(5)}"/>`,
      );
    for (let k = 0; k < i.length; k += 3)
      triangles.push(
        `<triangle v1="${i[k]}" v2="${i[k + 1]}" v3="${i[k + 2]}"/>`,
      );
    resources += `<object id="${j + 2}" type="model" name="${xmlEscape(part.name)}" pid="1" pindex="${j}"><mesh><vertices>${vertices.join("")}</vertices><triangles>${triangles.join("")}</triangles></mesh></object>`;
  });
  const assembly = parts.length + 2;
  resources += `<object id="${assembly}" type="model" name="${xmlEscape(title)}"><components>${parts.map((_, j) => `<component objectid="${j + 2}"/>`).join("")}</components></object>`;
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${xmlEscape(title)}</metadata><resources>${resources}</resources><build><item objectid="${assembly}"/></build></model>`;
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      ),
      "3D/3dmodel.model": strToU8(model),
    },
    { level: 3 },
  );
}
