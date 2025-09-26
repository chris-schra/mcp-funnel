import { promises as fs } from 'fs';

/**
 * Check if a file exists at the given path
 * @param filepath
 */
async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Create a timestamped backup of the given file if it exists
 *
 * @param filepath - The path to the file to backup
 * @returns The backup file path if backup was created, null if file doesn't exist
 */
export async function createBackup(filepath: string): Promise<string | null> {
  if (!(await fileExists(filepath))) {
    return null;
  }

  const backupPath = `${filepath}.backup.${Date.now()}`;
  await fs.copyFile(filepath, backupPath);
  console.info(`  Created backup: ${backupPath}`);
  return backupPath;
}
