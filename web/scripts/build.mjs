import './check-node.mjs';
import { syncFunctionData } from './sync-function-data.mjs';
// Set this before importing Vite: the desktop terminal can inherit development mode.
process.env.NODE_ENV = 'production';
syncFunctionData();
const { build } = await import('vite');
await build({ mode: 'production' });
