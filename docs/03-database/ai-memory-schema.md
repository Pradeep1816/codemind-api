This document defines how CodeMind stores AI interaction memory.

The previous layers:

Repository Schema
        |
        v
Code Intelligence
        |
        v
Knowledge Engine
        |
        v
Embeddings

allow CodeMind to understand the software.

The AI Memory layer allows CodeMind to learn from interactions and avoid repeating expensive analysis.

# AI Memory Schema


## Document Information

Module: AI Intelligence

Document: AI Memory Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


AI Memory stores information generated during AI interactions.


The goal is to make CodeMind improve over time.


Instead of:


Developer asks:

"How does payment work?"


Every time:


- Search repository
- Analyse code
- Generate explanation


CodeMind can remember:


- Previous explanations
- Developer feedback
- Confirmed knowledge
- Common questions



# 2. Purpose


AI Memory provides:


- Conversation history
- Context retention
- Developer preferences
- Knowledge feedback
- AI improvement



# 3. Memory Architecture




Developer

|

v

AI Request

|

v

Memory Retrieval

|

v

Knowledge + Context

|

v

AI Response

|

v

Store Memory




# 4. Memory Types



CodeMind supports different memory categories.



## 4.1 Conversation Memory


Stores:


- Questions
- Answers
- Context used


Example:



Question:

How does invoice generation work?

Answer:

Invoice is created after payment validation.




---



## 4.2 Knowledge Memory


Stores confirmed understanding.



Example:



Rule:

Refund creates account credit.

Confirmed:

Yes




---



## 4.3 Developer Memory


Stores user-specific preferences.



Example:



Developer prefers:

Detailed explanations

TypeScript examples

Architecture diagrams




---



## 4.4 Agent Memory


Stores AI execution state.



Example:



Previous analysis:

Payment module completed.

Next task:

Analyse refund flow.




# 5. AI Conversation Table



Table:



ai_conversations




Purpose:


Stores AI sessions.



Schema:



```sql
ai_conversations


id

repository_id

user_id

title

status

created_at

updated_at


Example:

Payment Investigation


Repository:

smw-api2

6. AI Message Table

Table:

ai_messages


Purpose:

Stores conversation messages.

Schema:

ai_messages


id

conversation_id

role

content

token_count

created_at


Roles:

USER

ASSISTANT

SYSTEM

TOOL


Example:

USER:

Explain payment workflow.


ASSISTANT:

Payment starts from PaymentController.

7. Context History Table

Table:

ai_context_history


Purpose:

Stores what information was provided to AI.

Schema:

ai_context_history


id

message_id

source_type

source_id

relevance_score

created_at


Example:

Source:

PaymentService


Relevance:

0.94


Benefits:

Debug AI responses
Improve retrieval
Audit decisions
8. AI Memory Table

Table:

ai_memory


Purpose:

Stores reusable AI knowledge.

Schema:

ai_memory


id

repository_id

memory_type

key

value

confidence

created_at

updated_at


Example:

key:

payment_flow


value:

Payment creates invoice after validation.


confidence:

0.95

9. Memory Types

Supported:

ARCHITECTURE

BUSINESS_RULE

CODE_EXPLANATION

USER_PREFERENCE

WORKFLOW

TECHNICAL_DECISION

10. AI Feedback Table

Table:

ai_feedback


Purpose:

Allow developers to correct AI.

Schema:

ai_feedback


id

message_id

user_id

rating

feedback

created_at


Example:

AI Answer:

Wrong payment explanation.


Developer:

Payment is handled by Stripe service.

11. Knowledge Approval Flow

Important principle:

AI generated knowledge should not always become truth.

Flow:

AI Generates Knowledge


          |

          v


Confidence Check


          |

          +----------------+

          |                |


          v                v


     Auto Approve      Human Review



12. Memory Lifecycle
AI Interaction


       |

       v


Store Conversation


       |

       v


Extract Knowledge


       |

       v


Validate


       |

       v


Store Long Term Memory

13. Memory Expiration

Not all memory is permanent.

Temporary:

Conversation Context

Temporary Analysis

Debug Sessions


Permanent:

Business Rules

Architecture Decisions

Approved Knowledge


Fields:

expires_at

14. AI Context Retrieval

When user asks:

Why does invoice creation fail?


System retrieves:

Previous Conversations

+

Knowledge Items

+

Code Evidence

+

Business Rules


Then sends only relevant context.

15. Token Optimization

Without memory:

Question


|

Read Repository Again


|

Large Context


With memory:

Question


|

Retrieve Existing Understanding


|

Small Context


Benefits:

Lower AI cost
Faster answers
Consistent responses
16. Security Considerations

AI memory may contain:

Source code information
Business logic
Internal architecture

Requirements:

Repository isolation
User permissions
Audit history
Encryption
17. TypeORM Example
@Entity()
export class AiMemory {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
memoryType:string;


@Column("text")
value:string;


@Column({
type:"float"
})
confidence:number;


}

18. Index Strategy

ai_memory:

repository_id

memory_type

key

confidence


ai_messages:

conversation_id

created_at

19. Future Enhancements
Self Improving Knowledge

AI can detect:

Repeated Questions


       |

       v


Create Documentation


       |

       v


Update Knowledge Base

Multi Agent Memory

Support:

Analysis Agent

Documentation Agent

Review Agent

Migration Agent

Organization Memory

Enterprise teams can share:

Approved Architecture Knowledge

Coding Standards

Business Rules

Summary

AI Memory transforms CodeMind from a simple code search tool into a continuously improving software intelligence platform.

It enables:

Remembering previous analysis
Avoiding repeated work
Reducing token usage
Maintaining system understanding

Core principle:

"Every useful explanation should make CodeMind smarter."