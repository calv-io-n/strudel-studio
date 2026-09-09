import { discoverGitHub, downloadGitHub, type GitHubSelection } from './github';
import type { SampleImports } from './imports';
export class GitHubImports {
  readonly root = document.createElement('section');
  private selection?: GitHubSelection;
  private abort?: AbortController;
  private busy = false;
  constructor(private imports: SampleImports, private report: (message: string) => void) {
    this.root.innerHTML = `<h2>From GitHub</h2><p>Choose a public repository, folder or audio file. Check the source license before using its sounds.</p><label>Public GitHub link <input data-url type="url" placeholder="https://github.com/owner/samples"></label><label>Branch, tag or commit (optional) <input data-revision></label><button data-discover>Find samples</button><button data-download disabled>Download selected for review</button><button data-cancel>Cancel GitHub request</button><p data-github-status role="status"></p><div data-remote class="import-review"></div>`;
    this.el('discover').onclick = () => void this.run(signal => this.discover(signal));
    this.el('download').onclick = () => void this.run(signal => this.download(signal));
    this.el('cancel').onclick = () => { this.abort?.abort(); this.status('GitHub request cancelled'); };
  }
  private el<T extends HTMLElement = HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-${name}]`)!; }
  private status(text: string) { this.el('github-status').textContent = text; }
  private request(signal: AbortSignal): typeof fetch { return (url, options) => fetch(url, { ...options, signal: AbortSignal.any([signal, options?.signal ?? AbortSignal.timeout(60000)]) }); }
  private async run(action: (signal: AbortSignal) => Promise<void>) {
    if (this.busy) return;
    this.busy = true; this.abort = new AbortController();
    this.el<HTMLButtonElement>('discover').disabled = this.el<HTMLButtonElement>('download').disabled = true;
    try { await action(this.abort.signal); }
    catch (error) { const message = this.abort.signal.aborted ? 'GitHub request cancelled. Completed imports are retained.' : `${(error as Error).message} You can also download the files yourself and use Upload.`; this.status(message); if (!this.abort.signal.aborted) this.report(message); }
    finally { this.busy = false; this.el<HTMLButtonElement>('discover').disabled = false; this.el<HTMLButtonElement>('download').disabled = !this.selection; }
  }
  private async discover(signal: AbortSignal) {
    this.selection = undefined; this.el('remote').replaceChildren(); this.status('Finding samples…');
    const result = await discoverGitHub({ url: this.el<HTMLInputElement>('url').value, revision: this.el<HTMLInputElement>('revision').value || undefined }, this.request(signal));
    signal.throwIfAborted(); this.selection = result;
    for (const file of result.files) {
      const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.value = file.path; check.checked = file.size <= 64_000_000; check.disabled = file.size > 64_000_000;
      label.append(check, document.createTextNode(`${file.path} · ${(file.size / 1_000_000).toFixed(1)} MB${check.disabled ? ' · over limit' : ''}`)); this.el('remote').append(label);
    }
    this.status(`${result.files.length} samples · revision ${result.revision}`);
  }
  private async download(signal: AbortSignal) {
    const selection = this.selection; if (!selection) throw new Error('Find samples first.');
    const paths = Array.from(this.el('remote').querySelectorAll<HTMLInputElement>('input:checked')).map(input => input.value);
    if (!paths.length) throw new Error('Select at least one sample.');
    if (selection.files.filter(file => paths.includes(file.path)).reduce((sum, file) => sum + file.size, 0) > 256_000_000) throw new Error('Selection exceeds 256 MB; choose fewer samples.');
    const files: File[] = [], errors: string[] = []; let total = 0;
    for (const [index, path] of paths.entries()) {
      if (signal.aborted) break;
      this.status(`Downloading ${index + 1} of ${paths.length}…`);
      try {
        const bytes = await downloadGitHub({ owner: selection.owner, repo: selection.repo, revision: selection.revision, path }, this.request(signal));
        total += bytes.length;
        if (total > 256_000_000) { errors.push('Selection exceeds 256 MB; choose fewer files.'); break; }
        files.push(new File([bytes], path));
      } catch (error) { errors.push(`${path}: ${(error as Error).message}`); }
    }
    if (files.length) await this.imports.add(files, { name: selection.repo, url: selection.url, revision: selection.revision });
    this.status(`${files.length} downloaded for review.${errors.length ? ' ' + errors.join(' · ') + ' Retry failed files or use Upload.' : ''}${signal.aborted ? ' Cancelled; downloaded files retained.' : ''}`);
  }
}
