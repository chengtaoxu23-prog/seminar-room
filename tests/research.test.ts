import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createGtmApp } from "../server/gtm-api.js";
import { AuditRepository } from "../server/gtm-repository.js";
import { ResearchRepository } from "../server/research-repository.js";
import { parseCSV } from "../server/research-api.js";
import type { ResearchState } from "../src/shared/research.js";
async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gtm-research-")),
    service = createGtmApp(new AuditRepository(dir), undefined, 1);
  await service.init();
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base =
    "http://127.0.0.1:" +
    (server.address() as { port: number }).port +
    "/api/gtm";
  let state: ResearchState = { revision: 0, hypotheses: [], events: [] };
  const send = async (body: unknown) => {
    const r = await fetch(base + "/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (r.ok) state = data;
    return { status: r.status, data };
  };
  const command = async (
    operation: string,
    payload: unknown = {},
    hypothesisId = state.hypotheses[0]?.id,
  ) =>
    send({
      operation,
      payload,
      hypothesisId,
      expectedRevision: state.revision,
      requestId: randomUUID(),
    });
  return {
    service,
    dir,
    base,
    send,
    command,
    get state() {
      return state;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
test("Contract lock/version preservation, server authority and stale-revision rejection", async () => {
  const f = await setup();
  try {
    assert.equal(
      (
        await f.command("create", {
          statement: "Can this model sustain paid acquisition?",
        })
      ).status,
      200,
    );
    const h = f.state.hypotheses[0];
    assert.equal(h.contracts[0].metric, "");
    await f.command("lock");
    const original = structuredClone(f.state.hypotheses[0].contracts[0]);
    assert.equal(
      (await f.command("edit", { statement: "silent rewrite" })).status,
      400,
    );
    assert.deepEqual(f.state.hypotheses[0].contracts[0], original);
    await f.command("revise", {
      statement: "Version two",
      supporting: "Human criteria",
    });
    assert.deepEqual(f.state.hypotheses[0].contracts[0], original);
    assert.equal(f.state.hypotheses[0].contracts.length, 2);
    await f.command("lock");
    assert.equal(
      (await f.command("review", { status: "supported" })).status,
      400,
    );
    assert.equal(
      (
        await f.send({
          operation: "create",
          payload: { statement: "stale" },
          requestId: randomUUID(),
          expectedRevision: 0,
        })
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("incremental sources preserve revisions; invalid citations rejected; insufficient evidence and reject do not approve status", async () => {
  const f = await setup();
  try {
    await f.command("create", { statement: "Hypothesis" });
    await f.command("lock");
    await f.command("source", {
      title: "A.csv",
      format: "csv",
      rawContent: "name,value\ncohort,unknown",
    });
    const source = f.state.hypotheses[0].sources[0],
      rev = source.revision;
    const before = f.state.revision;
    assert.equal(
      (
        await f.command("delta", {
          sourceId: source.id,
          paragraphId: 1,
          quote: "Fabricated excerpt",
          fixture: "supporting",
        })
      ).status,
      400,
    );
    assert.equal(f.state.revision, before);
    await f.command("delta", {
      sourceId: source.id,
      paragraphId: 1,
      quote: "cohort,unknown",
      fixture: "inconclusive",
    });
    let h = f.state.hypotheses[0];
    assert.equal(h.status, "unassessed");
    assert.equal(h.deltas[0].claim.classification, "insufficient_evidence");
    assert.equal(h.deltas[0].mode, "MOCK / SYNTHETIC");
    await f.command("review", {
      proposalId: h.proposals[0].id,
      decision: "rejected",
      reason: "Needs independent data",
    });
    assert.equal(f.state.hypotheses[0].status, "unassessed");
    assert.ok(f.state.events.some((e) => e.type === "Transition Rejected"));
    assert.equal(
      (
        await f.command("delta", {
          sourceId: source.id,
          paragraphId: 1,
          quote: "cohort,unknown",
        })
      ).status,
      400,
    );
    await f.command("source", {
      title: "B.md",
      format: "md",
      rawContent: "Independent data not available.",
    });
    h = f.state.hypotheses[0];
    assert.equal(h.sources[0].revision, rev);
    await f.command("delta", {
      sourceId: h.sources[1].id,
      paragraphId: 1,
      quote: "Independent data not available.",
      fixture: "supporting",
    });
    h = f.state.hypotheses[0];
    assert.deepEqual(h.deltas[1].previousEvidenceIds, [h.deltas[0].id]);
    await f.command("review", {
      proposalId: h.proposals[1].id,
      decision: "approved",
      reason: "Synthetic interaction acceptance only",
    });
    assert.equal(f.state.hypotheses[0].status, "supported");
    assert.equal(
      f.state.events.filter((e) => e.type === "Transition Approved").length,
      1,
    );
    const restored = await new ResearchRepository(
      path.join(f.dir, "hypotheses"),
    ).load();
    assert.deepEqual(restored, f.state);
  } finally {
    await f.close();
  }
});
test("idempotent approval and audit link do not duplicate changes or model requests", async () => {
  const f = await setup();
  try {
    await f.command("case_t0");
    const h = f.state.hypotheses[0];
    assert.equal(f.state.hypotheses.length, 3);
    assert.ok(
      f.state.hypotheses.every((h) =>
        h.sources.every((s) => s.publishedAt! <= "2023-06-30"),
      ),
    );
    const body = {
      operation: "audit",
      hypothesisId: h.id,
      payload: { sourceIds: [h.sources[0].id] },
      expectedRevision: f.state.revision,
      requestId: randomUUID(),
    };
    assert.equal((await f.send(body)).status, 200);
    const before = structuredClone(f.state),
      auditId = f.state.hypotheses[0].audits[0].auditId;
    assert.equal((await f.send(body)).status, 200);
    assert.deepEqual(f.state, before);
    const a = (await f.service.repository.load(auditId)).audit;
    assert.equal(a.state.lifecycle, "completed");
    assert.equal(a.providerSnapshot?.mode, "mock");
    assert.equal(a.execution?.report?.auditId, auditId);
    const proposal = f.state.hypotheses[0].proposals[0];
    const review = {
      operation: "review",
      hypothesisId: h.id,
      payload: {
        proposalId: proposal.id,
        decision: "approved",
        reason: "Mock fixture review",
      },
      expectedRevision: f.state.revision,
      requestId: randomUUID(),
    };
    await f.send(review);
    const after = structuredClone(f.state);
    await f.send(review);
    assert.deepEqual(f.state, after);
    assert.deepEqual((await f.service.repository.load(auditId)).audit, a);
    await f.command("case_t1", {}, h.id);
    assert.equal(
      f.state.hypotheses[0].sources.at(-1)?.publishedAt,
      "2024-09-13",
    );
    const exportResult = await fetch(f.base + "/research/export");
    assert.deepEqual(await exportResult.json(), f.state);
  } finally {
    await f.close();
  }
});
test("old contract proposals cannot mutate a revised contract; further research is retained", async () => {
  const f = await setup();
  try {
    await f.command("case_t0");
    let h = f.state.hypotheses[0];
    await f.command("delta", {
      sourceId: h.sources[0].id,
      paragraphId: 1,
      quote: "relies on the de minimis provision",
    });
    h = f.state.hypotheses[0];
    await f.command("revise", { statement: "new contract" });
    await f.command("lock");
    assert.equal(
      (
        await f.command("review", {
          proposalId: h.proposals[0].id,
          decision: "approved",
          reason: "stale",
        })
      ).status,
      400,
    );
    assert.equal(f.state.hypotheses[0].status, "unassessed");
  } finally {
    await f.close();
  }
});
test("ledger hash integrity prevents overwrite after corruption; CSV handles quoted commas and newlines", async () => {
  assert.deepEqual(parseCSV('a,b\n"x,y","z\nq"'), [
    ["a", "b"],
    ["x,y", "z\nq"],
  ]);
  assert.throws(() => parseCSV('a,b\n"unterminated'));
  assert.throws(() => parseCSV("a,b\none"));
  const f = await setup();
  try {
    await f.command("create", { statement: "integrity" });
    const file = path.join(f.dir, "hypotheses", "decisions.json"),
      events = JSON.parse(await readFile(file, "utf8"));
    events[0].reason = "tamper";
    await writeFile(file, JSON.stringify(events));
    assert.equal(
      (await f.command("create", { statement: "must not overwrite" })).status,
      500,
    );
    assert.equal(JSON.parse(await readFile(file, "utf8"))[0].reason, "tamper");
  } finally {
    await f.close();
  }
});

test("conflicting deltas propose research, each approval appends history; further research leaves status unchanged", async () => {
  const f = await setup();
  try {
    await f.command("create", {
      statement: "Synthetic multi-round hypothesis",
    });
    await f.command("lock");
    for (const [i, direction] of [
      "supporting",
      "contradicting",
      "inconclusive",
    ].entries()) {
      await f.command("source", {
        title: "Synthetic " + i,
        format: "txt",
        rawContent: "Synthetic evidence record " + i,
      });
      let h = f.state.hypotheses[0];
      const src = h.sources[i];
      await f.command("delta", {
        sourceId: src.id,
        paragraphId: 1,
        quote: src.rawContent,
        fixture: direction,
      });
      h = f.state.hypotheses[0];
      const p = h.proposals.at(-1)!;
      if (i === 0) {
        assert.equal(p.to, "supported");
        await f.command("review", {
          proposalId: p.id,
          decision: "approved",
          reason: "Synthetic human approval 1",
        });
        assert.equal(f.state.hypotheses[0].status, "supported");
      } else if (i === 1) {
        assert.equal(p.to, "needs_research");
        await f.command("review", {
          proposalId: p.id,
          decision: "approved",
          reason: "Conflicting synthetic directions",
        });
        assert.equal(f.state.hypotheses[0].status, "needs_research");
      } else {
        await f.command("review", {
          proposalId: p.id,
          decision: "further_research",
          reason: "Collect independent material",
        });
        assert.equal(f.state.hypotheses[0].status, "needs_research");
      }
    }
    assert.equal(
      f.state.events.filter((e) => e.type === "Transition Approved").length,
      2,
    );
    assert.ok(
      f.state.events.some((e) => e.type === "Further Research Requested"),
    );
    const h = f.state.hypotheses[0];
    assert.equal(
      (
        await f.command("source", {
          title: "Duplicate",
          format: "txt",
          rawContent: h.sources[0].rawContent,
        })
      ).status,
      400,
    );
    assert.equal(f.state.hypotheses[0].sources.length, 3);
    assert.throws(() => parseCSV('a,b\n"x"unexpected,y'));
  } finally {
    await f.close();
  }
});

test("concurrent identical request is applied once; simultaneous stale writer rejected", async () => {
  const f = await setup();
  try {
    const request = {
      operation: "create",
      payload: { statement: "Concurrent" },
      requestId: randomUUID(),
      expectedRevision: 0,
    };
    const same = await Promise.all([f.send(request), f.send(request)]);
    assert.ok(same.every((r) => r.status === 200));
    assert.equal(f.state.hypotheses.length, 1);
    assert.equal(f.state.events.length, 1);
    const writes = await Promise.all([
      f.send({
        ...request,
        requestId: randomUUID(),
        expectedRevision: 1,
        payload: { statement: "Writer A" },
      }),
      f.send({
        ...request,
        requestId: randomUUID(),
        expectedRevision: 1,
        payload: { statement: "Writer B" },
      }),
    ]);
    assert.deepEqual(writes.map((r) => r.status).sort(), [200, 400]);
  } finally {
    await f.close();
  }
});

test("research audit blocks real runtime before dispatch and preserves all records", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gtm-research-real-"));
  let calls = 0;
  const service = createGtmApp(new AuditRepository(dir), undefined, 1, {
    mode: "real",
    model: "synthetic-no-credentials",
    provider: {
      configuredModel: "synthetic-no-credentials",
      async complete() {
        calls++;
        throw Error("must not dispatch");
      },
    },
  });
  await service.init();
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base =
    "http://127.0.0.1:" +
    (server.address() as { port: number }).port +
    "/api/gtm/research";
  try {
    let response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "case_t0",
        payload: {},
        expectedRevision: 0,
        requestId: randomUUID(),
      }),
    });
    const state = await response.json();
    const h = state.hypotheses[0];
    response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "audit",
        hypothesisId: h.id,
        payload: { sourceIds: [h.sources[0].id] },
        expectedRevision: state.revision,
        requestId: randomUUID(),
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
    assert.deepEqual(await (await fetch(base)).json(), state);
    assert.deepEqual(await service.repository.ids(), []);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("saving edited criteria and locking are atomic; human modifications preserve the original AI proposal", async () => {
  const f = await setup();
  try {
    await f.command("create", { statement: "Initial draft" });
    assert.equal(
      (
        await f.command("lock", {
          statement: "Edited and locked",
          supporting: "Signed purchase evidence",
          falsification: "Explicit refusal",
          market: "Germany",
          customerSegment: "SME",
          validationWindow: "2026-11 snapshot",
          decisionThreshold: "Human-defined threshold",
        })
      ).status,
      200,
    );
    let h = f.state.hypotheses[0];
    assert.equal(h.contracts[0].statement, "Edited and locked");
    assert(h.contracts[0].lockedAt);
    assert.equal(h.contracts[0].market, "Germany");
    const saved = structuredClone(h.contracts[0]);
    await f.command("source", {
      title: "Isolated fixture",
      format: "txt",
      rawContent: "Published subscription offer, no customer purchases.",
    });
    h = f.state.hypotheses[0];
    await f.command("delta", {
      sourceId: h.sources[0].id,
      paragraphId: 1,
      quote: "Published subscription offer",
      fixture: "supporting",
    });
    h = f.state.hypotheses[0];
    const proposal = h.proposals[0];
    assert.equal(proposal.to, "supported");
    assert.equal(
      (
        await f.command("review", {
          proposalId: proposal.id,
          decision: "approved",
          newStatus: "inconclusive",
          reason: "Human rejects the leap from offer to actual demand.",
        })
      ).status,
      200,
    );
    h = f.state.hypotheses[0];
    assert.equal(h.status, "inconclusive");
    assert.equal(h.proposals[0].to, "supported");
    assert.equal(h.proposals[0].reviewedStatus, "inconclusive");
    assert.deepEqual(h.contracts[0], saved);
    assert.equal(f.state.events.at(-1)!.type, "Transition Modified");
    assert.equal(f.state.events.at(-1)!.actor, "user");
  } finally {
    await f.close();
  }
});
