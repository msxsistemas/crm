// Test setup — ensures environment variables are set before any test file loads
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Add backend node_modules to module resolution path
const __dir = dirname(fileURLToPath(import.meta.url));
process.env.NODE_PATH = join(__dir, '..', 'node_modules');
