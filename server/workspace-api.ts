import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { RuntimeProvider } from "./gtm-runtime.js";
import { WorkspaceRepository } from "./workspace-repository.js";
import { ResearchRepository } from "./research-repository.js";
import { WorkspaceEngine } from "./workspace-engine.js";
import {
  fetchPublicUrl,
  ingestMaterial,
  materialKey,
  searchCapability,
} from "./research-materials.js";
import { researchReport } from "./workspace-report.js";
import { workspaceDeltas } from "./workspace-deltas.js";
import { SchemaError } from "./validation.js";
const text = (v: unknown, max = 12000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new SchemaError("请输入有效且未超限的文本");
  return v.trim();
};
const fields = (v: any, keys: string[]) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw new SchemaError("不支持的输入字段");
};
export function mountWorkspaceApi(
  app: Express,
  repo: WorkspaceRepository,
  research: ResearchRepository,
  runtime?: RuntimeProvider,
) {
  const engine = new WorkspaceEngine(repo, research, runtime),
    base = "/api/gtm/workspace";
  const wrap =
    (fn: (q: Request, r: Response) => Promise<void>) =>
    (q: Request, r: Response, n: NextFunction) => {
      void fn(q, r).catch(n);
    };
  app.use(base, (q, r, n) => {
    if (
      q.headers.origin &&
      q.headers.origin !== `${q.protocol}://${q.headers.host}`
    ) {
      r.status(403).json({ error: "Cross-origin workspace access denied" });
      return;
    }
    n();
  });
  app.get(
    base,
    wrap(async (_q, r) => {
      // Run completion is persisted after ledger commit; read in that order to
      // avoid returning a completed run alongside a pre-commit hypothesis list.
      const state = await repo.load(),
        ledger = await research.load();
      for (const run of state.runs) run.deltas = workspaceDeltas(run, ledger);
      r.json({
        state,
        ledger,
        provider: runtime ? { mode: runtime.mode, model: runtime.model } : null,
        search: searchCapability,
      });
    }),
  );
  app.post(
    base + "/projects",
    wrap(async (q, r) => {
      fields(q.body, ["name", "brief", "market", "customer"]);
      const p = {
        id: randomUUID(),
        name: text(q.body.name, 200),
        brief: text(q.body.brief),
        market: text(q.body.market, 500),
        customer: text(q.body.customer, 500),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        materialKeys: [] as string[],
      };
      await repo.update((s) => {
        if (s.projects.length >= 100) throw new SchemaError("本地项目上限 100");
        s.projects.push(p);
      });
      r.status(201).json(p);
    }),
  );
  app.post(
    base + "/projects/:id/materials",
    wrap(async (q, r) => {
      fields(q.body, ["name", "base64", "url"]);
      const state = await repo.load(),
        project = state.projects.find((p) => p.id === q.params.id);
      if (!project) throw new SchemaError("研究项目不存在");
      let buffer: Buffer, name: string, url: string | undefined;
      if (q.body.url) {
        if (q.body.base64 || q.body.name)
          throw new SchemaError("URL 和文件上传不能混用");
        const fetched = await fetchPublicUrl(text(q.body.url, 3000));
        buffer = fetched.buffer;
        url = fetched.url;
        name = fetched.contentType.includes("pdf")
          ? "web-source.pdf"
          : fetched.contentType.includes("csv")
            ? "web-source.csv"
            : fetched.contentType.includes("html")
              ? "web-source.html"
              : "web-source.txt";
      } else {
        name = text(q.body.name, 240);
        const encoded = text(q.body.base64, 27_000_000);
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
          throw new SchemaError("文件编码无效");
        buffer = Buffer.from(encoded, "base64");
      }
      if (!buffer.length || buffer.length > 20_000_000)
        throw new SchemaError("文件必须介于 1 字节和 20 MB");
      const fileHash = await repo.saveRaw(buffer);
      let material;
      try {
        material = await ingestMaterial(buffer, name, url);
      } catch (e) {
        await repo.update((s) => {
          const p = s.projects.find((p) => p.id === project.id)!;
          (p.imports ??= []).push({
            id: randomUUID(),
            at: new Date().toISOString(),
            name,
            ...(url ? { url } : {}),
            fileHash,
            classification: "failed",
            reason:
              "Parsing failed; raw bytes retained, not registered as evidence.",
          });
        });
        throw e;
      }
      let duplicate = false,
        key = materialKey(material);
      await repo.update((s) => {
        const p = s.projects.find((p) => p.id === project.id)!;
        const existing = s.materials.find(
          (m) =>
            m.fileHash === material.fileHash &&
            m.revision === material.revision,
        );
        if (existing) {
          key = materialKey(existing);
          duplicate = p.materialKeys.includes(key);
        } else s.materials.push(material);
        if (!duplicate) {
          if (p.materialKeys.length >= 100)
            throw new SchemaError("项目材料上限 100");
          p.materialKeys.push(key);
          p.updatedAt = new Date().toISOString();
        }
        (p.imports ??= []).push({
          id: randomUUID(),
          at: new Date().toISOString(),
          name,
          ...(url ? { url } : {}),
          fileHash,
          materialKey: key,
          classification: duplicate ? "duplicate" : "new",
          reason: duplicate
            ? "Identical file hash; no new evidence or model request."
            : "Original bytes and complete parsed units retained.",
        });
      });
      r.status(duplicate ? 200 : 201).json({
        materialKey: key,
        duplicate,
        classification: duplicate ? "duplicate" : "new",
        message: duplicate
          ? "内容哈希相同，不重复加入或调用模型"
          : "原件和完整解析结果已保存",
      });
    }),
  );
  app.get(
    base + "/materials/:hash/original",
    wrap(async (q, r) => {
      const material = (await repo.load()).materials.find(
        (m) => m.fileHash === q.params.hash,
      );
      if (!material) throw new SchemaError("来源不存在");
      r.attachment(material.name)
        .type("application/octet-stream")
        .send(await repo.original(material));
    }),
  );
  app.post(
    base + "/retrieve",
    wrap(async (q, r) => {
      fields(q.body, ["materialKey", "query", "offset", "limit"]);
      const m = (await repo.load()).materials.find(
        (m) => materialKey(m) === q.body.materialKey,
      );
      if (!m) throw new SchemaError("来源不存在");
      const query = String(q.body.query ?? "").toLowerCase();
      if (query.length > 500) throw new SchemaError("检索词超限");
      const offset = q.body.offset ?? 0,
        limit = q.body.limit ?? 50;
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
        throw new SchemaError("检索范围无效");
      const units = m.units.filter(
        (u) =>
          !query ||
          u.text.toLowerCase().includes(query) ||
          u.locator.toLowerCase().includes(query),
      );
      r.json({
        total: units.length,
        offset,
        units: units.slice(offset, offset + limit),
      });
    }),
  );
  app.post(
    base + "/projects/:id/runs",
    wrap(async (q, r) => {
      fields(q.body, ["kind", "consentToSend"]);
      if (!["plan", "research", "delta"].includes(q.body.kind))
        throw new SchemaError("研究任务类型无效");
      const run = await engine.create(
        q.params.id,
        q.body.kind,
        q.body.consentToSend === true,
      );
      engine.launch(run.id);
      r.status(202).json(run);
    }),
  );
  app.post(
    base + "/runs/:id/resume",
    wrap(async (q, r) => {
      fields(q.body, []);
      await engine.resume(q.params.id);
      r.status(202).json(await engine.run(q.params.id));
    }),
  );
  app.get(
    base + "/projects/:id/report",
    wrap(async (q, r) => {
      const s = await repo.load(),
        project = s.projects.find((p) => p.id === q.params.id);
      if (!project) throw new SchemaError("研究项目不存在");
      const run = [...s.runs]
        .reverse()
        .find(
          (run) =>
            run.projectId === project.id &&
            run.kind !== "plan" &&
            run.status === "completed",
        );
      if (!run) throw new SchemaError("真实研究尚未完成，不能导出完整报告");
      const markdown = researchReport(
        project,
        run,
        s.materials,
        await research.load(),
        s.runs,
      );
      r.attachment(`gtm-research-${project.id}.md`)
        .type("text/markdown")
        .send(markdown);
    }),
  );
  app.get(
    base + "/projects/:id/export",
    wrap(async (q, r) => {
      const s = await repo.load(),
        project = s.projects.find((p) => p.id === q.params.id);
      if (!project) throw new SchemaError("研究项目不存在");
      const ledger = await research.load(),
        hypotheses = ledger.hypotheses.filter(
          (h) => h.projectId === project.id,
        );
      r.attachment(`gtm-research-${project.id}.json`).json({
        exportVersion: "v0.4",
        project,
        materials: s.materials.filter((m) =>
          project.materialKeys.includes(materialKey(m)),
        ),
        runs: s.runs
          .filter((run) => run.projectId === project.id)
          .map((run) => ({ ...run, deltas: workspaceDeltas(run, ledger) })),
        hypotheses,
        decisionEvents: ledger.events.filter((e) =>
          hypotheses.some((h) => h.id === e.objectId),
        ),
        integrityNote:
          "Filtered events retain original hashes; full decisions.json required to validate the complete hash chain.",
      });
    }),
  );
  return engine;
}
