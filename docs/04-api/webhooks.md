This document defines how CodeMind communicates events to external systems.

Webhooks are required for:

CI/CD integration
Developer workflows
Enterprise automation
AI agent workflows
External monitoring systems

The goal:

"CodeMind should notify external systems when important events happen without requiring continuous polling."

# CodeMind Webhooks API


## 1. Introduction


Webhooks allow CodeMind to send real-time event notifications
to external applications.


Instead of repeatedly asking:


Is indexing completed?

Is documentation ready?

Did analysis finish?


External systems receive events automatically.



Example:



Repository Indexed

    |

    v

CodeMind Webhook

    |

    v

External System




# 2. Webhook Goals


## Real-Time Communication


Provide immediate notification for important events.



## Automation


Enable workflows like:


- Trigger deployment after analysis
- Update dashboards
- Notify teams
- Start external jobs



## Reliability


Webhooks must support:


- Retry handling
- Security verification
- Event tracking



# 3. Webhook Architecture



Flow:




CodeMind Event

    |

    v

Event Processor

    |

    v

Webhook Service

    |

    v

External Application

    |

    v

Webhook Endpoint




# 4. Supported Webhook Events



Initial events:



## Repository Events




repository.created

repository.updated

repository.deleted

repository.connected




---



## Indexing Events




index.started

index.progress

index.completed

index.failed




---



## Analysis Events




analysis.started

analysis.completed

analysis.failed




---



## AI Events




ai.request.completed

ai.documentation.generated

ai.analysis.completed




---



## Knowledge Events




knowledge.updated

business-rule.detected

architecture.generated




# 5. Webhook Registration API



Base path:




/api/v1/webhooks




## Create Webhook



Endpoint:




POST /webhooks




Request:



```json
{
 "url":"https://example.com/codemin-webhook",

 "events":[
   "index.completed",
   "analysis.completed"
 ]
}

Response:

{
 "id":"webhook_123",

 "status":"active"
}
6. List Webhooks

Endpoint:

GET /webhooks


Returns:

Registered URLs
Events
Status
Last delivery
7. Update Webhook

Endpoint:

PATCH /webhooks/{id}


Used for:

Changing URL
Adding events
Disabling webhook
8. Delete Webhook

Endpoint:

DELETE /webhooks/{id}

9. Webhook Payload Format

Every webhook follows a standard structure.

Example:

{
 "id":"evt_123",

 "event":"index.completed",

 "timestamp":"2026-07-29T10:00:00Z",

 "data":{
    "repositoryId":"repo_123",
    "status":"completed"
 }
}
10. Event Types
Repository Created

Event:

repository.created


Payload:

{
 "repositoryId":"repo_123",

 "name":"payment-service"
}
Index Completed

Event:

index.completed


Payload:

{
 "repositoryId":"repo_123",

 "filesIndexed":15000,

 "symbolsIndexed":45000
}
AI Documentation Generated

Event:

ai.documentation.generated


Payload:

{
 "repositoryId":"repo_123",

 "documentId":"doc_123"
}
11. Webhook Security

Webhook requests must be verified.

Security methods:

Signature Verification

CodeMind sends:

X-CodeMind-Signature


Example:

sha256=abc123


Receiver verifies:

Request Body

+

Secret Key

=

Signature

12. Webhook Secret

When creating webhook:

CodeMind generates:

Webhook Secret


Example:

whsec_xxxxxxxxx


Rules:

Store securely
Never expose publicly
Rotate when required
13. Webhook Headers

Example:

POST /webhook


Headers:


Content-Type: application/json


X-CodeMind-Event: index.completed


X-CodeMind-Signature: sha256=abc123


X-CodeMind-Delivery-ID: del_123

14. Delivery Retry Strategy

Webhook delivery can fail.

Example:

CodeMind

 |

 v

External API


500 Error


Retry policy:

Attempt 1

Immediately


Attempt 2

1 minute


Attempt 3

5 minutes


Attempt 4

30 minutes

15. Failed Webhook Handling

After maximum retries:

Event status:

failed


Stored information:

Event ID
Destination URL
Error response
Retry count
16. Webhook Idempotency

External systems must handle duplicate events.

Each event contains:

eventId


Example:

{
 "id":"evt_123"
}

Consumer should store processed IDs.

17. Webhook Delivery States

Lifecycle:

Created


 |

 v


Queued


 |

 v


Sending


 |

 +------+

 |      |

 v      v


Success Failed



Statuses:

pending

delivered

failed

disabled

18. Webhook Logs

CodeMind stores:

Event ID
Delivery time
Response status
Retry attempts

Example:

Event:

index.completed


Status:

200


Duration:

120ms

19. Webhook Permissions

Only authorized users can manage webhooks.

Required permission:

webhook.create

webhook.read

webhook.update

webhook.delete

20. Enterprise Webhooks

Future support:

Event Filtering

Example:

Only send:

repository.created

for production repositories

Multiple Destinations

Example:

Slack

+

Jira

+

Custom API

Webhook Transformation

Allow:

CodeMind Event

       |

       v

Custom Format

       |

       v

External System

21. Webhook Implementation

Backend modules:

src/


webhooks/


├── webhook.controller.ts

├── webhook.service.ts

├── delivery.service.ts

├── signature.service.ts

└── retry.worker.ts

22. Webhook Database Model

Tables:

webhooks


webhook_events


webhook_deliveries


Example:

Webhook


   |

   v


Deliveries


   |

   v


Event Logs

23. Webhook Monitoring

Monitor:

Delivery success rate
Failed deliveries
Average latency
Retry count
24. Final Webhook Principles

CodeMind webhooks follow:

Reliable delivery

+

Secure communication

+

Retry support

+

Event transparency


Conclusion:

"Webhooks allow CodeMind intelligence to become part of existing engineering workflows."
