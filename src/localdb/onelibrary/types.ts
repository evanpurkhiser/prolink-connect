/**
 * OneLibrary Entity Types
 */

/**
 * User-created tag (MyTag)
 */
export interface MyTag {
  id: number;
  name: string;
  isFolder: boolean;
  parentId: number | null;
}

/**
 * History session
 */
export interface HistorySession {
  id: number;
  name: string;
  parentId: number | null;
}

/**
 * Hot cue bank list
 */
export interface HotCueBankList {
  id: number;
  name: string;
  parentId: number | null;
}

/**
 * Menu item for browsing
 */
export interface MenuItem {
  id: number;
  kind: number;
  name: string;
}

/**
 * Browse category
 */
export interface Category {
  id: number;
  menuItemId: number;
  name: string;
  kind: number;
  isVisible: boolean;
}

/**
 * Sort option
 */
export interface SortOption {
  id: number;
  menuItemId: number;
  name: string;
  kind: number;
  isVisible: boolean;
  isSelectedAsSubColumn: boolean;
}

/**
 * Device property
 */
export interface DeviceProperty {
  deviceName: string;
  dbVersion: string;
  numberOfContents: number;
  createdDate: string;
  backgroundColorType: number;
}
