This document defines the trust and observability layer of CodeMind.

Since CodeMind uses AI to analyse business logic, generate documentation, and provide recommendations, every important action must be traceable.

The core question:

"Why did CodeMind give this answer, and who changed this knowledge?"

Create:

docs/03-database/audit-schema.md

Content:

# Audit Schema Design


## Document Information

Module: Audit & Observability

Document: Audit Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Audit System records all important activities performed by:

- Users
- AI Agents
- MCP Clients
- Background Workers
- System Processes


The purpose is to provide:


- Transparency
- Security
- Debugging capability
- Compliance tracking
- AI trust



# 2. Why Audit Is Required



AI generated knowledge can affect developer decisions.


Example:


CodeMind generates:



Business Rule:

Paid invoices cannot be deleted.




A developer should know:



Where did this come from?

Which files support this?

Who approved it?

When was it created?




Audit provides this history.



# 3. Audit Architecture




User Action

  |

  v

Application Event

  |

  v

Audit Service

  |

  v

Audit Database

  |

  v

Audit Dashboard




# 4. Audit Data Types



CodeMind tracks:



## User Actions


Examples:



Created repository

Approved knowledge

Rejected AI suggestion

Updated documentation




---



## AI Actions


Examples:



Generated explanation

Created business rule

Updated documentation




---



## System Actions


Examples:



Repository indexed

Embedding generated

Worker executed




---



## MCP Actions


Examples:



AI client requested search

Tool executed

Context returned




# 5. Audit Log Table



Table:



audit_logs




Purpose:


Stores all system activities.



Schema:



```sql
audit_logs


id

organization_id

user_id

actor_type

action

entity_type

entity_id

description

metadata

created_at


Example:

{
 "action":
 "KNOWLEDGE_APPROVED",

 "entity":
 "business_rule",

 "entityId":
 "123"
}

6. Actor Types

Supported:

USER

AI_AGENT

SYSTEM

WORKER

MCP_CLIENT


Example:

Actor:

AI_AGENT


Action:

Generated Documentation

7. Audit Action Types
Repository Actions
REPOSITORY_CREATED

REPOSITORY_INDEXED

REPOSITORY_DELETED

Knowledge Actions
KNOWLEDGE_CREATED

KNOWLEDGE_UPDATED

KNOWLEDGE_APPROVED

KNOWLEDGE_REJECTED

AI Actions
AI_QUERY_EXECUTED

AI_RESPONSE_GENERATED

AI_MEMORY_CREATED

Documentation Actions
DOCUMENT_CREATED

DOCUMENT_UPDATED

DOCUMENT_APPROVED

8. Knowledge Audit

Important for AI trust.

Table:

knowledge_audit


Purpose:

Tracks knowledge lifecycle.

Schema:

knowledge_audit


id

knowledge_id

previous_value

new_value

changed_by

change_reason

created_at


Example:

Before:

Refund creates customer credit.


After:

Refund creates account adjustment.


Reason:

Developer correction

9. AI Decision Tracking

Table:

ai_decisions


Purpose:

Stores AI reasoning context.

Schema:

ai_decisions


id

request_id

decision_type

input_context

output

confidence

created_at


Example:

Decision:

Identify Payment Module


Confidence:

0.92


Evidence:

PaymentService.ts

10. Evidence Tracking

Every AI answer should have evidence.

Table:

audit_evidence


Schema:

audit_evidence


id

audit_id

source_type

source_id

relevance_score

created_at


Example:

AI Answer:

Invoice generated after payment.


Evidence:

PaymentService.createInvoice()

InvoiceService.generate()

11. MCP Audit

Table:

mcp_audit_logs


Purpose:

Tracks external AI access.

Schema:

mcp_audit_logs


id

client_id

user_id

tool_name

repository_id

request

response

tokens_used

created_at


Example:

Client:

Cursor


Tool:

explain_module


Module:

Payment

12. Security Audit

Tracks security-sensitive actions.

Examples:

Permission granted

Repository accessed

API key created

User removed


Table:

security_audit_logs


Schema:

security_audit_logs


id

actor_id

action

resource

ip_address

created_at

13. Change History

For important entities:

Maintain history.

Example:

Business Rule:

Version 1:

Discount applies to all users.


Version 2:

Discount applies only premium users.


Table:

entity_history


Schema:

entity_history


id

entity_type

entity_id

version

data

created_at

14. Audit Query Examples
Why does AI say this?

Query:

Find evidence for response ID 123


Returns:

Files:

payment.service.ts


Rules:

Payment validation rule


Knowledge:

Payment workflow

Who changed this rule?

Query:

Business Rule History


Returns:

Changed By:

Pradeep


Reason:

Corrected AI assumption


Date:

2026-07-29

15. Audit Retention

Different data has different retention.

Short term:

AI Conversations

Temporary Logs


Long term:

Business Rules

Architecture Decisions

Security Events

16. Audit Event Flow

Example:

Developer approves AI knowledge:

Developer


   |

   v


Knowledge Approved


   |

   v


Audit Event Created


   |

   v


Audit Database

17. TypeORM Example
@Entity()
export class AuditLog {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
actorType:string;


@Column()
action:string;


@Column("json")
metadata:any;


@CreateDateColumn()
createdAt:Date;


}

18. Index Strategy

audit_logs:

organization_id

user_id

action

entity_type

created_at


mcp_audit_logs:

client_id

tool_name

created_at

19. Monitoring Metrics

Track:

AI Decisions Count

Knowledge Approval Rate

Rejected Suggestions

MCP Usage

Security Events


Metrics:

ai_accuracy_score

knowledge_confidence

audit_events_per_day

20. Future Enhancements
AI Explainability Dashboard

Show:

Question

      |

Search Results

      |

Evidence

      |

AI Answer

Compliance Mode

For enterprise:

Full audit history

Immutable logs

Export reports

AI Trust Score

Calculate:

Evidence Quality

+

Developer Feedback

+

Historical Accuracy

Summary

The Audit System makes CodeMind trustworthy.

It answers:

"Can we trust this AI explanation?"

Because every answer can be traced back to:

Source code
Business rules
Knowledge
Developer approval
AI decisions

Core principle:

"AI should be explainable, not just intelligent."