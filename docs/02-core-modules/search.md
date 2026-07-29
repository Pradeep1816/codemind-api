The Search Module is the retrieval intelligence layer of CodeMind.

All previous modules create knowledge:

Repository
      |
      v
Indexing
      |
      v
Parser
      |
      v
Analysis
      |
      v
Knowledge
      |
      v
Business Engine

But developers need a way to ask:

"Where is this logic?"

"How does this workflow work?"

"What will break if I change this service?"

The Search Module provides that capability.

# Search Module Design


## Document Information

Module: Search Engine

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Search Module provides intelligent retrieval capabilities across the entire CodeMind knowledge system.


It allows developers to search:


- Source code
- Code structure
- Relationships
- Business rules
- Documentation
- Architecture knowledge



The Search Module is responsible for finding the most relevant information before sending context to AI.



# 2. Goals


The Search Module should:


- Provide fast code search
- Support semantic understanding
- Search across technical and business knowledge
- Rank results by relevance
- Reduce AI token usage
- Provide accurate context retrieval



# 3. Problem Statement


Traditional search:


User:



invoice creation



Returns:



invoice.service.ts
invoice.controller.ts
invoice.repository.ts



But it does not understand:


- Business meaning
- Relationships
- Workflow



CodeMind search should understand:


Question:



How is invoice created?



Result:



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

Business Rule:

Invoice requires payment validation before creation.




# 4. Search Architecture


High-level architecture:


             User Query


                 |

                 v


          Query Processor


                 |

    ----------------------------


    |             |            |


    v             v            v

Keyword Search Vector Search Graph Search

    |             |            |


    ----------------------------


                 |

                 v


          Ranking Engine


                 |

                 v


          Search Results


                 |

                 v


                AI



# 5. Search Types


## 5.1 Keyword Search


Traditional text search.


Example:


Query:



PaymentService



Finds:



payment.service.ts

PaymentController

PaymentRepository




Used for:


- Exact names
- File names
- Class names
- Function names



---

# 5.2 Semantic Search


Semantic search understands meaning.


Example:


Question:



How does refund work?



May find:



cancelPayment()

reverseTransaction()

creditAdjustment()



Even if "refund" does not exist in code.



Powered by:



Embeddings

Vector Database




---

# 5.3 Graph Search


Uses relationships from Analysis Module.



Example:


Question:



What depends on PaymentService?



Graph query:



PaymentService

    |

    +---- InvoiceService

    |

    +---- RefundService

    |

    +---- SubscriptionService



Useful for:


- Impact analysis
- Architecture understanding
- Dependency tracing



# 6. Hybrid Search


CodeMind combines multiple search strategies.



Formula:



Final Score =

Keyword Score

Semantic Score

Graph Score

Business Relevance




Example:


A result ranking:



PaymentService.ts

95% relevance

Payment Documentation

90% relevance

Payment Test File

60% relevance




# 7. Query Processing Pipeline


Flow:



User Question

  |

  v

Query Understanding

  |

  v

Search Multiple Sources

  |

  v

Merge Results

  |

  v

Rank Results

  |

  v

Create Context

  |

  v

AI Response




# 8. Search Index Design


## Code Index


Stores:



Classes

Functions

Files

Methods

Variables




Example:



InvoiceService

type:

CLASS

location:

src/invoice/invoice.service.ts




---

## Knowledge Index


Stores:



Business Rules

Workflows

Architecture

Documentation




Example:



Invoice Creation Workflow

confidence:

92%




---

## Vector Index


Stores:



Embeddings

Metadata

References




Example:



Vector:

[0.234,0.455,...]

Reference:

invoice.service.ts




# 9. Search Ranking System


Ranking factors:


## Exact Match


Example:



PaymentService



Higher score.



---

## Relationship Importance


Example:


A service connected to many modules:



PaymentService

Used by:

20 modules



Gets higher priority.



---

## Business Importance


Example:


Core business workflow:



Payment Processing



Higher ranking.



---

## Recency


Recently changed code:



Updated yesterday



May get higher priority.



# 10. Search API Design


## Search


Endpoint:



GET /search



Request:


```json
{
 "query":"How invoice creation works"
}


Response:

{
 "results":[

 {
  "type":"workflow",
  "name":"Invoice Creation",
  "confidence":92
 },

 {
  "type":"class",
  "name":"InvoiceService"
 }

 ]
}

11. Context Builder

Before AI receives information:

Search creates optimized context.

Example:

Bad:

Send entire repository

500MB code


Good:

InvoiceService

PaymentService

Invoice Workflow

Relevant Database Tables


Benefits:

Lower token usage
Faster responses
Better answers
12. Search Storage Strategy
PostgreSQL

Used for:

Metadata
Filters
Permissions
Elasticsearch / OpenSearch

Used for:

Full text search
Large scale indexing
Vector Database

Example:

Qdrant


Used for:

Semantic search
Similarity search
Graph Database

Example:

Neo4j


Used for:

Relationship queries
13. Search Events
SearchIndexUpdatedEvent

Triggered when:

New knowledge created

Code changed

Documentation updated

14. Module Structure

NestJS:

src/modules/search/


├── controllers/

├── services/

├── query/

├── ranking/

├── adapters/

│
├── vector/

│
├── database/

│
└── graph/


├── context/

├── entities/

├── events/

└── search.module.ts

15. Dependencies

Search Module depends on:

Knowledge Module

Analysis Module

Embedding Module

Database Module


Should NOT depend on:

AI Module

MCP Module

Frontend

16. Performance Strategy

Large systems:

1 Million files

10 Million code entities


Required:

Search indexes
Caching
Query optimization
Async indexing
Distributed processing
17. Future Enhancements
Natural Language Search

Example:

Show me all payment related logic

Developer Assistant Mode

Example:

Explain this function

Change Impact Search

Example:

What files should I update for changing invoice rules?

Summary

The Search Module connects CodeMind knowledge with developers.

Its responsibility:

"Find the right information at the right time."

It enables:

Fast code discovery
AI context retrieval
Legacy system understanding
Token-efficient AI responses