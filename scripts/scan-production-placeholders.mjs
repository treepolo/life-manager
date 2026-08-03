import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const scanRoots = ["src", "public"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css"]);
const forbidden = [
  { label: "production fixture reference", pattern: /(?:from|import\s*\()\s*["'][^"']*fixtures/i },
  { label: "demo data", pattern: /\bdemoData\b/i },
  { label: "random production value", pattern: /Math\.random\s*\(/ },
  { label: "unfinished marker", pattern: /\b(?:TODO|FIXME|NotImplemented)\b/i },
  { label: "arbitrary code execution", pattern: /\b(?:eval|new\s+Function)\s*\(/ },
  { label: "Firstrade password", pattern: /firstrade.{0,40}(?:password|passwd)/i },
  { label: "React Router RSC mode", pattern: /(?:react-server-dom|unstable_createCallServer|RSCStaticRouter)/ },
];
const secretPatterns = [
  /re_[A-Za-z0-9]{20,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /(?:access_token|refresh_token)["']?\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/i,
];

const ruleSelfTests = [
  { label: "unfinished marker", source: "// TODO implement the real path" },
  { label: "unfinished marker", source: "// FIXME preserve the failed operation" },
  { label: "unfinished marker", source: "throw new NotImplemented()" },
  { label: "random production value", source: "const id = Math.random()" },
  { label: "arbitrary code execution", source: "const run = new Function('return 1')" },
  { label: "production fixture reference", source: "import data from '../tests/fixtures/data'" },
];
const testControlPattern = /\b(?:it|test|describe)\.(?:skip|todo|fixme|only)\s*\(/;

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesBelow(path)));
    else if (extensions.has(extname(entry.name))) result.push(path);
  }
  return result;
}

const failures = [];
for (const selfTest of ruleSelfTests) {
  const rule = forbidden.find((candidate) => candidate.label === selfTest.label);
  if (!rule?.pattern.test(selfTest.source)) failures.push(`scanner self-test: ${selfTest.label}`);
}
for (const source of ["test.skip(() => {})", "it.todo('later')", "test.fixme(() => {})", "describe.only(() => {})"]) {
  if (!testControlPattern.test(source)) failures.push(`scanner self-test: test control marker ${source}`);
}
for (const scanRoot of scanRoots) {
  for (const file of await filesBelow(join(root, scanRoot))) {
    const source = await readFile(file, "utf8");
    for (const rule of [...forbidden, ...secretPatterns.map((pattern) => ({ label: "committed secret", pattern }))]) {
      if (rule.pattern.test(source)) failures.push(`${relative(root, file)}: ${rule.label}`);
    }
  }
}

const testFiles = await filesBelow(join(root, "tests"));
for (const file of testFiles) {
  const source = await readFile(file, "utf8");
  if (testControlPattern.test(source)) {
    failures.push(`${relative(root, file)}: skipped, todo, fixme, or exclusive test`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Production placeholder/secret scan passed (${scanRoots.join(", ")}); test skip scan passed (${testFiles.length} files).`);
}
