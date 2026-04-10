/**
 * Template utilities — pure functions for variable extraction and rendering.
 */

/**
 * Extract all {{variable}} placeholders from a template body.
 * Returns unique variable names without the curly braces.
 */
export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/**
 * Check if a template body contains any {{variable}} placeholders.
 */
export function hasPlaceholders(body: string): boolean {
  return /\{\{(\w+)\}\}/.test(body);
}

/**
 * Render a template body with provided variables.
 * Merges defaults with provided variables, then replaces all {{key}} placeholders.
 *
 * @param body - Template body with {{variable}} placeholders
 * @param variables - Values to substitute (override defaults)
 * @param defaults - Default values from Template.variables
 * @returns Rendered string with all placeholders replaced
 */
export function renderTemplate(
  body: string,
  variables: Record<string, string>,
  defaults: Record<string, string> = {},
): string {
  let rendered = body;
  const allVars = { ...defaults, ...variables };

  for (const [key, value] of Object.entries(allVars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(regex, value ?? '');
  }

  // Replace any remaining {{vars}} with empty string (fallback)
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, '');

  return rendered;
}

/**
 * Get all variables from a template with their default values.
 */
export function getVariablesWithDefaults(
  variables: Record<string, string> | null | undefined,
): Record<string, string> {
  return variables ?? {};
}
