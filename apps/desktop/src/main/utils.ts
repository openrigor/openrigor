export function isSmokeTest(argv: string[]): boolean {
  return argv.includes("--smoke-test");
}
