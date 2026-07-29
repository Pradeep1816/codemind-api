This is one of the most important API documents because CodeMind's main purpose is not only code search but providing software intelligence to AI agents.

MCP (Model Context Protocol) allows:

Codex
Cursor
Claude Desktop
Internal AI assistants
Custom developer agents

to communicate with CodeMind.

The goal:

"AI agents should understand a complete software system without repeatedly reading millions of files."

# CodeMind MCP API Design


## 1. Introduction


MCP (Model Context Protocol) is the integration layer that
allows AI agents to access CodeMind intelligence.


Instead of AI agents directly reading repositories:



AI Agent

|

v

Repository Files

|

v

Limited Understanding



CodeMind provides:



AI Agent

|

v

CodeMind MCP Server

|

+----------------+

|                |

Code Index Knowledge Graph

|

v

Business Understanding



MCP enables AI systems to query:

- Code structure
- Repository knowledge
- Business rules
- Architecture information
- Documentation
- Dependency relationships



# 2. MCP Goals


## Reduce AI Token Consumption


Traditional approach:



Developer asks:

"Explain payment flow"

AI reads:

1000 files

Consumes:

Large context window



CodeMind approach:



Repository Indexed

    |

Knowledge Extracted

    |

AI receives relevant context only




Benefits:


- Lower token usage
- Faster responses
- Better accuracy



---



## Provide Software Intelligence


MCP should expose:


- What code does
- Why code exists
- How modules interact
- Where business rules live



---



## Secure AI Access


AI agents must follow:


- User permissions
- Repository permissions
- Organization boundaries



# 3. MCP Architecture



High-level architecture:



            Developer


                |

                v


          AI Client


    (Cursor / Codex / Claude)


                |

                v


          MCP Protocol


                |

                v


        CodeMind MCP Server


                |

    +-----------+-----------+

    |                       |


Search Engine        Knowledge Engine


    |                       |


    +-----------+-----------+


                |

                v


         Repository Index



# 4. MCP Components



## MCP Server



Responsible for:


- Receiving AI requests
- Validating permissions
- Fetching context
- Returning structured responses



Module:



src/mcp/




---



## MCP Tools


Actions AI agents can execute.



Examples:




search_code

explain_module

find_business_rule

analyze_impact




---



## MCP Resources


Information exposed to AI.



Examples:




repository_structure

architecture_map

business_rules

documentation




---



## MCP Prompts


Reusable AI workflows.



Examples:




Explain this module

Find payment flow

Analyze impact of change




# 5. MCP Authentication



MCP requests require authentication.



Flow:




AI Client

|

v

MCP Authentication

|

v

Validate User

|

v

Check Repository Permission

|

v

Allow Access




Authentication methods:



Initial:



JWT Token




Future:



API Keys

OAuth

Enterprise Identity




# 6. MCP Request Flow



Example:



Developer asks:




"Explain invoice generation flow"




Flow:




Cursor

|

v

MCP Tool Call

|

v

CodeMind MCP Server

|

v

Semantic Search

|

v

Knowledge Retrieval

|

v

AI Context Response




# 7. MCP Tools API



Base path:




/api/v1/mcp/tools




# 8. Search Code Tool



Tool:



search_code




Purpose:


Find relevant source code.



Request:



```json
{
 "repositoryId":"repo_123",

 "query":"invoice creation logic"
}

Response:

{
 "results":[
  {
   "file":"invoice.service.ts",

   "function":"createInvoice",

   "score":0.94
  }
 ]
}
9. Explain Module Tool

Tool:

explain_module


Purpose:

Explain a complete module.

Request:

{
 "repositoryId":"repo_123",

 "module":"payment"
}

Response:

{
 "summary":
 "Payment module handles invoice charging",

 "dependencies":[
   "InvoiceService",
   "PaymentGateway"
 ]
}
10. Find Business Rule Tool

Tool:

find_business_rule


Purpose:

Discover hidden business logic.

Request:

{
 "repositoryId":"repo_123",

 "question":
 "How discount is calculated?"
}

Response:

{
 "rules":[
  {
   "description":
   "Summer promotion applies 15% discount",

   "location":
   "discount.service.ts"
  }
 ]
}
11. Impact Analysis Tool

Tool:

analyze_impact


Purpose:

Understand change impact.

Request:

{
 "repositoryId":"repo_123",

 "change":
 "Modify InvoiceService"
}

Response:

{
 "affectedModules":[
   "Payment",
   "Reporting",
   "Notifications"
 ]
}
12. Architecture Tool

Tool:

architecture_overview


Returns:

Modules
Dependencies
Data flow
Communication patterns

Example:

{
 "modules":[
  "Auth",
  "Payment",
  "Invoice"
 ]
}
13. MCP Resources

Resources available:

Repository Structure
repository://structure/{id}


Contains:

Folders
Files
Modules
Knowledge Graph
knowledge://graph/{id}


Contains:

Relationships
Dependencies
Business rules
Documentation
docs://repository/{id}


Contains:

Generated documentation
Architecture notes
14. MCP Prompt Templates

Examples:

Explain Legacy System

Prompt:

Explain this legacy system architecture.

Include:

- Main modules
- Data flow
- Business rules

Debug Feature

Prompt:

Find all code involved in this feature
and explain possible impact.

New Developer Onboarding

Prompt:

Create onboarding documentation
for this repository.

15. MCP Security Model

MCP follows:

User Authentication

        +

Repository Authorization

        +

Tool Permission Check


Example:

Developer has access:

payment-service


AI can query:

payment-service


Cannot access:

hr-service

16. MCP Permission Model

Permissions:

mcp.access


mcp.search


mcp.explain


mcp.analysis


mcp.documentation


Example:

Developer:

mcp.search

mcp.explain


Admin:

All MCP permissions

17. MCP Context Optimization

One major CodeMind feature:

Traditional AI
Repository

5000 files


        |

        v


AI Context


        |

        v


High Token Usage

CodeMind
Repository


        |

        v


Index


        |

        v


Relevant Context


        |

        v


AI Response



Benefits:

Lower cost
Better answers
Faster analysis
18. MCP Response Format

Standard:

{
 "success":true,

 "data":{

 }
}

Include metadata:

{
 "metadata":{

  "repository":"payment-service",

  "sourceFiles":10,

  "confidence":0.92

 }
}
19. MCP Error Handling

Examples:

MCP_AUTH_FAILED


REPOSITORY_ACCESS_DENIED


CONTEXT_NOT_FOUND


AI_CONTEXT_LIMIT

20. MCP Implementation Structure

NestJS:

src/


mcp/


├── mcp.controller.ts

├── mcp.service.ts

├── tools/

│   ├── search.tool.ts

│   ├── explain.tool.ts

│   └── analysis.tool.ts


├── resources/

└── prompts/

21. MCP Future Features
Autonomous Code Agent

AI can:

Understand repository
Create plan
Suggest changes
Generate documentation
Multi Repository Intelligence

Example:

Frontend Repository

        +

Backend Repository

        +

Database Repository


        |

        v


Complete System Understanding

Developer Copilot

Example:

Why does this API return this value?


CodeMind:

Explains business reason

22. MCP Design Principles

CodeMind MCP follows:

Security First


+

Minimal Context


+

Maximum Understanding


+

Tool Based Intelligence

Conclusion

MCP transforms CodeMind from a code search system into a
software intelligence platform.

The final goal:

"AI agents should understand software systems like experienced engineers."