This document defines how CodeMind stores and manages automatically generated software documentation.

The goal is not just generating documentation once.

CodeMind should maintain documentation as the system changes.

The previous layers:

Repository
      |
      v
Code Intelligence
      |
      v
Knowledge Engine
      |
      v
Business Understanding
      |
      v
Documentation Engine

The Documentation Schema converts intelligence into human-readable artifacts.

Example:

Code:

PaymentService.processPayment()

Knowledge:

Payment validates transactions,
creates payment records,
and triggers invoice generation.

Generated documentation:

# Payment Module

## Responsibility

Handles customer payment processing.

## Workflow

Customer Payment
        |
Payment Validation
        |
Transaction Creation
        |
Invoice Generation

Create:

docs/03-database/documentation-schema.md

Content:

# Documentation Schema Design


## Document Information

Module: Documentation Engine

Document: Documentation Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Documentation Schema stores generated and maintained documentation
created from CodeMind intelligence.


The system generates documentation from:


- Source code
- Code analysis
- Business knowledge
- Architecture knowledge
- API information
- Developer feedback



# 2. Goals


The Documentation System provides:


- Automatic documentation generation
- Documentation versioning
- Change tracking
- Documentation search
- AI generated explanations
- Architecture reports



# 3. Documentation Architecture




Code Repository

   |

   v

Analysis Engine

   |

   v

Knowledge Engine

   |

   v

Documentation Generator

   |

   v

Documentation Database

   |

   v

Developer Portal




# 4. Documentation Types



CodeMind supports multiple documentation categories.



## 4.1 Architecture Documentation


Examples:



System Overview

Module Architecture

Database Design

Deployment Architecture




---


## 4.2 Module Documentation


Example:




Payment Module

Responsibilities

Dependencies

Public APIs

Business Rules




---


## 4.3 API Documentation


Example:




POST /payments

Purpose:

Create customer payment

Authentication:

Bearer Token

Flow:

Validate

Process

Store




---


## 4.4 Business Documentation


Example:




Refund Process

Customer Request

    |

Validation

    |

Refund Creation

    |

Credit Generation




---


## 4.5 Change Documentation


Example:



PaymentService changed

Affected:

Invoice Module

Notification Module




# 5. Documentation Entity Overview




documentation_documents

      |

      +---- documentation_versions


      |

      +---- documentation_sections


      |

      +---- documentation_sources



# 6. Documentation Documents Table



Table:



documentation_documents




Purpose:


Stores documentation metadata.



Schema:


```sql
documentation_documents


id

repository_id

type

title

description

status

created_by

created_at

updated_at

7. Document Type

Values:

ARCHITECTURE

MODULE

API

BUSINESS

DATABASE

CHANGE_REPORT

MIGRATION_GUIDE

8. Documentation Sections Table

Table:

documentation_sections


Purpose:

Stores individual document sections.

Example:

Payment Module


    |

    +-- Overview

    |

    +-- Workflow

    |

    +-- API

    |

    +-- Business Rules


Schema:

documentation_sections


id

document_id

title

content

order_number

created_at

updated_at

9. Documentation Version Table

Table:

documentation_versions


Purpose:

Track documentation changes.

Schema:

documentation_versions


id

document_id

version

content

change_reason

created_at


Example:

Version 1:

Payment uses Stripe


Version 2:

Payment migrated to Razorpay

10. Documentation Source Mapping

Table:

documentation_sources


Purpose:

Track where documentation information came from.

Example:

Documentation:

Payment Workflow


Sources:

PaymentService.ts

InvoiceService.ts

Business Rule #123


Schema:

documentation_sources


id

document_id

source_type

source_id

confidence

created_at


Source Types:

CODE_ENTITY

KNOWLEDGE_ITEM

BUSINESS_RULE

API_ENDPOINT

DATABASE_ENTITY

11. Documentation Generation Jobs

Table:

documentation_jobs


Purpose:

Track generation process.

Schema:

documentation_jobs


id

repository_id

document_type

status

started_at

completed_at

error_message


Statuses:

PENDING

PROCESSING

COMPLETED

FAILED

12. Documentation Template Schema

Table:

documentation_templates


Purpose:

Define reusable documentation formats.

Example:

Architecture template:

Overview

Components

Data Flow

Deployment

Security


Schema:

documentation_templates


id

name

type

template_content

created_at

13. Documentation Search

Documentation should be searchable.

Flow:

User Question


      |

      v


Documentation Search


      |

      v


Relevant Sections


      |

      v


AI Response

14. Documentation + Embedding Integration

Documentation content should also create embeddings.

Flow:

Documentation Generated


        |

        v


Create Embedding


        |

        v


Store Vector


        |

        v


Semantic Search

15. Documentation Update Flow

When code changes:

Git Commit


     |

     v


Impact Analysis


     |

     v


Find Related Documentation


     |

     v


Generate Update


     |

     v


Create New Version

16. Documentation Approval Flow

Generated documentation may require review.

AI Generated


      |

      v


Review


      |

      +------------+

      |            |

      v            v


Approved       Rejected


17. Documentation Quality Score

Each document has quality metrics.

Example:

Completeness:

90%


Code Coverage:

85%


Business Coverage:

70%


Table:

documentation_quality


Schema:

documentation_quality


id

document_id

completeness_score

accuracy_score

coverage_score

created_at

18. TypeORM Example
@Entity()
export class DocumentationDocument {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
title:string;


@Column()
type:string;


@Column()
status:string;


@OneToMany(
()=>DocumentationSection,
section=>section.document
)
sections:DocumentationSection[];

}

19. Index Strategy

documentation_documents:

repository_id

type

status


documentation_sections:

document_id

title


documentation_versions:

document_id

version

20. Future Enhancements
Living Documentation

Documentation automatically updates when:

Code changes
Architecture changes
Business rules change
Documentation Chat

Developer can ask:

Explain this architecture document

Documentation Diff

Example:

Before:


Payment handled by Stripe


After:


Payment handled by Razorpay


Impact:

PaymentService updated

Summary

The Documentation Schema enables CodeMind to create
living documentation for legacy systems.

It transforms:

Code Understanding

        +

Business Knowledge

        +

AI Generation


        |


        v


Always Updated Documentation


Core principle:

"Documentation should evolve with software, not become outdated."