const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const requiredDocs = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "README_EN.md",
  "docs/QUALITY_SCORE.md",
  "docs/RELIABILITY.md",
  "docs/SECURITY.md",
  "docs/recovery-model.md",
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function collectMarkdownFiles() {
  const roots = ["AGENTS.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "README.md", "README_EN.md"];
  const docsRoot = path.join(repoRoot, "docs");
  if (fs.existsSync(docsRoot)) {
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          roots.push(path.relative(repoRoot, fullPath));
        }
      }
    };
    visit(docsRoot);
  }
  return [...new Set(roots)].sort();
}

function findBrokenLocalLinks(relativePath, source) {
  const broken = [];
  const linkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(source))) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (!rawTarget || rawTarget.startsWith("#") || /^[a-z]+:/i.test(rawTarget)) {
      continue;
    }
    const targetWithoutAnchor = rawTarget.split("#", 1)[0];
    if (!targetWithoutAnchor) {
      continue;
    }
    const resolved = path.resolve(repoRoot, path.dirname(relativePath), targetWithoutAnchor);
    if (!fs.existsSync(resolved)) {
      broken.push(rawTarget);
    }
  }
  return broken;
}

function checkDocs() {
  const errors = [];
  const ignoreRules = read(".gitignore")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  for (const forbiddenRule of ["AGENTS.md", "/AGENTS.md", "docs/", "docs/**", "/docs", "/docs/", "/docs/**"]) {
    if (ignoreRules.includes(forbiddenRule)) {
      errors.push(`.gitignore must not hide agent documentation: ${forbiddenRule}`);
    }
  }
  for (const relativePath of requiredDocs) {
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      errors.push(`Missing required document: ${relativePath}`);
    }
  }

  if (errors.length === 0) {
    for (const readmePath of ["README.md", "README_EN.md"]) {
      const source = read(readmePath);
      if (!source.includes("img.shields.io/github/v/release/HHim8826/claw-in-chrome")) {
        errors.push(`${readmePath} must use the dynamic GitHub release badge`);
      }
      for (const expectedPath of ["src/assets/", "src/i18n/", "src/"]) {
        if (!source.includes(`\`${expectedPath}\``)) {
          errors.push(`${readmePath} must document ${expectedPath}`);
        }
      }
    }
  }

  for (const relativePath of collectMarkdownFiles()) {
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      continue;
    }
    for (const target of findBrokenLocalLinks(relativePath, read(relativePath))) {
      errors.push(`${relativePath} has broken local link: ${target}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Documentation check failed:\n- ${errors.join("\n- ")}`);
  }
  return { documentCount: collectMarkdownFiles().length };
}

if (require.main === module) {
  try {
    const result = checkDocs();
    console.log(`Documentation check passed (${result.documentCount} Markdown files).`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { checkDocs, collectMarkdownFiles, findBrokenLocalLinks };
