import fs from 'fs';
import path from 'path';
import { Application } from 'express';
import { AwilixContainer } from 'awilix';
import type { IAppModule } from './app-module';

/**
 * ModuleLoader — Auto-discover va load cac AppModule tu libs/modules/
 * Convention: moi module PHAI co file src/index.ts (hoac .js) export mot IAppModule.
 */
export function loadModules(app: Application, container: AwilixContainer): void {
    const modulesDir = path.resolve(__dirname, '../../../modules');

    if (!fs.existsSync(modulesDir)) {
        console.warn(`⚠️  Modules directory not found: ${modulesDir}`);
        return;
    }

    const moduleFolders = fs.readdirSync(modulesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`\n🔍 Discovering modules in ${modulesDir}...`);

    for (const folder of moduleFolders) {
        // Tim ca .ts lan .js de tuong thich ca 2 giai doan
        const tsEntry = path.join(modulesDir, folder, 'src', 'index.ts');
        const jsEntry = path.join(modulesDir, folder, 'src', 'index.js');
        const entryFile = fs.existsSync(tsEntry) ? tsEntry : fs.existsSync(jsEntry) ? jsEntry : null;

        if (!entryFile) {
            console.warn(`⚠️  Skipping [${folder}]: no src/index.ts or src/index.js found`);
            continue;
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const imported = require(entryFile);
            // Handle both `export default` (TS → CJS wraps as { default: ... })
            // and direct `module.exports = ...`
            const mod = (imported.default ?? imported) as IAppModule;

            if (typeof mod.register !== 'function') {
                console.warn(`⚠️  Skipping [${folder}]: missing register() method`);
                continue;
            }

            mod.register(app, container);
        } catch (err) {
            console.error(`❌ Failed to load module [${folder}]:`, (err as Error).message);
        }
    }

    console.log('✅ All modules loaded.\n');
}

