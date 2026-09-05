import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyNativeRender(sourcePath, manifestPath, { requireVideo = false } = {}) {
    const manifest = JSON.parse((await readFile(manifestPath, 'utf8')).replace(/^\uFEFF/, ''));
    if (manifest.format !== 'paperdom-native-render' || manifest.version !== 1 || manifest.renderer !== 'Microsoft PowerPoint' || !manifest.rendererVersion || !manifest.rendererBuild)
        throw new Error('Expected a Microsoft PowerPoint native rendering manifest.');
    if (manifest.sourceSha256 !== digest(await readFile(sourcePath))) throw new Error('Native evidence belongs to a different PPTX.');
    if (!Number.isInteger(manifest.slideCount) || manifest.slideCount < 1 || manifest.slideCount > 10000 || !Number.isInteger(manifest.width) || manifest.width < 1 || !Number.isInteger(manifest.height) || manifest.height < 1) throw new Error('Invalid slide count or dimensions.');
    if (!Array.isArray(manifest.artifacts) || new Set(manifest.artifacts.map(a => a.file)).size !== manifest.artifacts.length) throw new Error('Invalid artifact list.');
    const required = ['presentation.pdf', ...Array.from({ length: manifest.slideCount }, (_, i) => `slide-${String(i + 1).padStart(3, '0')}.png`), ...(manifest.video || requireVideo ? ['presentation.mp4'] : [])];
    if (required.some(file => !manifest.artifacts.some(a => a.file === file))) throw new Error('Native evidence is incomplete.');
    const root = await realpath(dirname(manifestPath));
    for (const artifact of manifest.artifacts) {
        if (typeof artifact.file !== 'string' || basename(artifact.file) !== artifact.file || artifact.file.includes('\\')) throw new Error('Invalid artifact path.');
        const path = await realpath(resolve(root, artifact.file));
        if (!path.startsWith(root + sep)) throw new Error('Artifact escapes its evidence directory.');
        const info = await stat(path);
        if (!info.isFile() || info.size !== artifact.bytes || !info.size) throw new Error(`Invalid artifact size: ${artifact.file}`);
        const bytes = await readFile(path);
        if (digest(bytes) !== artifact.sha256) throw new Error(`Artifact integrity failed: ${artifact.file}`);
        if (artifact.file.endsWith('.png') && (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.length < 24 || bytes.readUInt32BE(16) !== manifest.width || bytes.readUInt32BE(20) !== manifest.height)) throw new Error('Native image dimensions do not match the manifest.');
        if (artifact.file.endsWith('.pdf') && bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid native PDF.');
        if (artifact.file.endsWith('.mp4') && bytes.subarray(4, 8).toString() !== 'ftyp') throw new Error('Invalid native video.');
    }
    return { sourceSha256: manifest.sourceSha256, slides: manifest.slideCount, video: !!manifest.video, rendererVersion: manifest.rendererVersion, rendererBuild: manifest.rendererBuild };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node scripts/verify-native-render.mjs input.pptx evidence/native-render.json [--video]');
        console.log(JSON.stringify(await verifyNativeRender(process.argv[2], process.argv[3], { requireVideo: process.argv.includes('--video') }), null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
