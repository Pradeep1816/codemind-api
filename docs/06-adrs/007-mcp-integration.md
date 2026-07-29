This ADR defines how CodeMind exposes its intelligence to external AI development tools.

The goal:

"Allow any AI coding assistant to use CodeMind as a software knowledge layer."

Examples:

Codex CLI
Cursor
Claude Desktop
GitHub Copilot Agents
Internal AI agents

Create:

docs/06-adrs/007-mcp-integration.md

Content:

# ADR-007: MCP Integration Strategy


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


Modern AI coding assistants can generate and modify code,
but they usually have limited understanding of enterprise
codebases.


Examples:



AI Agent:

"Explain payment flow"

Problem:

AI does not know the company's architecture,
business rules, or previous decisions.



CodeMind solves this by becoming a knowledge provider.



Instead of:



Developer

|

v

AI Assistant

|

v

Repository Files



The future architecture becomes:



Developer

|

v

AI Assistant

|

v

CodeMind MCP Server

|

v

Repository Intelligence




# 2. What is MCP?


MCP (Model Context Protocol) is a standard protocol
that allows AI applications to connect with external
data sources and tools.


MCP allows CodeMind to expose:


- Tools
- Resources
- Prompts
- Context



# 3. Requirements


CodeMind MCP integration should support:



## External AI Tools


Examples:



Cursor

Codex

Claude

Copilot

Custom Agents




---



## Repository Intelligence Access


AI agents should access:


- Code search
- Business rules
- Architecture knowledge
- Documentation
- Dependency information



---



## Security


MCP must enforce:


- User authentication
- Repository permissions
- Organization isolation



---



## Low Token Usage


AI should request only required information.



# 4. Options Considered



# Option 1: Direct API Integration



Architecture:



AI Tool

|

v

Custom CodeMind API



Advantages:


- Simple


Problems:


- Every AI tool requires custom integration
- No standard protocol
- Hard to maintain



Decision:


Rejected.



---



# Option 2: MCP Server



Architecture:



AI Client

|

v

MCP Protocol

|

v

CodeMind Intelligence



Advantages:


- Standard protocol
- Multiple AI clients
- Reusable tools
- Future compatible



Decision:


Selected.



---



# Option 3: Plugin System



Architecture:



AI Tool

|

Plugin

|

CodeMind



Problems:


- Vendor specific
- Different implementation per platform



Decision:


Rejected.



# 5. Decision


CodeMind will provide an MCP Server.



Architecture:


             AI Clients


   +-----------+------------+

   |           |            |


Cursor     Codex       Claude


   |           |            |


   +-----------+------------+


                |


                v


          CodeMind MCP


                |


                v


      Code Intelligence Layer



# 6. MCP Server Responsibilities



The MCP layer provides:



## Tools


Actions AI can execute.



Examples:




search_code

explain_module

find_business_rule

trace_execution_flow

impact_analysis




---



## Resources


Information AI can read.



Examples:




Repository structure

Architecture map

Database schema

Module documentation




---



## Prompts


Reusable AI instructions.



Examples:




Explain this legacy module

Review architecture

Analyze risk




# 7. MCP Tool Design



## Tool: search_code



Purpose:


Find relevant code.



Input:


```json
{
 "query":"payment processing",
 "repositoryId":"123"
}

Output:

{
 "results":[
   {
    "file":"payment.service.ts",
    "symbol":"processPayment",
    "score":0.92
   }
 ]
}
Tool: explain_module

Purpose:

Explain a software module.

Input:

module:

invoice


Output:

Invoice module handles:

- Invoice creation
- Payment calculation
- Tax processing

Sources:

invoice.service.ts

invoice.entity.ts

Tool: impact_analysis

Purpose:

Predict change impact.

Input:

Change:

Modify PaymentService


Output:

Affected:

Invoice Module

Subscription Module

Reporting Module


Risk:

High

8. MCP Architecture

Flow:

User Question


        |

        v


AI Assistant


        |

        v


MCP Request


        |

        v


CodeMind MCP Server


        |

        +----------------+

        |                |


 Search Engine     Knowledge Engine


        |                |


        +----------------+


                |

                v


            Response


9. Authentication Strategy

MCP requests require authentication.

Initial:

JWT Token


Future:

OAuth2

SSO

Enterprise Identity

10. Permission Model

Every request checks:

User


 |

 v


Organization


 |

 v


Repository Permission


 |

 v


Access Granted


Example:

Developer A:

Can access:

Project A


Cannot access:

Project B

11. MCP Data Protection

Never expose:

Secrets

Environment Variables

Passwords

Private Keys


Sensitive files:

.env

credentials.json

secret files


must be filtered.

12. MCP + AI Agent Workflow

Example:

Developer:

Why does invoice calculation fail?


AI Agent:

Uses MCP:

1. Search invoice logic

2. Find related services

3. Retrieve business rules

4. Generate explanation


CodeMind returns:

Cause:

Discount calculation changed in InvoiceService.


Evidence:

invoice.service.ts

line 120

13. Future MCP Extensions
Code Modification Tools

Future tools:

create_patch

generate_test

refactor_module

Architecture Tools
generate_diagram

analyze_architecture

detect_patterns

Migration Tools
plan_migration

estimate_effort

generate_steps

14. MCP Deployment Strategy

Initial:

Same NestJS Application


        |

        v


MCP Module


Future:

CodeMind Core


        |


        v


Independent MCP Service

15. Consequences
Positive
Universal AI Integration

Works with multiple AI assistants.

Lower Development Cost

One integration supports many tools.

Future Proof

Aligned with AI ecosystem standards.

Better AI Context

Agents receive structured knowledge.

Negative
Additional Security Layer

Requires authentication and permission handling.

Protocol Maintenance

MCP standards may evolve.

More API Design

Tools must be carefully designed.

16. Final Decision Summary
Area	Decision
Integration	MCP Server
Protocol	Model Context Protocol
Clients	Cursor, Codex, Claude, Copilot
Authentication	JWT initially
Tool Layer	CodeMind Intelligence APIs
Future	Standalone MCP Service
Conclusion

CodeMind will become a knowledge layer between software
repositories and AI assistants.

Final decision:

"AI agents should not directly read millions of files.
They should ask CodeMind for intelligent context."