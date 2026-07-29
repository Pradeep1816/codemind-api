This document defines the event-driven architecture layer of CodeMind.

Events allow different modules to communicate without creating tight dependencies.

Without events:

Indexing Module
        |
        v
Knowledge Module
        |
        v
Embedding Module
        |
        v
Documentation Module

Problems:

Strong coupling
Hard to scale
Slow processing
Difficult retry handling

With events:

Repository Module

        |
        |
        v

   Event Bus

        |
        |
+---------------+---------------+

|               |               |

Indexing     Knowledge      Documentation

Worker       Worker          Worker


Create:

docs/03-database/event-schema.md

Content:

# Event Schema Design


## Document Information

Module: Event Processing System

Document: Event Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Event System provides asynchronous communication between CodeMind
modules.


It allows the platform to process large repositories efficiently.



Main responsibilities:


- Publish system events
- Consume events
- Retry failed processing
- Track event history
- Enable distributed workers



# 2. Event Architecture




Module Action

  |

  v

Event Created

  |

  v

Event Bus

  |

  +-------------+-------------+

  |             |             |

Consumer A Consumer B Consumer C

  |

  v

Business Processing




# 3. Event Bus


The Event Bus is responsible for delivering events.



Recommended technologies:



Development:



Redis Streams

BullMQ



Enterprise scale:



Apache Kafka

RabbitMQ




# 4. Event Flow Example



Repository indexed:



Repository Service

    |

    v

RepositoryIndexed Event

    |

    +----------------+

    |                |

Knowledge Worker Embedding Worker




# 5. Event Entity Overview




events

|

+---- event_consumers

|

+---- event_failures

|

+---- event_subscriptions




# 6. Events Table



Table:




events




Purpose:


Stores published events.



Schema:



```sql
events


id

event_name

aggregate_type

aggregate_id

payload

status

created_at

processed_at


Example:

{
 "event":"repository.indexed",

 "repositoryId":"123",

 "files":5000
}

7. Event Naming Convention

Format:

domain.action


Examples:

repository.created

repository.indexed

file.changed

code.parsed

knowledge.generated

embedding.created

documentation.updated

8. Core CodeMind Events
Repository Events
repository.created

Triggered when a repository is added.

Payload:

{
 "repositoryId":"123",
 "url":"git-url"
}

repository.indexed

Triggered after indexing completes.

Payload:

{
 "repositoryId":"123",
 "filesProcessed":5000,
 "duration":"20min"
}

9. File Events
file.detected

New file discovered.

Payload:

{
 "fileId":"123",
 "path":"payment.service.ts"
}

file.changed

Triggered after git changes.

Example:

Developer commits code


        |

        v


file.changed


Payload:

{
 "file":"payment.service.ts",
 "changeType":"MODIFIED"
}

10. Parsing Events
code.parsed

Generated after AST parsing.

Payload:

{
 "fileId":"123",
 "entities":25
}

11. Knowledge Events
knowledge.generated

Triggered when AI analysis creates knowledge.

Payload:

{
 "knowledgeId":"456",
 "type":"BUSINESS_RULE",
 "confidence":0.92
}

12. Embedding Events
embedding.created

Triggered after vector generation.

Payload:

{
 "entityId":"123",
 "model":"text-embedding-model"
}

13. Documentation Events
documentation.generated

Triggered after documentation creation.

Payload:

{
 "documentId":"123",
 "type":"MODULE"
}

documentation.updated

Triggered after code changes affect documentation.

Payload:

{
 "documentId":"123",
 "reason":"code_changed"
}

14. MCP Events

MCP clients can receive notifications.

Examples:

knowledge.updated

documentation.updated

repository.reindexed


Example:

Cursor IDE


        |

        v


MCP Notification


        |

        v


Refresh Context

15. Event Consumer Schema

Table:

event_consumers


Purpose:

Track event processing.

Schema:

event_consumers


id

event_id

consumer_name

status

attempts

processed_at

error_message


Example:

Event:

repository.indexed


Consumer:

Embedding Worker


Status:

COMPLETED

16. Event Subscription Schema

Table:

event_subscriptions


Purpose:

Defines which service listens to events.

Schema:

event_subscriptions


id

service_name

event_name

enabled

created_at


Example:

Service:

Documentation Worker


Event:

file.changed

17. Event Failure Handling

Failures are expected.

Example:

Embedding API unavailable


        |

        v


Retry Event


        |

        v


Process Again


Table:

event_failures


Schema:

event_failures


id

event_id

error

retry_count

last_retry_at

created_at

18. Retry Strategy

Example:

Attempt 1

Immediate retry


Attempt 2

After 1 minute


Attempt 3

After 5 minutes


Attempt 4

Move to dead letter queue

19. Event Ordering

Some events require order.

Example:

Correct:

file.changed

      |

      v

code.parsed

      |

      v

embedding.created


Incorrect:

embedding.created

before

code.parsed


Solution:

Use:

Event sequence number
Aggregate version
20. Event Payload Design

Payload should contain:

Required:

eventId

timestamp

aggregateId

eventName

version

data


Example:

{
 "eventId":"abc",

 "version":1,

 "eventName":
 "knowledge.generated",

 "data":{
   "knowledgeId":"123"
 }
}

21. Event Versioning

Events change over time.

Example:

Version 1:

{
"userId":"123"
}


Version 2:

{
"user":{
"id":"123",
"name":"John"
}
}


Maintain:

event_version

22. TypeORM Example
@Entity()
export class Event {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
eventName:string;


@Column("json")
payload:any;


@Column()
status:string;


}

23. Index Strategy

events:

event_name

aggregate_id

status

created_at


event_consumers:

event_id

consumer_name

status

24. Monitoring Metrics

Track:

Events Published

Events Processed

Failed Events

Retry Count

Processing Time


Metrics:

event_processing_time

event_failure_rate

event_queue_size

25. Future Enhancements
Event Replay

Ability to rebuild knowledge:

Repository History


        |

        v


Replay Events


        |

        v


Rebuild Intelligence

Real-Time Collaboration

Multiple developers:

Developer A changes code


        |

        v


CodeMind updates knowledge


        |

        v


Developer B gets fresh context

AI Agent Events

Agents communicate:

Analysis Agent Completed


        |

        v


Documentation Agent Starts


        |

        v


Review Agent Validates

Summary

The Event System makes CodeMind scalable and modular.

It allows:

Large repository processing
Background indexing
Independent workers
Real-time updates
Reliable AI workflows

Core principle:

"Modules should communicate through events, not dependencies."