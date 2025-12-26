const windowObj: {
  base44SharedInstances?: {
    [key: string]: { instance: any };
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
    };
  }
  return windowObj.base44SharedInstances[name].instance;
}
