This document defines the Model Context Protocol (MCP) integration layer of CodeMind.

MCP is the bridge that allows external AI agents like:

Codex
Cursor
Claude
Copilot Agents
Internal AI assistants

to consume CodeMind intelligence.

Instead of every AI agent indexing the repository separately:

Without CodeMind MCP


Developer

   |

   v


AI Agent


   |

   v


Clone Repository


   |

   v


Index Code


   |

   v


Consume Tokens



With CodeMind:

Developer

   |

   v


AI Agent


   |

   v


CodeMind MCP Server


   |

   +----------------+

   |                |

Knowledge       Search

Code Graph      Business Rules


   |

   v


Small Relevant Context


   |

   v


AI Response


Create:

docs/03-database/mcp-schema.md

Content:

# MCP Schema Design


## Document Information

Module: MCP Integration

Document: MCP Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The MCP layer exposes CodeMind intelligence through
Model Context Protocol.


It allows AI agents to query:


- Code understanding
- Repository knowledge
- Business rules
- Documentation
- Architecture information
- Search results



The MCP layer does not expose raw repositories by default.


It exposes understanding.



# 2. MCP Architecture




AI Client

(Codex/Cursor/Claude)

    |

    |

    v

MCP Protocol

    |

    |

    v

CodeMind MCP Server

    |

    +----------------+

    |                |

Search Engine Knowledge Engine

    |

    |

    v

CodeMind Database




# 3. MCP Responsibilities



The MCP module handles:


- Client authentication
- Tool registration
- Resource exposure
- Context retrieval
- Permission validation
- Request logging



# 4. MCP Components




MCP Server

|

+---- Tools

|

+---- Resources

|

+---- Prompts

|

+---- Sessions

|

+---- Permissions



# 5. MCP Client Entity



Table:



mcp_clients




Purpose:


Stores connected AI clients.



Schema:


```sql
mcp_clients


id

organization_id

name

client_type

api_key

status

created_at

updated_at


Example:

Client:

Cursor IDE


Type:

AI_AGENT

6. MCP Session Schema

Table:

mcp_sessions


Purpose:

Tracks active AI connections.

Schema:

mcp_sessions


id

client_id

user_id

repository_id

started_at

last_activity

status


Example:

User:

Developer


Repository:

smw-api2


Session:

Active

7. MCP Tool Schema

Table:

mcp_tools


Purpose:

Stores available MCP tools.

Example tools:

search_code

explain_module

find_business_rule

trace_workflow

generate_documentation

impact_analysis


Schema:

mcp_tools


id

name

description

input_schema

output_schema

enabled

created_at

8. Available MCP Tools
search_code

Purpose:

Find relevant code.

Example:

Request:

Find payment retry logic


Response:

PaymentService.retryPayment()

PaymentRetryHandler

explain_module

Purpose:

Explain complete modules.

Example:

Explain invoice module


Response:

Invoice module handles:

- Creation
- Tax calculation
- Payment association

find_business_rule

Purpose:

Find business behaviour.

Example:

Why cannot paid invoice be deleted?


Response:

Business Rule:

Paid invoices are immutable.

Evidence:

InvoiceService.delete()

trace_workflow

Purpose:

Follow business process.

Example:

Trace customer payment flow


Response:

Controller

 |

Payment Service

 |

Invoice Service

 |

Notification

impact_analysis

Purpose:

Predict changes.

Example:

If PaymentService changes, what breaks?


Response:

Affected:


Invoice Module

Subscription Module

Reporting Module

9. MCP Resource Schema

Table:

mcp_resources


Purpose:

Defines accessible information.

Resources:

repository://overview

repository://architecture

repository://business-rules

repository://documentation

repository://code-map


Schema:

mcp_resources


id

name

resource_uri

resource_type

permission

created_at

10. MCP Prompt Schema

Table:

mcp_prompts


Purpose:

Provides reusable AI instructions.

Example:

legacy-system-analysis


migration-planning


code-review


Schema:

mcp_prompts


id

name

description

template

created_at


Example:

Analyze this legacy module.

Explain:

1. Purpose

2. Dependencies

3. Business rules

4. Risks

11. MCP Permission Schema

Table:

mcp_permissions


Purpose:

Controls access.

Schema:

mcp_permissions


id

client_id

repository_id

permission_type

created_at


Permission types:

READ_CODE

READ_KNOWLEDGE

READ_BUSINESS

READ_DOCUMENTATION

12. MCP Request Log

Table:

mcp_requests


Purpose:

Audit AI usage.

Schema:

mcp_requests


id

session_id

tool_name

request

response_time

token_saved

created_at


Example:

Tool:

search_code


Tokens Saved:

45000

13. Token Optimization Tracking

Important metric:

Before CodeMind:

Repository Context:

100,000 tokens


After CodeMind:

Retrieved Context:

5,000 tokens


Store:

mcp_token_metrics


id

request_id

original_tokens

used_tokens

saved_tokens

created_at

14. MCP Request Flow

Example:

Developer asks:

Explain refund process


Flow:

AI Client


    |

    v


MCP Tool Call


    |

    v


CodeMind MCP Server


    |

    v


Search Knowledge


    |

    v


Retrieve Business Workflow


    |

    v


Return Context


    |

    v


AI Generates Answer

15. MCP + RAG Architecture
Question


   |

   v


MCP Server


   |

   v


Search Engine


   |

   +------------+

   |            |


Vector DB   Knowledge DB


   |

   v


Relevant Context


   |

   v


LLM

16. TypeORM Example
@Entity()
export class McpTool {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
name:string;


@Column()
description:string;


@Column()
enabled:boolean;


}

17. Index Strategy

mcp_tools:

name

enabled


mcp_sessions:

client_id

repository_id

status


mcp_requests:

session_id

created_at

18. Security Requirements

MCP must enforce:

Authentication
Repository permissions
User authorization
Request auditing
Rate limiting

Important:

AI agents should never bypass CodeMind permissions.

19. Future Enhancements
Multi Agent Collaboration

Example:

Analysis Agent

        |

Documentation Agent

        |

Migration Agent

MCP Marketplace

Allow organizations to create:

Custom Tools

Custom Prompts

Custom Knowledge Providers

Real-Time Code Intelligence

Git push:

Code Change


    |

    v


Update Index


    |

    v


MCP Immediately Uses New Knowledge

Summary

The MCP Schema makes CodeMind a universal
software intelligence provider.

Instead of AI agents repeatedly analysing code:

AI Agent

     |

     v

CodeMind Knowledge

     |

     v

Answer


Core principle:

"Build understanding once, expose it everywhere."