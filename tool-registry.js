const TOOL_DEFINITIONS = [
  {
    name: 'web_search',
    description: 'Search the public web for current information. Read-only.',
    risk: 'low',
    permissions: ['web_read'],
    mutating: false,
    destructive: false
  },
  {
    name: 'file_read',
    description: 'Read a user-provided file that is already attached to the current task. Read-only.',
    risk: 'low',
    permissions: ['file_read'],
    mutating: false,
    destructive: false
  },
  {
    name: 'code_execution',
    description: 'Execute code in an isolated sandbox for analysis. No external writes.',
    risk: 'medium',
    permissions: ['code_execution'],
    mutating: false,
    destructive: false
  },
  {
    name: 'external_write',
    description: 'Write to an external service or system. Disabled unless explicitly approved.',
    risk: 'high',
    permissions: ['external_write'],
    mutating: true,
    destructive: false
  },
  {
    name: 'destructive_action',
    description: 'Delete, revoke, terminate, or otherwise irreversibly modify an external resource. Disabled by default.',
    risk: 'high',
    permissions: ['destructive_actions'],
    mutating: true,
    destructive: true
  }
];

const BY_NAME = new Map(TOOL_DEFINITIONS.map(tool => [tool.name, Object.freeze({ ...tool, permissions: Object.freeze([...tool.permissions]) })]));

export function listTools() {
  return TOOL_DEFINITIONS.map(tool => ({ ...tool, permissions: [...tool.permissions] }));
}

export function getTool(name) {
  const tool = BY_NAME.get(String(name || ''));
  return tool ? { ...tool, permissions: [...tool.permissions] } : null;
}

export function toolAllowed(name, policy = {}) {
  const tool = BY_NAME.get(String(name || ''));
  if (!tool) return false;
  if (tool.destructive && policy.destructive_actions !== true) return false;
  if (tool.mutating && !tool.destructive && policy.external_write !== true) return false;
  return tool.permissions.every(permission => policy[permission] === true);
}

export function authorizeTool(name, policy = {}) {
  const tool = getTool(name);
  if (!tool) return { allowed: false, reason: 'Unknown tool.' };
  if (!toolAllowed(name, policy)) {
    return {
      allowed: false,
      reason: tool.destructive
        ? 'Destructive actions require explicit approval.'
        : tool.mutating
          ? 'External writes require explicit approval.'
          : `Missing permission: ${tool.permissions.join(', ')}.`
    };
  }
  return { allowed: true, reason: 'Tool is allowed by the active policy.' };
}

export const _test = { TOOL_DEFINITIONS, listTools, getTool, toolAllowed, authorizeTool };
