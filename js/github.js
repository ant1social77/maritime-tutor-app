// GitHub REST API: чтение дерева/файлов приватного репо и атомарный коммит через Git Data API.
// Токен (fine-grained, только этот репо, Contents: Read and write) хранится только на устройстве.

export function ghSource({ owner, repo, branch = 'main', token, api: apiRoot }) {
  // apiRoot — только для теста с локальным мок-сервером (app/tests/mock_github.py)
  const base = `${apiRoot || 'https://api.github.com'}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch { /* */ }
      const e = new Error(`GitHub ${r.status}: ${msg}`);
      e.status = r.status;
      throw e;
    }
    return raw ? r : r.json();
  }

  return {
    kind: 'gh',
    async listFiles() {
      const ref = await api(`/git/ref/heads/${encodeURIComponent(branch)}`);
      const head = ref.object.sha;
      const t = await api(`/git/trees/${head}?recursive=1`);
      return {
        head,
        truncated: t.truncated,
        entries: t.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha, size: e.size })),
      };
    },
    async fetchText(entry) {
      const r = await api(`/git/blobs/${entry.sha}`, { raw: true });
      return r.text();
    },
    async fetchBlob(entry) {
      const r = await api(`/git/blobs/${entry.sha}`, { raw: true });
      const type = /\.pdf$/i.test(entry.path) ? 'application/pdf' : 'application/octet-stream';
      return new Blob([await r.arrayBuffer()], { type });
    },
    /** Один коммит со всеми файлами. При гонке (ветка ушла вперёд) — ошибка с conflict=true. */
    async commit({ head, files, message }) {
      const blobs = {};
      const tree = [];
      for (const f of files) {
        const b = await api('/git/blobs', {
          method: 'POST',
          body: f.b64 != null ? { content: f.b64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' },
        });
        blobs[f.path] = b.sha;
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
      }
      const parent = await api(`/git/commits/${head}`);
      const t = await api('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree } });
      const c = await api('/git/commits', { method: 'POST', body: { message, tree: t.sha, parents: [head] } });
      try {
        await api(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: c.sha, force: false } });
      } catch (e) {
        if (e.status === 422 || e.status === 409) e.conflict = true;
        throw e;
      }
      return { commit: c.sha, blobs };
    },
    async check() {
      const r = await fetch(base, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) { const e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
      const j = await r.json();
      return { private: j.private, canPush: !!j.permissions?.push, defaultBranch: j.default_branch };
    },
  };
}
