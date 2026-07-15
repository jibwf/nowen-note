import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nowen-user-ai-settings-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

let db: Database.Database;
let closeDb: () => void;
let repository: typeof import("../src/repositories/userAISettingsRepository").userAISettingsRepository;

test.before(async () => {
  const [schema, repositoryModule] = await Promise.all([
    import("../src/db/schema"),
    import("../src/repositories/userAISettingsRepository"),
  ]);
  db = schema.getDb();
  closeDb = schema.closeDb;
  repository = repositoryModule.userAISettingsRepository;
  db.prepare("INSERT INTO users (id, username, passwordHash) VALUES (?, ?, ?)").run("user-a", "user-a", "hash");
  db.prepare("INSERT INTO users (id, username, passwordHash) VALUES (?, ?, ?)").run("user-b", "user-b", "hash");
});

test.after(async () => {
  closeDb?.();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    } catch (error: any) {
      if (error?.code !== "EBUSY" || attempt === 4) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
});

test("repository keeps AI settings isolated by user", () => {
  repository.setMany("user-a", [
    { key: "ai_provider", value: "openai" },
    { key: "ai_api_key", value: "key-a" },
  ]);
  repository.setMany("user-b", [
    { key: "ai_provider", value: "deepseek" },
    { key: "ai_api_key", value: "key-b" },
  ]);

  assert.equal(repository.get("user-a", "ai_api_key")?.value, "key-a");
  assert.equal(repository.get("user-b", "ai_api_key")?.value, "key-b");
  assert.deepEqual(
    repository.getMany("user-a", ["ai_provider", "ai_api_key"]).map((row) => [row.key, row.value]),
    [["ai_api_key", "key-a"], ["ai_provider", "openai"]],
  );
});

test("deleting a user cascades only that user's AI settings", () => {
  db.prepare("DELETE FROM users WHERE id = ?").run("user-a");
  assert.equal(repository.get("user-a", "ai_api_key"), undefined);
  assert.equal(repository.get("user-b", "ai_api_key")?.value, "key-b");
});
