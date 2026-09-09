import { pathToFileURL } from 'node:url';

/** Converts a local desktop runtime module path into an ESM-safe specifier. */
export function toDesktopModuleUrl(filePath: string): string {
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    return new URL(`file:///${filePath.replace(/\\/g, '/')}`).href;
  }
  return pathToFileURL(filePath).href;
}
