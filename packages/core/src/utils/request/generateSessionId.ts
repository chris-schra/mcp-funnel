import { v4 as uuidv4 } from 'uuid';

// just a seam for now
export function generateSessionId() {
  return uuidv4();
}
