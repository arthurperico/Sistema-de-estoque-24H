const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const copyPlan = [
    { source: 'html', target: path.join('public', 'html') },
    { source: 'css', target: path.join('public', 'css') },
    { source: 'javascript', target: path.join('public', 'javascript'), excludedDirectories: new Set(['servidor']) },
    { source: 'fotos', target: path.join('public', 'fotos') }
];

function copyDirectory(sourceDir, targetDir, excludedDirectories = new Set()) {
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (entry.isDirectory() && excludedDirectories.has(entry.name)) {
            continue;
        }

        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath, excludedDirectories);
            continue;
        }

        if (entry.isFile()) {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

for (const item of copyPlan) {
    const sourceDir = path.join(projectRoot, item.source);
    const targetDir = path.join(projectRoot, item.target);

    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Pasta de assets não encontrada: ${sourceDir}`);
    }

    copyDirectory(sourceDir, targetDir, item.excludedDirectories);
    console.log(`${item.source} -> ${item.target}`);
}
