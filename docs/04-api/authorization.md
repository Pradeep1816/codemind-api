This document defines what an authenticated user is allowed to access.

Authentication answers:

"Who are you?"

Authorization answers:

"What are you allowed to do?"

For CodeMind, this is critical because source code, architecture knowledge, and AI-generated insights are private company assets.

# CodeMind Authorization API


## 1. Introduction


Authorization controls access to CodeMind resources after
authentication has succeeded.


CodeMind authorization manages access to:


- Organizations
- Users
- Teams
- Repositories
- Code intelligence
- AI features
- MCP tools
- Generated documentation


The authorization model follows:



Identity

+

Role

+

Permission

+

Resource Ownership




# 2. Authorization Goals



## Secure Resource Access


Users should only access resources they have permission for.



Example:



Developer A

Company Repository A

    ✓ Allowed

Developer A

Company Repository B

    ✗ Denied



## Fine-Grained Permissions


Permissions should control specific actions.


Example:



repository.read

repository.index

repository.delete

ai.query

mcp.access




## Enterprise Support


The model should support:


- Small teams
- Large organizations
- Multiple projects
- Enterprise policies



# 3. Authorization Architecture



Request flow:




API Request

  |

  v

Authentication

  |

  v

Load User Context

  |

  v

Authorization Guard

  |

  v

Permission Check

  |

  v

Resource Access




# 4. Authorization Model



CodeMind uses:



RBAC

(Role Based Access Control)

Resource Level Permissions




Architecture:




User

|

v

Role

|

v

Permissions

|

v

Resources




# 5. User and Role Relationship



A user belongs to an organization.



Example:




Organization

  |

  +----------------+

  |                |

User A User B

  |


  v

Developer Role




# 6. Roles



Initial system roles:



## Organization Owner



Highest permission level.



Can:


- Manage organization
- Manage billing
- Manage users
- Delete repositories
- Configure security



Example:




owner




---



## Admin



Can:


- Manage users
- Manage repositories
- Configure settings



Example:




admin




---



## Developer



Main engineering role.



Can:


- Read repositories
- Search code
- Use AI analysis
- Start indexing



Example:




developer




---



## Viewer



Read-only access.



Can:


- View documentation
- Search knowledge
- Read analysis



Example:




viewer




# 7. Permission Model



Permissions are action based.



Format:




resource.action




Examples:




repository.read

repository.write

repository.delete

knowledge.read

knowledge.create

ai.query

ai.analysis

mcp.access




# 8. Permission Categories



## Repository Permissions




repository.read

repository.clone

repository.index

repository.update

repository.delete




---



## Search Permissions




search.code

search.knowledge

search.semantic




---



## AI Permissions




ai.query

ai.explain

ai.generate_documentation




---



## MCP Permissions




mcp.access

mcp.search

mcp.analysis




# 9. Role Permission Matrix



Example:



| Permission | Owner | Admin | Developer | Viewer |
|---|---|---|---|---|
| repository.read | ✓ | ✓ | ✓ | ✓ |
| repository.index | ✓ | ✓ | ✓ | ✗ |
| repository.delete | ✓ | ✓ | ✗ | ✗ |
| ai.query | ✓ | ✓ | ✓ | ✓ |
| user.manage | ✓ | ✓ | ✗ | ✗ |



# 10. Organization Isolation



Every resource belongs to an organization.



Example:




Organization A

Repository 1

Repository 2

Organization B

Repository 3

Repository 4




A user from Organization A cannot access:




Organization B repositories




Even if the ID is known.



# 11. Repository-Level Access



Large organizations may need repository-specific access.



Example:




Organization

|

+-------------+

|             |

Backend Repo Mobile Repo




User permissions:




Developer A

Backend Repo:

Read + Index

Mobile Repo:

No Access




# 12. Authorization Guards



Backend implementation:




Request

|

v

JWT Guard

|

v

Permission Guard

|

v

Resource Guard

|

v

Controller




Example:



```typescript
@RequirePermission(
  'repository.index'
)
indexRepository()
13. Resource Ownership Check

Some operations require ownership.

Example:

Delete repository:

Request


 |

 v


Check User


 |

 v


Check Organization


 |

 v


Check Repository Owner


 |

 v


Allow Delete

14. MCP Authorization

External AI tools must follow the same rules.

Example:

Cursor


 |

 v


MCP Request


 |

 v


Validate User


 |

 v


Check Repository Permission


 |

 v


Return Context


AI agents cannot bypass permissions.

15. AI Data Access Control

AI responses must respect permissions.

Example:

Developer has access:

Payment Repository


AI can provide:

Payment explanation

Payment code context

Payment documentation


But cannot provide:

Restricted repository information

16. Permission Storage

Database model:

users


organizations


roles


permissions


user_roles


role_permissions


Relationship:

User


 |

 v


Role


 |

 v


Permission


17. Temporary Permissions

Future support:

Example:

Grant Developer


Access to Repository


For 7 days


Useful for:

Contractors
External reviewers
Audits
18. Audit Requirements

Authorization events should be logged.

Examples:

permission.granted

permission.revoked

repository.accessed

repository.deleted

19. Security Principles
Least Privilege

Users receive minimum required access.

Default Deny

Unknown permissions are rejected.

Explicit Access

Access must be granted.

Audit Everything

Sensitive actions are recorded.

20. Future Authorization Features
Attribute Based Access Control (ABAC)

Example:

Allow access if:


User.department == Engineering


AND


Repository.type == Backend

Enterprise Policies

Support:

IP restrictions
Device policies
Compliance rules
Custom Roles

Organizations can create:

AI Reviewer

Security Auditor

Architecture Owner

21. Authorization API Summary
Endpoint	Purpose
GET /roles	List roles
GET /permissions	List permissions
POST /roles	Create role
PUT /roles/{id}	Update role
POST /users/{id}/roles	Assign role
DELETE /users/{id}/roles/{roleId}	Remove role
Conclusion

CodeMind authorization protects software intelligence by
controlling access at every level.

Final principle:

"Authentication identifies the developer. Authorization protects the knowledge."