/** Explicit offline entry: never loads environment files or constructs a real provider. */
import express from "express";
import path from "node:path";
import { createGtmApp } from "../server/gtm-api.js";
import { AuditRepository } from "../server/gtm-repository.js";
const service = createGtmApp(
  new AuditRepository(path.resolve("work", "v03-local", "audits")),
);
await service.init();
service.app.use(express.static(path.resolve("dist/web")));
service.app.get("*", (_q, r) =>
  r.sendFile(path.resolve("dist/web/index.html")),
);
service.app
  .listen(4318, "127.0.0.1", () =>
    console.log(
      "v0.3-alpha OFFLINE MOCK http://127.0.0.1:4318/?screen=hypotheses",
    ),
  )
  .on("error", () => {
    console.error("Port 4318 unavailable; existing service left unchanged.");
    process.exitCode = 1;
  });
