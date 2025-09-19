⚠️ Remaining Issues and Areas for Improvement

## Token URL Leakage NOT FIXED
Risk: Tokens might still be in URLs
The eventsource package v4.0.0 DOES NOT HAVE a fetch option! Our "fix" is passing a non-existent option:
```
// THIS DOESN'T WORK - fetch option doesn't exist!
this.eventSource = new EventSource(url, {
fetch: customFetch,  // ❌ IGNORED - NOT A VALID OPTION
withCredentials: false,
});
```

Valid options for eventsource v4.0.0:
- headers - We should use this instead!
- withCredentials
- https
- proxy

### Check
- [ ] Checked and analyzed
- [ ] Is valid issue that needs to be fixed
- [ ] Fixed with commit <commit_hash>

**Inconsistent Error Handling:**
The codebase still exhibits two different patterns for creating TransportError instances (static factory methods vs. direct enum usage). Consolidating this to a single pattern would
improve consistency.
- [ ] Checked and analyzed
- [ ] Is valid issue that needs to be fixed
- [ ] Fixed with commit <commit_hash>

**Redundant `StdioClientTransport`:**
The legacy PrefixedStdioClientTransport still exists in index.ts and is used for backward compatibility, while a new, more robust StdioClientTransport is in the transports directory.
Migrating fully to the new implementation would eliminate this redundancy.
- [ ] Checked and analyzed
- [ ] Is valid issue that needs to be fixed
- [ ] Fixed with commit <commit_hash>

**Missing Use Case:**
The implementation for mcp-funnel to act as an OAuth provider (for CLIs to authenticate against it) is still missing. The current implementation only covers mcp-funnel acting as an OAuth
client.
- [ ] Checked and analyzed
- [ ] Is valid issue that needs to be fixed
- [ ] Fixed with commit <commit_hash>

**TODOs:**
A quick scan of the code reveals a "TODO: handle disconnects" in packages/mcp/src/index.ts. This should be addressed to ensure the proxy can gracefully handle servers going offline.
- [ ] Checked and analyzed
- [ ] Is valid issue that needs to be fixed
- [ ] Fixed with commit <commit_hash>