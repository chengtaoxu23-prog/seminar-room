import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SeminarSession } from '../src/shared/types.js';

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`找不到研讨会话 ${id}。`);
    this.name = 'SessionNotFoundError';
  }
}

const writeChains = new Map<string, Promise<void>>();

export class SessionStore {
  get directory(): string { return path.resolve(this.dir); }

  constructor(private readonly dir: string) {}

  private file(id: string): string {
    if (!ID_PATTERN.test(id)) throw new SessionNotFoundError(id);
    return path.join(this.directory, `${id}.json`);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async ids(): Promise<string[]> {
    return (await fs.readdir(this.dir))
      .filter(name => name.endsWith('.json') && ID_PATTERN.test(name.slice(0, -5)))
      .map(name => name.slice(0, -5));
  }

  async get(id: string): Promise<SeminarSession> {
    try {
      const file = this.file(id);
      while (writeChains.has(file)) await writeChains.get(file);
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw) as SeminarSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SessionNotFoundError(id);
      }
      throw error;
    }
  }

  save(session: SeminarSession): Promise<void> {
    const id = session.id;
    const file = this.file(id);
    const payload = `${JSON.stringify(session, null, 2)}\n`;
    const previous = writeChains.get(file) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(this.dir, { recursive: true });
        const temporary = path.join(this.dir, `.${id}.${randomUUID()}.tmp`);
        try {
          const handle = await fs.open(temporary, 'wx', 0o600);
          try { await handle.writeFile(payload, 'utf8'); await handle.sync(); }
          finally { await handle.close(); }
          await fs.rename(temporary, file);
        } finally {
          await fs.unlink(temporary).catch(error => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          });
        }
      })
      .finally(() => {
        if (writeChains.get(file) === next) writeChains.delete(file);
      });
    writeChains.set(file, next);
    return next;
  }

  /** Wait for writes from every store instance targeting this directory. */
  async flush(): Promise<void> {
    while (true) {
      const pending = [...writeChains].filter(([file]) => path.dirname(path.resolve(file)) === this.directory).map(([, task]) => task);
      if (!pending.length) return;
      await Promise.all(pending);
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      await fs.access(this.file(id));
      return true;
    } catch {
      return false;
    }
  }
}
