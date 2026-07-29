This document defines the technical database architecture of CodeMind.

It explains:

Storage components
Data ownership
Database communication
Read/write patterns
Scaling strategy
Deployment architecture
# Database Architecture


## Document Information

Module: Database Architecture

Document: Database Architecture

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


CodeMind requires a database architecture capable of storing and processing software intelligence.


Unlike traditional applications, CodeMind handles:


- Large source repositories
- Millions of code entities
- Complex relationships
- Semantic search
- AI generated knowledge



The architecture follows a hybrid storage model:



Relational Data

Vector Data

Graph Data




# 2. Architecture Principles


## 2.1 Separation of Storage Responsibility


Each storage technology has a specific responsibility.



Example:




PostgreSQL

|
|
+-- Application Data
+-- Metadata
+-- Knowledge

Vector Database

|
|
+-- Semantic Search

Graph Database

|
|
+-- Relationships



# 3. High Level Architecture



                CodeMind API


                     |


                     v


            Database Access Layer


                     |


    --------------------------------------


    |                 |                  |


    v                 v                  v

PostgreSQL Vector Store Graph Database

Core Data Embeddings Relationships




# 4. PostgreSQL Architecture



PostgreSQL is the primary database.



Responsibilities:




User Management

Organizations

Repositories

Files

Code Entities

Knowledge

Documentation

AI History




Architecture:



             PostgreSQL


                 |


   --------------------------------


   |              |               |


   v              v               v

Tables JSONB pgvector

Structured Flexible Embeddings

Data Data




# 5. PostgreSQL Schema Organization



Schemas:




public

|
|
+-- auth

+-- repository

+-- code

+-- knowledge

+-- business

+-- documentation

+-- ai




Example:




repository.repositories

code.entities

knowledge.rules

business.workflows




Benefits:


- Better organization
- Clear ownership
- Easier migration



# 6. Vector Database Architecture



The vector system stores semantic representations.



Flow:




Code Entity

|

v

Embedding Generator

|

v

Vector Storage

|

v

Similarity Search




Stored information:




Vector

Entity Reference

Metadata

Content Summary

Embedding Version




Example:




Entity:

InvoiceService.createInvoice()

Vector:

[0.234,0.654,0.321]

Metadata:

type=function

language=typescript




# 7. Graph Database Architecture



Future architecture component.



Purpose:


Store relationships.



Example:



         Customer


            |

            |

         creates


            |

            v


         Invoice


            |

            |

         paid_by


            |

            v


         Payment



Graph queries:




Find all services affected by PaymentService change

Find complete business workflow

Find dependency chain




# 8. Database Communication Flow



Example:


Developer asks:



How does invoice generation work?




Flow:




API Request

|

v

Search Service

|

+----------------+

|                |


v                v

PostgreSQL Vector DB

Knowledge Similarity

|                |


+----------------+


         |


         v


    Context Builder


         |


         v


         AI Module



# 9. Write Architecture



CodeMind uses asynchronous processing for heavy operations.



Example:



Repository import:




User Uploads Repository

    |

    v

Create Repository Record

    |

    v

Queue Job

    |

    v

Background Worker

    |

    v

Parse Files

    |

    v

Store Knowledge

    |

    v

Generate Embeddings




# 10. Read Architecture



User queries require optimized reads.



Example:




Developer Question

    |

    v

Search Index

    |

    v

Retrieve Knowledge

    |

    v

Generate Response




Avoid:




Question

|

v

Scan Entire Repository Database




# 11. Async Processing Architecture



Heavy tasks:




Repository Indexing

Code Parsing

Dependency Analysis

Embedding Generation

Documentation Generation




Architecture:




API

|

v

Message Queue

|

v

Worker Services

|

v

Database




Possible technologies:



Queue:


BullMQ

Redis

RabbitMQ




# 12. Database Modules Ownership



## Repository Module


Owns:




repositories

repository_files

commits

branches




---

## Parser Module


Owns:




code_files

code_entities

symbols




---

## Analysis Module


Owns:




relationships

dependencies

call_graph




---

## Knowledge Module


Owns:




knowledge_items

knowledge_versions




---

## Business Engine


Owns:




business_rules

workflows

events




---

## AI Module


Owns:




conversations

messages

ai_memory




# 13. Database Access Pattern



Recommended:


Repository Pattern



Example:




Controller

|

v

Service

|

v

Repository

|

v

Database




Avoid:




Controller

|

v

Direct SQL Queries




# 14. Caching Strategy



Frequently accessed data:




Repository Summary

Architecture Summary

Popular Searches

Generated Documentation




Cache:



Redis




Example:




Question:

Explain payment module

First request:

Database

Second request:

Redis Cache




# 15. Database Scaling Strategy



## Stage 1




Single PostgreSQL Instance




Suitable for:


- MVP
- Small repositories



---

## Stage 2




PostgreSQL

Read Replicas

pgvector




Suitable for:


- Multiple projects



---

## Stage 3




PostgreSQL

Qdrant

Neo4j

Workers




Suitable for:


- Enterprise scale



# 16. Backup Strategy



Important data:




Repository Metadata

Knowledge

Business Rules

Documentation

Embeddings




Strategy:




Daily Backup

Point-in-Time Recovery

Migration Testing




# 17. Deployment Architecture



Production:



            Kubernetes


                |


    ----------------------------


    |             |            |


    v             v            v

PostgreSQL Redis Vector DB




Workers:




Indexer Worker

Parser Worker

Embedding Worker

Documentation Worker




# 18. Monitoring



Track:



Database:



CPU

Memory

Connections

Query Time

Storage




Application:



Queue Size

Processing Time

Failed Jobs




# 19. Security



Requirements:



- Database encryption
- Secret management
- Role permissions
- Audit logs
- Repository isolation



# Summary



The CodeMind database architecture provides a scalable foundation for software intelligence.


The architecture separates:



Structured Knowledge

Semantic Knowledge

Relationship Knowledge




The goal:


"Build a database system that allows AI to understand software like an experienced developer."