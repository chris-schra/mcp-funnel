Development Terminology (Minimal, Deterministic)

Hierarchy (containment)

Request > Mission > Burst > Spark > Issue


A Request contains 1..n Missions

A Mission contains 1..n Bursts

A Burst contains 1..n Sparks

A Spark may produce 0..n Issues

An Issue must have exactly one parent: a Spark (preferred) or a Burst

Definitions

Request
The overall ask (can be tiny or huge). Describes why we’re doing something and the broad what. Flexible scope (from “bump a package” to “migrate JS→TS”).

Mission
The solution approach for a Request. Sets the strategy/architecture to achieve the Request. One Request can have multiple Missions.

Burst
A parallelizable chunk of work within a Mission. Groups Sparks that can run concurrently and converge on a shared outcome.

Spark
The smallest planned, actionable task (“Do this”). Concrete, testable, and specific enough for one focused work session.

Issue
An unplanned follow-up discovered during execution (bug, refactor need, risk, decision). It documents new information and is attached to its parent Spark (or Burst).

Core Rules (for agents & humans)

No silent scope changes: If new work appears, create an Issue; if it changes planned scope, add a new Spark (small) or Burst (larger).

One source of truth: Code changes should map to one Spark; Issues record unexpected work, decisions, or risks.

Parenting: Every Issue must point to exactly one parent (Spark preferred; Burst only if it spans multiple Sparks).

Parallelism boundary: Use Burst to delineate what can proceed in parallel; use Spark for the atomic unit of execution.

Referencing (neutral wording): While work is ongoing, reference items without implying completion (e.g., “Refs SP-…”, not “Fixes …”). Use closing verbs only when verified.