import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteSettingsProvider, useSiteSettings } from "../useSiteSettings";
import { setServerUrl } from "@/lib/api";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function installBeianFooter() {
  document.body.innerHTML = `
    <div id="root"></div>
    <footer id="beian-footer" class="beian-footer">
      <a id="beian-link" href="https://beian.miit.gov.cn/"></a>
    </footer>
  `;
}

async function waitFor(assertion: () => void) {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

describe("SiteSettingsProvider ICP 备案号", () => {
  let root: Root;
  let host: HTMLElement;
  let fetchMock: ReturnType<typeof vi.fn<any[], Promise<Response>>>;

  beforeEach(() => {
    localStorage.clear();
    installBeianFooter();
    host = document.getElementById("root")!;
    root = createRoot(host);
    fetchMock = vi.fn(async (url: string) => {
      const body = String(url).startsWith("https://notes.example.com/api/settings")
        ? {
            site_title: "nowen-note",
            site_favicon: "",
            site_icp_beian: "粤ICP备12345678号-1",
            editor_font_family: "",
          }
        : {
            site_title: "nowen-note",
            site_favicon: "",
            site_icp_beian: "",
            editor_font_family: "",
          };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("服务器地址确认后重新加载远端备案号并展示到登录页 footer", async () => {
    await act(async () => {
      root.render(
        <SiteSettingsProvider>
          <div>login page</div>
        </SiteSettingsProvider>,
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings");
    });
    expect(document.getElementById("beian-footer")?.classList.contains("is-visible")).toBe(false);

    await act(async () => {
      setServerUrl("https://notes.example.com");
    });

    await waitFor(() => {
      expect(document.getElementById("beian-link")?.textContent).toBe("粤ICP备12345678号-1");
    });
    expect(document.getElementById("beian-footer")?.classList.contains("is-visible")).toBe(true);
  });

  it("保存响应漏掉 site_icp_beian 时仍保留刚提交的备案号", async () => {
    function SaveIcpButton() {
      const { siteConfig, updateIcpBeian } = useSiteSettings();
      return (
        <button type="button" onClick={() => updateIcpBeian("粤ICP备888888888号-X")}>
          {siteConfig.icpBeian || "empty"}
        </button>
      );
    }

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(JSON.stringify({
          site_title: "nowen-note",
          site_favicon: "",
          editor_font_family: "",
          feature_personal_export_enabled: "true",
          feature_personal_import_enabled: "true",
          debug_files_query: "false",
          web_ui_enabled: "true",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        site_title: "nowen-note",
        site_favicon: "",
        site_icp_beian: "",
        editor_font_family: "",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await act(async () => {
      root.render(
        <SiteSettingsProvider>
          <SaveIcpButton />
        </SiteSettingsProvider>,
      );
    });

    const button = host.querySelector("button")!;
    await waitFor(() => {
      expect(button.textContent).toBe("empty");
    });

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      expect(button.textContent).toBe("粤ICP备888888888号-X");
    });
    expect(document.getElementById("beian-link")?.textContent).toBe("粤ICP备888888888号-X");
  });
});
