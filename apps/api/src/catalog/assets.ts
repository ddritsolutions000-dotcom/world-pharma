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
      return storageKey;
    }
    return `/assets/catalog/${storageKey}`;
  }
}
