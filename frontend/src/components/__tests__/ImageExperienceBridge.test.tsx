import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ImageExperienceBridge from "@/components/ImageExperienceBridge";

describe("ImageExperienceBridge 移动端图片菜单", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    document.documentElement.lang = "zh-CN";
    document.body.innerHTML = `
      <div class="fixed bottom-0 left-0 right-0 z-50">
        <div><button aria-label="关闭">x</button></div>
        <div class="grid grid-cols-4">
          <button>查看大图</button><button>下载图片</button><button>替换图片</button>
          <button>复制图片地址</button><button>删除图片</button><button>编辑图片</button>
        </div>
        <div class="grid grid-cols-5">
          <button>25%</button><button>50%</button><button>75%</button>
          <button>100%</button><button>原始</button>
        </div>
      </div>
    `;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("先显示五个高频操作，更多面板按需展示低频操作", async () => {
    await act(async () => {
      root.render(<ImageExperienceBridge />);
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(document.querySelectorAll('[data-nowen-image-primary-action="true"]')).toHaveLength(5);
    expect(document.querySelector('[data-nowen-image-more-panel="true"]')).toBeNull();

    const moreButton = document.querySelector<HTMLButtonElement>('[data-nowen-image-more-trigger="true"]');
    expect(moreButton).not.toBeNull();
    act(() => moreButton?.click());

    expect(document.querySelector('[data-nowen-image-more-panel="true"]')).not.toBeNull();
    expect(document.querySelector('[data-nowen-image-transform-slot="true"]')).not.toBeNull();
    expect(document.body.textContent).toContain("复制图片地址");
    expect(document.body.textContent).toContain("删除图片");
    expect(document.body.textContent).toContain("原始");
  });
});
