Business Engine Module Design


## Document Information

Module: Business Intelligence Engine

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Business Engine converts technical code understanding into business-level knowledge.


It discovers:

- Business rules
- Workflows
- Domain concepts
- State transitions
- Decision logic
- Business constraints


The goal is to help developers understand legacy systems without manually reading thousands of files.



# 2. Problem Statement


Legacy systems usually contain business knowledge hidden inside:


- Conditional statements
- Database queries
- Service methods
- Configuration files
- Validation logic
- Historical code changes


Example:


Technical code:


```typescript
if(student.status === "inactive") {

    cancelFutureLessons();

}

Traditional code understanding:

StudentService updates lessons.


Business understanding:

When a student becomes inactive,
all future scheduled lessons are cancelled.

3. Goals

The Business Engine should:

Extract business rules from code
Identify business workflows
Map technical components to business concepts
Understand domain terminology
Generate business explanations
Connect code behaviour with user actions
4. Non Goals

The Business Engine should NOT:

Replace domain experts
Make final business decisions
Modify application behaviour
Automatically rewrite code

It provides understanding, not automation.

5. Architecture

High-level design:

              Knowledge Module


                    |

                    v


          Business Extraction Engine


                    |

        --------------------------------


        |              |              |


        v              v              v


 Rule Engine    Workflow Engine   Domain Engine


        |

        v


 Business Knowledge Graph

6. Business Understanding Pipeline

Flow:

Source Code


    |

    v


Code Analysis


    |

    v


Pattern Detection


    |

    v


Business Extraction


    |

    v


Business Knowledge


    |

    v


Documentation / AI

7. Business Rule Extraction
What is a Business Rule?

A business rule represents a condition or decision that controls system behaviour.

Example:

Code:

if(amount > 10000){

 requireApproval();

}


Extracted rule:

Transactions above 10,000 require approval.

8. Rule Types
Validation Rules

Example:

Code:

if(age < 18){

 throw Error();

}


Business:

Users under 18 cannot register.

Calculation Rules

Example:

Code:

total = price - discount;


Business:

Final amount is calculated after applying discount.

Permission Rules

Example:

Code:

if(role==="ADMIN")


Business:

Only administrators can perform this action.

State Transition Rules

Example:

Code:

order.status="SHIPPED";


Business:

An order moves from processing to shipped state.

9. Workflow Discovery

A workflow represents a sequence of business actions.

Example:

Technical flow:

OrderController

      |

      v

OrderService

      |

      v

PaymentService

      |

      v

InventoryService


Business workflow:

Customer places order

        |

Payment processed

        |

Inventory reserved

        |

Order confirmed

10. Domain Concept Extraction

The engine identifies business entities.

Examples:

Technical:

CustomerEntity

InvoiceEntity

PaymentEntity


Business:

Customer

Invoice

Payment


Sources:

Database tables
Entity names
API names
Variable names
Documentation
11. Decision Logic Analysis

The engine analyzes:

Conditions

Example:

if(subscription.type==="PREMIUM")


Meaning:

Premium subscribers receive special processing.

Loops

Example:

for(each invoice)


Meaning:

System processes multiple invoices.

Exceptions

Example:

throw PaymentFailedException


Meaning:

Payment failure is a supported business scenario.

12. Business Knowledge Model

Business objects:

Business Entity

Business Rule

Workflow

Decision

Constraint

Event


Example:

Entity:

Invoice


Rule:

Invoice cannot be deleted after payment.


Workflow:

Invoice Creation Process

13. Business Graph

Example:

Customer


   |

creates


   |

Enrollment


   |

generates


   |

Invoice


   |

paid by


   |

Payment


The graph allows questions:

How does customer payment work?


What happens after cancellation?


Which rules affect invoices?

14. AI Assisted Extraction

AI should not directly scan the whole repository.

Correct flow:

Repository


 |

 v


Parser


 |

 v


Analysis


 |

 v


Business Context


 |

 v


AI



Benefits:

Less token usage
Better accuracy
Better context
Lower cost
15. Confidence System

Business extraction should have confidence scores.

Example:

Rule:

Late payment creates penalty.


Confidence:

85%


Evidence:

PaymentService

PenaltyCalculationService

Documentation


Levels:

HIGH

MEDIUM

LOW

16. Database Design
Business Rules

Table:

business_rules


id

repository_id

name

description

confidence

source_reference

created_at

Workflows
business_workflows


id

name

description

steps

confidence

Business Entities
business_entities


id

name

type

description

17. Events
BusinessRuleDetectedEvent

Example:

{
"type":"VALIDATION_RULE",
"name":"Payment Approval Required"
}
WorkflowDiscoveredEvent

Example:

{
"name":"Invoice Generation Workflow"
}
18. Module Structure

NestJS:

src/modules/business/


├── controllers/

├── services/

├── extractors/

│
├── rules/

│
├── workflows/

│
├── domain/

├── confidence/

├── entities/

├── events/

└── business.module.ts

19. Dependencies

Depends on:

Knowledge Module

Analysis Module

Parser Module


Should NOT depend on:

AI Module

MCP Module

Frontend

20. Future Enhancements
Business Simulation

Example:

Question:

What happens if payment fails?


Simulation:

Payment Failure

 |

 v

Create Credit

 |

 v

Notify Customer

Automatic Business Documentation

Generate:

Process documents
SOPs
Technical-to-business mapping
Domain Expert Feedback

Allow users to:

Approve rules
Correct explanations
Add missing context
Summary

The Business Engine transforms technical understanding into business understanding.

Its responsibility:

"Explain what the software does from a business perspective."

It enables:

Legacy system onboarding
Faster developer productivity
Business documentation
AI-powered system understanding
Safer code changes