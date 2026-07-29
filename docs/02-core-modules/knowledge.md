Knowledge Module Design


## Document Information

Module: Knowledge Engine

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Knowledge Module is responsible for storing, organizing, and retrieving knowledge extracted from software systems.


It acts as the long-term memory layer of CodeMind.


The module combines:


- Code metadata
- Dependency relationships
- Business concepts
- Workflows
- Documentation
- AI-generated insights



Input:



Parser Data

Analysis Results

Database Metadata

Documentation



Output:



System Knowledge Model




# 2. Goals


The Knowledge Module should:


- Store structured system knowledge
- Build a knowledge graph
- Represent software concepts
- Connect technical and business information
- Provide context for AI systems
- Preserve historical understanding



# 3. Problem Being Solved


Source code contains implementation details.


Example:


```typescript
if(payment.status === FAILED){

 createCredit();

}


Code understanding:

PaymentService calls createCredit()


Business understanding:

Failed payments automatically create customer credit.


The Knowledge Module stores both views.

4. Knowledge Architecture

High-level architecture:

                 Analysis Module


                       |

                       v


              Knowledge Builder


                       |

        --------------------------------

        |              |               |

        v              v               v


 Structured       Knowledge       Semantic

 Storage          Graph           Search


(PostgreSQL)      (Neo4j)         (Vector DB)



5. Knowledge Types

CodeMind stores different types of knowledge.

5.1 Technical Knowledge

Generated from source code.

Examples:

Class:

InvoiceService


Methods:

createInvoice()

cancelInvoice()


Dependencies:

PaymentService


Stored attributes:

Name

Type

Location

Relationships

Metadata

5.2 Architectural Knowledge

Represents system structure.

Example:

Controller Layer

       |

       v

Service Layer

       |

       v

Repository Layer


Examples:

Modules
Services
Components
Dependencies
5.3 Business Knowledge

Represents business behaviour.

Example:

Technical:

cancelLesson()


Business:

When a lesson is cancelled,
the payment allocation is reversed
and the invoice amount is recalculated.

5.4 Historical Knowledge

Stores system evolution.

Example:

Payment calculation changed in version 2.4

Reason:

New tax requirement


Useful for:

Legacy systems
Migration projects
Debugging
6. Knowledge Model

CodeMind represents knowledge using:

Entity

+

Relationship

+

Context

+

Evidence


Example:

Entity:

Invoice


Relationship:

GENERATED_BY


Target:

InvoiceService


Context:

Created during payment completion workflow.


Evidence:

invoice.service.ts line 120

7. Knowledge Graph

The Knowledge Graph represents relationships between concepts.

Example:

Customer

    |

    HAS

    |

Enrollment

    |

    GENERATES

    |

Invoice

    |

PAID_BY

    |

Payment


The graph answers questions like:

Which services affect invoice generation?


or:

What happens when payment fails?

8. Knowledge Building Pipeline

Flow:

Parsed Code


    |

    v


Relationship Analysis


    |

    v


Knowledge Extractor


    |

    v


Knowledge Graph


    |

    v


Search Layer

9. Knowledge Extractors

Different extractors build different knowledge.

Code Extractor

Creates:

Classes

Functions

Methods

Relationship Extractor

Creates:

CALLS

DEPENDS_ON

IMPORTS

USES

Domain Extractor

Creates:

Business Entity

Workflow

Rule

Documentation Extractor

Reads:

README

Wiki

Comments

Markdown

10. Knowledge Graph Design
Nodes

Examples:

Repository

File

Class

Function

Entity

BusinessRule

Workflow

APIEndpoint

DatabaseTable

Relationships

Examples:

CONTAINS

CALLS

DEPENDS_ON

CREATES

UPDATES

IMPLEMENTS

REPRESENTS


Example:

PaymentController

        |

        CALLS

        |

PaymentService

        |

        UPDATES

        |

PaymentTable

11. Storage Strategy

CodeMind uses different storage systems.

PostgreSQL

Purpose:

Structured information.

Stores:

Users

Repositories

Files

Classes

Functions

Business Rules

Graph Database

Technology:

Neo4j


Purpose:

Relationship traversal.

Stores:

Service

      |

depends on

      |

Repository

Vector Database

Technology:

Qdrant


Purpose:

Semantic retrieval.

Stores:

Code summaries

Documentation

Business explanations

12. Knowledge Database Entities
Knowledge Entity
knowledge_items


id

repository_id

type

name

description

source

created_at


Types:

TECHNICAL

BUSINESS

ARCHITECTURE

DOCUMENTATION

Business Rule
business_rules


id

name

description

evidence

confidence


Example:

Name:

Payment Failure Handling


Description:

Failed payments generate customer credits.

13. Knowledge Confidence

Every generated knowledge item should have confidence.

Example:

Business Rule:

High Confidence

Evidence:

Source code + Tests + Documentation


Confidence levels:

HIGH

MEDIUM

LOW

14. Knowledge Query Examples
Example 1

Question:

How does invoice creation work?


Knowledge retrieval:

InvoiceController

       |

       v

InvoiceService

       |

       v

PaymentService

       |

       v

InvoiceRepository

Example 2

Question:

What breaks if PaymentService changes?


Knowledge:

PaymentService

 affects:

- InvoiceService

- RefundService

- SubscriptionService

15. Events
KnowledgeCreatedEvent

Payload:

{
 "type":"BUSINESS_RULE",
 "entity":"Payment"
}
KnowledgeUpdatedEvent

Triggered when:

Source code changes
New analysis completes
Documentation changes
16. Module Structure

NestJS:

src/modules/knowledge/


├── controllers/

├── services/

├── builders/

├── extractors/

├── graph/

├── entities/

├── events/

└── knowledge.module.ts

17. Dependencies

Knowledge Module depends on:

Parser Module

Analysis Module

Database Module

Graph Module


Should NOT depend on:

AI Module

MCP Module

18. Performance Strategy

Large systems may contain:

Millions of knowledge nodes


Strategies:

Batch graph updates
Incremental updates
Background processing
Cache frequently accessed knowledge
19. Future Enhancements
Autonomous Knowledge Updates

When code changes:

Git Push

 |

 v

Re-index

 |

 v

Update Knowledge

System Memory

Remember:

Previous architecture decisions

Historical changes

Known problems

Knowledge Validation

Allow developers to:

Confirm rules
Correct generated knowledge
Add missing context
Summary

The Knowledge Module transforms raw technical information into a persistent understanding of software systems.

Its responsibility:

"Remember what the system is, how it works, and why it behaves that way."

It enables:

Business understanding
AI context generation
Documentation generation
Impact analysis
Legacy system exploration