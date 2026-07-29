This document defines the retrieval intelligence layer of CodeMind.

The Indexing Engine creates understanding.

The Search Engine finds the correct understanding.

This is the layer responsible for answering:

"From millions of lines of code, what small amount of information does the AI actually need?"

Create:

docs/03-database/search-schema.md

Content:

# Search Schema Design


## Document Information

Module: Search Intelligence Engine

Document: Search Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Search Engine is responsible for retrieving the most relevant
information from CodeMind's knowledge base.


It combines multiple search strategies:


- Keyword search
- Semantic search
- Code symbol search
- Business knowledge search
- Relationship search



The goal:


"Find the smallest and most accurate context required by AI."



# 2. Problem Statement


Traditional AI coding assistants:



User Question

  |

  v

Search Files

  |

  v

Send Large Context

  |

  v

LLM Response



Problems:


- Too many tokens
- Slow responses
- Missing important relationships
- Repeated repository scanning



CodeMind:



Question

|

v

Search Intelligence Layer

|

v

Relevant Knowledge

|

v

Small AI Context

|

v

Answer




# 3. Search Architecture



             User Query


                 |

                 v


          Query Understanding


                 |

    +------------+-------------+

    |            |             |

Keyword Search Vector Search Graph Search

    |            |             |


    +------------+-------------+


                 |

                 v


          Ranking Engine


                 |

                 v


         Context Selection


                 |

                 v


              AI Model



# 4. Search Components



## 4.1 Keyword Search


Traditional text matching.



Example:


Question:



payment retry logic



Finds:



paymentRetry()

retryPayment()

PaymentService




Technology:


- PostgreSQL Full Text Search
- Elasticsearch (future)



---



## 4.2 Semantic Search


Understands meaning.



Example:



Question:



How does failed payment recover?




Finds:




Payment retry workflow

Transaction recovery

Payment exception handler




Technology:


- pgvector
- Vector Database



---



## 4.3 Code Symbol Search



Searches code identifiers.



Example:




InvoiceService

calculateDiscount

PaymentRepository




Uses:



code_symbols




---



## 4.4 Knowledge Search



Searches generated understanding.



Example:




Business rule:

Paid invoice cannot be deleted.




Uses:



knowledge_items

business_rules




---



# 5. Search Entity Overview




search_queries

    |

    v

search_results

    |

    v

search_feedback

    |

    v

search_analytics




# 6. Search Query Table



Table:




search_queries




Purpose:


Stores user searches.



Schema:



```sql
search_queries


id

repository_id

user_id

query

search_type

created_at


Example:

Query:

How invoice creation works?


Type:

HYBRID

7. Search Result Table

Table:

search_results


Purpose:

Stores retrieved results.

Schema:

search_results


id

query_id

source_type

source_id

score

rank

created_at


Example:

Result:

InvoiceService.createInvoice()


Score:

0.94


Rank:

1

8. Search Source Types

Supported:

CODE_ENTITY

CODE_CHUNK

KNOWLEDGE_ITEM

BUSINESS_RULE

DOCUMENTATION

API_ENDPOINT

DATABASE_ENTITY

9. Ranking Algorithm

Search ranking combines multiple signals.

Example:

Final Score =


Semantic Similarity

+

Keyword Match

+

Business Importance

+

Usage Frequency

+

Confidence Score


Example:

PaymentService


Vector Score:

0.92


Keyword:

0.80


Business Importance:

0.95


Final:

0.91

10. Search Context Selection

Important concept:

Do not send everything to AI.

Example:

Repository:

5000 Files


Search result:

Top Relevant:


1. PaymentService

2. InvoiceService

3. Payment Entity

4. Payment Workflow


AI receives:

4 relevant contexts


Not:

5000 files

11. Search Context Table

Table:

search_contexts


Purpose:

Stores AI-ready context.

Schema:

search_contexts


id

query_id

source_id

content

token_count

importance_score

created_at

12. Query Understanding

Before searching:

Analyze user intent.

Example:

Question:

Why invoice is not generated?


Detected:

Intent:

DEBUGGING


Domain:

INVOICE


Action:

FIND_FAILURE_REASON


Table:

query_intents


Schema:

query_intents


id

query_id

intent

domain

entity

created_at

13. Search Intent Types

Supported:

EXPLANATION

DEBUGGING

ARCHITECTURE

DOCUMENTATION

BUSINESS_FLOW

IMPACT_ANALYSIS

CODE_REVIEW

14. Relationship Based Search

Some questions require dependency understanding.

Example:

Question:

What happens when payment fails?


Search graph:

PaymentService


     |

     v


PaymentFailureHandler


     |

     v


NotificationService


     |

     v


CreditService


Uses:

code_relationships

business_relationships

15. Search Feedback

Table:

search_feedback


Purpose:

Improve retrieval quality.

Schema:

search_feedback


id

query_id

user_id

rating

comment

created_at


Example:

Result useful:

Yes


Score:

5

16. Search Analytics

Table:

search_analytics


Tracks:

Popular questions
Missing knowledge
Failed searches
Response quality

Schema:

search_analytics


id

query

result_count

response_time

created_at

17. Hybrid Search Flow

Example:

Question:

Explain refund process


Step 1:

Keyword search:

refund()

RefundService


Step 2:

Vector search:

Refund workflow

Credit creation

Customer reimbursement


Step 3:

Graph search:

RefundService

    |

    v

PaymentService

    |

    v

InvoiceService


Step 4:

Ranking:

Best Context Selected

18. TypeORM Example
@Entity()
export class SearchResult {


@PrimaryGeneratedColumn("uuid")
id:string;


@Column()
sourceType:string;


@Column()
sourceId:string;


@Column({
type:"float"
})
score:number;


}
19. Index Strategy

search_queries:

repository_id

user_id

created_at


search_results:

query_id

source_type

score


Knowledge search:

embedding_vector

full_text_index

20. Performance Strategy

For large repositories:

Cache Popular Queries

Example:

"How payment works"



Store previous retrieval.

Incremental Search Index Update

Only update changed code.

Query Result Ranking

Prioritize:

Business critical modules
Recently changed code
High confidence knowledge
21. Security

Search must respect:

Repository permissions
User access
Organization isolation

Example:

Developer A:

Can search Project A


Developer B:

Cannot access Project A

22. Future Enhancements
AI Query Planner

AI decides:

Need business search?


Need code search?


Need architecture search?

Cross Repository Search

Example:

Frontend


    |

Backend


    |

Mobile App


Understand complete ecosystem.

Search Explanation

Show why result was selected:

Example:

Selected PaymentService because:


- Similarity: 94%

- Called by InvoiceService

- Contains payment workflow

Summary

The Search Engine is the retrieval brain of CodeMind.

It solves the biggest limitation of current AI coding tools:

"Finding the right information before asking AI."

Core principle:

"Better retrieval creates better AI answers with fewer tokens."