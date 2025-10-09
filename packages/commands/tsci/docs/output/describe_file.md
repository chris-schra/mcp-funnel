## Basic

Removing usage, references and file name (I think that's pretty clear as we return it for describe_file for a given file).  
I checked "token estimators" and they show for this format around 400 tokens, while the full file (raw typeExpander.ts) is around 2500 tokens.

```yaml
symbols:
  - inline: "function expandType (type: Type, config: TypeExpanderConfig): string"
    lines: 359-362
    summary: Convenience function to expand a type with default configuration
  - inline: "function expandTypeWithResult (type: Type, config: TypeExpanderConfig): TypeExpansionResult"
    line: 367
  - inline: interface TypeExpanderConfig
    line: 39
    docLines: 1-18
    summary: Configuration options for TypeExpander
    members:
      - "expandPrimitiveUnions: boolean #L48"
      - "maxDepth: number #L42"
      - "preferArraySyntax: boolean #L45"
      - "skipTypes: Set<string> #L51"
  - inline: interface TypeExpansionResult
    line: 56
    summary: Result of type expansion
    members:
      - "expanded: string #L59"
      - "truncated: boolean #L62"
      - 'truncationReason: "depth" | "cycle" | "complexity" #L65'
  - inline: class TypeExpander
    line: 92
    summary: |-
      TypeExpander - Pure type expansion orchestrator with cycle detection.

      This service provides intelligent type expansion for TypeDoc Type objects,
      orchestrating specialized expanders for different type kinds.

      Core responsibilities:
      - Route types to appropriate specialized expanders
      - Enforce cycle detection to prevent infinite recursion
      - Apply configurable depth limits
      - Maintain visited type tracking across expansion

      Architecture (SEAMS):
      - TypeExpander: Pure orchestration (THIS CLASS)
      - Specialized expanders: Handle specific type kinds (primitives, objects, arrays, etc.)
      - SymbolReferenceManager: Symbol indexing and external reference extraction
      - TypePreviewGenerator: Type preview generation with ⟶ notation
```



**TBD**: if we skip the usages, I'm just worried that LLM might change the signature of a method without modifying call-sites.
