/**
 * Helper to flatten linked list structures into an array
 */
export const flattenLinkedList = (item: any): any => [
  item,
  ...(item.next() ? flattenLinkedList(item.next()) : []),
];
