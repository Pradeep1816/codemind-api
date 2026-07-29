This ADR documents why CodeMind chooses PostgreSQL as the primary database.

Create:

docs/06-adrs/002-database-selection.md

Content:

# ADR-002: Database Selection


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind requires a database capable of storing:


- Users and organizations
- Repository metadata
- Code entities
- AST information
- Knowledge relationships
- Business rules
- AI memory
- Search metadata
- Analytics data



The database is a critical component because CodeMind is not only
a CRUD application.


It combines:



Traditional Application Data

Software Intelligence Data

AI Knowledge Data




Therefore, the database must support both structured and
semi-structured information.



# 2. Database Requirements



## Relational Data Support



CodeMind contains strongly related entities:



Example:




Organization

  |

  v

Repository

  |

  v

Module

  |

  v

Code Entity

  |

  v

Business Rule




A relational database provides strong consistency.



---



## JSON Data Support



AI systems generate flexible data:



Examples:


- AI responses
- AST metadata
- Analysis results
- Model information



The database should support JSON documents.



---



## Vector Search Capability



CodeMind requires semantic search:



Example:



User:



Explain payment workflow




System retrieves:



Similar business knowledge

Similar code sections

Related documentation




Vector support is required.



---



## Scalability



The database should support:


- Large repositories
- Millions of code entities
- Enterprise usage



# 3. Options Considered



# Option 1: PostgreSQL



## Advantages



### Strong Relational Database



Supports:


- Transactions
- Constraints
- Relationships
- Complex queries



### JSON Support



PostgreSQL provides:




JSONB




Useful for:


- AI metadata
- AST storage
- Flexible schemas



### Vector Search



With:




pgvector extension




PostgreSQL can store embeddings.



Example:




Code Chunk

    |

    v

Embedding Vector

    |

    v

Similarity Search




### Full Text Search



Built-in search capabilities:




tsvector

tsquery




### Enterprise Adoption



Widely used in:


- SaaS platforms
- Data systems
- AI applications



Decision:


Selected.



---



# Option 2: MySQL



## Advantages


- Popular
- Simple deployment
- Good performance
- Large ecosystem



## Disadvantages


- Less AI ecosystem support
- Vector search support is less mature
- JSON querying less powerful compared with PostgreSQL



Decision:


Rejected as primary database.



Note:


MySQL can still be supported for imported legacy systems.



---



# Option 3: MongoDB



## Advantages


- Flexible schema
- Good document storage
- Fast development



## Disadvantages


CodeMind has highly connected data:




Repository

|

Module

|

Function

|

Business Rule




Document databases make relationship traversal harder.



Decision:


Rejected as primary database.



---



# Option 4: SQLite



## Advantages


- Simple
- Local development friendly



## Disadvantages


- Not suitable for enterprise scale
- Limited concurrency
- Not suitable for multi-user SaaS



Decision:


Rejected.



---



# Option 5: Neo4j



## Advantages


Excellent graph database.



Useful for:


- Dependency graphs
- Knowledge graphs



## Disadvantages


Not ideal as the main application database.



CodeMind still requires:


- Users
- Billing
- Permissions
- Configuration
- Transactions



Decision:


Not selected as primary database.



Future:


May be used as a specialized graph layer.



# 4. Decision



CodeMind will use:




PostgreSQL

TypeORM

pgvector




Architecture:




Application Layer

    |

    v

NestJS

    |

    v

PostgreSQL

    |

    +----------------+

    |                |

Relational Data Vector Data




# 5. Database Responsibility Split



## PostgreSQL Stores



Application data:



Users

Organizations

Repositories

Permissions

Settings




Code intelligence:




Files

Symbols

Functions

Classes

Relationships




Knowledge:




Business Rules

Workflows

Documentation

AI Memory




AI:




Embeddings

Search Metadata

AI History




# 6. Vector Storage Decision



CodeMind will initially use:




PostgreSQL + pgvector




For:




Code embeddings

Documentation embeddings

Business knowledge embeddings




Example:




Code Chunk

"PaymentService.calculateInvoice()"

    |

    v

Embedding Vector

[0.23,0.54,0.12...]




Similarity search:




User Question

    |

    v

Generate Query Embedding

    |

    v

Find Similar Vectors

    |

    v

Return Context




# 7. Future Database Evolution



Current:




PostgreSQL

|

+-- Application Data

|

+-- Vector Search



Future:




PostgreSQL

|

+-- Application Data

Vector Database

|

+-- Large Scale Embeddings

Graph Database

|

+-- Knowledge Relationships



Possible future technologies:




Qdrant

Pinecone

Weaviate

Neo4j




# 8. Consequences



## Positive Consequences



### Single Database Initially


Less operational complexity.



### Strong Consistency


Important for business rules.



### AI Ready


pgvector enables RAG architecture.



### Flexible Data Model


JSONB supports AI generated structures.



### Mature Ecosystem


Large community and tooling.



---



## Negative Consequences



### Database Size Growth


Code intelligence data can become large.



### Complex Queries


Knowledge relationships may require optimization.



### Future Separation Possible


Large-scale deployments may require specialized databases.



# 9. Migration Strategy



If scale increases:



Phase 1:




PostgreSQL

Everything




Phase 2:




PostgreSQL

Dedicated Vector Database




Phase 3:




PostgreSQL

Vector Database

Graph Database




# 10. Final Decision Summary



| Area | Decision |
|---|---|
| Primary Database | PostgreSQL |
| ORM | TypeORM |
| Vector Search | pgvector |
| JSON Storage | JSONB |
| Search | PostgreSQL Full Text + Vector |
| Future Graph | Neo4j / Graph Layer |



# Conclusion



PostgreSQL provides the best foundation for CodeMind because it
supports both traditional software data and AI knowledge workloads.


Final decision:


"CodeMind will use PostgreSQL as the primary intelligence database."