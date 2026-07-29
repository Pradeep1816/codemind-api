This document defines the semantic intelligence layer of CodeMind.

The previous layers:

Repository Schema
        |
        v
Code Intelligence Schema
        |
        v
Knowledge Schema

understand the structure and meaning of code.

The Embedding Schema enables CodeMind to find the right knowledge quickly without sending the entire repository to an AI model.

This is the main solution for the problem:

"Current coding agents consume too many tokens because they repeatedly read large codebases."

# Embedding Schema Design


## Document Information

Module: Semantic Search

Document: Embedding Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


Embeddings convert code and knowledge into mathematical representations
that allow semantic search.


Example:


Developer Question:


"How does payment failure create customer credit?"


Instead of searching exact words:



payment failure
credit



CodeMind searches meaning:



payment exception handling

account adjustment

refund workflow

credit creation




# 2. Purpose


The Embedding System provides:


- Semantic code search
- Context retrieval
- RAG pipeline
- AI context optimization
- Similarity matching
- Knowledge discovery



# 3. Problem Without Embeddings



Traditional approach:




Developer Question

    |

    v

Send entire repository to AI

    |

    v

Large token usage

    |

    v

Expensive + slow




Problems:


- High API cost
- Slow responses
- Context limit issues
- Poor relevance



# 4. Embedding Based Architecture




Developer Question

    |

    v

Generate Query Embedding

    |

    v

Vector Search

    |

    v

Retrieve Relevant Context

    |

    v

AI Generation




Only required information is sent to AI.



# 5. Embedding Flow



## Indexing Time




Source Code

|

v

Parser

|

v

Create Code Chunks

|

v

Generate Embeddings

|

v

Store Vectors




## Query Time




Question

|

v

Embedding Model

|

v

Similarity Search

|

v

Relevant Context

|

v

LLM Response




# 6. Embedding Entity Overview




embedding_records

    |

    |

    +---- embedding_chunks


    |

    |

    +---- embedding_models



# 7. Embedding Records Table



Table:




embeddings




Purpose:


Stores vector representations.



Schema:



```sql
embeddings


id

repository_id

entity_type

entity_id

chunk_id

vector

model

dimensions

created_at

updated_at

8. Embedding Fields Explanation
entity_type

Defines what is embedded.

Values:

CODE_FILE

CODE_FUNCTION

CODE_CLASS

DOCUMENTATION

BUSINESS_RULE

KNOWLEDGE_ITEM


Example:

CODE_FUNCTION

calculateDiscount()

entity_id

Reference to original data.

Example:

code_entities.id

vector

Stores numerical representation.

Example:

[
0.123,
0.542,
0.982
]


Storage:

PostgreSQL pgvector

model

Embedding model used.

Examples:

text-embedding-3-small

text-embedding-3-large


Important because different models create different vector spaces.

dimensions

Example:

1536

3072

9. Embedding Chunk Strategy

Large files should not create one embedding.

Bad:

payment.service.ts

5000 lines

1 vector


Problem:

Poor search accuracy
Too much context

Better:

payment.service.ts


    |

    +-- createPayment()

    |

    +-- refundPayment()

    |

    +-- validatePayment()


Each meaningful unit gets its own embedding.

10. Code Chunk Entity

Table:

embedding_chunks


Purpose:

Stores searchable text segments.

Schema:

embedding_chunks


id

entity_id

content

summary

token_count

chunk_type

created_at


Example:

Content:

Function validates payment status
and creates invoice after success.


Metadata:

chunk_type:

FUNCTION

token_count:

120

11. Chunk Types

Supported:

FILE_CHUNK

Example:

Controller file section

FUNCTION_CHUNK

Example:

calculateInvoice()

CLASS_CHUNK

Example:

InvoiceService

BUSINESS_CHUNK

Example:

Paid invoices cannot be deleted.

DOCUMENTATION_CHUNK

Example:

Architecture explanation

12. Vector Search Strategy

Search uses similarity score.

Example:

Question:

How are invoices generated?


Search result:

InvoiceService.createInvoice()

Similarity:

0.94


Payment workflow

Similarity:

0.88


Invoice documentation

Similarity:

0.82

13. pgvector Schema

PostgreSQL example:

CREATE TABLE embeddings (

id uuid PRIMARY KEY,


vector vector(1536),


metadata jsonb

);


Similarity search:

SELECT *

FROM embeddings

ORDER BY

vector <-> query_vector

LIMIT 10;

14. Metadata Storage

Each embedding stores context.

Example:

{
 "repository":"smw-api2",

 "file":
 "invoice.service.ts",

 "entity":
 "InvoiceService",

 "language":
 "typescript"
}


Benefits:

Filtering
Better ranking
Security isolation
15. Retrieval Strategy

CodeMind uses hybrid search.

User Question


      |

      +-------------+

      |             |


Keyword Search   Vector Search


      |             |


      +-------------+


             |

             v


        Ranking Engine


             |

             v


        Final Context

16. Token Optimization Strategy

Before:

Repository:

5000 files


Send:

5000 files


Tokens:

Millions


After:

Question

   |

   v


Vector Search


   |

   v


Top 10 relevant chunks


   |

   v


AI Context


Tokens:

Few thousand

17. Embedding Update Strategy

When code changes:

Git Change


    |

    v


Detect Changed Files


    |

    v


Remove Old Embeddings


    |

    v


Generate New Embeddings


Only changed code is processed.

18. Embedding Versioning

Table:

embedding_versions


Purpose:

Track model changes.

Schema:

embedding_versions


id

model_name

dimension

created_at


Example:

text-embedding-3-small


version:

1

19. Access Control

Important:

Embeddings contain information from private code.

Security:

Repository isolation
User permissions
Encrypted storage
Access logging
20. TypeORM Example
@Entity()
export class Embedding {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
entityType:string;


@Column({
 type:"vector"
})
vector:number[];


@Column()
model:string;


}

21. Future Improvements
Multi Model Embeddings

Support:

Code Model

Documentation Model

Business Model

Automatic Re-indexing

Trigger:

Git Push

   |

Webhook

   |

Update Embeddings

Personal Developer Memory

Store:

Developer preferences

Common workflows

Previous questions

Summary

The Embedding Schema is the performance engine of CodeMind.

It solves the main limitation of existing AI coding tools:

"Do not give AI the whole repository. Give AI the right knowledge."

The embedding layer enables:

Faster answers
Lower token usage
Better understanding
Scalable AI assistance