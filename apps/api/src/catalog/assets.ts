/** Asset port for catalog media. Do not store binaries in PostgreSQL. */

export interface CatalogAssetRecord {
  storageKey: string;
  publicUrl: string;
}

export interface CatalogAssetStore {
  publicUrl(storageKey: string): string;
}

export class LocalCatalogAssetStore implements CatalogAssetStore {
  publicUrl(storageKey: string): string {
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      // Pass-through only for already-stored keys; write paths must use isSafeExternalHttpUrl.
      return storageKey;
    }
    if (storageKey.includes('..') || storageKey.includes('\\') || storageKey.startsWith('/')) {
      return '/assets/catalog/invalid';
    }
    return `/assets/catalog/${storageKey}`;
  }
}
