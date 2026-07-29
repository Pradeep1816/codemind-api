This ADR defines how CodeMind manages:

Users
Organizations
Repository access
Permissions
API security
MCP authentication

Security is a critical decision because CodeMind will analyze private enterprise source code.

The principle:

"Code intelligence is valuable only when access control is trustworthy."

Create:

docs/06-adrs/008-authentication-strategy.md

Content:

# ADR-008: Authentication Strategy


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind works with private software repositories.

Examples:


- Company source code
- Internal documentation
- Business rules
- Architecture information
- Database structures


This information must be protected.



The authentication system must support:


- Individual developers
- Teams
- Organizations
- Enterprise customers
- External AI clients through MCP



# 2. Security Requirements



The authentication system must provide:



## Identity Management



Support:


- User accounts
- User profiles
- Organization membership
- Account status



---



## Authorization



Control access to:


- Organizations
- Repositories
- Projects
- AI knowledge



---



## Multi-Tenancy



Multiple companies can use CodeMind.



Example:




Company A

Users

Repositories

Knowledge

Company B

Users

Repositories

Knowledge




Data must remain isolated.



---



## API Security



Protect:


- REST APIs
- MCP APIs
- Background jobs
- Internal services



# 3. Options Considered



# Option 1: Simple API Keys



Architecture:




Client

|

v

API Key

|

v

CodeMind API




Advantages:


- Simple
- Easy for machine access



Problems:


- Poor user management
- No role system
- Difficult enterprise support



Decision:


Rejected as primary authentication.



---



# Option 2: Session Based Authentication



Architecture:




User

|

v

Login Session

|

v

Server Session Store




Advantages:


- Simple web authentication
- Common pattern



Problems:


- Less suitable for API-first architecture
- Harder for external AI clients



Decision:


Not selected.



---



# Option 3: JWT Authentication



Architecture:




User

|

v

Login

|

v

JWT Token

|

v

API Request




Advantages:


- Stateless
- API friendly
- Works with MCP
- Easy service communication



Decision:


Selected.



---



# Option 4: OAuth2 / Enterprise Identity



Examples:


- Google Workspace
- Microsoft Entra ID
- Okta


Advantages:


- Enterprise ready
- Single Sign-On
- Strong security



Problems:


- More complexity initially



Decision:


Future extension.



# 4. Decision



CodeMind will use:




JWT Authentication

Role Based Access Control

Organization Based Isolation




Initial architecture:




User

|

v

Authentication Service

|

v

JWT Token

|

v

CodeMind API

|

v

Permission Check




# 5. User Model



Core entity:




User




Example:




User

id

email

password_hash

name

status

created_at




Status:




ACTIVE

INACTIVE

SUSPENDED




# 6. Organization Model



CodeMind follows organization-based tenancy.



Structure:




Organization

    |

    +-------------+

    |             |


  Users      Repositories



Example:




Pearl Technologies

|

+-- Developer A

+-- Developer B

+-- Repository X




# 7. Role Based Access Control (RBAC)



Users receive roles.



Example:




Organization Owner

    |

Admin

    |

Developer

    |

Viewer




# 8. Permission Model



Permissions are action based.



Examples:




repository.read

repository.index

repository.delete

knowledge.read

ai.query

mcp.access




Permission flow:




Request

|

v

Identify User

|

v

Check Organization

|

v

Check Role

|

v

Check Permission

|

v

Allow / Deny




# 9. Repository Access Control



Every repository belongs to an organization.



Example:




Organization

    |

    v

Repository

    |

    v

Access Policy




A user can only access repositories where permission exists.



# 10. JWT Design



JWT contains:



```json
{
 "userId":"123",

 "organizationId":"456",

 "roles":[
    "developer"
 ],

 "permissions":[
    "repository.read"
 ]
}

Sensitive data should not be stored inside JWT.

Never include:

Passwords

API secrets

Source code

11. MCP Authentication

External AI tools must authenticate.

Example:

Cursor


 |

 v


MCP Request


 |

 v


CodeMind MCP Server


 |

 v


JWT Validation


Before returning information:

Is user valid?


        |


Does user have repository access?


        |


Return context

12. API Security Layers

CodeMind uses:

Authentication

Who are you?

JWT Verification

Authorization

What can you access?

RBAC Check

Data Isolation

What data belongs to you?

Organization Filter

13. Password Security

Passwords must use:

Strong Hashing


Example:

bcrypt / argon2


Never store:

Plain Text Passwords

14. Future Enterprise Authentication

Future support:

OAuth2

Examples:

Google Login

Microsoft Login

GitHub Login

SSO

Enterprise:

SAML

OIDC

Azure AD

Okta

SCIM

Automatic user provisioning.

15. API Token Strategy

Future support for:

Machine integrations:

API Token


 |

 v


External System


 |

 v


CodeMind API


Use cases:

CI/CD integration
Automated indexing
Enterprise workflows
16. Audit Logging

Security events should be recorded.

Examples:

User login

Permission change

Repository access

MCP request

API token creation


Stored in:

audit_logs

17. Security Principles
Least Privilege

Users receive only required permissions.

Zero Trust

Every request is validated.

Organization Isolation

No cross-company data access.

Audit Everything

Important actions are recorded.

18. Consequences
Positive
Secure Enterprise Foundation

Suitable for private repositories.

Clear Permission Model

Easy team management.

MCP Ready

External AI tools can authenticate safely.

Future Enterprise Support

SSO integration possible.

Negative
More Complexity

Requires permission management.

Token Management

JWT lifecycle needs handling.

Additional Database Models

Users, roles, permissions increase complexity.

19. Final Decision Summary
Area	Decision
Authentication	JWT
Authorization	RBAC
Tenancy	Organization Based
API Security	JWT + Guards
MCP Security	Token Based
Password Hashing	Argon2/Bcrypt
Enterprise SSO	Future
Conclusion

CodeMind security architecture is built around:

Identity

+

Permission

+

Organization Isolation

+

Auditability


Final decision:

"Every piece of code intelligence must have controlled access."