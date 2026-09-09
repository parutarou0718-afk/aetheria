import { pathToFileURL } from 'node:url';

/** Converts a local desktop runtime module path into an ESM-safe specifier. */
export function toDesktopModuleUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}
