import { build } from "vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const output = process.env.ATK_AUDIT_OUTPUT ?? "audit/phase1";
mkdirSync(output, { recursive: true });
await build({
  plugins: [
    {
      name: "audit-bundle-evidence",
      writeBundle(options, bundle) {
        const chunks = Object.values(bundle)
          .filter((item) => item.type === "chunk")
          .map((chunk) => ({
            file: chunk.fileName,
            entry: chunk.isEntry,
            bytes: readFileSync(resolve(options.dir, chunk.fileName))
              .byteLength,
            gzipBytes: gzipSync(
              readFileSync(resolve(options.dir, chunk.fileName)),
            ).byteLength,
            imports: chunk.imports,
            dynamicImports: chunk.dynamicImports,
            modules: Object.entries(chunk.modules)
              .map(([id, module]) => ({
                id: id
                  .replaceAll("\\", "/")
                  .replace(process.cwd().replaceAll("\\", "/") + "/", ""),
                renderedBytes: module.renderedLength,
              }))
              .sort((a, b) => b.renderedBytes - a.renderedBytes),
          }));
        writeFileSync(`${output}/bundle.json`, JSON.stringify(chunks, null, 2));
        const entryLimit = Number(process.env.ATK_ENTRY_BUDGET ?? 300000);
        const chunkLimit = Number(process.env.ATK_CHUNK_BUDGET ?? 250000);
        for (const chunk of chunks)
          assert(
            chunk.bytes < (chunk.entry ? entryLimit : chunkLimit),
            `${chunk.file} exceeds its JavaScript budget (${chunk.bytes} bytes)`,
          );
        const byName = new Map(chunks.map((chunk) => [chunk.file, chunk]));
        const initial = new Set();
        function visit(file) {
          if (initial.has(file)) return;
          initial.add(file);
          byName.get(file)?.imports.forEach(visit);
        }
        chunks
          .filter((chunk) => chunk.entry)
          .forEach((chunk) => visit(chunk.file));
        const deviceData = chunks.flatMap((chunk) =>
          chunk.modules
            .filter((module) => /^src\/devices\/.*\.json$/.test(module.id))
            .map((module) => ({ ...module, chunk: chunk.file })),
        );
        const allowed = new Set([
          "mice.json",
          "devices.json",
          "sourceMouseProtocols.json",
          "mouseModels.generated.json",
          "layoutPreviews.json",
          "atk68Layout.json",
        ]);
        for (const data of deviceData) {
          assert(
            allowed.has(data.id.split("/").at(-1)),
            `Unexpected device extraction input in runtime bundle: ${data.id}`,
          );
          assert(
            !initial.has(data.chunk),
            `Device data loaded eagerly: ${data.id}`,
          );
        }
        console.log(
          `Bundle guards: ${chunks.length} chunks within budget; ${deviceData.length} required device datasets lazy; raw extraction inputs absent.`,
        );
      },
    },
  ],
});
