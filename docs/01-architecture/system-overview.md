# System Overview

## Document Information

Status: Draft  
Version: 1.0  
Category: Architecture


# Introduction

CodeMind is designed as a modular AI-powered code intelligence platform.

The system converts software repositories into structured knowledge that can be searched, analyzed, and consumed by AI agents.

The platform consists of multiple independent capabilities:

- Repository management
- Code indexing
- Source parsing
- Static analysis
- Knowledge extraction
- Search
- AI context generation
- External integrations


# High-Level Architecture


                Developer

                   |
                   |

             CodeMind Dashboard

                   |
                   |

              CodeMind API

                   |

| | | | |
v v v v v

Repository Indexing Parser Knowledge Search
Module Engine Engine Engine Engine

                   |

                   v

          AI Context Engine


                   |

                   v


          MCP / AI Integrations

                   |

    --------------------------------

    Codex     Cursor     Claude     IDEs


# Core Architecture Principles


## 1. Modular Design

Each business capability is isolated into a separate module.

Benefits:

- Easier maintenance
- Independent development
- Better testing
- Future scalability


Example:


Repository Module

does not know

Parser implementation details



---

## 2. Separation of Responsibilities

Each layer has a specific responsibility.


Example:



Parser

Responsible:

"Understand source code structure"

Knowledge Engine

Responsible:

"Understand relationships"

AI Engine

Responsible:

"Explain knowledge"



---

## 3. AI as a Consumer

AI is not responsible for discovering the system.

The system prepares knowledge first.


Traditional:


AI
|
Reads Code
|
Answers



CodeMind:


Code

|

Index

|

Knowledge

|

AI

|

Answer



---

# Major Components


## Repository Management

Responsible for:

- Repository registration
- Git operations
- Branch management
- Repository metadata


---

## Indexing Engine

Responsible for:

- File scanning
- Change detection
- Index jobs
- Processing pipeline


---

## Parser Engine

Responsible for:

- AST generation
- Code extraction
- Language processing


Extracts:

- Classes
- Functions
- Interfaces
- Imports
- Decorators


---

## Analysis Engine

Responsible for discovering:

- Function relationships
- Dependencies
- Call graphs
- Architecture patterns


---

## Knowledge Engine

Creates structured understanding:


Example:



InvoiceService

|
creates

Invoice

|
depends on

PaymentService



---

## Search Engine

Provides:

- Keyword search
- Semantic search
- Relationship search
- Hybrid search


---

## AI Context Engine

Creates optimized context for AI.


Responsibilities:

- Retrieve relevant knowledge
- Reduce unnecessary context
- Build prompts


---

## MCP Layer

Provides CodeMind knowledge to external AI tools.

Supported clients:

- Codex
- Cursor
- Claude Code
- VS Code extensions


# Technology Overview


| Component | Technology |
|---|---|
| Backend | NestJS |
| Language | TypeScript |
| Database | PostgreSQL |
| Queue | Redis + BullMQ |
| Vector Search | Qdrant |
| Graph Database | Neo4j |
| Parser | ts-morph / Tree-sitter |
| Frontend | Next.js |
| Deployment | Docker |


# Future Architecture Evolution


Initial:


Modular Monolith

NestJS Application



Future:


Microservices

API Service

Indexer Service

Parser Service

AI Service

Search Service