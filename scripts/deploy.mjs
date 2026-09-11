import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const vault = process.env.OBSIDIAN_VAULT || join(homedir(), 'Documents', 'obsidian-personal');
const obsidianDir = join(vault, '.obsidian');

if (!existsSync(obsidianDir)) {
	console.error(`Vault not found: ${obsidianDir} does not exist.`);
	process.exit(1);
}

const pluginDir = join(obsidianDir, 'plugins', 'obsidian-draw');
mkdirSync(pluginDir, { recursive: true });

for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	copyFileSync(file, join(pluginDir, file));
}

console.log(`Deployed to ${pluginDir}`);
