This ADR defines how CodeMind stores:

Source code
Repository snapshots
Generated documentation
Analysis results
Large files
AI artifacts

This decision is important because CodeMind is not only an application database. It processes large software repositories.

The principle:

"Store metadata in databases, store large artifacts in object storage."

Create:

docs/06-adrs/009-storage-strategy.md

Content:

# ADR-009: Storage Strategy


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind analyzes software repositories containing:


- Source code files
- Documentation
- Configuration files
- Generated reports
- Embeddings
- Analysis results


Repository size can vary:




Small Project

100 files

Medium Project

10,000 files

Enterprise Project

Millions of files




A single storage system is not suitable for all data types.



CodeMind requires a storage strategy that supports:


- Large files
- Fast metadata queries
- Repository versioning
- Scalable processing
- Secure access



# 2. Storage Requirements



## Source Repository Storage


Need to store:


- Repository snapshots
- Branch information
- Commit history
- File contents



---



## Metadata Storage


Need fast access to:


- Files
- Symbols
- Dependencies
- Relationships
- Analysis status



---



## AI Artifact Storage


Need to store:


- Generated documentation
- Reports
- AI outputs
- Diagrams



---



## Enterprise Requirements


Need:


- Encryption
- Backup
- Access control
- Retention policy



# 3. Options Considered



# Option 1: Store Everything in PostgreSQL



Architecture:




PostgreSQL

|

+-- Users

+-- Repository Data

+-- Source Files

+-- AI Results



## Advantages


- Simple architecture
- Easy transactions



## Problems


Large repositories create:


- Huge database size
- Slow backups
- Expensive queries
- Poor file management



Decision:


Rejected.



---

# Option 2: Store Everything on Local File System



Architecture:




Server Disk

|

+-- Repositories

+-- Files

+-- Reports




## Advantages


- Simple
- Fast locally



## Problems


- Difficult scaling
- No distributed storage
- Backup complexity



Decision:


Rejected.



---

# Option 3: Object Storage



Examples:



AWS S3

MinIO

Google Cloud Storage

Azure Blob Storage




Architecture:




Application

  |


  v

Object Storage

  |


  +-- Repository Files

  +-- Reports

  +-- Generated Documents



## Advantages


- Highly scalable
- Cost effective
- Designed for large files
- Easy backup



Decision:


Selected.



# 4. Decision



CodeMind will use a hybrid storage architecture.



Architecture:



             CodeMind


                |


    +-----------+------------+

    |                        |

PostgreSQL Object Storage

    |                        |

Metadata Large Files

Relationships Repository Files

Knowledge Reports

Embeddings Documents




# 5. Storage Responsibility



## PostgreSQL Stores



Application data:




Users

Organizations

Repositories

Permissions




Code intelligence metadata:




Files

Symbols

Functions

Classes

Dependencies

Knowledge Nodes




Search data:




Embeddings Metadata

Search Index Data




---



## Object Storage Stores



Repository content:




Source Files

Repository Archives

Git Snapshots




Generated artifacts:




Documentation

Architecture Diagrams

AI Reports

Export Files




# 6. Repository Storage Strategy



When a repository is connected:



Flow:




Git Provider

  |

  v

Repository Clone Worker

  |

  v

Object Storage

  |

  v

Indexing Pipeline




# 7. Repository Versioning



CodeMind should understand code history.



Store:




Repository

|

+-- Branch

|

+-- Commit

|

+-- Snapshot



Example:




main branch

commit abc123

|

v

Indexed Version




# 8. File Storage Model



Database stores metadata:



Table:




repository_files




Example:



```sql
repository_files


id

repository_id

path

language

size

hash

storage_location

created_at


Object storage stores content:

Example:

s3://codemind/repos/project-a/src/payment.ts

9. Large Repository Handling

Problem:

Large Repository


500,000 files



Solution:

Streaming Processing

Do not load everything into memory.

Use:

Read File


    |

    v


Process


    |

    v


Store Result

Incremental Updates

Only process changed files:

Git Commit


      |

      v


Changed Files


      |

      v


Re-index

10. Storage Lifecycle
Repository Added
Repository Connected


        |

        v


Clone


        |

        v


Store Snapshot


        |

        v


Start Indexing

Repository Updated
New Commit


        |

        v


Detect Changes


        |

        v


Update Storage


        |

        v


Re-index

Repository Removed
Delete Request


        |

        v


Remove Metadata


        |

        v


Remove Stored Files

11. Security Strategy

Object storage must support:

Encryption

At rest:

Encrypted Storage


In transit:

HTTPS / TLS

Access Control

Users never directly access storage.

Flow:

User


 |

 v


CodeMind API


 |

 v


Permission Check


 |

 v


Temporary Access URL

12. Backup Strategy

Backup:

Database
PostgreSQL Backup

Daily

Object Storage
Versioned Storage

Replication

Snapshots

13. Retention Policy

Future configurable policies:

Example:

Active Repository


Keep Everything



Deleted Repository


Archive After 90 Days


Delete After 1 Year

14. Storage Providers

Initial:

AWS S3 Compatible Storage


Development:

MinIO


Future:

Azure Blob Storage

Google Cloud Storage

Enterprise Private Storage

15. Consequences
Positive
Scalable Storage

Supports very large repositories.

Better Performance

Database remains optimized.

Lower Cost

Object storage is cheaper for large files.

Enterprise Ready

Supports backup and encryption.

Negative
More Components

Requires storage management.

Data Synchronization

Metadata and files must stay consistent.

Access Management

Requires secure file access.

16. Final Decision Summary
Area	Decision
Metadata Storage	PostgreSQL
File Storage	Object Storage
Development Storage	MinIO
Production Storage	S3 Compatible
Repository Files	Object Storage
Search Metadata	PostgreSQL
Backup	Versioned Storage
Conclusion

CodeMind will separate metadata from large artifacts.

Final decision:

"Database stores intelligence. Object storage stores large data."