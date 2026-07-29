The Embedding Module is the semantic memory layer of CodeMind.

Its main purpose is to solve the biggest problem with current AI coding assistants:

AI models cannot continuously read an entire legacy codebase because context size and token cost are limited.

CodeMind solves this by converting code and system knowledge into searchable semantic representations.

# Embedding Module Design


## Document Information

Module: Embedding Engine

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Embedding Module converts code intelligence and business knowledge into numerical vector representations called embeddings.


These embeddings allow CodeMind to perform semantic search.


Example:


Developer question:


"How does payment failure handling work?"


The system can find:



PaymentService

PaymentFailedException

RefundWorkflow

CreditCreationRule

Payment Documentation



Even when exact words do not match.



# 2. Problem Statement


Traditional search depends on exact keywords.



Example:


Search:



refund



May miss:



reverseTransaction()

createCredit()

rollbackPayment()



Because the terminology is different.



Semantic search understands meaning.


Example:



refund

=

reverse payment

=

return money

=

credit customer account




# 3. Goals


The Embedding Module should:


- Convert code knowledge into vectors
- Support semantic search
- Reduce AI token consumption
- Improve context retrieval
- Support RAG architecture
- Handle large repositories
- Update embeddings incrementally



# 4. Non Goals


The Embedding Module should NOT:


- Parse source code
- Understand programming syntax
- Generate business rules
- Answer user questions


Responsibilities:



Parser

Analysis

Business Engine

AI Module




# 5. Embedding Architecture



High-level architecture:



             Code Repository


                   |

                   v


            Indexing Module


                   |

                   v


            Parser Module


                   |

                   v


          Knowledge Builder


                   |

                   v


          Chunk Generator


                   |

                   v


        Embedding Generator


                   |

                   v


          Vector Database



# 6. What Should Be Embedded?


Important:

Do not embed every line of code.



Bad approach:



500,000 files

Every line

=

Millions of useless vectors




CodeMind embeds meaningful units.



## 6.1 Code Entities


Examples:



Class

Function

Method

Interface

Controller

Service

Repository




Example:


Class:



InvoiceService

Responsible for invoice creation,
calculation, and cancellation.




---

## 6.2 Business Knowledge


Examples:



Invoice Creation Workflow

Payment Processing Rule

Student Enrollment Process




---

## 6.3 Documentation


Examples:



README

Architecture Docs

API Documentation

Database Documentation




---

## 6.4 Database Knowledge


Examples:



Tables

Columns

Relationships

Queries




# 7. Code Chunking Strategy


Chunking decides how information is divided before embedding.



Poor chunking:



First 1000 characters




Problem:


- Breaks logic
- Loses context
- Poor search results



Better chunking:



File

|

+-- Class

  |

  +-- Method

  |

  +-- Business Logic Block



Example:


File:



invoice.service.ts




Chunks:



InvoiceService

InvoiceService.createInvoice()

InvoiceService.cancelInvoice()

InvoiceService.calculateTax()




# 8. Embedding Generation Pipeline



Flow:




Knowledge Item

  |

  v

Create Chunk

  |

  v

Generate Text Representation

  |

  v

Embedding Model

  |

  v

Store Vector




Example:



Source code:


```typescript
createInvoice(){

 validatePayment();

 generateInvoice();

}


Converted text:

Function createInvoice creates invoices
after validating payment.

Then:

Text

 |

 v

Embedding Model

 |

 v

[0.234,0.876,0.123...]

9. Embedding Models

Possible providers:

Cloud Models

Examples:

OpenAI Embeddings
Google Embeddings
Cohere Embeddings
Local Models

Examples:

BGE
E5
Nomic Embed

Future goal:

Support multiple embedding providers.

10. Vector Database Design
Option 1: PostgreSQL + pgvector

Advantages:

Simple architecture
One database
Easy deployment

Example:

PostgreSQL


tables

+

vector columns


Good for:

MVP
Small/medium repositories
Option 2: Qdrant

Advantages:

Dedicated vector database
High performance
Large scale search

Architecture:

CodeMind

    |

    v

Qdrant

    |

    v

Nearest Vector Search


Good for:

Millions of vectors
Enterprise systems
11. Vector Storage Model

Example:

Table:

embeddings


Schema:

id

repository_id

entity_type

entity_id

content

vector

metadata

created_at

updated_at


Example:

entity_type:

FUNCTION


entity:

InvoiceService.createInvoice


vector:

[0.234,0.555...]

12. Similarity Search

User query:

How is invoice generated?


Process:

Question

 |

 v

Generate Query Embedding

 |

 v

Compare Vectors

 |

 v

Find Similar Knowledge

 |

 v

Return Context


Result:

InvoiceService

InvoiceWorkflow

InvoiceRepository

13. RAG Integration

Retrieval Augmented Generation flow:

Developer Question


        |

        v


Search Module


        |

        v


Embedding Search


        |

        v


Relevant Context


        |

        v


Prompt Builder


        |

        v


AI Model


        |

        v


Answer

14. Incremental Embedding Updates

Problem:

Large repository:

500,000 files


Developer changes:

payment.service.ts


Do not regenerate:

500,000 embeddings


Instead:

File Changed


      |

      v


Generate New Chunk


      |

      v


Update Vector

15. Embedding Versioning

Models change over time.

Example:

Embedding Model:

text-embedding-v1



Later:

text-embedding-v2


Need:

embedding_version


to support migration.

16. Cost Optimization

Important strategies:

Cache Existing Embeddings

If content hash unchanged:

Reuse Existing Vector

Batch Generation

Instead of:

Generate one by one


Use:

Generate 100 chunks together

Embed Important Knowledge First

Priority:

1. Business Rules

2. Core Services

3. APIs

4. Documentation

5. Tests

17. Events
EmbeddingCreatedEvent

Payload:

{
 "entityId":"123",
 "type":"FUNCTION"
}
EmbeddingUpdatedEvent

Triggered when:

Code changes
Knowledge changes
Documentation changes
18. Module Structure

NestJS:

src/modules/embeddings/


├── controllers/

├── services/

├── generators/

├── chunking/

├── providers/

│
├── openai/

│
├── local/


├── vector-store/

│
├── qdrant/

│
└── postgres/


├── entities/

├── events/

└── embeddings.module.ts

19. Dependencies

Depends on:

Knowledge Module

Search Module

Storage Module

Queue Module


Should NOT depend on:

AI Module

MCP Module

Frontend

20. Future Enhancements
Multi-Modal Understanding

Support:

Screenshots
Diagrams
Database ER diagrams
API specifications
Automatic Context Optimization

Before sending to AI:

Select best files

Remove duplicates

Compress context

Rank importance

Personal Developer Memory

Remember:

Frequently accessed modules

Developer questions

Common workflows

Summary

The Embedding Module creates the semantic memory layer of CodeMind.

Its responsibility:

"Convert software knowledge into a searchable intelligence layer."

It enables:

Token-efficient AI responses
Semantic code search
RAG architecture
Large repository understanding
Faster developer onboarding