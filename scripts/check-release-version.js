const childProcess = require("node:child_process");
const path = require("node:path");

const VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;

function parseVersion(value, label) {
  const normalized = String(value || "").trim();
  if (!VERSION_PATTERN.test(normalized)) {
    throw new Error(`${label} must use four numeric segments, got: ${normalized || "<empty>"}`);
  }
  return normalized.split(".").map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left, "current version");
  const rightParts = parseVersion(right, "previous version");
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

function gitTagExists(tag, repoRoot) {
  const result = childProcess.spawnSync(
    "git",
    ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  return result.status === 0;
}

function validateReleaseVersion(options) {
  const settings = options && typeof options === "object" ? options : {};
  const current = String(settings.current || "").trim();
  const previous = String(settings.previous || "").trim();
  const tag = String(settings.tag || `v${current}`).trim();
  parseVersion(current, "current version");
  if (previous && compareVersions(current, previous) <= 0) {
    throw new Error(`release version ${current} must be greater than ${previous}`);
  }
  if (tag !== `v${current}`) {
    throw new Error(`release tag ${tag} does not match version ${current}`);
  }
  const tagExists =
    typeof settings.tagExists === "boolean"
      ? settings.tagExists
      : gitTagExists(tag, settings.repoRoot || process.cwd());
  if (tagExists) {
    throw new Error(`release tag already exists: ${tag}`);
  }
  return { current, previous, tag };
}

function readArguments(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] || "").replace(/^--/, "");
    output[key] = argv[index + 1] || "";
  }
  return output;
}

function main() {
  const args = readArguments(process.argv.slice(2));
  const result = validateReleaseVersion({
    current: args.current,
    previous: args.previous,
    tag: args.tag,
    repoRoot: path.resolve(args.repo || process.cwd()),
  });
  console.log(
    `Release version check passed (${result.previous || "no previous version"} -> ${result.current}, ${result.tag} is unused).`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  compareVersions,
  gitTagExists,
  parseVersion,
  validateReleaseVersion,
};
