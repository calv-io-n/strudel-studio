import { parseProject, type Project } from '../shared/model';
import { sameSession } from './storage/session-save';
export type SessionDraft = { version: 1; project: Project; base?: Project };
export function decodeDraft(text: string): SessionDraft {
  const value = JSON.parse(text);
  return value.version === 1 && value.project ? { version: 1, project: parseProject(value.project), base: value.base ? parseProject(value.base) : undefined } : { version: 1, project: parseProject(value) };
}
export class SessionDrafts {
  key = '';
  private release?: () => void;
  async initialize() {
    let id = sessionStorage.getItem('studio.tab') || crypto.randomUUID();
    const claim = (id: string) => new Promise<boolean>((resolve, reject) => {
      void navigator.locks.request(`studio-draft:${id}`, { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return; }
        return new Promise<void>(release => { this.release = release; resolve(true); });
      }).catch(reject);
    });
    if (!await claim(id)) { id = crypto.randomUUID(); await claim(id); }
    sessionStorage.setItem('studio.tab', id); this.key = `studio.pending-session.${id}`;
    window.addEventListener('pagehide', () => this.release?.(), { once: true });
  }
  read() {
    const text = localStorage.getItem(this.key) ?? localStorage.getItem('studio.pending-session');
    return text ? decodeDraft(text) : undefined;
  }
  cache(project: Project, base?: Project) {
    if (!this.key) return;
    if (base && sameSession(project, base)) localStorage.removeItem(this.key);
    else localStorage.setItem(this.key, JSON.stringify({ version: 1, project, base } satisfies SessionDraft));
  }
  clear() { if (this.key) localStorage.removeItem(this.key); }
}
