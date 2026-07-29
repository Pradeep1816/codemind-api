ADR-001: Backend Framework Selection


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind requires a backend platform capable of supporting:


- Repository processing
- Code indexing
- AI workflows
- Search services
- MCP integration
- Background workers
- Event-driven architecture
- Enterprise security



The backend will become the foundation of the entire CodeMind platform.


Therefore, the framework must support:

- Large-scale modular architecture
- Maintainability
- Developer productivity
- Type safety
- Long-term evolution



# 2. Requirements



The backend framework should provide:



## Modular Architecture


CodeMind contains many independent domains:




Repository

Indexing

Parser

Knowledge

Search

AI

MCP

Analytics

Security




The framework should allow clear module boundaries.



---



## Type Safety



The platform handles complex data:



- Code entities
- Knowledge graphs
- AI responses
- Events
- Repository metadata



Strong typing reduces errors.



---



## Dependency Management



The system requires:


- Database services
- AI providers
- Queue systems
- Event handlers
- External APIs



A dependency injection system is required.



---



## Enterprise Maintainability



The codebase should support:


- Multiple developers
- Long-term maintenance
- Testing
- Clear ownership



# 3. Options Considered



## Option 1: Express.js



### Advantages


- Popular Node.js framework
- Simple
- Large ecosystem



### Disadvantages


- No official architecture pattern
- Developers define structure themselves
- Large projects become difficult to maintain



Example problem:




src/

controllers/

services/

utils/

helpers/




After years:



Business logic scattered everywhere




Decision:


Rejected.



---



## Option 2: Fastify



### Advantages


- Very fast
- Low overhead
- Good performance



### Disadvantages


- Requires more architectural decisions
- Smaller enterprise structure
- Less opinionated



Decision:


Not selected.



---



## Option 3: Spring Boot



### Advantages


- Enterprise proven
- Strong architecture
- Excellent ecosystem



### Disadvantages


- Java ecosystem
- Slower development for JavaScript-focused teams
- Less aligned with AI tooling ecosystem



Decision:


Not selected.



---



## Option 4: Django



### Advantages


- Mature framework
- Excellent Python ecosystem
- Good for AI services



### Disadvantages


- Less suitable for real-time Node ecosystem
- Different language stack
- Less alignment with frontend TypeScript



Decision:


Not selected.



---



## Option 5: NestJS



### Advantages


- TypeScript native
- Enterprise architecture
- Modular design
- Dependency injection
- Built-in testing support
- Good ecosystem



Example:




repository.module.ts

repository.controller.ts

repository.service.ts

repository.entity.ts




Benefits:


- Clear ownership
- Easy scaling
- Better developer experience



Decision:


Selected.



# 4. Decision



CodeMind backend will use:




NestJS

TypeScript

Node.js




Architecture style:




Modular Monolith

    |

    v

Future Microservices




# 5. Why Modular Monolith First?



Initial architecture:




codemind-api

Authentication Module

Repository Module

Indexing Module

Search Module

AI Module

MCP Module




Benefits:


- Faster development
- Easier debugging
- Shared code
- Lower infrastructure cost



Future:




Repository Service

Indexing Service

AI Service

Search Service




can be extracted independently.



# 6. NestJS Architecture Decision



CodeMind will follow:



## Module Based Design



Example:




src/

repository/

repository.module.ts

repository.service.ts

repository.controller.ts

indexing/

indexing.module.ts

indexing.service.ts



---



## Dependency Injection



Example:




SearchService

depends on

EmbeddingService




NestJS manages dependency lifecycle.



---



## Layer Separation



Each module follows:




Controller

|

v

Service

|

v

Repository

|

v

Database




# 7. Consequences



## Positive Consequences



### Better Maintainability


Each domain has clear responsibility.



### Easier Team Collaboration


Developers can work on independent modules.



### Strong Type Safety


TypeScript reduces runtime errors.



### Better Testing


Modules can be tested independently.



### MCP Compatibility


NestJS works well for creating MCP servers.



---



## Negative Consequences



### More Boilerplate


NestJS requires more files compared to Express.



### Learning Curve


Developers must understand:


- Modules
- Providers
- Dependency Injection



### Possible Over Engineering


Small applications may not need this structure.



# 8. Future Impact



This decision enables:




Current

NestJS Modular Monolith

    |

Future

Distributed Services

    |

Enterprise AI Platform




# 9. Final Decision Summary



| Decision | Choice |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Framework | NestJS |
| Architecture | Modular Monolith |
| Future Scaling | Microservices |
| API Style | REST + MCP |
| Database Access | TypeORM |



# Conclusion



NestJS provides the balance between:


- Developer productivity
- Enterprise architecture
- Type safety
- Future scalability


Therefore:


"CodeMind backend will be built using NestJS with a modular architecture."