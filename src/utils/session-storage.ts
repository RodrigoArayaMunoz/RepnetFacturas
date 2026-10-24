type StringStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type Manifest = { generation: string; count: number };

function readManifest(value: string | null): Manifest | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<Manifest>;
    return typeof candidate.generation === 'string' &&
      /^[a-z0-9-]+$/.test(candidate.generation) &&
      Number.isInteger(candidate.count) && candidate.count! > 0 && candidate.count! <= 256
      ? candidate as Manifest
      : null;
  } catch {
    return null;
  }
}

/** Publish the manifest last so an interrupted refresh preserves the old session. */
export function createChunkedSessionStorage(storage: StringStorage): StringStorage {
  const pending = new Map<string, Promise<void>>();

  async function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const operation = (pending.get(key) ?? Promise.resolve()).then(action);
    const settled = operation.then(() => {}, () => {});
    pending.set(key, settled);
    try {
      return await operation;
    } finally {
      if (pending.get(key) === settled) pending.delete(key);
    }
  }

  async function clean(key: string, manifest: Manifest | null) {
    if (!manifest) return;
    await Promise.allSettled(Array.from({ length: manifest.count }, (_, index) =>
      storage.removeItem(`${key}.${manifest.generation}.${index}`)));
  }

  return {
    getItem: (key) => serial(key, async () => {
      const manifest = readManifest(await storage.getItem(`${key}.manifest`));
      if (!manifest) return null;
      const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, index) =>
        storage.getItem(`${key}.${manifest.generation}.${index}`)));
      return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
    }),
    setItem: (key, value) => serial(key, async () => {
      const previous = readManifest(await storage.getItem(`${key}.manifest`));
      // 400 Unicode code points stay below 2 KB even with four-byte characters.
      const characters = Array.from(value);
      const count = Math.max(1, Math.ceil(characters.length / 400));
      if (count > 256) throw new Error('La sesión supera el tamaño permitido.');
      const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const manifest = { generation, count };
      try {
        for (let index = 0; index < count; index += 1) {
          await storage.setItem(`${key}.${generation}.${index}`,
            characters.slice(index * 400, (index + 1) * 400).join(''));
        }
        await storage.setItem(`${key}.manifest`, JSON.stringify(manifest));
      } catch (error) {
        await clean(key, manifest);
        throw error;
      }
      await clean(key, previous);
    }),
    removeItem: (key) => serial(key, async () => {
      const manifest = readManifest(await storage.getItem(`${key}.manifest`));
      await storage.removeItem(`${key}.manifest`);
      await clean(key, manifest);
    }),
  };
}
