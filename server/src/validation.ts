/**
 * Input validation shared by routes and services. A ValidationError maps to HTTP 400.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function requireText(value: unknown, field: string, maxLength: number = 200): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function requireId(value: unknown, field: string): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return id;
}

export function optionalIdList(value: unknown, field: string): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`);
  return value.map((v) => requireId(v, field));
}

/**
 * Normalizes a repository-relative path: `\` -> `/`, strips `./` and duplicate/leading/trailing slashes.
 * Rejects `..` segments, absolute/drive paths and anything inside `.git`.
 * Returns '' for the repository root.
 */
export function normalizeRepoPath(value: unknown, field: string = 'path'): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  const raw = value.trim().replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(raw)) {
    throw new ValidationError(`${field} '${value}' must be relative to the repository`);
  }
  const segments = raw.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) {
    throw new ValidationError(`${field} '${value}' must not contain '..'`);
  }
  if (segments[0]?.toLowerCase() === '.git') {
    throw new ValidationError(`${field} '${value}' must not point inside .git`);
  }
  return segments.join('/');
}

/**
 * Validates a task scope list. Root scope ('' / '/') is stored as '/'.
 */
export function normalizeScopePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('scopePaths must be a non-empty array of paths');
  }
  const normalized = value.map((p) => normalizeRepoPath(p, 'Scope path') || '/');
  return [...new Set(normalized)];
}

/**
 * Validates files sent to pushWork: non-empty list of { path, content } with a real file path.
 */
export function validatePushFiles(value: unknown): { path: string; content: string }[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('No files provided for commit');
  }
  return value.map((f: any) => {
    const filePath = normalizeRepoPath(f?.path, 'File path');
    if (!filePath) throw new ValidationError('File path must name a file');
    if (filePath === '.scrum.json') throw new ValidationError('.scrum.json is managed by SprintVault');
    if (typeof f.content !== 'string') throw new ValidationError(`Content of '${filePath}' must be a string`);
    return { path: filePath, content: f.content };
  });
}
