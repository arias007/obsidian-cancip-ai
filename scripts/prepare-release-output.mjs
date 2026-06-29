import { mkdir, readFile, writeFile } from "node:fs/promises";

const outputDir = "outputs/cancip";
const version = JSON.parse(await readFile("manifest.json", "utf8")).version;
const minAppVersion = JSON.parse(await readFile("manifest.json", "utf8")).minAppVersion;
const versionsPath = `${outputDir}/versions.json`;

await mkdir(outputDir, { recursive: true });

for (const file of ["manifest.json", "README.md"]) {
  await writeFile(`${outputDir}/${file}`, await readFile(file, "utf8"));
}

let versions = {};
try {
  versions = JSON.parse(await readFile(versionsPath, "utf8"));
} catch {
  versions = {};
}
versions[version] = minAppVersion;
await writeFile(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);
