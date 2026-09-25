> **Legacy draft — do not implement.** Phase 4 initially represents business
> facts as typed, evidence-backed knowledge nodes and edges. See
> [Knowledge Graph Schema](knowledge-graph-schema.md) and
> [ADR-014](../06-adrs/014-knowledge-analysis-architecture.md). Specialized
> `business_*` projections are deferred until real query requirements justify
> them. The model below is retained only as historical design context.

This was the original business-schema concept for CodeMind.

The previous layers understand:

Repository
        |
        v
Code Structure
        |
        v
Knowledge
        |
        v
AI Memory

The Business Schema answers:

"What business problem does this code solve?"

This is the layer that helps developers understand legacy systems.

Example:

Code:

paymentService.processPayment()

Technical understanding:

Calls payment gateway API
Updates payment table
Creates invoice

Business understanding:

Customer payment workflow:

Customer pays
      |
Payment verified
      |
Invoice generated
      |
Subscription activated
      |
Notification sent


Create file:

docs/03-database/business-schema.md

Content:

# Business Schema Design


## Document Information

Module: Business Intelligence Engine

Document: Business Schema

Status: Superseded legacy draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Business Schema stores business-level understanding extracted from
software systems.


The purpose is to transform:


Technical Implementation


into:


Business Meaning



Example:


Code:



createInvoice()



Business meaning:



Generate customer invoice after successful payment.




# 2. Goals


The Business Schema enables CodeMind to understand:


- Business entities
- Business processes
- Business rules
- Domain workflows
- Business events
- System behaviour



# 3. Architecture Position




Source Code

|

v

Code Intelligence

|

v

Analysis Engine

|

v

Business Engine

|

v

Business Knowledge

|

v

AI Assistant




# 4. Business Data Model



High level:




Business Domain

   |

   +---- Entities


   |

   +---- Rules


   |

   +---- Workflows


   |

   +---- Events


   |

   +---- Decisions



# 5. Business Entity Schema



Table:



business_entities



Purpose:


Represents important business concepts.



Examples:



Customer

Invoice

Payment

Subscription

Order

Lesson

Enrollment




Schema:



```sql
business_entities


id

repository_id

name

description

domain

source_type

confidence

created_at

updated_at


Example:

Entity:

Invoice


Description:

Document representing customer payment obligation.


Domain:

Billing

6. Business Entity Mapping

Business entities must connect with code.

Example:

Business Entity


Invoice


        |

        |

Implemented By


        |

        v


Code Entity


InvoiceEntity

InvoiceService

InvoiceController


Table:

business_entity_mapping


Schema:

business_entity_mapping


id

business_entity_id

code_entity_id

relationship_type

confidence

created_at


Relationship types:

IMPLEMENTS

MANAGES

CREATES

UPDATES

VALIDATES

7. Business Rule Schema

Table:

business_rules


Purpose:

Stores business constraints and policies.

Example:

Rule:

Paid invoices cannot be deleted.


Schema:

business_rules


id

repository_id

name

description

condition

action

priority

confidence

status

created_at

updated_at

8. Business Rule Example

Rule:

Name:

Invoice deletion restriction


Condition:

Invoice status = PAID


Action:

Prevent deletion


Implemented By:

InvoiceService.delete()

9. Business Workflow Schema

Table:

business_workflows


Purpose:

Stores end-to-end business processes.

Examples:

Customer Registration

Payment Processing

Invoice Generation

Refund Process

Enrollment Process


Schema:

business_workflows


id

repository_id

name

description

trigger

status

confidence

created_at

updated_at

10. Workflow Steps Schema

Table:

workflow_steps


Purpose:

Stores workflow sequence.

Example:

Payment Workflow


Step 1:

Validate customer


Step 2:

Process payment


Step 3:

Create invoice


Step 4:

Send notification


Schema:

workflow_steps


id

workflow_id

step_number

name

description

business_entity_id

code_entity_id

created_at

11. Business Event Schema

Table:

business_events


Purpose:

Stores important system events.

Examples:

PaymentCompleted

InvoiceCreated

EnrollmentCreated

UserRegistered


Schema:

business_events


id

repository_id

name

description

trigger

created_at

12. Event Mapping

Connect events with code.

Example:

PaymentCompleted


       |

       v


PaymentService


       |

       v


InvoiceService


Table:

business_event_handlers


Schema:

business_event_handlers


id

event_id

code_entity_id

handler_type

created_at

13. Domain Schema

Table:

business_domains


Purpose:

Group related business concepts.

Example:

Billing Domain


    |

    +-- Invoice

    +-- Payment

    +-- Refund



Schema:

business_domains


id

repository_id

name

description

created_at

14. Decision Schema

Table:

business_decisions


Purpose:

Store decision logic.

Example:

If customer has premium plan:

Apply 10% discount


Schema:

business_decisions


id

rule_id

condition

decision

created_at

15. Business Relationship Schema

Table:

business_relationships


Purpose:

Connect business concepts.

Example:

Customer


   owns


Subscription


   creates


Invoice


Schema:

business_relationships


id

source_entity_id

target_entity_id

relationship_type

confidence

created_at

16. Business Understanding Flow

Example:

Question:

How does subscription renewal work?


CodeMind Flow:

Question


   |

   v


Business Workflow Search


   |

   v


Subscription Renewal Workflow


   |

   +---- Payment Rule

   |

   +---- Invoice Rule

   |

   +---- Notification Rule


   |

   v


AI Explanation

17. Confidence System

Business knowledge can come from different sources.

Confidence:

User Confirmed

        |

        v

1.0


Code Evidence

        |

        v

0.9


AI Inference

        |

        v

0.6

18. TypeORM Example
@Entity()
export class BusinessRule {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
name:string;


@Column("text")
description:string;


@Column({
type:"float"
})
confidence:number;


}

19. Index Strategy

business_entities:

repository_id

name

domain


business_rules:

repository_id

status

confidence


business_workflows:

repository_id

name

20. Future Enhancements
Automatic Domain Discovery

CodeMind can detect:

Payment Domain

Billing Domain

User Domain

Inventory Domain

Business Documentation Generation

Generate:

Business Process Documents

System Manuals

Migration Guides

Legacy Modernization Support

Example:

Legacy PHP System


        |

        v


Business Understanding


        |

        v


New NestJS Architecture

Summary

The Business Schema is the heart of CodeMind's mission.

It allows AI to understand:

"Why does this code exist?"

not only:

"What does this code do?"

This enables developers to safely work on legacy systems.
