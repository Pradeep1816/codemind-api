This document defines how CodeMind manages API evolution over time.

API versioning is important because CodeMind will become a platform used by:

Web applications
MCP clients
AI agents
Enterprise integrations
External developers

The goal:

"Improve the API without breaking existing consumers."

# CodeMind API Versioning Strategy


## 1. Introduction


API versioning defines how CodeMind manages changes to
public APIs over time.


CodeMind APIs are long-lived contracts between:


- Frontend applications
- External integrations
- MCP clients
- Enterprise systems


Breaking these contracts can disrupt customer workflows.


Therefore CodeMind follows a controlled versioning strategy.



# 2. Versioning Goals


The API versioning system must provide:


## Backward Compatibility


Existing clients should continue working after new releases.



## Controlled Evolution


New capabilities can be introduced without breaking users.



## Clear Migration Path


Consumers should know:

- What changed
- When it changes
- How to migrate



# 3. API Version Format



CodeMind uses URL-based versioning.



Format:




/api/{version}/{resource}




Example:




/api/v1/repositories

/api/v1/search

/api/v1/knowledge




# 4. Current API Version



Current version:




v1




Example:




GET /api/v1/repositories




v1 represents the first stable public API contract.



# 5. When to Create a New Version



A new API version is created only for breaking changes.



Examples:



## Response Structure Change



Before:



```json
{
 "name":"repository"
}

After:

{
 "repositoryName":"repository"
}

Requires:

v2

Endpoint Removal

Example:

Old:

GET /api/v1/files


Removing this endpoint requires:

/api/v2/files

Authentication Changes

Example:

Changing:

JWT

to

OAuth only


requires a new version.

6. Changes That Do Not Require New Version

Non-breaking changes:

Adding New Fields

Example:

Before:

{
"id":"repo_123"
}

After:

{
"id":"repo_123",
"language":"typescript"
}

No new version required.

Adding New Endpoints

Example:

Existing:

/api/v1/repositories


New:

/api/v1/repositories/{id}/analysis


No version change.

Adding Optional Parameters

Example:

Before:

GET /repositories


After:

GET /repositories?language=typescript


No version change.

7. Version Lifecycle

Each API version follows:

Development


      |

      v


Beta


      |

      v


Stable


      |

      v


Deprecated


      |

      v


Retired

8. API Version States
Development

Purpose:

Internal testing
Rapid changes

Example:

v1-alpha

Beta

Purpose:

External testing
Feedback collection

Example:

v1-beta

Stable

Purpose:

Production usage

Example:

v1

Deprecated

Purpose:

Migration period

Example:

v1 deprecated

use v2

9. Deprecation Policy

When an API version is deprecated:

CodeMind provides:

Notice

Example:

API v1 will be retired after 12 months.

Documentation

Migration guide:

v1 → v2 Migration Guide

Warning Headers

Example:

Deprecation: true

Sunset: 2027-01-01

10. API Migration Strategy

Example:

Current:

/api/v1/repositories


New:

/api/v2/repositories


Migration:

Client Update


        |

        v


Test v2


        |

        v


Switch Traffic


        |

        v


Remove v1

11. Database Compatibility

API versions should not directly depend on database structure.

Architecture:

API v1


 |

 v


Service Layer


 |

 v


Database



Not:

API

 |

 v

Database Tables


This allows database changes without API breaking changes.

12. NestJS Version Structure

Recommended backend structure:

src/

├── modules/

│

├── v1/

│   ├── repositories/

│   ├── search/

│   └── ai/

│

└── v2/

    └── future changes


Alternative:

src/

├── api/

│

├── v1/

│

└── v2/

13. OpenAPI Documentation Versioning

Each API version has separate documentation.

Example:

Swagger


/api/v1/docs


/api/v2/docs

14. MCP API Versioning

MCP tools also require version control.

Example:

Current:

mcp/v1/search-code


Future:

mcp/v2/search-code


Because AI clients may depend on tool schemas.

15. SDK Versioning

Future CodeMind SDKs:

Example:

codemind-sdk-js@1.x

codemind-sdk-python@1.x


SDK versions should match API compatibility.

16. Breaking Change Checklist

Before creating a new version:

□ API contract reviewed

□ Migration plan created

□ Documentation updated

□ SDK updated

□ Deprecation timeline defined

□ Existing clients notified

17. API Governance

Every API change requires:

Design review
Documentation update
Test coverage
Migration consideration
18. Version Examples
Version 1
/api/v1/repositories

/api/v1/search

/api/v1/ai

Version 2 Future

Possible changes:

/api/v2/intelligence/search

/api/v2/agents

/api/v2/workflows

19. Final Versioning Rules

CodeMind follows:

Stable APIs are never broken


+

Breaking changes create new versions


+

Old versions receive migration support

Conclusion

API versioning allows CodeMind to evolve from an internal
tool into an enterprise developer intelligence platform.

Final principle:

"Change the implementation often, but change the contract carefully."