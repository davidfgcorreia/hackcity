declare module 'osrm-text-instructions' {
  interface Compiler {
    compile(language: string, step: object, options?: { legCount?: number; legIndex?: number; waypointName?: string }): string
  }
  export default function osrmTextInstructions(version: 'v5'): Compiler
}
