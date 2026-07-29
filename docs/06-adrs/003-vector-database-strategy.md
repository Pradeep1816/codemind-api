This ADR defines how CodeMind stores and searches AI embeddings.

This is a critical decision because CodeMind's main purpose is:

"Understand large legacy codebases with minimum AI context cost."

The vector layer enables:

Semantic code search
RAG (Retrieval Augmented Generation)
Business knowledge retrieval
AI memory
Similar code discovery

Create:

docs/06-adrs/003-vector-database-strategy.md

Content:

# ADR-003: Vector Database Strategy


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind needs semantic understanding of software systems.


Traditional search can find:



paymentService

invoice.calculate()

createUser()



But developers ask questions based on meaning:




How does payment processing work?

Why is this validation required?

Where is invoice calculation handled?



The system must understand relationships and concepts,
not only keywords.



This requires vector embeddings.



# 2. What Are Embeddings?


An embedding converts information into numerical vectors.



Example:



Code:




calculateInvoiceTotal()




Converted into:




[
0.234,
0.721,
0.154,
...
]




Similar concepts produce similar vectors.



Example:




Question:

"How are invoices calculated?"

    |

    v

Similar code:

InvoiceCalculationService




# 3. Requirements



The vector system must support:



## Code Search



Search:



Functions

Classes

Modules

Files




---



## Knowledge Retrieval



Search:



Business Rules

Documentation

Architecture Notes




---



## RAG Context Retrieval



Before sending data to AI:



Instead of:




Entire Repository

500,000 lines




Retrieve:




Relevant Context

20-50 code chunks




Benefits:


- Lower token cost
- Better AI answers
- Faster response



# 4. Options Considered



# Option 1: PostgreSQL + pgvector


## Overview



Use PostgreSQL extension:




pgvector




Store embeddings together with application data.



Example:




code_chunks

id

file_id

content

embedding_vector




## Advantages



### Single Database


No additional infrastructure.



Example:




Users

Repositories

Code

Knowledge

Embeddings

All in PostgreSQL




### Transaction Support


Code and embeddings remain consistent.



Example:




Code deleted

    |

    v

Embedding deleted




### Good Initial Scale


Suitable for:


- Small repositories
- Medium repositories
- Enterprise MVP



Decision:


Selected for initial architecture.



---



# Option 2: Qdrant



## Overview


Dedicated vector database.



Advantages:


- Very fast similarity search
- Built for embeddings
- Filtering support



Disadvantages:


- Additional infrastructure
- Another database to maintain



Decision:


Future option.



---



# Option 3: Pinecone



## Overview


Managed cloud vector database.



Advantages:


- Fully managed
- Easy scaling



Disadvantages:


- Vendor dependency
- Cost
- Less control



Decision:


Not selected initially.



---



# Option 4: Weaviate



Advantages:


- AI focused
- Hybrid search
- Knowledge graph features



Disadvantages:


- More infrastructure complexity



Decision:


Future consideration.



# 5. Decision



CodeMind will use:




PostgreSQL

pgvector




Initial architecture:



             NestJS


                |


                v


          PostgreSQL


      +----------------+

      |                |

Relational Data Vector Data

      |                |

Users Embeddings

Repositories Code Chunks

Knowledge Documents




# 6. Embedding Storage Design



Table:




embeddings




Schema:



```sql
embeddings


id

organization_id

entity_type

entity_id

content

embedding

metadata

created_at


Example:

{
"type":"FUNCTION",

"name":"calculateInvoice",

"file":"invoice.service.ts",

"language":"typescript"
}

7. What Gets Embedded?

CodeMind embeds:

Source Code

Examples:

Class

Function

Method

Module

Documentation

Examples:

README

Architecture docs

API docs

Business Knowledge

Examples:

Business Rule

Workflow

Decision

Historical Knowledge

Examples:

Previous fixes

Architecture decisions

Developer explanations

8. Chunking Strategy

Large files cannot be embedded as one block.

Example:

payment.service.ts


5000 lines



Split into:

Chunk 1

Payment validation


Chunk 2

Payment processing


Chunk 3

Refund handling


Each chunk contains:

Content

Source location

Context

Relationships

9. Embedding Pipeline

Flow:

Repository


    |

    v


Parser


    |

    v


Code Chunks


    |

    v


Embedding Generator


    |

    v


Vector Storage


    |

    v


Semantic Search

10. Retrieval Strategy

When user asks:

Explain payment flow


Process:

Question


 |

 v


Generate Question Embedding


 |

 v


Vector Similarity Search


 |

 v


Retrieve Relevant Context


 |

 v


Send Context To AI


 |

 v


Generate Answer

11. Hybrid Search Strategy

Vector search alone is not enough.

CodeMind combines:

Semantic Search


        +


Keyword Search


        +


Code Relationship Search



Example:

Query:

invoice calculation


Results:

Exact symbol match
Similar business concepts
Related modules
12. Embedding Model Strategy

Initial:

External Embedding API


Future:

Self-hosted Embedding Model


Requirements:

Code understanding
Multiple languages
Fast generation
Low cost
13. Embedding Lifecycle
Creation

When repository indexed:

Code Changed


    |

    v


Generate Embedding


    |

    v


Store Vector

Update

When code changes:

Git Commit


    |

    v


Detect Changed Files


    |

    v


Regenerate Embeddings

Delete

When file removed:

Remove Code


    |

    v


Remove Embedding

14. Performance Strategy

Optimization:

Batch Processing

Instead of:

Generate 1 embedding

Generate 1 embedding

Generate 1 embedding


Use:

Generate 100 embeddings together

Metadata Filtering

Before vector search:

Filter:

repository_id

language

module

organization


Then search.

15. Security Considerations

Embeddings contain information about code.

Therefore:

Organization isolation required
Access permissions required
Encryption required

Example:

Developer A:

Cannot search Company B embeddings

16. Future Migration Strategy

Current:

PostgreSQL

+

pgvector


Future:

PostgreSQL


        +


Qdrant


        +


Graph Database


Migration should not affect application APIs.

17. Consequences
Positive
Simple Architecture

Only one database initially.

Lower Operational Cost

No extra infrastructure.

Strong Consistency

Data and embeddings stay synchronized.

Faster Development

Less complexity.

Negative
Large Scale Limitations

Very large repositories may require dedicated vector storage.

Database Growth

Embedding storage increases database size.

Specialized Search

Dedicated vector engines may outperform PostgreSQL.

18. Final Decision Summary
Area	Decision
Vector Storage	pgvector
Primary Database	PostgreSQL
Search Type	Hybrid Search
Embedding Storage	PostgreSQL
Future Vector DB	Qdrant/Pinecone
Chunking	Semantic Code Chunks
Conclusion

CodeMind will start with PostgreSQL + pgvector because it provides
the best balance between simplicity, capability, and future growth.

Final decision:

"Use PostgreSQL as the source of truth and pgvector as the first
semantic intelligence layer."