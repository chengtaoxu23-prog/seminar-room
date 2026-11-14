import yauzl from "yauzl";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { load } from "cheerio";
import type { MaterialUnit } from "../src/shared/workspace.js";
import { parseCSV } from "./research-api.js";
const list = (v: any): any[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const xml = (s: string, ordered = false) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(s) || XMLValidator.validate(s) !== true)
    throw Error("invalid_xml");
  return new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    preserveOrder: ordered,
  }).parse(s);
};
const xmlText = (v: any): string =>
  typeof v === "string"
    ? v
    : typeof v === "number"
      ? String(v)
      : Array.isArray(v)
        ? v.map(xmlText).join("")
        : v && typeof v === "object"
          ? Object.entries(v)
              .filter(
                ([k]) =>
                  !k.startsWith("@_") &&
                  k !== ":@" &&
                  k !== "w:pPr" &&
                  k !== "w:rPr",
              )
              .map(([k, x]) =>
                k === "w:tab"
                  ? "\t"
                  : k === "w:br"
                    ? "\n"
                    : k === "w:p"
                      ? xmlText(x) + "\n"
                      : xmlText(x),
              )
              .join("")
          : "";
async function unzip(buffer: Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (err, zip) => {
        if (err || !zip) {
          reject(Error("invalid_office_zip"));
          return;
        }
        const result = new Map<string, string>();
        let total = 0,
          count = 0,
          ended = false;
        const fail = () => {
          if (!ended) {
            ended = true;
            zip.close();
            reject(Error("unsafe_or_oversized_office_zip"));
          }
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (!ended) {
            ended = true;
            resolve(result);
          }
        });
        zip.on("entry", (entry: yauzl.Entry) => {
          total += entry.uncompressedSize;
          count++;
          if (
            count > 10000 ||
            total > 75_000_000 ||
            entry.uncompressedSize > 25_000_000 ||
            entry.isEncrypted() ||
            entry.fileName.includes("..") ||
            entry.fileName.startsWith("/")
          ) {
            fail();
            return;
          }
          if (
            !/^(word\/document\.xml|xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml))$/.test(
              entry.fileName,
            )
          ) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) {
              fail();
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on("data", (b: Buffer) => {
              size += b.length;
              if (size > 25_000_000) {
                stream.destroy();
                fail();
              } else chunks.push(b);
            });
            stream.on("error", fail);
            stream.on("end", () => {
              if (!ended) {
                result.set(
                  entry.fileName,
                  Buffer.concat(chunks).toString("utf8"),
                );
                zip.readEntry();
              }
            });
          });
        });
        zip.readEntry();
      },
    ),
  );
}
export async function parseMaterial(
  buffer: Buffer,
  format: string,
): Promise<{
  title?: string;
  publishedAt?: string;
  publicationBasis?: string;
  units: MaterialUnit[];
  warnings: string[];
}> {
  const units: MaterialUnit[] = [],
    warnings: string[] = [];
  const add = (
    text: string,
    locator: string,
    extra: Partial<MaterialUnit> = {},
  ) => {
    if (!text.trim()) {
      if (extra.rawValue === undefined) return;
      text = "Raw value (escaped): " + JSON.stringify(extra.rawValue);
    }
    // All text retained. Long paragraphs split with explicit character ranges.
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i += 3500)
      units.push({
        id: `u${units.length + 1}`,
        text: chars.slice(i, i + 3500).join(""),
        locator:
          locator +
          (chars.length > 3500
            ? ` / chars ${i + 1}-${Math.min(i + 3500, chars.length)}`
            : ""),
        ...extra,
      });
    if (units.length > 30000) throw Error("too_many_material_units");
  };
  let title: string | undefined,
    publishedAt: string | undefined,
    publicationBasis: string | undefined;
  if (format === "pdf") {
    if (buffer.subarray(0, 5).toString() !== "%PDF-")
      throw Error("invalid_pdf_signature");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const doc = await task.promise;
    try {
      if (doc.numPages > 1000) throw Error("pdf_page_limit");
      for (let p = 1; p <= doc.numPages; p++) {
        const content = await (await doc.getPage(p)).getTextContent();
        let text = "",
          para = 0,
          lastY: number | null = null;
        const flush = () => {
          if (text.trim()) add(text.trim(), `Page ${p} / paragraph ${++para}`);
          text = "";
        };
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5];
          if (lastY !== null && Math.abs(y - lastY) > 22) flush();
          text += item.str + (item.hasEOL ? "\n" : " ");
          lastY = y;
        }
        flush();
        if (!para)
          warnings.push(
            `Page ${p}: no text layer; OCR required, not parsed as evidence.`,
          );
      }
    } finally {
      await task.destroy();
    }
  } else if (format === "docx") {
    const files = await unzip(buffer),
      raw = files.get("word/document.xml");
    if (!raw) throw Error("missing_docx_document");
    const body = xml(raw, true)
      .find((x: any) => x["w:document"])
      ?.["w:document"].find((x: any) => x["w:body"])?.["w:body"];
    if (!body) throw Error("invalid_docx_body");
    let p = 0,
      t = 0;
    for (const node of body) {
      if (node["w:p"]) {
        p++;
        const style = JSON.stringify(node["w:p"]).match(/Heading[1-6]/i)?.[0];
        add(xmlText(node["w:p"]), `${style ?? "Paragraph"} ${p}`);
      } else if (node["w:tbl"]) {
        t++;
        let r = 0;
        for (const row of node["w:tbl"])
          if (row["w:tr"]) {
            r++;
            let c = 0;
            for (const cell of row["w:tr"])
              if (cell["w:tc"])
                add(
                  xmlText(cell["w:tc"]),
                  `Table ${t} / row ${r} / cell ${++c}`,
                );
          }
      }
    }
    warnings.push(
      "DOCX locations refer to document XML order; floating text boxes, headers and footnotes are outside this parser scope.",
    );
  } else if (format === "xlsx") {
    const files = await unzip(buffer),
      workbook = files.get("xl/workbook.xml"),
      rels = files.get("xl/_rels/workbook.xml.rels");
    if (!workbook || !rels) throw Error("invalid_xlsx_workbook");
    const strings = list(
        xml(files.get("xl/sharedStrings.xml") ?? "<sst/>").sst?.si,
      ).map(xmlText),
      relationships = list(xml(rels).Relationships.Relationship);
    for (const sheet of list(xml(workbook).workbook.sheets.sheet)) {
      const rel = relationships.find((r: any) => r["@_Id"] === sheet["@_r:id"]);
      if (!rel || rel["@_TargetMode"] === "External")
        throw Error("invalid_sheet_relationship");
      const target = rel["@_Target"].replace(/^\//, "");
      const key = target.startsWith("xl/")
        ? target
        : `xl/${target.replace(/^\.\//, "")}`;
      const raw = files.get(key);
      if (!raw) throw Error("missing_sheet_xml");
      for (const row of list(xml(raw).worksheet.sheetData?.row))
        for (const cell of list(row.c)) {
          const address = cell["@_r"];
          if (!/^[A-Z]+[1-9][0-9]*$/.test(address))
            throw Error("invalid_cell_address");
          const rawValue = cell.v === undefined ? "" : xmlText(cell.v),
            type = cell["@_t"];
          const value =
            type === "s"
              ? strings[Number(rawValue)]
              : type === "inlineStr"
                ? xmlText(cell.is)
                : rawValue;
          if (value === undefined) throw Error("invalid_shared_string");
          const formula = cell.f === undefined ? undefined : xmlText(cell.f);
          add(
            formula !== undefined
              ? `Formula: ${formula || "(shared/array formula; see original XML)"}\nCached value: ${cell.v === undefined ? "unknown" : value}`
              : String(value),
            `Sheet ${sheet["@_name"]} / Cell ${address}`,
            {
              rawValue,
              ...(formula !== undefined
                ? { formula, cachedValue: cell.v === undefined ? null : value }
                : {}),
            },
          );
        }
    }
    warnings.push(
      "Formula values are saved workbook caches, never recalculated. Shared/array formula dependencies and number-format display require inspection of the original workbook.",
    );
  } else {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (raw.includes("\u0000")) throw Error("binary_text_not_supported");
    if (format === "csv") {
      const rows = parseCSV(raw);
      rows.forEach((r, i) =>
        r.forEach((v, j) =>
          add(v, `CSV row ${i + 1} / column ${j + 1}`, { rawValue: v }),
        ),
      );
    } else if (format === "html") {
      const $ = load(raw);
      title = $("title").first().text().trim() || undefined;
      const date =
        $('meta[property="article:published_time"]').attr("content") ??
        $('meta[name="date"]').attr("content");
      if (
        date &&
        /^\d{4}-\d{2}-\d{2}/.test(date) &&
        Number.isFinite(Date.parse(date))
      ) {
        publishedAt = new Date(date).toISOString();
        publicationBasis =
          "Publisher-declared HTML metadata; not independently verified";
      }
      $("script,style,noscript,svg,iframe,nav,footer,header,form").remove();
      const root = $("main").length ? $("main") : $("body");
      const blocks = new Set([
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "li",
        "td",
        "th",
        "pre",
        "blockquote",
        "div",
        "section",
        "article",
        "tr",
        "dl",
        "dt",
        "dd",
        "table",
        "ul",
        "ol",
      ]);
      let block = 0;
      const walk = (node: any) => {
        let pending = "";
        const flush = () => {
          if (pending.trim())
            add(
              pending.trim(),
              `HTML block ${++block} / ${node.tagName ?? "body"}`,
            );
          pending = "";
        };
        for (const child of node.children ?? []) {
          if (child.type === "text") pending += child.data;
          else if (child.tagName === "br") pending += "\n";
          else if (blocks.has(child.tagName)) {
            flush();
            walk(child);
          } else pending += $(child).text();
        }
        flush();
      };
      root.each((_i, node) => walk(node));
      warnings.push(
        "Public HTML text snapshot; JavaScript is never executed. Navigation, scripts, forms and page furniture are excluded; original HTML retained. Publisher metadata is not independently verified.",
      );
    } else if (["txt", "md"].includes(format))
      raw
        .replace(/\r\n?/g, "\n")
        .split(/\n\s*\n/)
        .forEach((p, i) => add(p, `Paragraph ${i + 1}`));
    else throw Error("unsupported_material_format");
  }
  if (!units.length)
    throw Error("no_extractable_text_ocr_or_manual_review_required");
  if (units.reduce((n, u) => n + u.text.length, 0) > 4_000_000)
    throw Error("extracted_text_limit_no_silent_truncation");
  return { title, publishedAt, publicationBasis, units, warnings };
}
