This document defines the communication and real-time update layer of CodeMind.

Notifications are important because CodeMind performs many long-running operations:

Repository indexing
Code analysis
Embedding generation
Documentation generation
AI analysis jobs
MCP requests

Users should not need to continuously refresh the application.

Create:

docs/03-database/notification-schema.md

Content:

# Notification Schema Design


## Document Information

Module: Notification System

Document: Notification Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Notification System provides real-time communication between
CodeMind services and users.


It informs users about:


- Background job progress
- Repository indexing status
- AI task completion
- Documentation updates
- Knowledge approvals
- Security events



# 2. Problem Statement


CodeMind performs asynchronous operations.



Example:


Repository:



10,000 files




Indexing:



Clone

|

Scan

|

Parse

|

Analyze

|

Generate Embeddings




This may take several minutes.



Users need visibility:




Indexing started

30% completed

80% completed

Completed successfully




# 3. Notification Architecture




Application Event

    |

    v

Notification Service

    |

    +-------------+

    |             |

WebSocket Email/Push

    |

    v

Developer Interface




# 4. Notification Types



## System Notifications


Examples:



Repository indexing completed

Repository analysis failed

System maintenance




---



## AI Notifications


Examples:



AI analysis completed

New business rule detected

Documentation generated




---



## Collaboration Notifications


Examples:



Knowledge approved

Developer mentioned

Review requested




# 5. Notification Entity Overview




notifications

  |

  +---- notification_preferences


  |

  +---- notification_delivery


  |

  +---- notification_templates



# 6. Notifications Table



Table:



notifications




Purpose:


Stores user notifications.



Schema:



```sql
notifications


id

user_id

organization_id

type

title

message

priority

status

entity_type

entity_id

created_at

read_at


Example:

{
"type":"INDEX_COMPLETED",

"title":"Repository Analysis Complete",

"message":"Payment module analysis finished",

"status":"UNREAD"
}

7. Notification Types

Supported:

INDEX_STARTED

INDEX_PROGRESS

INDEX_COMPLETED

INDEX_FAILED

ANALYSIS_COMPLETED

KNOWLEDGE_CREATED

KNOWLEDGE_APPROVAL_REQUIRED

DOCUMENTATION_UPDATED

MCP_REQUEST_COMPLETED

SECURITY_ALERT

8. Notification Status

Values:

UNREAD

READ

ARCHIVED

FAILED

9. Notification Priority

Priority levels:

LOW

NORMAL

HIGH

CRITICAL


Example:

Documentation updated

NORMAL


Security permission changed

CRITICAL

10. Notification Delivery

A notification may use multiple channels.

Table:

notification_delivery


Schema:

notification_delivery


id

notification_id

channel

status

sent_at

error_message


Channels:

IN_APP

EMAIL

WEB_SOCKET

SLACK

11. Notification Preferences

Users should control notifications.

Table:

notification_preferences


Schema:

notification_preferences


id

user_id

notification_type

email_enabled

web_enabled

created_at

updated_at


Example:

User preference:


INDEX_COMPLETED

Email:

OFF


Web:

ON

12. Notification Templates

Table:

notification_templates


Purpose:

Reusable notification messages.

Schema:

notification_templates


id

name

type

subject

content

created_at


Example:

Template:

Repository {name} indexing completed.

Files processed:

{count}

13. Real-Time Notification Flow

Example:

Repository indexing finished:

Index Worker


      |

      v


repository.indexed Event


      |

      v


Notification Service


      |

      v


WebSocket Gateway


      |

      v


Developer UI

14. WebSocket Architecture
Browser


   |

   |

WebSocket Connection


   |

   v


NestJS Gateway


   |

   v


Notification Service


Example event:

{
"event":"notification.created",

"data":{

"title":"Index Completed"

}

}

15. Job Progress Notifications

Long-running tasks require progress updates.

Example:

Repository Analysis


0%

 |

25%

 |

50%

 |

75%

 |

100%


Table:

job_progress_notifications


Schema:

job_progress_notifications


id

job_id

progress

message

created_at


Example:

{
"jobId":"123",

"progress":75,

"message":"Generating embeddings"

}

16. Notification + Event Integration

Events create notifications.

Example:

knowledge.generated


        |

        v


Notification Created


        |

        v


Developer Alerted

17. Notification Security

Notifications must respect:

User permissions
Repository access
Organization boundaries

Example:

Developer without access:

Cannot receive repository notifications

18. Notification History

Users should view previous notifications.

API:

GET

/api/notifications


Response:

[
 {
  "title":"Analysis completed",
  "read":false
 }
]

19. Notification APIs

Create:

POST

/api/notifications


List:

GET

/api/notifications


Mark read:

PATCH

/api/notifications/{id}/read


Preferences:

GET

/api/notification-preferences

20. TypeORM Example
@Entity()
export class Notification {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
type:string;


@Column()
title:string;


@Column()
status:string;


@Column()
priority:string;


@CreateDateColumn()
createdAt:Date;


}

21. Index Strategy

notifications:

user_id

status

created_at


notification_delivery:

notification_id

channel

status

22. Monitoring Metrics

Track:

Notifications Sent

Delivery Success Rate

Failed Deliveries

Average Delivery Time

Unread Count

23. Future Enhancements
Smart Notifications

AI decides importance:

Example:

Minor code change


      |

      v


No notification



Critical business rule change:

Immediate notification

Team Notifications

Example:

Payment module changed


Notify:

Backend Team

QA Team

Architecture Owner

AI Generated Reports

Automatically send:

Weekly Repository Health Report

Security Summary

Architecture Changes

Summary

The Notification System keeps developers informed about
CodeMind activities.

It enables:

Real-time updates
Background task visibility
AI workflow communication
Enterprise collaboration

Core principle:

"Developers should know what CodeMind is doing without waiting."
