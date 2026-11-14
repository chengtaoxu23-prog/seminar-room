import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  DecisionEvent,
  Hypothesis,
  ResearchState,
} from "../src/shared/research.js";
import { SchemaError } from "./validation.js";
const queues = new Map<string, Promise<unknown>>();
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export class ResearchRepository {
  readonly file: string;
  constructor(directory: string) {
    this.file = path.resolve(directory, "decisions.json");
  }
  async load(): Promise<ResearchState> {
    let events: DecisionEvent[];
    try {
      events = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { revision: 0, hypotheses: [], events: [] };
      throw Error("决策记录不可读取；原文件保留，禁止覆盖。");
    }
    if (!Array.isArray(events)) throw Error("决策账本损坏");
    const hypotheses = new Map<string, Hypothesis>();
    let previous = "genesis";
    for (const event of events) {
      const { hash: stored, ...body } = event;
      if (
        body.previousHash !== previous ||
        hash(body) !== stored ||
        body.after.id !== body.objectId
      )
        throw Error("决策账本完整性检查失败，禁止覆盖。");
      previous = stored;
      hypotheses.set(event.objectId, event.after);
    }
    return structuredClone({
      revision: events.length,
      hypotheses: [...hypotheses.values()].map((h) => structuredClone(h)),
      events,
    });
  }
  async transact(
    requestId: string,
    expected: number,
    input: unknown,
    mutate: (
      state: ResearchState,
      emit: (
        type: string,
        h: Hypothesis,
        reason: string,
        evidenceIds?: string[],
        from?: Hypothesis["status"] | null,
      ) => void,
    ) => Promise<void> | void,
  ): Promise<ResearchState> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))
      throw new SchemaError("需要有效的幂等 requestId");
    const key = hash(input),
      previous = queues.get(this.file) ?? Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        const s = await this.load(),
          seen = s.events.find((e) => e.requestId === requestId);
        if (seen) {
          if (seen.requestHash !== key)
            throw new SchemaError("同一 requestId 不能用于不同操作");
          return s;
        }
        if (expected !== s.revision)
          throw new SchemaError("记录已变化，请刷新后重试");
        const emit = (
          type: string,
          h: Hypothesis,
          reason: string,
          evidenceIds: string[] = [],
          from: Hypothesis["status"] | null = h.status,
        ) => {
          h.updatedAt = new Date().toISOString();
          const body = {
            id: randomUUID(),
            at: h.updatedAt,
            objectId: h.id,
            actor:
              (input as { actor?: string })?.actor === "assistant_acceptance"
                ? ("assistant_acceptance" as const)
                : (input as { actor?: string })?.actor === "agent"
                  ? ("agent" as const)
                  : ("user" as const),
            ...(h.projectId ? { projectId: h.projectId } : {}),
            contractRevision: h.contracts.at(-1)!.revision,
            type,
            reason,
            evidenceIds,
            from,
            to: h.status,
            ...(type === "Transition Proposed"
              ? { proposedStatus: h.proposals.at(-1)!.to }
              : {}),
            requestId,
            requestHash: key,
            after: structuredClone(h),
            previousHash: s.events.at(-1)?.hash ?? "genesis",
          };
          s.events.push({ ...body, hash: hash(body) });
        };
        await mutate(s, emit);
        if (!s.events.some((e) => e.requestId === requestId))
          throw new SchemaError("操作没有产生事件");
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const temp = this.file + "." + randomUUID() + ".tmp";
        const handle = await fs.open(temp, "wx");
        try {
          await handle.writeFile(JSON.stringify(s.events), "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          try {
            await fs.copyFile(this.file, this.file + ".bak");
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          }
          await fs.rename(temp, this.file);
        } catch (e) {
          await fs.rm(temp, { force: true });
          throw e;
        }
        return this.load();
      });
    queues.set(this.file, work);
    try {
      return await work;
    } finally {
      if (queues.get(this.file) === work) queues.delete(this.file);
    }
  }
}
