// 由 esbuild 处理的资源模块
declare module '*.css';
declare module '*.woff2' {
  const url: string;
  export default url;
}
