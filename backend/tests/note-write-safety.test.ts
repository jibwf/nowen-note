import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nowen-note-write-safety-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.ELECTRON_USER_DATA = tmpDir;

import { getDb } from "../src/db/schema";
import { ensureNoteWriteSafetyTrigger } from "../src/repositories/noteWriteSafety";

const USER_ID = "sync-safety-user";
const NOTEBOOK_ID = "sync-safety-notebook";
const NOTE_ID = "sync-safety-note";

function seedNote(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM note_versions;
    DELETE FROM notes;
    DELETE FROM notebooks;
    DELETE FROM users;
  `);
  db.prepare("INSERT INTO users (id, username, passwordHash) VALUES (?, ?, ?)")
    .run(USER_ID, "sync-safety-user", "hash");
  db.prepare(`
    INSERT INTO notebooks (id, userId, name, icon, sortOrder, isExpanded)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(NOTEBOOK_ID, USER_ID, "Safety", "S", 0, 1);
  db.prepare(`
    INSERT INTO notes (
      id, userId, notebookId, title, content, contentText, contentFormat, version,
      isPinned, isLocked, isArchived, isTrashed, sortOrder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)
  `).run(
    NOTE_ID,
    USER_ID,
    NOTEBOOK_ID,
    "Original title",
    "important content",
    "important content",
    "markdown",
    7,
  );
  ensureNoteWriteSafetyTrigger();
}

test.beforeEach(seedNote);

test("snapshots the exact server revision before a destructive overwrite", () => {
  const db = getDb();

  db.prepare(`
    UPDATE notes
    SET content = '', contentText = '', version = version + 1
    WHERE id = ?
  `).run(NOTE_ID);

  const snapshot = db.prepare(`
    SELECT noteId, title, content, contentText, contentFormat, version, changeSummary
    FROM note_versions
    WHERE noteId = ? AND version = 7
  `).get(NOTE_ID) as any;

  assert.equal(snapshot.noteId, NOTE_ID);
  assert.equal(snapshot.title, "Original title");
  assert.equal(snapshot.content, "important content");
  assert.equal(snapshot.contentText, "important content");
  assert.equal(snapshot.contentFormat, "markdown");
  assert.equal(snapshot.version, 7);
  assert.equal(snapshot.changeSummary, "Automatic safety snapshot before overwrite");
});

test("does not duplicate a revision already recorded by the route", () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO note_versions (
      id, noteId, userId, title, content, contentText, contentFormat,
      version, changeType, changeSummary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'edit', ?)
  `).run(
    "existing-version",
    NOTE_ID,
    USER_ID,
    "Original title",
    "important content",
    "important content",
    "markdown",
    7,
    "route snapshot",
  );

  db.prepare(`
    UPDATE notes
    SET title = 'Renamed', version = version + 1
    WHERE id = ?
  `).run(NOTE_ID);

  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM note_versions
    WHERE noteId = ? AND version = 7
  `).get(NOTE_ID) as { count: number };

  assert.equal(row.count, 1);
});
