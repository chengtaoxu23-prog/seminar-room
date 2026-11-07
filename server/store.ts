import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SeminarSession } from '../src/shared/types.js';

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`找不到研讨会话 ${id}。`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionStore {
  private readonly chains = new Map<string, Promise<void>>();

  constructor(private readonly dir: string) {}

  private file(id: string): string {
    if (!ID_PATTERN.test(id)) throw new SessionNotFoundError(id);
    return path.join(this.dir, `${id}.json`);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async get(id: string): Promise<SeminarSession> {
    try {
      const raw = await fs.readFile(this.file(id), 'utf8');
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
    const previous = this.chains.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(this.dir, { recursive: true });
        await fs.writeFile(file, payload, 'utf8');
      })
      .finally(() => {
        if (this.chains.get(id) === next) this.chains.delete(id);
      });
    this.chains.set(id, next);
    return next;
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
