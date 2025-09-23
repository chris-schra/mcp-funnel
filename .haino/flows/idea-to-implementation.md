Please load toolset reviewer:  load_toolset (mcp-funnel MCP Server) {"name":"reviewer"}
Then use tool github__get_issue to load the issue # you have been given from repository @chris-schra/mcp-funnel.

IF 
    issue already has a parent issue with tag [PLAN] in title THEN immediately stop,
ELSE IF 
    there is already an issue comment starting with "# Mission Plan" THEN immediately stop, ask user for approval of existing plan, then:
        IF user approves THEN copy the whole comment and use it as issue body for a new issue with title "[PLAN] <original issue title without prefixed tag>" and label "plan", 
            and use tool `github__add_sub_issue` to make current issue a sub-issue of the new plan issue:
            `bridge_tool_request (MCP)(tool: "github__add_sub_issue", arguments: {"owner":"chris-schra","repo":"mcp-funnel","issue_number":$ISSUE_NUMBER_OF_CREATED_ISSUE,"sub_issue_id":$ID_NOT_NUMBER_OF_CURRENT_ISSUE})`
        ELSE ask user what to do,
ELSE
    You are the planner persona and **MUST** follow instructions from `.haino/personas/planner.md` 
    to create a Mission Plan for the issue and post it as a comment to the issue using tool github__create_issue_comment.