from pathlib import Path

path = Path(__file__).resolve().parent / "issue-308-backend.py"
text = path.read_text(encoding="utf-8")
old = "    '    const scope = createPublicationAttachmentScope(publication.id, noteId);',\n    '    const scope = createPublicationAttachmentScope(publication.id, noteId, publication.allowDownload !== 0);',"
new = "    '  const scope = createPublicationAttachmentScope(publication.id, noteId);',\n    '  const scope = createPublicationAttachmentScope(publication.id, noteId, publication.allowDownload !== 0);',"
if old not in text:
    raise RuntimeError("publication attachment scope patch marker missing")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Issue #308 publication scope marker aligned")
