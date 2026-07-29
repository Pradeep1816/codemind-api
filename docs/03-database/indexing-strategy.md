This is one of the most critical documents in CodeMind architecture.

The main difference between CodeMind and a normal AI coding assistant is:

Normal AI Agent:

User Question

     |

     v

Read Code Files

     |

     v

Send Context To LLM

     |

     v

Answer

Problem:

High token usage
Slow analysis
Repeated work
Poor understanding of large legacy systems

CodeMind approach:

Repository

     |

     v

Index Once

     |

     v

Build Understanding Layer

     |

     v

Fast Retrieval

     |

     v

Small AI Context

     |

     v

Answer

Create:

docs/03-database/indexing-strategy.md

Content:

# Indexing Strategy Design


## Document Information

Module: Indexing Engine

Document: Indexing Strategy

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Indexing Engine is responsible for converting a complete
software repository into a searchable intelligence system.


It performs:


- Repository scanning
- File discovery
- Code parsing
- Symbol extraction
- Relationship detection
- Knowledge generation
- Embedding creation



The goal:


"Understand the repository once and reuse the understanding."


# 2. Indexing Architecture




Repository

|

v

Repository Scanner

|

v

File Discovery

|

v

Parser Engine

|

v

Code Intelligence

|

v

Knowledge Engine

|

v

Embedding Generator

|

v

Search Index




# 3. Indexing Pipeline



## Stage 1: Repository Clone



Input:



Git Repository




Example:



github.com/company/smw-api2




Output:



Local Repository Snapshot




Responsibilities:


- Clone repository
- Checkout branch
- Store commit hash



---



## Stage 2: File Discovery



Purpose:


Find all source files.



Example:




src/

├── payment/

│ ├── payment.service.ts

│ └── payment.controller.ts

└── invoice/

   └── invoice.service.ts



Store:




repository_files




---



## Stage 3: File Filtering



Not every file requires indexing.



Ignore:




node_modules

dist

build

coverage

.git

logs




Configuration:



.codemindignore




Example:




node_modules/

*.log

.env




---



## Stage 4: Language Detection



Detect programming language.



Example:




payment.service.ts

Language:

TypeScript




Supported:




TypeScript

JavaScript

Python

Java

PHP

Go




---



## Stage 5: AST Parsing



Convert source code into structured format.



Example:



Source:


```typescript
class PaymentService {

 processPayment(){

 }

}


AST:

ClassDeclaration

   |

   +-- MethodDeclaration


Store:

code_entities

4. Incremental Indexing

Important principle:

Do not re-index the entire repository.

Example:

Repository:

5000 files


New commit:

5 files changed


Only process:

5 files


Flow:

Git Commit


     |

     v


Compare File Hash


     |

     v


Changed Files


     |

     v


Re-index

5. File Hash Strategy

Each file stores:

SHA-256 Hash


Example:

payment.service.ts


hash:

abc123xyz


After change:

hash:

xyz789abc


Difference:

File Modified

6. Indexing Queue Architecture

Large repositories cannot be indexed synchronously.

Architecture:

API Server


     |

     v


Job Queue


     |

     +----------------+

     |                |


 Parser Worker    Embedding Worker



Recommended technology:

Redis Queue

BullMQ

7. Indexing Jobs

Table:

index_jobs


Schema:

index_jobs


id

repository_id

job_type

status

priority

progress

started_at

completed_at

error_message

created_at


Job Types:

CLONE_REPOSITORY

SCAN_FILES

PARSE_FILES

ANALYZE_CODE

CREATE_EMBEDDINGS

GENERATE_KNOWLEDGE

8. Worker Processing

Example:

Index Job


    |

    v


Parser Worker


    |

    +---- File 1

    |

    +---- File 2

    |

    +---- File 3


    |

    v


Store Results

9. Parallel Processing

Large repository:

5000 files


Instead of:

File 1

File 2

File 3

...


Use:

Worker 1

Payment Module


Worker 2

Invoice Module


Worker 3

User Module


Benefits:

Faster indexing
Better scalability
10. Index Priority System

Not all files are equally important.

Priority:

High:

src/

controllers

services

entities

modules


Medium:

utils

helpers

config


Low:

tests

examples

docs

11. Dependency Graph Indexing

CodeMind builds relationships:

Example:

PaymentController


        |

        v


PaymentService


        |

        v


PaymentRepository


        |

        v


Database


Stored:

code_relationships

12. Embedding Indexing

After code analysis:

Code Chunk


      |

      v


Embedding Model


      |

      v


Vector Database


Example:

calculatePayment()


Vector:

[0.123,0.523,...]

13. Indexing States

Repository status:

CREATED


 |

 v


CLONING


 |

 v


SCANNING


 |

 v


PARSING


 |

 v


ANALYZING


 |

 v


EMBEDDING


 |

 v


READY

14. Failure Handling

Possible failures:

Parser Error

Large File

Unsupported Language

Network Failure

AI Timeout


Handling:

Retry Job


     |

     v


Log Error


     |

     v


Continue Other Files


One failed file should not stop the complete indexing.

15. Large Repository Strategy

Target:

10,000+

files


Approach:

Batch Processing

Example:

Batch 1:

100 files


Batch 2:

100 files

Lazy Indexing

Do not analyse everything immediately.

Example:

User asks:

Explain payment module


Then:

Analyse payment module first

Priority Indexing

Important modules first:

Application Entry

Controllers

Services

Database

Business Logic

16. Index Storage

Stores:

Repository Metadata


+

File Information


+

Code Entities


+

Relationships


+

Knowledge


+

Embeddings

17. API Flow

Start indexing:

POST

/api/repositories/{id}/index


Response:

{
 "jobId":"123",
 "status":"STARTED"
}


Check status:

GET

/api/index/jobs/123


Response:

{
 "progress":85,
 "status":"PARSING"
}

18. Monitoring

Track:

Files Processed

Parsing Speed

Embedding Count

Failures

Token Usage


Metrics:

index_duration

files_per_second

embedding_cost

19. Security

Requirements:

Private repository isolation
Credential encryption
Access validation
Secure temporary storage
20. Future Improvements
Continuous Indexing

Git webhook:

Push


 |

 v


Detect Changes


 |

 v


Update Index

Multi Repository Intelligence

Example:

Company


 |

 +-- Backend

 |

 +-- Frontend

 |

 +-- Mobile App


Understand entire ecosystem.

AI Optimized Index

Store:

Most Important Files

Most Used Modules

Business Critical Areas

Summary

The Indexing Engine is the foundation of CodeMind.

It transforms:

Raw Repository

        |

        v


Structured Intelligence


The key principle:

"Index once, understand forever."

This allows CodeMind to analyse large legacy systems while consuming far fewer AI tokens.