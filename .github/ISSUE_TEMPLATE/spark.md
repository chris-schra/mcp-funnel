---
name: SPARK Implementation Task
about: Self-contained implementation task for a single engineer
title: "[SPARK] "
labels: spark
assignees: ''
---

# SPARK: [Task Title]

## Parent Context
**Parent Burst**: #[issue_number] - [Brief description of parent burst]
**Dependencies**: [List any SPARK tasks that must be completed first, or write "None"]

## Objective
[Single sentence describing what this SPARK accomplishes]

## Implementation Requirements

### Reference Files to Study
<!-- List specific files engineers should study for patterns -->
<!-- Be specific about WHAT to look for and WHY -->

#### Configuration Patterns
- `packages/commands/ts-validate/package.json` - Study for:
  - Script naming conventions (build, test, release)
  - Export/main/types field configuration
  - Workspace dependency notation
- `packages/commands/ts-validate/tsconfig.json` - Minimal extension pattern
- `packages/commands/ts-validate/build.ts` - ESBuild and TypeScript compilation approach

### Files to Create
<!-- For CONFIGURATION files: Reference patterns + specific requirements -->
<!-- For IMPLEMENTATION files: Mocked structure only, NOT complete code -->
<!-- Engineers should understand WHAT to build, not copy-paste HOW -->

#### `path/to/config-file.json` (Configuration File)
```json
// Reference: See path/to/similar/config.json for pattern
// Requirements:
// - Must include X field for Y purpose
// - Follow workspace convention for Z
```

#### `path/to/implementation.ts` (Implementation File)
```typescript
// MOCK CODE - Illustrative structure only
// Shows WHAT to implement, not HOW

import { RequiredDependency } from 'package';

export interface SomeInterface {
  // Must handle X scenario
  // Engineer designs the interface shape
}

export class YourClass {
  // Must: validate input, process data, return result
  // Engineer implements the logic

  // SEAM: Extension point for future Y feature
}

// Must export these specific items
export { /* list required exports */ };
```

### Files to Modify
<!-- List each file with EXACT path, line numbers, and changes -->

#### `path/to/existing-file.ext`
**Current State (lines X-Y):**
```typescript
// Exact current code that will be replaced
```

**Required Change:**
```typescript
// Exact new code to replace the above
```

**Reason**: [Brief explanation of why this change is needed]

### Configuration Details
<!-- Provide COMPLETE configuration, not references to other packages -->

#### Package Dependencies
```json
{
  "dependencies": {
    "package-name": "^1.0.0"
  },
  "devDependencies": {
    "dev-package": "^2.0.0"
  }
}
```
**Why each dependency:**
- `package-name`: Brief reason for this dependency
- `dev-package`: Brief reason for this dev dependency

#### Build Configuration
```typescript
// MOCK CODE - Shows required build capabilities
// Engineer implements the actual build script
export const buildConfig = {
  entryPoint: 'src/index.ts',
  output: 'dist/',
  format: 'esm', // Must support ESM
  // Must handle TypeScript declarations
  // Must bundle appropriately
};
```

## Directory Structure
<!-- Explicitly state the directory structure to create -->
```
packages/your-package/
├── src/
│   ├── index.ts         // Entry point exporting...
│   └── types.ts         // Type definitions for...
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Steps
<!-- Numbered list of concrete actions -->
1. Create directory structure at `packages/...`
2. Create `package.json` with provided configuration
3. Create source files with provided templates
4. [Specific action with concrete details]

## Validation Checklist
<!-- Worker must verify each item before marking task complete -->
- [ ] All specified files created with exact content
- [ ] `yarn validate path/to/file.ts` succeeds
- [ ] `yarn test path/to/file.ts` passes
- [ ] No TODO comments or placeholder code remains

If there are TODO comments kept or introduced, they **MUST** be reported in the task completion message with justification.

## Success Criteria
<!-- How does the worker know they succeeded? -->
- Command/feature works as: `[exact command or usage example]`
- Types are properly exported and importable from: `@package-name`
- [Other specific, measurable criteria]

## Context & Rationale
<!-- Help worker understand the "why" without overwhelming with details -->
- This component provides: [brief purpose]
- It will be used by: [what depends on this]
- Key design decision: [if any critical choices were made]

## Potential Gotchas
<!-- Known issues or common mistakes to avoid -->
- Ensure ESM compatibility by using `.js` extensions in imports
- [Other specific warnings relevant to this task]

---
<!--
TEMPLATE GUIDELINES FOR ISSUE CREATORS:
1. Make it self-contained with clear references to study
2. For CONFIGURATION files:
   - Point to specific examples to study
   - Explain what patterns to follow and why
   - List specific requirements/modifications
3. For IMPLEMENTATION files:
   - Provide MOCKED/ILLUSTRATIVE code only
   - Show structure and requirements, not solutions
   - Let engineers design and implement
4. Include exact paths and line numbers for modifications
5. Specify all dependencies with versions and reasons
6. Give concrete validation steps (yarn validate, yarn test)
7. Keep focused on ONE deliverable
8. Teach patterns through examples, preserve creativity through requirements
-->