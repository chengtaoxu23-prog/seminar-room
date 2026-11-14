import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import type { Material } from "../src/shared/workspace.js";
import { SchemaError } from "./validation.js";
export const digest = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
export const materialKey = (m: Material) => `${m.id}@${m.revision}`;
export function publicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export interface SearchProvider {
  search(
    query: string,
    signal: AbortSignal,
  ): Promise<{ title: string; url: string; snippet: string }[]>;
}
export const searchCapability = {
  configured: false,
  reason:
    "No search provider configured. Import public URLs or files; no fabricated search results.",
};
async function publicDns(
  hostname: string,
): Promise<{ address: string; family: number }[]> {
  // Fixed public resolver for TUN fake-IP networks. No caller-controlled resolver or network target.
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "1.1.1.1",
        servername: "cloudflare-dns.com",
        path: "/dns-query?name=" + encodeURIComponent(hostname) + "&type=A",
        headers: { Host: "cloudflare-dns.com", Accept: "application/dns-json" },
      },
      (res) => {
        let body = "";
        res.on("error", () => reject(new SchemaError("公网 DNS 响应读取失败")));
        res.on("data", (b) => {
          body += b.toString();
          if (body.length > 32000) req.destroy();
        });
        res.on("end", () => {
          try {
            if (res.statusCode !== 200) throw Error();
            const data = JSON.parse(body);
            const records = (data.Answer ?? [])
              .filter((a: any) => a.type === 1)
              .map((a: any) => ({ address: a.data as string, family: 4 }));
            if (
              !records.length ||
              records.some((a: any) => !publicAddress(a.address))
            )
              throw Error();
            resolve(records);
          } catch {
            reject(new SchemaError("公网 DNS 核验失败"));
          }
        });
      },
    );
    const timer = setTimeout(() => req.destroy(Error("dns_timeout")), 10000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(new SchemaError("公网 DNS 查询失败")));
  });
}
export async function fetchPublicUrl(
  input: string,
  redirects = 0,
): Promise<{ buffer: Buffer; url: string; contentType: string }> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SchemaError("URL 无效");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && !["80", "443"].includes(url.port)) ||
    url.hostname.length > 253 ||
    url.href.length > 3000
  )
    throw new SchemaError("只允许无凭证的公开 HTTP/HTTPS 标准端口 URL");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (/(^|\.)(localhost|local|internal|home|lan|test|invalid)$/i.test(hostname))
    throw new SchemaError("禁止访问本机和内网地址");
  let addresses = await dns.lookup(hostname, { all: true }).catch(() => {
    throw new SchemaError("公开来源 DNS 解析失败");
  });
  if (
    addresses.length &&
    addresses.every((a) => /^198\.(18|19)\./.test(a.address))
  )
    addresses = await publicDns(hostname);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new SchemaError("SSRF 防护：来源解析到非公开地址");
  const pinned = addresses.find((a) => a.family === 4) ?? addresses[0];
  return new Promise((resolve, reject) => {
    const fail = (message: string) => reject(new SchemaError(message));
    const request = (url.protocol === "https:" ? https : http).get(
      url,
      {
        headers: {
          "User-Agent": "GTM-RedTeam/0.4 (+public-source-research)",
          Accept: "text/html,application/pdf,text/plain,text/csv",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, options, cb: any) =>
          (options as any).all
            ? cb(null, [pinned])
            : cb(null, pinned.address, pinned.family),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.resume();
          if (redirects >= 3 || !response.headers.location) {
            fail("网页重定向超过上限");
            return;
          }
          const next = new URL(response.headers.location, url);
          if (url.protocol === "https:" && next.protocol !== "https:") {
            fail("禁止 HTTPS 降级重定向");
            return;
          }
          void fetchPublicUrl(next.href, redirects + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          response.resume();
          fail(`公开网页获取失败（HTTP ${status}）`);
          return;
        }
        if (
          response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity"
        ) {
          response.resume();
          fail("不接受压缩网页响应");
          return;
        }
        if (Number(response.headers["content-length"] ?? 0) > 8_000_000) {
          response.destroy();
          fail("网页超过 8 MB 上限");
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "");
        if (
          !/text\/html|application\/xhtml\+xml|application\/pdf|text\/plain|text\/csv/i.test(
            contentType,
          )
        ) {
          response.resume();
          fail("网页内容类型不受支持");
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (b: Buffer) => {
          bytes += b.length;
          if (bytes > 8_000_000) {
            response.destroy();
            fail("网页超过 8 MB 上限");
          } else chunks.push(b);
        });
        response.on("end", () =>
          resolve({
            buffer: Buffer.concat(chunks),
            url: url.href,
            contentType,
          }),
        );
        response.on("error", () => fail("网页读取失败"));
      },
    );
    const timeout = setTimeout(() => request.destroy(Error("timeout")), 20000);
    request.on("error", (error: NodeJS.ErrnoException) =>
      fail("公开来源连接失败或超时（" + (error.code ?? "network_error") + "）"),
    );
    request.on("close", () => clearTimeout(timeout));
  });
}
export async function ingestMaterial(
  buffer: Buffer,
  name: string,
  url?: string,
): Promise<Material> {
  if (!buffer.length || buffer.length > 20_000_000)
    throw new SchemaError("文件必须介于 1 字节和 20 MB");
  if (name.length > 240 || /[\x00-\x1f/\\]/.test(name))
    throw new SchemaError("文件名无效");
  const format = name.split(".").at(-1)?.toLowerCase();
  if (
    !format ||
    !["pdf", "docx", "xlsx", "csv", "txt", "md", "html"].includes(format)
  )
    throw new SchemaError("支持 PDF / DOCX / XLSX / CSV / TXT / MD / HTML");
  const parsed = await new Promise<any>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("./material-worker.ts", import.meta.url)),
      ],
      {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
        },
      },
    );
    let output = "",
      settled = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new SchemaError("文件解析超时，原文不会登记为已解析"));
    }, 30000);
    child.stdout.on("data", (b) => {
      output += b.toString();
      if (output.length > 16_000_000) {
        child.kill();
        reject(new SchemaError("解析结果超过容量限制"));
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new SchemaError("解析进程无法启动"));
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      try {
        const result = JSON.parse(output);
        if (!result.ok) throw Error();
        resolve(result.parsed);
      } catch {
        reject(
          new SchemaError(
            "文件解析失败：格式损坏、加密、不受支持或超限；未生成证据。",
          ),
        );
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(
      JSON.stringify({ format, base64: buffer.toString("base64") }),
    );
  });
  const fileHash = digest(buffer);
  return {
    id: "src-" + digest(url ?? name).slice(0, 24),
    revision: "sha256:" + digest(fileHash + ":material-v2"),
    fileHash,
    name,
    title: parsed.title ?? name,
    format,
    ...(url ? { url } : {}),
    ...(parsed.publishedAt
      ? {
          publishedAt: parsed.publishedAt,
          publicationBasis: parsed.publicationBasis,
        }
      : {}),
    acquiredAt: new Date().toISOString(),
    bytes: buffer.length,
    parserVersion: "material-v2",
    units: parsed.units,
    warnings: parsed.warnings,
  };
}
