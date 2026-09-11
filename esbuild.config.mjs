import esbuild from 'esbuild';
import process from 'node:process';
import builtins from 'builtin-modules';

const production = process.argv[2] === 'production';

/** @type {import('esbuild').Plugin} */
const noNodeBuiltins = {
	name: 'no-node-builtins',
	setup(build) {
		const pattern = new RegExp(`^(${builtins.join('|')})$`);
		build.onResolve({ filter: pattern }, (args) => {
			return {
				errors: [
					{
						text: `Node built-in module "${args.path}" cannot be imported from src/ (Obsidian mobile has no Node runtime).`,
					},
				],
			};
		});
	},
};

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	format: 'cjs',
	target: 'es2020',
	platform: 'browser',
	external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtins],
	logLevel: 'info',
	sourcemap: production ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	minify: production,
	plugins: [noNodeBuiltins],
});

if (production) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
