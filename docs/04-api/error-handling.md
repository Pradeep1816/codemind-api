This document defines how CodeMind handles:

API errors
Validation failures
Authentication failures
Authorization failures
Business logic errors
Internal system failures

A consistent error system is important because CodeMind has multiple clients:

Web application
MCP clients
AI agents
External integrations
# CodeMind API Error Handling


## 1. Introduction


Error handling defines how CodeMind communicates failures
between backend services and API consumers.


The goals are:


- Consistent error responses
- Easy debugging
- Clear client behavior
- Secure information exposure
- Better monitoring



# 2. Error Handling Principles



## Consistency


Every API error follows the same structure.



Example:



```json
{
 "success": false,
 "error": {
   "code": "RESOURCE_NOT_FOUND",
   "message": "Repository not found"
 }
}
Security First

Errors must not expose:

Database details
Internal stack traces
Secrets
Infrastructure information

Bad example:

{
 "error":
 "SELECT * FROM repositories WHERE id=123 failed"
}

Good example:

{
 "code":"DATABASE_ERROR",
 "message":"Unable to process request"
}
Developer Friendly

Errors should provide:

Error code
Message
Request ID
Validation details
3. Standard Error Response

All APIs return:

{
 "success": false,
 "error": {
   "code":"ERROR_CODE",
   "message":"Human readable message",
   "details":{}
 },
 "meta":{
   "requestId":"req_123"
 }
}

Example:

{
 "success":false,
 "error":{
   "code":"REPOSITORY_NOT_FOUND",
   "message":"Repository does not exist"
 },
 "meta":{
   "requestId":"req_abc123"
 }
}
4. HTTP Status Codes

CodeMind follows standard HTTP responses.

Status	Meaning
200	Successful request
201	Resource created
204	Successful without response
400	Invalid request
401	Authentication required
403	Permission denied
404	Resource not found
409	Conflict
422	Validation failed
429	Rate limit exceeded
500	Internal server error
503	Service unavailable
5. Error Code Format

Error codes use:

RESOURCE_ACTION_REASON


Examples:

USER_NOT_FOUND

REPOSITORY_ACCESS_DENIED

INDEX_JOB_FAILED

INVALID_TOKEN

AI_REQUEST_TIMEOUT

6. Authentication Errors
Invalid Token

HTTP:

401 Unauthorized


Response:

{
 "success":false,
 "error":{
   "code":"INVALID_TOKEN",
   "message":"Authentication token is invalid"
 }
}
Token Expired

Code:

TOKEN_EXPIRED


Client action:

Request new access token

Missing Authentication

Code:

AUTHENTICATION_REQUIRED

7. Authorization Errors

When user is authenticated but lacks permission.

HTTP:

403 Forbidden


Example:

{
 "success":false,
 "error":{
   "code":"PERMISSION_DENIED",
   "message":"You do not have access to this repository"
 }
}

Examples:

REPOSITORY_ACCESS_DENIED

INSUFFICIENT_ROLE

MCP_ACCESS_DENIED

8. Validation Errors

Invalid request data.

HTTP:

422 Unprocessable Entity


Example:

Request:

{
 "email":"invalid"
}

Response:

{
 "success":false,
 "error":{
   "code":"VALIDATION_FAILED",
   "message":"Invalid input",
   "details":[
     {
      "field":"email",
      "message":"Invalid email format"
     }
   ]
 }
}
9. Resource Errors

When requested resource does not exist.

HTTP:

404 Not Found


Examples:

USER_NOT_FOUND

REPOSITORY_NOT_FOUND

DOCUMENT_NOT_FOUND

JOB_NOT_FOUND


Example:

{
 "success":false,
 "error":{
  "code":"REPOSITORY_NOT_FOUND",
  "message":"Repository was not found"
 }
}
10. Conflict Errors

Used when operation conflicts with current state.

HTTP:

409 Conflict


Examples:

REPOSITORY_ALREADY_EXISTS

INDEX_ALREADY_RUNNING

USER_ALREADY_EXISTS


Example:

Repository indexing is already in progress.

11. Business Logic Errors

Business rules can fail.

Examples:

REPOSITORY_NOT_READY

INSUFFICIENT_AI_CREDITS

INDEXING_REQUIRED


Example:

User asks AI:

Explain payment module


But repository is not indexed.

Response:

{
 "success":false,
 "error":{
  "code":"REPOSITORY_NOT_INDEXED",
  "message":"Repository indexing is required before AI analysis"
 }
}
12. AI Service Errors

AI operations have special failures.

Examples:

AI_PROVIDER_ERROR

AI_TIMEOUT

AI_CONTEXT_LIMIT_EXCEEDED

AI_QUOTA_EXCEEDED


Example:

{
 "success":false,
 "error":{
  "code":"AI_TIMEOUT",
  "message":"AI processing took too long"
 }
}
13. Indexing Errors

Repository indexing errors:

Examples:

INDEX_FAILED

PARSER_ERROR

UNSUPPORTED_LANGUAGE

REPOSITORY_CLONE_FAILED


Example:

{
 "success":false,
 "error":{
  "code":"REPOSITORY_CLONE_FAILED",
  "message":"Unable to clone repository"
 }
}
14. Internal Server Errors

Unexpected failures.

HTTP:

500 Internal Server Error


Response:

{
 "success":false,
 "error":{
  "code":"INTERNAL_ERROR",
  "message":"Something went wrong"
 },
 "meta":{
  "requestId":"req_123"
 }
}

Detailed information goes only to logs.

15. NestJS Exception Mapping

Backend structure:

Request


 |

 v


Controller


 |

 v


Service


 |

 v


Exception


 |

 v


Global Exception Filter


 |

 v


API Response


Example:

throw new NotFoundException({
 code:"REPOSITORY_NOT_FOUND"
});

Global filter converts it into standard format.

16. Request ID Tracking

Every request receives:

X-Request-ID


Example:

X-Request-ID: req_a12345


Used for:

Debugging
Logging
Monitoring
Support tickets
17. Logging Strategy

Errors are logged internally.

Example:

ERROR


Request ID:

req_123


User:

usr_456


Action:

repository.index


Error:

INDEX_FAILED


Never log:

Passwords
JWT tokens
API keys
Source code
18. Client Error Handling

Clients should handle:

Authentication Errors

Action:

Refresh token

Permission Errors

Action:

Show access denied message

Validation Errors

Action:

Highlight form fields

Server Errors

Action:

Retry or contact support

19. Error Monitoring

Production monitoring should capture:

Error frequency
Stack traces
Request IDs
User impact
Failed jobs

Future tools:

Sentry

Datadog

Grafana

20. Error Categories Summary
Category	Example
Authentication	INVALID_TOKEN
Authorization	PERMISSION_DENIED
Validation	VALIDATION_FAILED
Resource	REPOSITORY_NOT_FOUND
Conflict	INDEX_ALREADY_RUNNING
Business	REPOSITORY_NOT_INDEXED
AI	AI_TIMEOUT
System	INTERNAL_ERROR
21. Final Error Design

CodeMind follows:

Standard Format

+

Meaningful Codes

+

Secure Messages

+

Detailed Internal Logs


Conclusion:

"Errors should help developers solve problems without exposing system internals."