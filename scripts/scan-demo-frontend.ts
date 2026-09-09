import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const demoEnv = path.join(process.cwd(), 'desktop', 'generated', 'demo-env');
const key = dotenv.parse(fs.readFileSync(demoEnv)).AETHERIA_UPSTREAM_1_API_KEY;
if (!key) throw new Error('Generated Demo credential is missing.');
const scan = (directory: string): void => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (fs.readFileSync(file).includes(key)) throw new Error(`Demo credential leaked into frontend asset: ${file}`);
  }
};
scan(path.join(process.cwd(), 'dist'));
