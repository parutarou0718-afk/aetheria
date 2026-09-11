import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const source = path.join(process.cwd(), '.env.demo.local');
const target = path.join(process.cwd(), 'desktop', 'generated', 'demo-env');
const required = ['AETHERIA_UPSTREAM_1_ID', 'AETHERIA_UPSTREAM_1_BASE_URL', 'AETHERIA_UPSTREAM_1_API_KEY', 'AETHERIA_UPSTREAM_1_MODELS', 'AETHERIA_UPSTREAM_1_ENABLED', 'AETHERIA_UPSTREAM_1_PRIORITY'];
if (!fs.existsSync(source)) throw new Error('Missing private .env.demo.local for demo build.');
const parsed = dotenv.parse(fs.readFileSync(source));
for (const key of required) if (!parsed[key]?.trim()) throw new Error(`Missing ${key} in .env.demo.local.`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
