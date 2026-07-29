This document defines the repository storage model of CodeMind.

The Repository Module is the entry point of CodeMind.

Before CodeMind can understand code, it needs to know:

Which repository is being analyzed
Where the code exists
Which files are present
Which branch/version is being indexed
What languages/frameworks are used
Current indexing status
# Repository Schema Design


## Document Information

Module: Repository Management

Document: Repository Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Repository Schema stores information about software repositories
connected to CodeMind.


A repository represents a source code project that CodeMind analyzes.



Example:



SMW Backend Repository

Repository

|

+-- Files

      |

      +-- Controllers

      |

      +-- Services

      |

      +-- Entities



# 2. Responsibilities


The Repository Schema manages:


- Repository registration
- Source location
- Repository metadata
- Branch information
- Commit history
- File inventory
- Indexing status
- Analysis progress



# 3. Entity Relationship Overview




Organization

  |

  |

Repository

  |

  |

Repository Files

  |

  |

Code Entities




Detailed:




repositories

  |

  +---- repository_files

                 |

                 +---- code_entities



# 4. Repository Entity



Table:



repositories




Purpose:


Stores connected source code repositories.



Schema:



```sql
repositories

id

organization_id

name

description

provider

url

default_branch

language

framework

status

created_at

updated_at

5. Repository Fields Explanation
id

Type:

UUID


Purpose:

Unique repository identifier.

Example:

8f2c3d4e-1234-4567

organization_id

Purpose:

Multi-tenant support.

Example:

Company A

    |

    +-- Backend Repository

name

Example:

smw-api2

provider

Source control provider.

Possible values:

github

gitlab

bitbucket

local

url

Repository location.

Example:

https://github.com/company/project

default_branch

Example:

main

develop

master

language

Primary language.

Examples:

TypeScript

Java

Python

PHP

framework

Examples:

NestJS

Laravel

Spring Boot

Django

status

Repository lifecycle status.

Values:

CONNECTED

INDEXING

READY

FAILED

ARCHIVED

6. Repository File Entity

Table:

repository_files


Purpose:

Stores every file discovered during indexing.

Schema:

repository_files


id

repository_id

path

name

extension

language

size

hash

branch

last_modified_at

index_status

created_at

updated_at

7. File Fields Explanation
path

Example:

src/payment/payment.service.ts


Used for:

File lookup
Search
Navigation
extension

Examples:

.ts

.java

.py

.php

language

Example:

typescript

size

Stores file size.

Example:

25 KB

hash

Purpose:

Detect changes.

Example:

sha256:

abc123xyz


When hash changes:

File Changed

      |

      v

Re-index File

8. Commit Entity

Table:

repository_commits


Purpose:

Tracks repository history.

Schema:

repository_commits


id

repository_id

commit_hash

author

message

branch

committed_at

created_at


Example:

commit_hash:

a82fd923


message:

"Fix invoice calculation"

9. Branch Entity

Table:

repository_branches


Purpose:

Stores available branches.

Schema:

repository_branches


id

repository_id

name

is_default

last_commit_hash

created_at

updated_at


Example:

main

develop

feature/payment-fix

10. Indexing Status Entity

Table:

repository_index_status


Purpose:

Tracks analysis progress.

Schema:

repository_index_status


id

repository_id

current_stage

progress

started_at

completed_at

error_message


Stages:

CLONING

DISCOVERING_FILES

PARSING

ANALYZING

GENERATING_KNOWLEDGE

GENERATING_EMBEDDINGS

COMPLETED

FAILED

11. Repository Metadata Entity

Table:

repository_metadata


Purpose:

Stores additional detected information.

Example:

Node Version

Package Manager

Database

Deployment Type


Schema:

repository_metadata


id

repository_id

key

value

created_at

updated_at


Example:

key:

node_version


value:

20.x

12. Relationships
Repository → Files

One repository has many files.

Repository


     1


     |

     *


Files

Repository → Commits
Repository


     1


     |

     *


Commits

Repository → Branches
Repository


     1


     |

     *


Branches

13. TypeORM Entity Structure

Example:

@Entity()
export class Repository {


 @PrimaryGeneratedColumn("uuid")
 id:string;


 @Column()
 name:string;


 @Column()
 provider:string;


 @Column()
 status:string;


 @OneToMany(
   ()=>RepositoryFile,
   file=>file.repository
 )
 files:RepositoryFile[];

}

14. Index Strategy

Important indexes:

repositories:

organization_id

status

name


repository_files:

repository_id

path

language

hash


repository_commits:

repository_id

commit_hash

committed_at

15. Repository Import Flow

Example:

User Connects GitHub


        |

        v


Create Repository Record


        |

        v


Clone Repository


        |

        v


Discover Files


        |

        v


Store File Records


        |

        v


Start Parsing

16. Repository Update Flow

When new commit arrives:

Git Change


    |

    v


Compare File Hash


    |

    v


Changed Files Only


    |

    v


Re-index



Benefits:

Faster processing
Lower cost
Incremental updates
17. Security Considerations

Repository data may contain private code.

Requirements:

Encrypted credentials
Access control
Repository isolation
Audit logs
18. Future Enhancements
Repository Branch Comparison

Example:

Compare:

main

vs

feature/payment-update

Repository Health Score

Example:

Architecture Quality:

78%


Complexity:

High


Documentation:

Low

Multi Language Analysis

Support:

TypeScript

Java

Python

Go

PHP

Summary

The Repository Schema is the foundation layer of CodeMind.

It answers:

"Which software system are we trying to understand?"

It provides the base information required by:

Parser Module
Analysis Module
Knowledge Module
Search Module
AI Module