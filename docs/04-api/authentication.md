This document defines how users, AI agents, and external systems securely access CodeMind.

# CodeMind Authentication API


## 1. Introduction


Authentication is responsible for verifying the identity of:

- Human users
- External applications
- MCP clients
- Internal services


CodeMind uses token-based authentication because the platform
is API-first and integrates with AI agents.


Authentication provides:

- User identity verification
- Secure API access
- Session management
- MCP client authentication



# 2. Authentication Goals


The authentication system must provide:



## Secure Identity


Every request must identify:


Who is making the request?




## Stateless API Access


The API should not depend on server-side sessions.


Architecture:



Client

|

v

JWT Token

|

v

API Gateway

|

v

Validate Token




## Enterprise Ready


Future support:

- OAuth2
- SSO
- SAML
- OpenID Connect



# 3. Authentication Architecture



High-level flow:



             User


              |

              v


          Login API


              |

              v


      Authentication Service


              |

              v


      Generate JWT Tokens


              |

              v


          Client


              |

              v


      Protected API Request



# 4. Authentication Methods



## Method 1: JWT Authentication


Primary authentication method.



Used for:

- Web application
- Mobile application
- API clients
- MCP clients



Flow:



Login

|

v

Receive Access Token

|

v

Send Token With Requests

|

v

Validate Token




---



## Method 2: API Token


Future support.



Used for:

- CI/CD systems
- Automation
- External integrations



Example:



GitHub Action

    |

    v

CodeMind API Token

    |

    v

Repository Indexing




---



## Method 3: OAuth / SSO


Future enterprise authentication.



Supported providers:




Google Workspace

Microsoft Entra ID

GitHub

Okta




# 5. JWT Token Strategy



CodeMind uses:




Access Token

Refresh Token




## Access Token



Purpose:


Short-lived API access.



Example:



Expiration:

15 minutes




Contains:



```json
{
 "sub":"user_id",
 "organizationId":"org_id",
 "roles":[
    "developer"
 ]
}
Refresh Token

Purpose:

Generate new access tokens.

Example:

Expiration:

30 days


Stored securely.

6. Login Flow

Request:

POST /api/v1/auth/login


Body:

{
 "email":"developer@example.com",
 "password":"password"
}

Response:

{
 "success":true,
 "data":{
    "accessToken":"jwt_token",
    "refreshToken":"refresh_token"
 }
}
7. Register Flow

Endpoint:

POST /api/v1/auth/register


Request:

{
 "name":"John Developer",
 "email":"john@example.com",
 "password":"password"
}

Process:

Validate User


        |

        v


Create Account


        |

        v


Hash Password


        |

        v


Create User


        |

        v


Return Token

8. Token Refresh Flow

Endpoint:

POST /api/v1/auth/refresh


Request:

{
 "refreshToken":"token"
}

Response:

{
 "accessToken":"new_access_token"
}

Flow:

Refresh Token

        |

        v

Validate Token

        |

        v

Generate New Access Token

9. Logout Flow

Endpoint:

POST /api/v1/auth/logout


Process:

Invalidate Refresh Token


        |

        v


Clear Session Data


        |

        v


User Logged Out

10. Protected API Requests

Every protected request requires:

Header:

Authorization: Bearer <access_token>


Example:

GET /api/v1/repositories


Authorization:

Bearer eyJhbGciOiJIUzI1...

11. Authentication Guard

Backend flow:

Incoming Request


        |

        v


JWT Guard


        |

        v


Validate Signature


        |

        v


Extract User


        |

        v


Continue Request

12. User Identity Context

After authentication,
the backend receives:

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

This context is available to all modules.

13. Password Security

Passwords must never be stored directly.

Storage:

Plain Password


        X


Hashed Password


        ✓


Recommended hashing:

Argon2

or

bcrypt


Requirements:

Minimum password length
Password strength validation
Secure reset flow
14. Password Reset Flow

Endpoint:

POST /api/v1/auth/password-reset


Flow:

User Request


        |

        v


Generate Reset Token


        |

        v


Send Email


        |

        v


Verify Token


        |

        v


Update Password

15. MCP Authentication

MCP clients:

Examples:

Cursor

Codex

Claude Desktop


Authentication flow:

AI Client


 |

 v


MCP Server


 |

 v


Validate Token


 |

 v


Check Repository Permission


 |

 v


Return Knowledge

16. Service Authentication

Internal services also require authentication.

Example:

Index Worker


        |

        v


AI Service


        |

        v


Knowledge Service


Future:

Service Tokens

mTLS

17. Security Rules
Token Security

Never:

Store Access Token in logs

Expose Token to frontend scripts

Share Tokens

Rate Limiting

Authentication endpoints must have limits.

Example:

Login:

5 attempts / minute


Password Reset:

3 attempts / 15 minutes

Account Protection

Support:

Account lock
Suspicious login detection
Audit logging
18. Authentication Audit Events

Track:

user.login.success

user.login.failed

password.changed

token.created

token.revoked


Example:

User logged in

Timestamp:

2026-07-29

IP:

Recorded

19. Future Improvements
Multi Factor Authentication

Support:

TOTP

Authenticator Apps

Security Keys

Enterprise SSO

Support:

SAML

OIDC

Azure AD

Okta

API Key Management

For integrations:

Create Key

Rotate Key

Revoke Key

Audit Usage

20. Authentication API Summary
Endpoint	Purpose
POST /auth/register	Create user
POST /auth/login	Login user
POST /auth/refresh	Refresh token
POST /auth/logout	Logout
POST /auth/password-reset	Reset password
POST /auth/change-password	Change password
Conclusion

CodeMind authentication provides a secure foundation for:

Developers
Organizations
AI agents
Enterprise integrations

Final principle:

"Every request must prove identity before accessing software intelligence."