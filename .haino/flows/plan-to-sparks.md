Please load toolset reviewer:  load_toolset (mcp-funnel MCP Server) {"name":"reviewer"}
Then use tool github__get_issue to load the issue # you have been given from repository @chris-schra/mcp-funnel.

IF 
    issue title is **not** prefixed with "[PLAN]" 
    THEN 
        immediately stop and ask user how to proceed.

ELSE
    load subissues using tool `github__list_sub_issues`: 
        `mcp-funnel - bridge_tool_request (MCP)(tool: "github__list_sub_issues", arguments: {"owner":"chris-schra","repo":"mcp-funnel","issue_number":$ISSUE_NUMBER})`
    IF
        there are no subissues
        THEN
            you are the supervisor persona and **MUST** follow instructions from `.haino/personas/supervisor.md` and
            must suggest to create the **first** burst issue (title must be prefixed with `[BURST]`) based on the specific burst plan in the issue body, and use 
            `bridge_tool_request (MCP)(tool: "github__add_sub_issue", arguments: {"owner":"chris-schra","repo":"mcp-funnel","issue_number":$ID_NOT_NUMBER_OF_CURRENT_ISSUE,"sub_issue_id":$ISSUE_NUMBER_OF_CREATED_ISSUE})`
            (IMPORTANT: the burst issue must be created first! For the `sub_issue_id` you must use the issue ID - NOT number - of the created burst issue)
            to make it a sub-issue of the current issue. Then create sub-issues of the Burst issue for each Spark (title must be prefixed with `[SPARK]`).
    END IF
