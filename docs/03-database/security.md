This document defines the security foundation of CodeMind.

Because CodeMind analyses enterprise repositories, business logic, and internal systems, security is a first-class feature.

The main question:

"Who can access what knowledge, from which repository, using which AI client?"

Create:

docs/03-database/security-schema.md

Content:

# Security Schema Design


## Document Information

Module: Security & Access Control

Document: Security Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Security System controls access to CodeMind resources.


It manages:


- Users
- Organizations
- Roles
- Permissions
- Repository access
- API authentication
- MCP client security



# 2. Security Goals



CodeMind must provide:


## Authentication


Verify:

"Who are you?"



## Authorization


Verify:

"What are you allowed to access?"



## Isolation


Ensure:

"One organization cannot access another organization's data."



## Auditability


Track:

"Who performed which action?"



# 3. Security Architecture




User / AI Client

    |

    v

Authentication Layer

    |

    v

Authorization Layer

    |

    v

Permission Engine

    |

    v

CodeMind Resources




# 4. Multi Tenant Architecture



CodeMind supports multiple organizations.



Example:




Organization A

Repositories:

Payment System
ERP System

Organization B

Repositories:

Banking Platform
Mobile App



Data isolation:



organization_id

must exist in all important tables.




# 5. User Schema



Table:



users




Purpose:


Stores CodeMind users.



Schema:


```sql
users


id

organization_id

email

password_hash

name

status

last_login_at

created_at

updated_at


Example:

Developer:

John


Organization:

ABC Software

6. Organization Schema

Table:

organizations


Schema:

organizations


id

name

slug

plan

status

created_at

updated_at


Example:

ABC Software


Plan:

Enterprise

7. Role Schema

Table:

roles


Purpose:

Defines access levels.

Schema:

roles


id

organization_id

name

description

created_at


Default roles:

OWNER

ADMIN

DEVELOPER

VIEWER

AUDITOR

8. Permission Schema

Table:

permissions


Schema:

permissions


id

name

resource

action

created_at


Examples:

repository.read

repository.index

knowledge.approve

documentation.edit

mcp.use

9. User Role Mapping

Table:

user_roles


Schema:

user_roles


id

user_id

role_id

created_at


Example:

User:

Developer


Role:

DEVELOPER

10. Role Permission Mapping

Table:

role_permissions


Schema:

role_permissions


id

role_id

permission_id


Example:

DEVELOPER


Allowed:

repository.read

search.use

11. Repository Access Control

A user may have access to specific repositories.

Table:

repository_permissions


Schema:

repository_permissions


id

repository_id

user_id

permission

created_at


Permissions:

READ

ANALYZE

INDEX

ADMIN

12. API Key Management

Used for:

MCP clients
External integrations
Automation

Table:

api_keys


Schema:

api_keys


id

organization_id

name

key_hash

last_used_at

expires_at

status

created_at


Important:

Store only hashed keys.

Never store:

plain API keys

13. MCP Authentication

External AI clients require authentication.

Flow:

Cursor / Codex


        |

        v


MCP API Key


        |

        v


Authentication


        |

        v


Permission Check


        |

        v


Tool Execution

14. Session Management

Table:

user_sessions


Schema:

user_sessions


id

user_id

token_hash

ip_address

user_agent

expires_at

created_at

15. Authentication Methods

Supported:

Email Password
email

password

OAuth

Future support:

GitHub

Google

Microsoft

API Authentication

For services:

Bearer Token

API Key

16. Access Control Flow

Example:

Developer asks:

Explain payment module


Flow:

Request


 |

 v


Authenticate User


 |

 v


Check Repository Access


 |

 v


Check Knowledge Permission


 |

 v


Return Answer

17. Data Encryption

Sensitive data:

Must be encrypted.

Examples:

API Keys

Tokens

Secrets

Repository Credentials


Methods:

Encryption at Rest

Encryption in Transit

Secret Management

18. Repository Credential Security

Git credentials:

Should use:

Encrypted Storage

Temporary Access Tokens

SSH Deploy Keys


Never store:

Plain Passwords

19. Audit Integration

Security actions generate audit events.

Example:

User granted repository access


        |

        v


Security Event


        |

        v


Audit Log

20. Security Events

Examples:

USER_LOGIN

FAILED_LOGIN

API_KEY_CREATED

PERMISSION_CHANGED

REPOSITORY_ACCESS_GRANTED

MCP_ACCESS_USED

21. Rate Limiting

Protect APIs.

Examples:

Login:


5 requests / minute



AI Query:


100 requests / hour



MCP:


1000 requests / hour

22. Security Index Strategy

users:

organization_id

email


repository_permissions:

repository_id

user_id


api_keys:

organization_id

status


audit:

actor_id

created_at

23. TypeORM Example
@Entity()
export class Permission {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
name:string;


@Column()
resource:string;


@Column()
action:string;


}

24. Security Monitoring

Track:

Failed Login Attempts

Permission Changes

API Usage

Suspicious Activity

MCP Requests

25. Future Enhancements
Enterprise SSO

Support:

SAML

OIDC

Azure AD

Okta

Fine Grained Permissions

Example:

Can view payment module

Cannot view customer data

Security AI Agent

Automatically detect:

Sensitive Code Exposure

Hardcoded Secrets

Permission Risks

Summary

Security is the foundation that allows enterprises to trust CodeMind.

It ensures:

Correct access control
Repository isolation
Secure AI integration
Traceable actions

Core principle:

"AI can understand code only when access is controlled and trusted."