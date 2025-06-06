declare module 'json-parse-safe' {
  function parseJson<T = any>(
    input: string,
  ): { value: T | null; error: Error | null }
  export default parseJson
}
