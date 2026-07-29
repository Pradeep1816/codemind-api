# Module Design


# Overview

CodeMind backend follows a modular architecture based on business capabilities.

Each module owns:

- Domain logic
- Database operations
- APIs
- Internal services


# Backend Structure



src/

├── modules/

│
├── auth/

├── users/

├── repositories/

├── indexing/

├── parser/

├── analysis/

├── knowledge/

├── search/

├── ai/

├── business/

├── documentation/

├── mcp/

└── health/



# Module Rules


## Rule 1

Modules should communicate through:

- Public services
- Events
- Interfaces


Avoid:

- Direct database access between modules
- Circular dependencies


---

# Repository Module


Responsibility:

Manage software repositories.


Contains:


Repository Entity

Repository Service

Repository Controller

Git Integration



Example:



Create Repository

    |

Clone Repository

    |

Start Indexing



---

# Indexing Module


Responsibility:

Convert repository files into indexed data.


Contains:



Scanner

Indexer

Queue Processor

Index Jobs



---

# Parser Module


Responsibility:

Understand programming languages.


Example:


Input:

```typescript
class UserService {}

Output:

Class

Name: UserService

Type: Service

Methods:
- createUser()
- updateUser()

Analysis Module

Responsibility:

Discover relationships.

Produces:

Function Calls

Dependencies

Architecture Graph

Knowledge Module

Responsibility:

Store system understanding.

Contains:

Business Entities

Rules

Relationships

Summaries

Workflows

Search Module

Responsibility:

Find relevant information.

Supports:

Keyword Search

Vector Search

Graph Search

Hybrid Search

AI Module

Responsibility:

Communicate with AI models.

Contains:

Context Builder

Prompt Builder

LLM Client

Response Formatter

MCP Module

Responsibility:

Expose CodeMind capabilities externally.

Example tools:

search_code()

explain_module()

find_dependencies()

business_workflow()

impact_analysis()


---

# `docs/01-architecture/data-flow.md`

```md
# Data Flow Architecture


# Overview

This document explains how information moves through CodeMind.


# Complete Data Pipeline



Repository

|

v

Repository Scanner

|

v

File Indexer

|

v

Parser Engine

|

v

Static Analysis

|

v

Knowledge Builder

|

v

Storage Layer

|

v

Search Engine

|

v

AI Context Builder

|

v

AI Response



# Step 1: Repository Ingestion


Input:


Git Repository



Process:



Repository Module

    |

    v

Clone Repository

    |

    v

Store Metadata

    |

    v

Create Index Job



---

# Step 2: File Processing


Scanner discovers:



src/

user.service.ts

invoice.service.ts

payment.service.ts



Creates:



File Records


---

# Step 3: Parsing


Source:


```typescript
class InvoiceService {

createInvoice(){}

}

Parser extracts:

Class:

InvoiceService


Method:

createInvoice()

Step 4: Analysis

Creates relationships:

InvoiceController

        |

        v

InvoiceService

        |

        v

PaymentService

Step 5: Knowledge Creation

Transforms:

Technical:

cancelLesson()

Into:

Business:

Lesson Cancellation Workflow

1. Cancel lesson

2. Reverse payment

3. Update invoice

4. Notify customer

Step 6: AI Query Flow

Question:

How does invoice cancellation work?

Flow:

Question

   |

   v

Search Knowledge

   |

   v

Retrieve Context

   |

   v

Build Prompt

   |

   v

AI Model

   |

   v

Answer


---

# `docs/01-architecture/event-flow.md`

```md
# Event Flow Architecture


# Overview

CodeMind uses an event-driven approach for long-running operations.

Examples:

- Repository indexing
- Parsing
- Analysis
- Embedding generation


# Event Pipeline



RepositoryCreatedEvent

      |

      v

IndexingStartedEvent

      |

      v

FileParsedEvent

      |

      v

AnalysisCompletedEvent

      |

      v

KnowledgeUpdatedEvent

      |

      v

EmbeddingCreatedEvent



# Example


## Repository Added


User creates repository:



POST /repositories



Application:



RepositoryService

    |

    v

RepositoryCreatedEvent

    |

    v

Index Worker

    |

    v

Parser

    |

    v

Knowledge Builder



# Benefits


- Loose coupling
- Better scalability
- Background processing
- Easier debugging


# Infrastructure


Technology:


Redis

BullMQ


