export const SIDEBAR_TREE_INDENT = 28;
export const SIDEBAR_TREE_LABEL_RESERVE_WIDTH = 260;
export const SIDEBAR_TREE_ROW_CHROME_WIDTH = 92;
export const SIDEBAR_TREE_ROW_BASE_WIDTH =
  SIDEBAR_TREE_LABEL_RESERVE_WIDTH + SIDEBAR_TREE_ROW_CHROME_WIDTH;

export function sidebarTreeRowMinWidth(depth: number): number {
  return SIDEBAR_TREE_ROW_BASE_WIDTH + Math.max(0, depth) * SIDEBAR_TREE_INDENT;
}

export function sidebarTreeContentMinWidth(maxDepth: number): number {
  return sidebarTreeRowMinWidth(maxDepth);
}
