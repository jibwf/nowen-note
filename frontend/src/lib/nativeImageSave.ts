import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Capacitor 原生插件接口：将图片保存到 Android 系统相册。
 */
interface MediaStoreSavePlugin {
  saveImage(options: {
    base64Data: string;
    fileName: string;
    mimeType: string;
    relativePath?: string;
  }): Promise<{ success: boolean; uri: string }>;
}

const MediaStoreSave = registerPlugin<MediaStoreSavePlugin>("MediaStoreSave");

/**
 * 判断当前是否运行在 Android 原生环境中（Capacitor App）。
 */
export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * 将 Blob 图片保存到 Android 系统相册。
 * 仅在 Capacitor Android 环境下可用，其他环境调用会抛错。
 */
export async function saveImageToGallery(options: {
  blob: Blob;
  fileName: string;
  mimeType: string;
}): Promise<boolean> {
  const { blob, fileName, mimeType } = options;

  // Blob → base64（去掉 data:image/xxx;base64, 前缀）
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 "data:image/png;base64," 前缀
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read blob as base64"));
    reader.readAsDataURL(blob);
  });

  const result = await MediaStoreSave.saveImage({
    base64Data,
    fileName,
    mimeType,
    relativePath: "Pictures/Nowen Note",
  });

  return result.success;
}