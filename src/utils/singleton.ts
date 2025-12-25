


// Singleton (shared between sdk instances)//
export function getSharedInstance<T>(name: string, factory: () => T): T {
  const windowObj: Window & {
    base44?: { [key: string]: { instance: T; _refCount: number } };
  } = typeof window !== "undefined" ? (window as any) : { base44: {} };
  if (!windowObj.base44) {
    windowObj.base44 = {};
  }
  if (!windowObj.base44[name]) {
    windowObj.base44[name] = { instance: factory(), _refCount: 1 };
  }
  return windowObj.base44[name].instance;
}

export function getSharedInstanceRefCount<T>(name: string): number {
  const windowObj: Window & {
    base44?: { [key: string]: { instance: T; _refCount: number } };
  } = typeof window !== "undefined" ? (window as any) : { base44: {} };

  return windowObj.base44?.[name]?._refCount ?? 0;
}
