const windowObj: {
  base44SharedInstances?: {
    [key: string]: { instance: any; _refCount: number };
  };
} =
  typeof window !== "undefined"
    ? (window as any)
    : { base44SharedInstances: {} };

// Singleton (shared between sdk instances)//
export function getSharedInstance<T>(name: string, factory: () => T): T {
  if (!windowObj.base44SharedInstances) {
    windowObj.base44SharedInstances = {};
  }
  if (!windowObj.base44SharedInstances[name]) {
    windowObj.base44SharedInstances[name] = {
      instance: factory(),
      _refCount: 0,
    };
  }
  windowObj.base44SharedInstances[name]._refCount++;
  return windowObj.base44SharedInstances[name].instance;
}

export function getSharedInstanceRefCount<T>(name: string): number {
  return windowObj.base44SharedInstances?.[name]?._refCount ?? 0;
}
