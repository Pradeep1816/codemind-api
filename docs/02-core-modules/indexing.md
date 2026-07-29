Indexing Module Design


## Document Information

Module: Indexing Engine

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Indexing Module is responsible for scanning software repositories and converting raw source files into structured information that can be consumed by downstream systems.


The Indexing Module is the first processing stage after repository registration.


Pipeline:



Repository

 |

 v

Indexing Engine

 |

 v

Parser

 |

 v

Analysis Engine

 |

 v

Knowledge Engine




# 2. Goals


The Indexing Module should:


- Scan repositories efficiently
- Handle very large codebases
- Detect file changes
- Avoid unnecessary processing
- Create background processing jobs
- Provide indexing progress
- Support multiple programming languages



# 3. Non Goals


The Indexing Module should NOT:


- Understand programming language syntax
- Extract business rules
- Generate AI summaries
- Create embeddings


Those responsibilities belong to:



Parser Module

Analysis Module

Business Engine

AI Module




# 4. High Level Architecture


             Repository Module

                     |

                     v


             Indexing Service


                     |

          ----------------------

          |                    |

          v                    v


    File Scanner          Job Queue


                               |

                               v


                          Workers


                               |

                               v


                          Parser Module



# 5. Indexing Workflow


## Step 1: Create Index Request


User triggers indexing:



POST /repositories/:id/index




System creates:



IndexJob

status: CREATED




---

## Step 2: Repository Scanner


Scanner reads repository:


Example:



src/

├── user.service.ts

├── invoice.service.ts

├── payment.service.ts

└── database.sql




Scanner extracts:


- File paths
- Extensions
- File size
- Hash
- Last modified date



---

## Step 3: File Metadata Storage


Each file creates a record:



File

id

repository_id

path

language

hash

size

status

created_at

updated_at




---

## Step 4: Processing Queue


Files are pushed into processing jobs.


Example:



ParseFileJob

{

fileId:"123"

}




Workers process jobs asynchronously.



---

# 6. File Discovery System


## Responsibilities


The scanner identifies:


Source code:


.ts

.js

.java

.py



Configuration:



package.json

docker-compose.yml

.env.example



Documentation:



README.md

docs/




# Ignore Rules


The scanner must support:



.gitignore

.codemindignore




Example:



node_modules/

dist/

build/

coverage/




# 7. Incremental Indexing


## Problem


Large repositories cannot be fully processed every time.


Example:


Initial indexing:



500,000 files



Developer changes:



invoice.service.ts

payment.service.ts



Only these files should be processed.



---

# Solution


Use file fingerprinting.


Each file stores:



path

size

hash

last_modified




Comparison:



Old Hash

 |

 v

New Hash

Same

|

Skip Processing

Different

|

Re-index File




---

# 8. Indexing Job Architecture


## Job Types



RepositoryIndexJob

 |

 +-- ScanFilesJob


 |

 +-- DetectChangesJob


 |

 +-- ProcessFilesJob


 |

 +-- CompleteIndexJob



---

# 9. Worker Architecture


Workers handle heavy operations.



Example:



API Server

|

v

Redis Queue

|

v

Index Worker

|

v

Process Files




Benefits:


- API remains fast
- Horizontal scaling
- Retry failed jobs
- Better resource management



---

# 10. Large Repository Strategy


CodeMind should support:



10,000 files

100,000 files

1,000,000+ files




## Techniques


### Batch Processing


Do not load everything into memory.


Bad:



Read entire repository

    |

    v

Store all files



Good:



Process 100 files

    |

    v

Save

    |

    v

Continue




---

## Parallel Processing


Example:



Worker 1

Parse files 1-100

Worker 2

Parse files 101-200

Worker 3

Parse files 201-300




---

## Priority Processing


Important files first:


Priority 1:


package.json

tsconfig.json

README.md



Priority 2:



src/



Priority 3:



tests/

examples/




---

# 11. Index Status Tracking


Index Job:



CREATED

|

v

RUNNING

|

v

PROCESSING

|

v

COMPLETED

or

FAILED




Stored:



index_jobs

id

repository_id

status

total_files

processed_files

failed_files

started_at

completed_at




---

# 12. Events


The Indexing Module publishes events.



## IndexStartedEvent


Payload:


```json
{
 "repositoryId":"123",
 "jobId":"456"
}

FileIndexedEvent

Payload:

{
 "fileId":"789"
}

IndexCompletedEvent

Payload:

{
 "repositoryId":"123",
 "totalFiles":50000
}


Consumers:

Parser Module

Analysis Module

Knowledge Module

13. Error Handling

Possible failures:

File Permission Error

Action:

Skip file

Log error

Continue indexing

Parser Failure

Action:

Mark file failed

Continue processing

Repository Removed

Action:

Cancel jobs

Cleanup data

14. Module Structure

NestJS:

src/modules/indexing/


├── controllers/

│

├── services/

│

├── workers/

│

├── queues/

│

├── processors/

│

├── jobs/

│

├── entities/

│

├── events/

│

└── indexing.module.ts

15. Dependencies

Indexing Module depends on:

Repository Module

Storage Module

Queue Module


Should NOT depend on:

AI Module

Business Engine

Search Module

16. Future Enhancements
Real Time Indexing

Using:

Git Webhooks


Flow:

Developer Push


      |

      v


Webhook


      |

      v


Changed Files Indexed

Multi Language Detection

Example:

Java Repository


    |

    +-- Java Parser


    +-- SQL Parser


    +-- XML Parser

Distributed Workers

Future:

Multiple Worker Nodes


Worker 1

Worker 2

Worker 3

Summary

The Indexing Module is the ingestion foundation of CodeMind.

Its responsibility:

"Convert a repository into a structured collection of files ready for understanding."

It focuses on:

Performance
Scalability
Reliability
Incremental processing

It does not understand code.