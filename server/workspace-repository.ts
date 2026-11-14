import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Material, WorkspaceState } from "../src/shared/workspace.js";
import { digest } from "./research-materials.js";
const queues = new Map<string, Promise<unknown>>();
const originalQueues = new Map<string, Promise<string>>();
export class WorkspaceRepository {
  readonly file: string;
  constructor(readonly dir: string) {
    this.file = path.resolve(dir, "workspace.json");
  }
  async load(): Promise<WorkspaceState> {
    try {
      const envelope = JSON.parse(await fs.readFile(this.file, "utf8"));
      if (
        digest(JSON.stringify(envelope.state)) !== envelope.hash ||
        envelope.state.schemaVersion !== "research-workspace-v1"
      )
        throw Error();
      return envelope.state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return {
          schemaVersion: "research-workspace-v1",
          revision: 0,
          projects: [],
          materials: [],
          runs: [],
        };
      throw Error(
        "Research workspace integrity failure; original retained, refusing overwrite",
      );
    }
  }
  async update(
    fn: (s: WorkspaceState) => void | Promise<void>,
  ): Promise<WorkspaceState> {
    const previous = queues.get(this.file) ?? Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        const state = await this.load();
        await fn(state);
        state.revision++;
        await fs.mkdir(this.dir, { recursive: true });
        const tmp = this.file + "." + randomUUID() + ".tmp";
        const handle = await fs.open(tmp, "wx");
        try {
          await handle.writeFile(
            JSON.stringify({ state, hash: digest(JSON.stringify(state)) }),
          );
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          await fs.copyFile(this.file, this.file + ".bak");
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        await fs.rename(tmp, this.file);
        return structuredClone(state);
      });
    queues.set(this.file, work);
    try {
      return await work;
    } finally {
      if (queues.get(this.file) === work) queues.delete(this.file);
    }
  }
  async saveOriginal(material: Material, buffer: Buffer): Promise<void> {
    if (digest(buffer) !== material.fileHash)
      throw Error("Original material does not match registered hash");
    await this.saveRaw(buffer);
  }
  async saveRaw(buffer: Buffer): Promise<string> {
    const fileHash = digest(buffer);
    const file = path.join(this.dir, "originals", fileHash);
    const previous = originalQueues.get(file) ?? Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.join(this.dir, "originals"), { recursive: true });
        try {
          const h = await fs.open(file, "wx");
          try {
            await h.writeFile(buffer);
            await h.sync();
          } finally {
            await h.close();
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          const old = await fs.readFile(file);
          if (digest(old) !== fileHash)
            throw Error("Original material integrity failure");
        }
        return fileHash;
      });
    originalQueues.set(file, work);
    try {
      return await work;
    } finally {
      if (originalQueues.get(file) === work) originalQueues.delete(file);
    }
  }
  async original(material: Material): Promise<Buffer> {
    const b = await fs.readFile(
      path.join(this.dir, "originals", material.fileHash),
    );
    if (digest(b) !== material.fileHash)
      throw Error("Original material hash mismatch");
    return b;
  }
}
