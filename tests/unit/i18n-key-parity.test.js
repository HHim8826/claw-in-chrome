const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const i18nRoot = path.join(__dirname, "..", "..", "src", "i18n");

function readLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(i18nRoot, `${locale}.json`), "utf8"));
}

function testChineseLocalesCoverEnglishKeysAndShareExtensions() {
  const englishKeys = Object.keys(readLocale("en-US")).sort();
  const simplifiedKeys = Object.keys(readLocale("zh-CN")).sort();
  const traditionalKeys = Object.keys(readLocale("zh-TW")).sort();

  for (const [locale, keys] of [["zh-CN", simplifiedKeys], ["zh-TW", traditionalKeys]]) {
    const missing = englishKeys.filter((key) => !keys.includes(key));
    assert.deepEqual(missing, [], `${locale} is missing English locale keys`);
  }

  const simplifiedExtensions = simplifiedKeys.filter((key) => !englishKeys.includes(key));
  const traditionalExtensions = traditionalKeys.filter((key) => !englishKeys.includes(key));
  assert.deepEqual(traditionalExtensions, simplifiedExtensions, "Chinese locale extension keys must stay aligned");
}

function main() {
  testChineseLocalesCoverEnglishKeysAndShareExtensions();
  console.log("i18n key parity tests passed");
}

main();
