Repository Module Design


## Document Information

Module: Repository Management

Status: Draft

Version: 1.0

Owner: CodeMind Engineering


# 1. Overview

The Repository Module is the entry point of CodeMind.

It manages software repositories that are analyzed by the platform.

A repository represents a complete software system that CodeMind will understand.


Examples:

- Legacy ERP application
- SaaS product
- Backend service
- Frontend application
- Monorepo


# 2. Goals

The Repository Module should:

- Register repositories
- Store repository metadata
- Connect Git providers
- Manage branches
- Track indexing status
- Trigger indexing workflows


# 3. Non Goals

The Repository Module should NOT:

- Parse source code
- Analyze business logic
- Generate embeddings
- Understand programming languages


Those responsibilities belong to other modules.



# 4. Architecture


             User

              |

              v

      Repository Controller

              |

              v

      Repository Service

              |

    --------------------

    |                  |

    v                  v

Repository DB Git Adapter



# 5. Responsibilities


## 5.1 Repository Registration


User adds a repository:


Example:



https://github.com/company/payment-system



System creates:



Repository

id

name

url

provider

branch

status




---

## 5.2 Repository Connection


Supported providers:


Initial:

- GitHub
- GitLab
- Local Git


Future:

- Bitbucket
- Azure DevOps



---

## 5.3 Repository Status Management


Lifecycle:



CREATED

|

v

CLONING

|

v

INDEXING

|

v

READY

|

v

FAILED




# 6. Domain Model


## Repository Entity



Repository

id

name

description

provider

url

default_branch

status

last_indexed_at

created_at

updated_at




## Repository Status


```typescript

enum RepositoryStatus {

 CREATED,

 CLONING,

 INDEXING,

 READY,

 FAILED

}

7. Module Structure

NestJS:

src/modules/repositories/


├── controllers/

│
├── services/

│
├── entities/

│
├── dto/

│
├── repositories/

│
├── events/

│
└── repositories.module.ts

8. API Design
Create Repository
POST /repositories

Request:

{
 "name": "payment-service",
 "url": "https://github.com/company/payment-service",
 "branch": "main"
}

Response:

{
 "id": "repo_123",
 "status": "CREATED"
}
Get Repository
GET /repositories/:id

Response:

{
"id":"repo_123",
"name":"payment-service",
"status":"READY"
}
List Repositories
GET /repositories

Returns:

All repositories accessible by user

9. Internal Services
RepositoryService

Responsibilities:

Create repository
Update repository
Delete repository
Validate repository
GitService

Responsibilities:

Clone repository
Pull changes
Check branches

Important:

Git logic must be isolated.

Example:

RepositoryService

        |

        v

GitService Interface

        |

        v

GitHub Adapter

10. Events

Repository module publishes events.

RepositoryCreatedEvent

Payload:

{
"repositoryId":"123"
}


Consumers:

Indexing Module

Flow:

Repository Created

        |

        v

RepositoryCreatedEvent

        |

        v

Indexing Started

11. Database

Table:

repositories


Schema:

CREATE TABLE repositories (

id UUID PRIMARY KEY,

name VARCHAR(255),

url TEXT,

provider VARCHAR(50),

branch VARCHAR(100),

status VARCHAR(50),

last_indexed_at TIMESTAMP,

created_at TIMESTAMP,

updated_at TIMESTAMP

);

12. Dependencies

Repository Module depends on:

Auth Module

Git Module

Database Module


It should NOT depend on:

Parser

AI

Search

Knowledge

13. Future Enhancements
Multiple Branch Analysis

Example:

main

develop

feature/payment

Repository Webhooks

Automatically trigger indexing:

Git Push

     |

     v

Webhook

     |

     v

Re-index Changed Files

Repository Health

Detect:

Broken builds
Deprecated dependencies
Security issues
Summary

The Repository Module provides the foundation for CodeMind.

Its responsibility is simple:

"Connect and manage software systems that CodeMind will understand."

It does not analyze code.

It only provides a reliable source for the indexing pipeline.


---

This is the level of detail we should maintain for every module.

Next we should prepare:

**Part 3.2 — Indexing Module Design**

because it is the most important engineering module after Repository. It will define:

- Scanner architecture
- Incremental indexing
- Queue design
- File hashing
- Worker processes
- Large repository handling (100k+ files)
- Re-index strategy

This is where CodeMind starts becoming a real code intelligence engine.