This document defines how CodeMind protects APIs from:

Abuse
Accidental overload
AI cost explosion
Excessive indexing requests
Automated attacks
Resource exhaustion

Rate limiting is especially important because CodeMind performs expensive operations:

Repository indexing
Code analysis
Semantic search
AI generation
Documentation generation
# CodeMind API Rate Limiting Strategy


## 1. Introduction


Rate limiting controls how frequently users and systems can
access CodeMind APIs.


The purpose is to:

- Protect system resources
- Maintain service availability
- Control AI costs
- Prevent abuse
- Provide fair usage



# 2. Rate Limiting Goals


## System Protection


Prevent:




Too many requests

    |

    v

API overload

    |

    v

Service degradation




---



## Fair Usage


One user should not consume resources that affect all users.



---



## Cost Control


AI operations can consume expensive resources.



Example:




AI Request

  |

  v

Context Retrieval

  |

  v

LLM Processing

  |

  v

Token Cost




# 3. Rate Limiting Architecture



Request flow:




Client Request

   |

   v

API Gateway

   |

   v

Rate Limit Guard

   |

   v

Permission Check

   |

   v

Business Logic




# 4. Rate Limit Levels



CodeMind uses multiple levels:




Global Limit

   +

User Limit

   +

Organization Limit

   +

Endpoint Limit

   +

AI Usage Limit




# 5. Global Rate Limit



Protects the entire platform.



Example:




10000 requests / minute




Purpose:


- Prevent system overload
- Protect infrastructure



# 6. User-Level Rate Limit



Applied per authenticated user.



Example:




User:

100 requests / minute




Example:




Developer A

100 requests/min

Developer B

100 requests/min




# 7. Organization-Level Rate Limit



Enterprise customers may have limits.



Example:




Organization:

10000 requests / hour




Useful for:


- Large teams
- Multiple developers
- CI/CD integrations



# 8. Endpoint-Based Limits



Different APIs have different costs.



## Authentication APIs



### Login



Limit:




5 requests / minute




Purpose:


Prevent brute-force attacks.



---



### Password Reset



Limit:




3 requests / 15 minutes




---



## Repository APIs



Example:




100 requests / minute




---



## Search APIs



Example:




300 requests / minute




Search is cheaper than AI processing.



---



## Indexing APIs



Example:




5 indexing jobs / hour




Reason:


Indexing consumes CPU and memory.



---



## AI APIs



Example:




50 AI requests / hour




Depends on:


- Plan
- Organization
- Token budget



# 9. AI Token-Based Limits



AI operations should also have token limits.



Example:




Maximum tokens per request

Daily token quota




Example:



User quota:




100000 AI tokens/day




# 10. MCP Rate Limiting



MCP clients require protection.



Examples:




Cursor

Claude Desktop

Codex

Custom AI Agents




MCP limits:




Tool calls/minute

Token usage

Repository access




Example:




mcp.search-code

60 calls/minute




# 11. Rate Limit Response



When limit is exceeded:



HTTP:




429 Too Many Requests




Response:



```json
{
 "success":false,
 "error":{
   "code":"RATE_LIMIT_EXCEEDED",
   "message":"Too many requests"
 },
 "meta":{
   "retryAfter":60
 }
}
12. Response Headers

Rate limit information should be returned.

Example:

X-RateLimit-Limit: 100

X-RateLimit-Remaining: 25

X-RateLimit-Reset: 1700000000


Meaning:

Limit:

100 requests


Remaining:

25 requests


Reset:

timestamp

13. Rate Limiting Algorithms

Possible algorithms:

Fixed Window

Example:

100 requests

per minute


Simple but has burst problems.

Sliding Window

More accurate:

100 requests

within any 60 seconds

Token Bucket

Recommended for CodeMind.

Concept:

Bucket

+

Tokens

+

Refill Rate


Example:

100 tokens


1 token added every second


Benefits:

Handles bursts
Flexible
Production proven
14. Storage Strategy

For distributed systems:

Use:

Redis


Architecture:

API Server 1

        |

API Server 2

        |

API Server 3

        |

        v

      Redis


All servers share limits.

15. NestJS Implementation

Recommended:

@nestjs/throttler

+

Redis Storage


Example:

@Throttle({
  default:{
    limit:100,
    ttl:60000
  }
})
16. Custom AI Limits

AI module should have custom control.

Example:

AI_LIMITS = {

 explanation:{
   requests:50,
   window:"1 hour"
 },

 documentation:{
   requests:10,
   window:"1 day"
 }

}

17. Background Job Limits

Long-running jobs also require limits.

Examples:

Repository indexing

Documentation generation

Architecture analysis


Example:

Maximum:

3 running jobs/user

18. Priority Handling

Future enterprise support:

Free Plan

      |

      v

Standard Plan

      |

      v

Enterprise Plan


Higher plans receive:

Higher limits
Priority queues
More AI usage
19. Abuse Detection

Future features:

Suspicious activity detection
IP reputation
Automated blocking
Usage anomaly detection

Example:

10000 search requests

from one user in 1 minute


       |

       v


Security Alert

20. Monitoring

Track:

Requests

Rejected Requests

AI Usage

Token Consumption

Latency


Dashboard:

API Usage

AI Cost

Rate Limit Events

21. Rate Limit Configuration Example

Example:

auth:

 login:

   limit: 5

   window: 60s


search:

 limit:300

 window:60s


ai:

 limit:50

 window:3600s


indexing:

 limit:5

 window:3600s

22. Rate Limit Rules

CodeMind follows:

Protect expensive operations


+

Allow normal development workflow


+

Provide clear retry information


+

Scale across multiple servers

Conclusion

Rate limiting ensures CodeMind remains reliable while
supporting thousands of developers and AI integrations.

Final principle:

"Every request has a cost. Rate limiting protects both users and the platform."