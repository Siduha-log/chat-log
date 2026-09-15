// Cloudflare WorkersランタイムのCache API拡張（`caches.default`）を型定義に追加する。
// 標準DOM libのCacheStorageにはdefaultプロパティがないための補完。
export {};

declare global {
  interface CacheStorage {
    default: Cache;
  }
}
