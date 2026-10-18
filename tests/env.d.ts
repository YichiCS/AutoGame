// 测试脚本在 Node 下运行，这里只声明用到的少量全局对象
declare const process: { argv: string[]; exit(code?: number): never; env: Record<string, string | undefined> };
