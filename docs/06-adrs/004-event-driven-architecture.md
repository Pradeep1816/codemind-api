This ADR defines how CodeMind handles long-running operations such as:

Repository cloning
Code indexing
AST parsing
Embedding generation
AI analysis
Documentation generation

A normal synchronous API request is not suitable for these workloads.

The decision:

Use an event-driven architecture with asynchronous job processing.

Create:

docs/06-adrs/004-event-driven-architecture.md

Content:

# ADR-004: Event Driven Architecture


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind performs many operations that may take several minutes.


Examples:




Import Repository

    |

    v

Clone 20,000 Files

    |

    v

Parse Source Code

    |

    v

Generate Embeddings

    |

    v

Build Knowledge Graph




These operations cannot run inside a normal HTTP request.



A synchronous approach creates problems:


- API timeout
- Poor user experience
- Difficult error handling
- No progress tracking
- Low scalability



Therefore, CodeMind requires asynchronous processing.



# 2. Requirements



The architecture must support:



## Background Processing



Examples:




Repository Indexing

AI Analysis

Documentation Generation

Embedding Creation




---



## Reliability



If a worker fails:


- Job should retry
- Error should be recorded
- System should recover



---



## Scalability



The system should support:




1 repository

    |

100 repositories

    |

10,000 repositories




---



## Real-Time Progress



Users should see:




Indexing started

25% completed

75% completed

Completed




# 3. Options Considered



# Option 1: Synchronous Processing



Architecture:




Client

|

v

API

|

v

Process Repository

|

v

Return Response




## Problems



Large repository:




Request timeout

Memory issues

Poor UX




Decision:


Rejected.



---



# Option 2: Simple Background Jobs



Architecture:




API

|

v

Job Queue

|

v

Worker




Advantages:


- Simple
- Reliable
- Easy scaling



Decision:


Selected for initial implementation.



---



# Option 3: Kafka Event Streaming



Architecture:




Service

|

v

Kafka

|

+-------------+

| |

Worker Analytics




Advantages:


- Very scalable
- High throughput
- Event history



Disadvantages:


- More infrastructure
- Operational complexity



Decision:


Future scaling option.



---



# Option 4: RabbitMQ



Advantages:


- Reliable messaging
- Mature system



Disadvantages:


- Additional infrastructure
- Less aligned with Node ecosystem compared with BullMQ



Decision:


Not selected initially.



# 4. Decision



CodeMind will use:




Event Driven Architecture

    +

Background Job Processing

    +

Queue System




Initial technology:




Redis

BullMQ

NestJS Workers




Architecture:



             API


              |

              v


          Event Created


              |

              v


          Redis Queue


              |

              v


          Worker Process


              |

              v


      Repository Intelligence



# 5. Core Events



CodeMind events:



## Repository Events




repository.created

repository.cloned

repository.index.started

repository.index.completed

repository.index.failed




---



## Code Analysis Events




code.parsing.started

code.parsing.completed

symbol.extracted

dependency.created




---



## AI Events




embedding.generated

knowledge.created

documentation.generated

ai.analysis.completed




# 6. Event Structure



All events follow a standard format.



Example:



```json
{
 "id":"event_uuid",

 "type":"repository.index.completed",

 "source":"indexing-service",

 "organizationId":"org_id",

 "timestamp":"2026-07-29T10:00:00Z",

 "data":{

    "repositoryId":"repo_id",

    "filesProcessed":5000

 }

}
7. Queue Architecture
Queue Types

CodeMind will have separate queues:

repository-queue


        |

        v


indexing-queue


        |

        v


embedding-queue


        |

        v


ai-analysis-queue


Benefits:

Independent scaling
Better failure handling
Easier monitoring
8. Worker Architecture

Example:

Index Worker


Responsibilities:


- Read repository

- Parse files

- Store metadata

- Publish events


AI Worker:

Responsibilities:


- Generate embeddings

- Retrieve context

- Create knowledge

9. Job Lifecycle

Example:

Repository indexing:

Created


 |

 v


Queued


 |

 v


Processing


 |

 v


Completed


 |

 v


Notification Sent


Failure:

Processing


 |

 v


Error


 |

 v


Retry


 |

 v


Failed Permanently

10. Retry Strategy

Failed jobs should retry.

Example:

Attempt 1

Wait 10 seconds


Attempt 2

Wait 1 minute


Attempt 3

Wait 5 minutes


After maximum retries:

Move to Dead Letter Queue

11. Event Storage

Important events are stored.

Table:

events


Schema:

events


id

type

source

payload

status

created_at


Used for:

Debugging
Auditing
Replay
12. Real-Time Updates

Event flow:

Worker


 |

 v


Event Published


 |

 v


Notification Service


 |

 v


WebSocket


 |

 v


Developer UI


Example:

Indexing 70% completed

13. Transactional Events

Problem:

Database update succeeds but event fails.

Solution:

Use:

Outbox Pattern


Flow:

Database Transaction


        |

        v


Save Data + Event


        |

        v


Event Publisher


        |

        v


Queue

14. Event Versioning

Events should support evolution.

Example:

Version 1:

{
"type":"repository.index.completed"
}

Future:

{
"type":"repository.index.completed",
"version":2
}
15. Monitoring

Track:

Queue Length

Job Duration

Failed Jobs

Retry Count

Worker Health

16. Security

Events must contain:

Organization isolation
Permission validation
No sensitive secrets

Example:

Never include:

Database passwords

API tokens

Private keys

17. Future Scaling

Current:

NestJS

+

BullMQ

+

Redis


Future:

NestJS Services


        |

        v


Kafka


        |

        +------------+

        |            |

 Analytics     AI Workers

18. Consequences
Positive
Better User Experience

Long tasks run in background.

Scalability

Workers can scale independently.

Reliability

Retries prevent data loss.

Extensibility

New features can subscribe to events.

Negative
More Complexity

Requires queue management.

Debugging Challenges

Distributed workflows require monitoring.

Event Design Responsibility

Poor event design creates coupling.

19. Final Decision Summary
Area	Decision
Architecture	Event Driven
Queue	BullMQ
Queue Storage	Redis
Workers	NestJS Workers
Future Streaming	Kafka
Reliability Pattern	Outbox Pattern
Communication	Events
Conclusion

CodeMind will use an event-driven architecture to process
large-scale code intelligence workloads.

Final decision:

"APIs should trigger work. Workers should perform intelligence."