import { importSample } from './storage/workspace';
import { writePending, readPending } from './recovery';
import { unzip } from 'fflate';
import { encodeWav } from '../shared/wav';
import type { Asset } from '../shared/model';

type Entry = { file: File; path: string; selected: boolean; status: string; asset?: Asset; error?: string; source?: Asset['source']; provider?: 'github'; preview?: string };
export class SampleImports {
  readonly root = document.createElement('section');
  private entries: Entry[] = [];
  private cancelled = false;
  private running = false;
  private recoverId?: string;
  recover(id: string) { this.recoverId = id; this.status('Choose the original file to restore this sound under its existing identifier.'); this.el<HTMLInputElement>('files').click(); }
  private packId: string = crypto.randomUUID();
  constructor(private saved: (asset: Asset) => Promise<void>, private report: (message: string) => void, private session: () => string, private saveSession: () => Promise<void>) {
    this.root.innerHTML = `<h2>Upload files or pack</h2><p>WAV, MP3, OGG, FLAC or ZIP · 64 MB per file, 256 MB unpacked, 500 files, 15 minutes per sample.</p><label>Choose audio files or ZIP <input data-files type="file" multiple accept=".wav,.mp3,.ogg,.flac,.zip"></label><label>Choose sample folder <input data-folder type="file" webkitdirectory multiple></label><div data-drop tabindex="0" role="group" aria-label="Drop sample files">Drop files or a ZIP here; file pickers also work by keyboard.</div><label>Pack name (optional) <input data-pack maxlength="80"></label><button data-import>Import selected</button><button data-cancel>Cancel import</button><p data-import-status role="status">Choose files to review.</p><div data-review class="import-review"></div><audio data-audio controls></audio>`;
    for (const name of ['files', 'folder']) this.el<HTMLInputElement>(name).onchange = () => { void this.add(Array.from(this.el<HTMLInputElement>(name).files ?? [])).catch(error => this.report(error.message)); };
    this.el('drop').ondragover = event => event.preventDefault(); this.el('drop').ondrop = event => { event.preventDefault(); void this.add(Array.from(event.dataTransfer?.files ?? [])).catch(error => this.report(error.message)); };
    this.el('import').onclick = () => { void this.commit().catch(error => this.report(error.message)); };
    this.el('cancel').onclick = () => { this.cancelled = true; this.status('Cancelling after the current file; completed imports remain in the library.'); };
  }
  private persist() {
    void writePending(`imports:${this.session()}`, { entries: this.entries, packId: this.packId, packName: this.el<HTMLInputElement>('pack').value }).catch(() => this.report('Import review is retained in memory; browser recovery storage is unavailable.'));
  }
  async restore() {
    const saved = await readPending<{ entries: Entry[]; packId: string; packName: string }>(`imports:${this.session()}`);
    if (!saved || !Array.isArray(saved.entries) || saved.entries.length > 500 || saved.entries.some(entry => !(entry.file instanceof Blob))) return;
    this.entries = saved.entries.map(entry => ({ ...entry, preview: undefined })); this.packId = saved.packId; this.el<HTMLInputElement>('pack').value = saved.packName; this.render();
    this.status('Recovered import review · completed sounds retain their identifiers');
  }
  private el<T extends HTMLElement = HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-${name}]`)!; }
  private status(message: string) { this.el('import-status').textContent = message; }
  async add(files: File[], source?: Asset['source']) {
    if (this.running) throw new Error('Wait for the current import or cancel it before choosing more files.');
    await this.saveSession();
    this.entries.forEach(entry => { if (entry.preview) URL.revokeObjectURL(entry.preview); });
    this.entries = []; this.cancelled = false; this.packId = crypto.randomUUID(); this.running = true;
    let total = 0;
    const add = (file: File, name = file.webkitRelativePath || file.name) => {
      if (this.entries.length >= 500) throw new Error('A review supports up to 500 files.');
      total += file.size;
      const format = name.split('.').pop()?.toLowerCase();
      const error = file.size > 64_000_000 || total > 256_000_000 ? 'File or unpacked pack exceeds the size limit' : name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') ? 'Unsafe archive path' : !['wav', 'mp3', 'ogg', 'flac'].includes(format || '') ? 'Unsupported format' : undefined;
      this.entries.push({ file, path: name, selected: !error, status: 'Ready to import', error, source, provider: source?.url ? 'github' : undefined });
    };
    try {
      for (const file of files) {
        if (this.cancelled) break;
        if (/\.zip$/i.test(file.name) && file.size <= 64_000_000) {
          let unpacked = 0, count = 0; const skipped: string[] = [];
          const content = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
            void file.arrayBuffer().then(buffer => unzip(new Uint8Array(buffer), { filter: entry => {
              count++; unpacked += entry.originalSize;
              const allowed = count <= 500 && unpacked <= 256_000_000 && entry.originalSize <= 64_000_000 && !entry.name.endsWith('/') && !entry.name.startsWith('/') && !entry.name.includes('\\') && !entry.name.split('/').includes('..');
              if (!allowed && !entry.name.endsWith('/')) skipped.push(entry.name); return allowed;
            } }, (error, result) => error ? reject(error) : resolve(result)));
          });
          for (const name of skipped.slice(0, 500)) { if (this.entries.length >= 500) break; this.entries.push({ file: new File([], name), path: name, selected: false, status: '', error: 'Archive entry skipped: unsafe path or size limit' }); }
          if (count > 500 || unpacked > 256_000_000) this.status('Some archive entries exceeded the limits and were skipped.');
          for (const [name, bytes] of Object.entries(content)) add(new File([bytes as Uint8Array<ArrayBuffer>], name), name);
          this.el<HTMLInputElement>('pack').value = file.name.replace(/\.zip$/i, '').slice(0, 80);
        } else add(file);
        this.render(); await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (files.length > 1 && !this.el<HTMLInputElement>('pack').value) this.el<HTMLInputElement>('pack').value = 'Imported pack';
      this.status(`${this.entries.length} files ready for review`);
    } finally { this.running = false; this.render(); this.persist(); }
  }
  private render() {
    const list = this.el('review'); list.replaceChildren();
    for (const entry of this.entries) {
      const row = document.createElement('div'), label = document.createElement('label'), check = document.createElement('input'), status = document.createElement('span'), preview = document.createElement('button');
      row.className = 'import-row'; check.type = 'checkbox'; check.checked = entry.selected; check.disabled = !!entry.asset || entry.file.size > 64_000_000 || !/\.(wav|mp3|ogg|flac)$/i.test(entry.path) || !entry.file.size; check.onchange = () => { entry.selected = check.checked; this.persist(); };
      label.append(check, document.createTextNode(entry.path)); status.textContent = entry.error || entry.status;
      preview.textContent = 'Preview'; preview.disabled = !!entry.error;
      preview.onclick = () => { if (!entry.preview) entry.preview = URL.createObjectURL(entry.file); this.el<HTMLAudioElement>('audio').src = entry.preview; void this.el<HTMLAudioElement>('audio').play().catch(error => this.report(error.message)); };
      row.append(label, status, preview); list.append(row);
    }
  }
  private async commit() {
    if (this.running) return;
    this.running = true; this.cancelled = false;
    const context = new AudioContext();
    try {
      for (const [index, entry] of this.entries.entries()) {
        if (this.cancelled) break;
        if (!entry.selected || entry.asset) continue;
        entry.error = undefined; entry.status = 'Decoding…'; this.render(); this.status(`Importing ${index + 1} of ${this.entries.length}`);
        try {
          const original = await entry.file.arrayBuffer();
          const decoded = await context.decodeAudioData(original.slice(0));
          if (decoded.duration > 900 || decoded.duration <= 0) throw new Error('Sample must be at most 15 minutes.');
          if (this.cancelled) break;
          const wav = encodeWav(decoded.getChannelData(0), decoded.getChannelData(Math.min(1, decoded.numberOfChannels - 1)), decoded.sampleRate).buffer;
          const packName = this.el<HTMLInputElement>('pack').value.trim();
          const metadata = { recoverId: this.recoverId, name: entry.path, label: entry.path.split('/').pop()!.replace(/\.[^.]+$/, '').slice(0, 80) || 'Sample', originalBytes: original.byteLength, originalFormat: entry.path.split('.').pop()!.toLowerCase(), pack: packName ? { id: this.packId, name: packName, folder: entry.path.split('/').slice(0, -1).join('/') } : undefined, source: entry.source, provider: entry.provider || 'upload' };
          const result = await importSample(metadata, original, wav as ArrayBuffer);
          entry.asset = result.asset; this.recoverId = undefined; entry.status = result.reused ? 'Already imported · reused existing sound' : 'Imported'; await this.saved(result.asset);
        } catch (error) { entry.error = (error as Error).message; }
        this.render();
      }
      this.status(this.cancelled ? 'Import cancelled · completed sounds retained' : 'Import finished · review individual results');
    } finally { await context.close(); this.running = false; this.persist(); }
  }
}
