/**
 * Path mapping utilities for converting absolute paths to relative paths
 *
 * Provides functionality to find common directory prefixes and create
 * mappings from absolute to relative paths for cleaner output formatting.
 */

/**
 * Create a mapping from absolute paths to relative paths
 *
 * Finds the longest common directory prefix across all paths and creates
 * a mapping that strips this common base from each path.
 *
 * @param paths - Array of absolute file paths
 * @returns Map from absolute path to relative path
 */
export function createPathMapping(paths: string[]): Map<string, string> {
  const mapping = new Map<string, string>();

  if (paths.length === 0) {
    return mapping;
  }

  const uniquePaths = Array.from(new Set(paths));

  if (uniquePaths.length === 1) {
    const path = uniquePaths[0];
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
      mapping.set(path, path);
    } else {
      mapping.set(path, path.substring(lastSlash + 1));
    }
    return mapping;
  }

  const pathInfos = uniquePaths.map((p) => {
    const lastSlash = p.lastIndexOf('/');
    if (lastSlash === -1) {
      return { path: p, dirParts: [], filename: p };
    }
    const dir = p.substring(0, lastSlash);
    const filename = p.substring(lastSlash + 1);
    return { path: p, dirParts: dir.split('/'), filename };
  });

  let commonDepth = 0;
  const minDepth = Math.min(...pathInfos.map((info) => info.dirParts.length));

  while (commonDepth < minDepth) {
    const segment = pathInfos[0].dirParts[commonDepth];
    if (pathInfos.every((info) => info.dirParts[commonDepth] === segment)) {
      commonDepth++;
    } else {
      break;
    }
  }

  for (const info of pathInfos) {
    let relativePath: string;

    if (commonDepth === 0) {
      relativePath = info.path;
    } else {
      const remainingDirs = info.dirParts.slice(commonDepth);
      if (remainingDirs.length === 0) {
        relativePath = info.filename;
      } else {
        relativePath = [...remainingDirs, info.filename].join('/');
      }
    }

    mapping.set(info.path, relativePath);
  }

  return mapping;
}
