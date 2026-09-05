/** Stable object IDs also work in HTTP previews, where randomUUID is unavailable. */
export function randomId(prefix:string,random:Pick<Crypto,'getRandomValues'> & Partial<Pick<Crypto,'randomUUID'>>=globalThis.crypto):string {
  const value=random.randomUUID?.()??Array.from(random.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${prefix}_${value}`;
}
