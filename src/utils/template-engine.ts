import { PromptHubMCPError, ErrorCodes } from '../types';

/**
 * Template rendering context
 */
export interface TemplateContext {
  variables: Record<string, any>;
  dependencies?: Record<string, any>;
  helpers?: Record<string, Function>;
}

/**
 * Template engine for PromptDSL
 */
export class PromptTemplateEngine {
  private helpers: Map<string, Function> = new Map();

  constructor() {
    this.registerDefaultHelpers();
  }

  /**
   * Render a template with given context
   */
  render(template: string, context: TemplateContext): string {
    try {
      let rendered = template;

      // Replace simple variables first
      rendered = this.replaceVariables(rendered, context.variables);

      // Replace dependency references
      if (context.dependencies) {
        rendered = this.replaceDependencies(rendered, context.dependencies);
      }

      // Process helper functions
      rendered = this.processHelpers(rendered, context);

      // Process conditionals
      rendered = this.processConditionals(rendered, context);

      // Process loops
      rendered = this.processLoops(rendered, context);

      return rendered;
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.EXECUTION_FAILED,
        'Template rendering failed',
        error
      );
    }
  }

  /**
   * Register a custom helper function
   */
  registerHelper(name: string, fn: Function): void {
    this.helpers.set(name, fn);
  }

  /**
   * Extract all variables referenced in a template
   */
  extractVariables(template: string): string[] {
    const variables = new Set<string>();
    
    // Simple variable references {{variable}}
    const simpleVarRegex = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = simpleVarRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }

    // Helper function calls {{helper variable}}
    const helperRegex = /\{\{(\w+)\s+(\w+)\}\}/g;
    while ((match = helperRegex.exec(template)) !== null) {
      variables.add(match[2]);
    }

    // Conditional references {{#if variable}}
    const conditionalRegex = /\{\{#if\s+(\w+)\}\}/g;
    while ((match = conditionalRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }

    // Loop references {{#each items}}
    const loopRegex = /\{\{#each\s+(\w+)\}\}/g;
    while ((match = loopRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Validate template syntax
   */
  validateTemplate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Check for balanced braces
      const openBraces = (template.match(/\{\{/g) || []).length;
      const closeBraces = (template.match(/\}\}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        errors.push('Unbalanced template braces');
      }

      // Check for balanced conditionals
      const ifCount = (template.match(/\{\{#if/g) || []).length;
      const endifCount = (template.match(/\{\{\/if\}\}/g) || []).length;
      
      if (ifCount !== endifCount) {
        errors.push('Unbalanced if/endif blocks');
      }

      // Check for balanced loops
      const eachCount = (template.match(/\{\{#each/g) || []).length;
      const endeachCount = (template.match(/\{\{\/each\}\}/g) || []).length;
      
      if (eachCount !== endeachCount) {
        errors.push('Unbalanced each/endeach blocks');
      }

      // Check for valid helper references
      const helperRegex = /\{\{(\w+)\s+/g;
      let match;
      while ((match = helperRegex.exec(template)) !== null) {
        const helperName = match[1];
        if (!['if', 'each', 'unless'].includes(helperName) && !this.helpers.has(helperName)) {
          errors.push(`Unknown helper: ${helperName}`);
        }
      }
    } catch (error) {
      errors.push(`Template validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Private methods

  private replaceVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (varName in variables) {
        const value = variables[varName];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
      return match; // Leave unreplaced if variable not found
    });
  }

  private replaceDependencies(template: string, dependencies: Record<string, any>): string {
    // Replace module references like {{module "module_id" param="value"}}
    return template.replace(
      /\{\{module\s+"([^"]+)"([^}]*)\}\}/g,
      (match, moduleId, params) => {
        if (moduleId in dependencies) {
          return dependencies[moduleId];
        }
        return match;
      }
    );
  }

  private processHelpers(template: string, context: TemplateContext): string {
    let processed = template;

    // Process helper functions like {{uppercase variable}}
    for (const [helperName, helperFn] of this.helpers) {
      const regex = new RegExp(`\\{\\{${helperName}\\s+(\\w+)\\}\\}`, 'g');
      processed = processed.replace(regex, (match, varName) => {
        if (varName in context.variables) {
          try {
            return helperFn(context.variables[varName]);
          } catch (error) {
            console.warn(`Helper ${helperName} failed:`, error);
            return match;
          }
        }
        return match;
      });
    }

    return processed;
  }

  private processConditionals(template: string, context: TemplateContext): string {
    // Process {{#if condition}}...{{/if}} blocks
    return template.replace(
      /\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/gs,
      (match, condition, content) => {
        const value = context.variables[condition];
        return this.isTruthy(value) ? content : '';
      }
    );
  }

  private processLoops(template: string, context: TemplateContext): string {
    // Process {{#each items}}...{{/each}} blocks
    return template.replace(
      /\{\{#each\s+(\w+)\}\}(.*?)\{\{\/each\}\}/gs,
      (match, arrayName, content) => {
        const array = context.variables[arrayName];
        if (!Array.isArray(array)) {
          return '';
        }

        return array.map((item, index) => {
          return content
            .replace(/\{\{this\}\}/g, typeof item === 'string' ? item : JSON.stringify(item))
            .replace(/\{\{@index\}\}/g, index.toString());
        }).join('');
      }
    );
  }

  private isTruthy(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  }

  private registerDefaultHelpers(): void {
    // String helpers
    this.registerHelper('uppercase', (str: string) => str.toUpperCase());
    this.registerHelper('lowercase', (str: string) => str.toLowerCase());
    this.registerHelper('capitalize', (str: string) => 
      str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
    );
    this.registerHelper('trim', (str: string) => str.trim());

    // Number helpers
    this.registerHelper('round', (num: number) => Math.round(num));
    this.registerHelper('floor', (num: number) => Math.floor(num));
    this.registerHelper('ceil', (num: number) => Math.ceil(num));

    // JSON helpers
    this.registerHelper('json', (obj: any) => JSON.stringify(obj, null, 2));
    this.registerHelper('jsonCompact', (obj: any) => JSON.stringify(obj));

    // Array helpers
    this.registerHelper('length', (arr: any[]) => arr.length);
    this.registerHelper('first', (arr: any[]) => arr[0]);
    this.registerHelper('last', (arr: any[]) => arr[arr.length - 1]);
    this.registerHelper('join', (arr: any[], separator = ', ') => arr.join(separator));

    // Date helpers
    this.registerHelper('now', () => new Date().toISOString());
    this.registerHelper('timestamp', () => Date.now());
    this.registerHelper('formatDate', (date: string | number) => new Date(date).toLocaleDateString());

    // Utility helpers
    this.registerHelper('default', (value: any, defaultValue: any) => value || defaultValue);
    this.registerHelper('escape', (str: string) => 
      str.replace(/[&<>"']/g, (match) => {
        const escapeMap: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return escapeMap[match];
      })
    );
  }
} 