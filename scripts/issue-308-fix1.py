from pathlib import Path

path = Path(__file__).resolve().parent / "issue-308-backend.py"
text = path.read_text(encoding="utf-8")

replacements = {
    "pg = pg.replace('\"password\" TEXT,\\n  \"expiresAt\"', '\"password\" TEXT,\\n  \"credentialVersion\" INTEGER NOT NULL DEFAULT 1,\\n  \"expiresAt\"', 1)":
        "pg = pg.replace('    password TEXT,\\n    \"expiresAt\"', '    password TEXT,\\n    \"credentialVersion\" INTEGER NOT NULL DEFAULT 1,\\n    \"expiresAt\"', 1)",
    "pg = pg.replace('\"anchorData\" TEXT,\\n  \"isResolved\"', '\"anchorData\" TEXT,\\n  \"sourceType\" TEXT NOT NULL DEFAULT \\'note_share\\',\\n  \"sourceId\" TEXT,\\n  \"isHidden\" INTEGER NOT NULL DEFAULT 0,\\n  \"isResolved\"', 1)":
        "pg = pg.replace('    \"anchorData\" TEXT,\\n    \"isResolved\"', '    \"anchorData\" TEXT,\\n    \"sourceType\" TEXT NOT NULL DEFAULT \\'note_share\\',\\n    \"sourceId\" TEXT,\\n    \"isHidden\" INTEGER NOT NULL DEFAULT 0,\\n    \"isResolved\"', 1)",
    "pg = pg.replace('\"status\" TEXT NOT NULL DEFAULT \\'active\\',\\n  \"invitedBy\"', '\"status\" TEXT NOT NULL DEFAULT \\'active\\',\\n  \"allowDownload\" INTEGER NOT NULL DEFAULT 1,\\n  \"allowReshare\" INTEGER NOT NULL DEFAULT 0,\\n  \"source\" TEXT NOT NULL DEFAULT \\'manual\\',\\n  \"sourceId\" TEXT,\\n  \"invitedBy\"', 1)":
        "pg = pg.replace(\"    status TEXT NOT NULL DEFAULT 'active',\\n    \\\"invitedBy\\\"\", \"    status TEXT NOT NULL DEFAULT 'active',\\n    \\\"allowDownload\\\" INTEGER NOT NULL DEFAULT 1,\\n    \\\"allowReshare\\\" INTEGER NOT NULL DEFAULT 0,\\n    source TEXT NOT NULL DEFAULT 'manual',\\n    \\\"sourceId\\\" TEXT,\\n    \\\"invitedBy\\\"\", 1)",
    "marker = 'CREATE INDEX IF NOT EXISTS \"idx_shares_token\" ON \"shares\"(\"shareToken\");'":
        "marker = 'CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(\"shareToken\");'",
}

for old, new in replacements.items():
    if old not in text:
        raise RuntimeError(f"expected marker missing: {old[:100]}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Issue #308 PostgreSQL markers aligned")
