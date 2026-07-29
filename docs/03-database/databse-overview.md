This document defines the database philosophy and foundation of CodeMind.

Before creating TypeORM entities, we need to answer:

What data does CodeMind own?
How is data organised?
Which storage technology is used?
How will it scale from 1 repository to thousands of repositories?
# Database Overview


## Document Information

Module: Database Architecture

Document: Database Overview

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Introduction


The CodeMind database is the memory foundation of the platform.


Unlike traditional applications that mainly store transactional data,
CodeMind stores software intelligence.


It stores:


- Repository metadata
- Source code understanding
- Code relationships
- Business knowledge
- Documentation
- Semantic embeddings
- AI memory



The database enables CodeMind to understand legacy systems and provide
accurate AI-powered explanations.



# 2. Database Design Principles


## 2.1 Knowledge First


CodeMind does not store only raw code.


It stores:



Code

Structure

Relationships

Meaning

Business Context




Example:


Raw code:


```typescript
calculateDiscount()

Database knowledge:

Function:

calculateDiscount


Purpose:

Calculates customer discount before invoice generation.


Business Rule:

Premium customers receive 10% discount.

3. Data Categories

CodeMind data is divided into six categories.

3.1 Repository Data

Information about imported projects.

Examples:

Repository

Branches

Commits

Files

Languages

Frameworks


Storage:

PostgreSQL

3.2 Code Intelligence Data

Information extracted from source code.

Examples:

Classes

Functions

Methods

Variables

Imports

Dependencies


Storage:

PostgreSQL

3.3 Relationship Data

Information about connections between entities.

Examples:

Service calls Service

Controller uses Service

Function calls Function

Module depends on Module


Storage:

Initially:

PostgreSQL

Future:

Graph Database

3.4 Knowledge Data

Information created by CodeMind analysis.

Examples:

Architecture Knowledge

Technical Decisions

System Explanation

Developer Notes


Storage:

PostgreSQL

3.5 Semantic Data

Information used for AI search.

Examples:

Code Embeddings

Documentation Embeddings

Business Knowledge Embeddings


Storage:

PostgreSQL + pgvector

Future:

Dedicated Vector Database

3.6 AI Data

Information generated during AI interactions.

Examples:

Conversations

Questions

Answers

AI Memory

Prompt History


Storage:

PostgreSQL

4. High Level Architecture
                    CodeMind


                       |

                       v


              Application Database


                       |

        --------------------------------


        |              |              |


        v              v              v


 PostgreSQL       Vector Store     Graph Store


 Core Data        Embeddings      Relationships


5. Storage Strategy

CodeMind follows a polyglot storage approach.

MVP Architecture

For the first version:

NestJS

   |

   v

PostgreSQL

   |

   +-- Relational Data

   |

   +-- JSON Data

   |

   +-- Vector Data (pgvector)


Advantages:

Simple deployment
Lower operational cost
Easier development
TypeORM support
Enterprise Architecture

Large scale:

                 CodeMind


                    |


        ---------------------------


        |            |            |


        v            v            v


 PostgreSQL      Neo4j        Qdrant


 Business       Knowledge    Semantic

 Data           Graph        Search


6. Database Responsibilities

The database is responsible for:

Persistence

Store:

Projects
Users
Code metadata
Knowledge
Querying

Support:

Search
Filtering
Relationships
Versioning

Track:

Code changes
Knowledge changes
Documentation versions
AI Context Retrieval

Provide:

Relevant information
Historical knowledge
Evidence
7. Data Ownership Model

Each module owns its data.

Example:

Repository Module:

Owns:

repositories

repository_files

repository_commits


Analysis Module:

Owns:

code_entities

relationships


Knowledge Module:

Owns:

knowledge_items

business_rules


AI Module:

Owns:

ai_conversations

ai_memory


Benefits:

Clear boundaries
Easier maintenance
Independent scaling
8. Database Naming Convention
Tables

Use:

snake_case

plural names


Examples:

Good:

repositories

code_files

business_rules


Avoid:

Repository

CodeFile

BusinessRule

Primary Keys

Use:

UUID


Example:

id UUID PRIMARY KEY


Reason:

Distributed systems support
Easier multi-project architecture
9. Audit Strategy

Important because CodeMind analyzes changing systems.

Every important entity should track:

created_at

updated_at

created_by

version


Example:

business_rules


id

name

description

version

created_at

updated_at

10. Soft Delete Strategy

Some data should not be permanently deleted.

Example:

Old code knowledge.

Fields:

deleted_at


Benefits:

Historical analysis
Audit support
Recovery
11. Versioning Strategy

CodeMind tracks knowledge evolution.

Example:

Version 1:

Payment handled by Stripe


Version 2:

Payment migrated to PayPal


Stored:

knowledge_versions

12. Multi Tenant Design

Future enterprise support requires isolation.

Structure:

Organization


      |

      +---- Projects


              |

              +---- Repository



Every major table should support:

organization_id

13. Security Considerations

Database security:

Encryption at rest
Role-based access
Repository permissions
Audit logging
Sensitive data filtering

Important:

CodeMind may analyze private company repositories.

Security is mandatory.

14. Performance Principles

Large repositories may contain:

Millions of files

Millions of functions


Strategies:

Indexing

Important indexes:

repository_id

file_path

entity_name

entity_type

created_at

Pagination

Never load:

Entire repository


Use:

Cursor pagination

Background Processing

Heavy operations:

Parsing

Embedding generation

Documentation generation


Should run asynchronously.

15. Migration Strategy

Database migrations are managed through:

TypeORM migrations


Example:

migration:

001_create_repository_table


002_create_code_entities


003_add_embeddings


Rules:

Never modify existing migrations
Create new migrations
Test rollback
Review schema changes
16. Future Scaling Plan

Stage 1:

Single PostgreSQL


Stage 2:

PostgreSQL

+

pgvector


Stage 3:

PostgreSQL

+

Qdrant

+

Neo4j


Stage 4:

Distributed architecture

Multiple workers

Multiple repositories

Summary

The CodeMind database is not only a storage system.

It is the memory layer that allows CodeMind to understand software systems.

The database stores:

Code knowledge
Relationships
Business understanding
AI context

The design priority is:

"Store intelligence, not only data."