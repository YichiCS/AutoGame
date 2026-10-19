// 测试脚本在 Node 下运行，这里只声明用到的少量全局对象
declare const process: { argv: string[]; exit(code?: number): never; env: Record<string, string | undefined> };
declare module 'node:fs' {
  export function readFileSync(path: string, enc: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
}
