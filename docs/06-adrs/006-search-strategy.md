This ADR defines how CodeMind finds relevant information from large software repositories.

Search is one of the most important layers because:

AI quality depends on retrieving the correct context.

A bad search system creates bad AI answers.

Create:

docs/06-adrs/006-search-strategy.md

Content:

# ADR-006: Search Strategy


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind needs to answer developer questions about complex
software systems.


Examples:



Where is payment validation implemented?

Why does invoice generation fail?

Explain the user registration flow.

Which modules depend on authentication?



Traditional search is not enough.


A developer may search:



payment



But the actual logic may exist in:



transaction.service.ts

billing.processor.ts

invoice.manager.ts

payment-rule.ts



Therefore CodeMind requires intelligent search.



# 2. Search Requirements



The search system must support:



## Exact Search


Find exact matches.



Example:



PaymentService

calculateInvoice()

UserEntity




---



## Semantic Search


Understand meaning.



Example:


Question:



How are customers charged?



Should find:




Payment Processing

Invoice Creation

Subscription Billing




---



## Code Relationship Search


Understand dependencies.



Example:




Controller

|


v

Service

|


v

Repository




---



## Business Knowledge Search


Find:


- Rules
- Workflows
- Decisions
- Documentation



# 3. Search Challenges



## Large Repository Size



Example:



Enterprise Application

50,000 Files

5 Million Lines




Searching everything every time is impossible.



---



## Different Developer Language



Developer:



Why is account locked?



Code:



user.status = INACTIVE

securityPolicy.validate()




Search must bridge human language and code language.



# 4. Options Considered



# Option 1: Keyword Search Only



Architecture:



User Query

|

v

Text Search

|

v

Results




Technology examples:


- PostgreSQL LIKE
- Regex
- Basic indexing



Advantages:


- Simple
- Fast
- Easy implementation



Problems:


- Does not understand meaning
- Poor with business questions
- Misses related concepts



Decision:


Rejected.



---



# Option 2: Vector Search Only



Architecture:



Question

|

v

Embedding

|

v

Vector Similarity




Advantages:


- Understands meaning
- Good for AI queries



Problems:


- Can miss exact symbols
- Weak for file names
- Weak for identifiers



Example:


Searching:



UserService



may not always find exact class name.



Decision:


Rejected as the only search method.



---



# Option 3: Hybrid Search



Architecture:


          Query


            |


   +--------+--------+

   |                 |

Keyword Search Semantic Search

   |                 |


   +--------+--------+


            |


            v


      Ranking Engine


            |


            v


        Results



Advantages:


- Best accuracy
- Combines exact and semantic understanding
- Suitable for code intelligence



Decision:


Selected.



# 5. Decision



CodeMind will use:




Hybrid Search Architecture

Keyword Search

    +

Vector Search

    +

Code Graph Search

    +

Ranking System




# 6. Search Architecture



Complete flow:




Developer Question

    |

    v

Query Analyzer

    |

    +----------------+

    |                |

Keyword Search Semantic Search

    |                |


    +----------------+

             |

             v


      Result Ranking


             |

             v


      Context Builder


             |

             v


          AI Layer



# 7. Search Components



## Query Analyzer



Responsibility:


Understand user intent.



Example:



Input:



Explain invoice calculation




Detect:



Type:

Business Question

Domain:

Invoice

Intent:

Explanation




---



## Keyword Search Engine



Searches:




File names

Class names

Functions

Variables

Database tables




Technology:



Initial:



PostgreSQL Full Text Search




Future:



Elasticsearch / OpenSearch




---



## Semantic Search Engine



Uses:




Embeddings

Vector Similarity




Searches:




Code meaning

Documentation meaning

Business concepts




---



## Code Graph Search



Uses relationships:



Example:



InvoiceController

    |


    v

InvoiceService

    |


    v

PaymentRepository




Finds:


- Dependencies
- Call relationships
- Impact areas



# 8. Ranking Strategy



Search results are scored.



Example:




Final Score =

Keyword Match

Vector Similarity

Code Importance

Relationship Score

Recent Changes




Example:




PaymentService.ts

Score: 95%

payment-helper.ts

Score: 55%




# 9. Search Index Model



Main entity:




search_documents




Example:



```sql
search_documents


id

organization_id

repository_id

entity_type

title

content

metadata

embedding

created_at


Entity types:

FILE

CLASS

FUNCTION

DOCUMENTATION

BUSINESS_RULE

API

DATABASE_ENTITY

10. Code Search Strategy

Code is indexed by:

File Level

Example:

payment.service.ts

Symbol Level

Example:

PaymentService.calculate()

Function Level

Example:

calculateInvoiceTotal()

Relationship Level

Example:

Function calls another function

11. Indexing Flow

When repository changes:

Git Change


     |

     v


Parser


     |

     v


Extract Symbols


     |

     v


Create Search Documents


     |

     v


Generate Embeddings


     |

     v


Update Index

12. Search Optimization
Metadata Filtering

Before searching:

Filter:

Repository

Language

Module

Branch

Organization

Caching

Frequently searched queries can be cached.

Example:

Explain authentication flow

Incremental Indexing

Do not rebuild everything.

Only update:

Changed Files

Changed Symbols

Changed Knowledge

13. Search Security

Every search must enforce:

Organization Isolation


Permission Check


Repository Access Control


Example:

Developer cannot search another company's repository.

14. Future Improvements
AI Query Planner

AI decides:

Should I use:

Keyword search?

Vector search?

Graph search?

Learning Ranking

System learns:

Which results developers open
Which answers are accepted
Which files are useful
Cross Repository Search

Enterprise users can search:

All company repositories

15. Consequences
Positive
Better AI Answers

Relevant context improves reasoning.

Lower Token Usage

Only useful information reaches the LLM.

Developer Friendly

Supports natural language questions.

Scalable

Can evolve into dedicated search infrastructure.

Negative
More Complexity

Multiple search strategies must work together.

Ranking Requires Tuning

Quality depends on scoring.

More Storage

Need search metadata and embeddings.

16. Final Decision Summary
Area	Decision
Search Type	Hybrid Search
Keyword Engine	PostgreSQL Full Text
Semantic Engine	pgvector
Relationship Search	Code Graph
Ranking	Multi-factor Score
Future Search Engine	OpenSearch/Elasticsearch
Conclusion

CodeMind search will combine traditional and AI-powered search.

The goal:

"Find the right code, knowledge, and business context before asking AI to reason."