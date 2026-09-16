import { getSessionUser } from './auth.js';

const GITHUB_API = 'https://api.github.com';
const MAX_OUTPUT = 12000;
const MAX_LIMIT = 20;

function githubToken() { return process.env.GITHUB_TOKEN || ''; }
function clean(value, max = 300) { return String(value || '').trim().slice(0, max); }
function repoParts(input) {
  const owner = clean(input?.owner || input?.repository?.split('/')[0], 100);
  const repo = clean(input?.repo || input?.repository?.split('/')[1], 100);
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('A valid GitHub owner/repository is required.');
  return { owner, repo };
}
async function github(path, options = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'global-ai-assistant' };
  if (githubToken()) headers.Authorization = `Bearer ${githubToken()}`;
  const response = await (options.fetchImpl || fetch)(`${GITHUB_API}${path}`, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `GitHub request failed (${response.status}).`);
  return data;
}

async function githubRepo(input, context, fetchImpl) {
  const { owner, repo } = repoParts(typeof input === 'string' ? { repository: input } : input);
  const data = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { fetchImpl });
  return { name: data.full_name, description: data.description, defaultBranch: data.default_branch, visibility: data.visibility, language: data.language, stars: data.stargazers_count, openIssues: data.open_issues_count, updatedAt: data.updated_at, url: data.html_url };
}

async function githubFile(input, context, fetchImpl) {
  const value = typeof input === 'string' ? { repository: input } : input || {};
  const { owner, repo } = repoParts(value);
  const path = clean(value.path, 500).replace(/^\/+/, '');
  if (!path) throw new Error('A repository file path is required.');
  const ref = value.ref ? `?ref=${encodeURIComponent(clean(value.ref, 120))}` : '';
  const data = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}${ref}`, { fetchImpl });
  if (Array.isArray(data)) return { type: 'directory', entries: data.slice(0, MAX_LIMIT).map(x => ({ name: x.name, type: x.type, path: x.path, size: x.size })) };
  if (data.type !== 'file') return { type: data.type, path: data.path };
  if (data.size > 200000) throw new Error('GitHub file is too large for this tool.');
  const raw = await (fetchImpl || fetch)(data.download_url, { headers: { 'User-Agent': 'global-ai-assistant' } });
  if (!raw.ok) throw new Error(`Could not read GitHub file (${raw.status}).`);
  const content = (await raw.text()).slice(0, MAX_OUTPUT);
  return { type: 'file', path: data.path, size: data.size, truncated: content.length >= MAX_OUTPUT, content, url: data.html_url };
}

async function githubIssues(input, context, fetchImpl) {
  const value = typeof input === 'string' ? { repository: input } : input || {};
  const { owner, repo } = repoParts(value);
  const state = ['open', 'closed', 'all'].includes(value.state) ? value.state : 'open';
  const limit = Math.min(Math.max(Number(value.limit) || 10, 1), MAX_LIMIT);
  const data = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${state}&per_page=${limit}`, { fetchImpl });
  return data.filter(x => !x.pull_request).map(x => ({ number: x.number, title: x.title, state: x.state, user: x.user?.login, labels: (x.labels || []).map(l => l.name), createdAt: x.created_at, updatedAt: x.updated_at, url: x.html_url }));
}

const EXTERNAL_TOOLS = {
  github_repo: githubRepo,
  github_file: githubFile,
  github_issues: githubIssues
};

export function externalToolRegistry() { return EXTERNAL_TOOLS; }
export function registerExternalToolRoutes(app) {
  app.get('/api/tools/status', async (req, res) => {
    const user = await getSessionUser(req).catch(() => null);
    if (!user?.id) return res.status(401).json({ error: 'Login required.' });
    res.set('Cache-Control', 'no-store');
    res.json({ tools: { github: { configured: Boolean(githubToken()), mode: githubToken() ? 'authenticated-read' : 'public-read' }, aws: { configured: Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ROLE_ARN || process.env.AWS_WEB_IDENTITY_TOKEN_FILE), mode: 'read-only-adapter' } } });
  });
}
export const _test = { repoParts, githubToken, EXTERNAL_TOOLS, MAX_OUTPUT, MAX_LIMIT };
