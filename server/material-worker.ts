import { parseMaterial } from "./material-parsers.js";
console.log = () => {};
console.warn = () => {};
let input = "";
for await (const part of process.stdin) {
  input += part;
  if (input.length > 29_000_000) process.exit(2);
}
try {
  const b = JSON.parse(input);
  const parsed = await parseMaterial(Buffer.from(b.base64, "base64"), b.format);
  process.stdout.write(JSON.stringify({ ok: true, parsed }));
} catch {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: "parse_failed_invalid_encrypted_unsupported_or_oversized_document",
    }),
  );
  process.exitCode = 1;
}
