export const SIDEBAR_TREE_INDENT = 16;
export const SIDEBAR_TREE_LABEL_RESERVE_WIDTH = 120;
export const SIDEBAR_TREE_ROW_CHROME_WIDTH = 78;
export const SIDEBAR_TREE_COUNT_RESERVE_WIDTH = 30;
export const SIDEBAR_TREE_ROW_BASE_WIDTH = SIDEBAR_TREE_LABEL_RESERVE_WIDTH + SIDEBAR_TREE_ROW_CHROME_WIDTH + SIDEBAR_TREE_COUNT_RESERVE_WIDTH;

export function sidebarTreeRowMinWidth(depth: number): number {
  return SIDEBAR_TREE_ROW_BASE_WIDTH + depth * SIDEBAR_TREE_INDENT;
}

export function sidebarTreeContentMinWidth(maxDepth: number): number {
  return sidebarTreeRowMinWidth(maxDepth);
}
