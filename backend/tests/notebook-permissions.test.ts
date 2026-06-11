import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  listSharedNotebookIds,
  resolveNoteNotebookMemberPermission,
  resolveNotebookMemberPermission,
} from "../src/services/notebook-permissions";

function createDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL
    );

    CREATE TABLE notebooks (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      workspaceId TEXT,
      parentId TEXT,
      name TEXT NOT NULL,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      notebookId TEXT,
      workspaceId TEXT,
      title TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (notebookId) REFERENCES notebooks(id) ON DELETE SET NULL
    );

    CREATE TABLE notebook_members (
      id TEXT PRIMARY KEY,
      notebookId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'active',
      invitedBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (notebookId) REFERENCES notebooks(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(notebookId, userId)
    );

    INSERT INTO users (id, username, passwordHash)
    VALUES
      ('owner', 'owner', 'hash'),
      ('editor', 'editor', 'hash'),
      ('viewer', 'viewer', 'hash'),
      ('removed', 'removed', 'hash');

    INSERT INTO notebooks (id, userId, name, updatedAt)
    VALUES
      ('nb-1', 'owner', 'Shared notebook', '2026-01-01 00:00:00'),
      ('nb-2', 'viewer', 'Own notebook', '2026-01-02 00:00:00'),
      ('nb-deleted', 'owner', 'Deleted notebook', '2026-01-03 00:00:00');

    INSERT INTO notes (id, userId, notebookId, title)
    VALUES ('note-1', 'owner', 'nb-1', 'Shared note');

    INSERT INTO notebook_members (id, notebookId, userId, role, status)
    VALUES
      ('nb-1:owner', 'nb-1', 'owner', 'owner', 'active'),
      ('nb-1:editor', 'nb-1', 'editor', 'editor', 'active'),
      ('nb-1:viewer', 'nb-1', 'viewer', 'viewer', 'active'),
      ('nb-1:removed', 'nb-1', 'removed', 'viewer', 'removed'),
      ('nb-2:viewer', 'nb-2', 'viewer', 'owner', 'active'),
      ('nb-deleted:viewer', 'nb-deleted', 'viewer', 'viewer', 'active');

    UPDATE notebooks SET isDeleted = 1 WHERE id = 'nb-deleted';
  `);
  return db;
}

test("resolves notebook member roles to permissions", () => {
  const db = createDb();

  assert.equal(resolveNotebookMemberPermission(db, "nb-1", "owner"), "manage");
  assert.equal(resolveNotebookMemberPermission(db, "nb-1", "editor"), "write");
  assert.equal(resolveNotebookMemberPermission(db, "nb-1", "viewer"), "read");
  assert.equal(resolveNotebookMemberPermission(db, "nb-1", "removed"), null);

  db.close();
});

test("resolves note permissions from its notebook membership", () => {
  const db = createDb();

  assert.equal(resolveNoteNotebookMemberPermission(db, "note-1", "editor"), "write");
  assert.equal(resolveNoteNotebookMemberPermission(db, "note-1", "viewer"), "read");
  assert.equal(resolveNoteNotebookMemberPermission(db, "note-1", "removed"), null);

  db.close();
});

test("lists active notebooks shared by other owners", () => {
  const db = createDb();

  assert.deepEqual(listSharedNotebookIds(db, "viewer"), ["nb-1"]);

  db.close();
});
