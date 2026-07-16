from pathlib import Path

path = Path(__file__).resolve().parent / "issue-308-ui.py"
text = path.read_text(encoding="utf-8")
start_marker = "# Insert a visually hidden honeypot before the public comment textarea/input block."
end_marker = "\n# Tests for helpers and invite lifecycle."
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError("public comment patch section missing")
replacement = r"""# Insert a visually hidden honeypot before the compact public comment input.
replace_once(
    "frontend/src/components/PublicNotebookView.tsx",
    '                      <Input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="写下评论…" maxLength={4000}',
    '''                      <input
                        type="text"
                        value={commentWebsite}
                        onChange={(event) => setCommentWebsite(event.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        className="absolute -left-[10000px] h-px w-px opacity-0"
                        name="website"
                      />
                      <Input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="写下评论…" maxLength={1000}''',
)
"""
path.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
print("Issue #308 public comment form patch aligned")
