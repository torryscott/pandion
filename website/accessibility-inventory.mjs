// Every HTML delivery path is either scanned here or assigned to an app gate.
// New teaching/workshop pages are discovered without maintaining a short list.
import { readdirSync } from 'node:fs';
import path from 'node:path';

export function websiteInventory(root) {
    const entries = [];
    function visit(directory, prefix = '') {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink())
                throw new Error('Review symlink in website inventory: ' + prefix + entry.name);
            if (entry.isDirectory()) visit(path.join(directory, entry.name), prefix + entry.name + '/');
            else if (entry.name.endsWith('.html')) {
                const file = prefix + entry.name;
                // app-experimental/ is a temporary copy of the app built from
                // an unreleased branch. It is the application, not a website
                // page, and it takes the application gates when its branch
                // ships as app/; until then it is listed and not gated.
                const experimental = file === 'app-experimental/index.html';
                const application = experimental ||
                    ['app/index.html', 'pandion-plots.html'].includes(file);
                entries.push({ file,
                    surface: application ? 'application' : file === 'docs/index.html' ? 'guide' : 'website',
                    gate: experimental ? 'none while experimental: an unreleased copy of app/, gated when it ships'
                        : application ? 'standalone/verify/axe-state-check.mjs + chart-accessibility-check.mjs + pdf-accessibility-check.mjs'
                        : 'website/verify-axe.mjs' });
            }
        }
    }
    visit(root);
    for (const required of ['index.html', 'docs/index.html', 'app/index.html', 'pandion-plots.html'])
        if (!entries.some(entry => entry.file === required)) throw new Error('Missing public artifact: ' + required);
    return entries.sort((a, b) => a.file.localeCompare(b.file));
}
