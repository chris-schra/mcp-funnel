You have been given a PR # to review.
If not, you **MUST** immediately stop and ask for the PR number.

## Setup

- load toolset reviewer: load_toolset (mcp-funnel MCP Server) {"name":"reviewer"}
- use tool `get_pull_request` to load PR details
- use tool `get_pull_request_reviews` to load existing reviews
- use tool `get_pull_request_comments` to load existing comments
- **NOTE**: if helpful, you can also use these tools when necessary:
  - get_pull_request_diff - Get the code diff
  - get_pull_request_files - Get changed files list
- use tool `create_pending_pull_request_review`
- create a thorough review following the instructions in `.haino/flows/review.md`
- if you found issues (even if they're only minor) you **MUST** use tool `add_comment_to_pending_review` to add comments to specific lines or files
- use tool `submit_pending_pull_request_review` to submit the review when done - body should be "Review Summary"
  you created after following `.haino/flows/review.md` - **ONLY** use event "COMMENT" - **NEVER** "APPROVE" or "REQUEST_CHANGES"

## Schemas:

### add_comment_to_pending_review

Required parameters:

- owner - Repository owner (string)
- repo - Repository name (string)
- pullNumber - PR number (number)
- path - File path to comment on (string)
- body - Comment text (string)
- subjectType - "FILE" or "LINE" (enum)

Optional parameters:

- line - Line number for single-line comments (number)
- side - "LEFT" or "RIGHT" for which side of diff (enum)
- startLine - First line for multi-line comments (number)
- startSide - Starting side for multi-line comments (enum)

### create_pending_pull_request_review

Required parameters:

- owner - Repository owner (string)
- repo - Repository name (string)
- pullNumber - PR number (number)
- event - Review action: "REQUEST_CHANGES" or "COMMENT" (enum)

Optional parameters:

- body - Overall review comment/summary (string)
