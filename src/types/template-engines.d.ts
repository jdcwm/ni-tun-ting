declare module 'ejs' {
  export function render(template: string, data?: any, options?: any): string;
  export function renderFile(path: string, data?: any, options?: any): string;
  export function compile(template: string, options?: any): (data?: any) => string;
  const _ejs: {
    render: typeof render;
    renderFile: typeof renderFile;
    compile: typeof compile;
  };
  export default _ejs;
}

declare module 'nunjucks' {
  export class Environment {
    constructor(templatesPath?: any, options?: any);
    renderString(template: string, context?: any): string;
    addFilter(name: string, filter: (...args: any[]) => any): void;
    addExtension(name: string, extension: any): void;
  }
  export function configure(options: any): void;
  export function render(template: string, context?: any): string;
  const _nunjucks: {
    Environment: typeof Environment;
    configure: typeof configure;
    render: typeof render;
  };
  export default _nunjucks;
}