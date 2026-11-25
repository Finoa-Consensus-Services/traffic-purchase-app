import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const diagramDir = path.join(root, "docs", "diagrams")
const config = path.join(diagramDir, "mermaid-config.json")
const puppeteer = path.join(diagramDir, "puppeteer-config.json")
const size = process.env.DIAGRAM_SIZE ?? "1400"

const files = fs
  .readdirSync(diagramDir)
  .filter((name) => name.endsWith(".mmd"))
  .sort()

if (files.length === 0) {
  console.error("No .mmd files in docs/diagrams")
  process.exit(1)
}

for (const file of files) {
  const input = path.join(diagramDir, file)
  const output = path.join(diagramDir, file.replace(/\.mmd$/, ".png"))
  console.log(`Rendering ${file} → ${path.basename(output)} (max size ${size}px)`)
  execSync(
    `npx -p @mermaid-js/mermaid-cli mmdc -i "${input}" -o "${output}" -e png -b white --size ${size} -c "${config}" -p "${puppeteer}"`,
    { stdio: "inherit", cwd: root },
  )
}

console.log(`Done. ${files.length} PNG(s) in docs/diagrams/`)
