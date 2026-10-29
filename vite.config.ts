import { readFileSync } from 'node:fs';
import { relative, basename, extname } from 'node:path';
import { defineConfig } from 'vite';

const manifest = JSON.parse(readFileSync('.asset-cache/manifest.json', 'utf8')) as Record<string, { url: string }>;

export default defineConfig({
  plugins: [{
    name: 'prepared-game-images',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (/^\/admin\/?(?:\?|$)/.test(req.url ?? '')) req.url = req.url!.replace(/^\/admin\/?/, '/admin.html');
        next();
      });
    },
    enforce: 'pre',
    load(id) {
      const source = id.split('?')[0];
      if (!source.endsWith('.png')) return;
      const entry = manifest[relative(process.cwd(), source).replaceAll('\\', '/')];
      if (entry) return `export default ${JSON.stringify(entry.url)};`;
    },
  }],
  build: {
    manifest: true,
    rolldownOptions: {
      input: { game: 'index.html', admin: 'admin.html' },
      output: { assetFileNames(asset) {
        const name = asset.names[0] ?? 'asset';
        return 'assets/' + basename(name, extname(name)).replace(/[^a-zA-Z0-9_-]/g, '_') + '-[hash][extname]';
      }, codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]/ }] } },
    },
  },
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.runtime/**'] },
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/api': { target: 'http://127.0.0.1:3001' },
    },
  },
});
