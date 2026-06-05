import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearQueue, enqueue, flushQueue, getQueue, getQueueLength } from "@/lib/offlineQueue";

function seedIdentity() {
  localStorage.setItem("nowen-server-url", "http://sync-test.local");
  localStorage.setItem("nowen-token", "test.token.value");
}

describe("offlineQueue conflict handling", () => {
  beforeEach(() => {
    localStorage.clear();
    seedIdentity();
    clearQueue();
  });

  it("replays an offline note update once with currentVersion from a 409 response", async () => {
    enqueue({
      type: "updateNote",
      noteId: "note-1",
      url: "/notes/note-1",
      method: "PUT",
      body: {
        title: "offline title",
        content: "{}",
        contentText: "offline title",
        version: 1,
      },
    });

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, data: { currentVersion: 5 } })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { id: "note-1", version: 6 } });

    const result = await flushQueue(fetchFn);

    expect(result).toEqual({ success: 1, failed: 0, remaining: 0 });
    expect(getQueueLength()).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, "/notes/note-1", "PUT", expect.objectContaining({ version: 1 }));
    expect(fetchFn).toHaveBeenNthCalledWith(2, "/notes/note-1", "PUT", expect.objectContaining({ version: 5 }));
  });

  it("keeps the queued update when conflict replay still fails", async () => {
    enqueue({
      type: "updateNote",
      noteId: "note-2",
      url: "/notes/note-2",
      method: "PUT",
      body: {
        title: "offline title",
        content: "{}",
        contentText: "offline title",
        version: 2,
      },
    });

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, data: { currentVersion: 8 } })
      .mockResolvedValueOnce({ ok: false, status: 409, data: { currentVersion: 9 } });

    const result = await flushQueue(fetchFn);
    const queue = getQueue();

    expect(result).toEqual({ success: 0, failed: 1, remaining: 1 });
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBe(1);
    expect(queue[0].body).toEqual(expect.objectContaining({ version: 8 }));
  });

  it("keeps the queued update when a 409 response has no currentVersion", async () => {
    enqueue({
      type: "updateNote",
      noteId: "note-3",
      url: "/notes/note-3",
      method: "PUT",
      body: {
        title: "offline title",
        content: "{}",
        contentText: "offline title",
        version: 3,
      },
    });

    const fetchFn = vi.fn().mockResolvedValueOnce({ ok: false, status: 409, data: {} });

    const result = await flushQueue(fetchFn);
    const queue = getQueue();

    expect(result).toEqual({ success: 0, failed: 1, remaining: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(queue[0].retryCount).toBe(1);
    expect(queue[0].body).toEqual(expect.objectContaining({ version: 3 }));
  });
});
