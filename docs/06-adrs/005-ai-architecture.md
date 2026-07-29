This ADR defines the architecture of the CodeMind AI Intelligence Layer.

This is the core decision because CodeMind is not just a chatbot.

The goal is:

"Build an AI system that understands software context before generating answers."

Create:

docs/06-adrs/005-ai-architecture.md

Content:

# ADR-005: AI Architecture


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind uses AI to help developers understand complex software
systems.


However, sending an entire repository to an LLM is not practical.



Example:



Large enterprise repository:



Files:

50,000

Lines of code:

5 million

Context:

Too large for LLM




Problems:


- High token cost
- Slow responses
- Poor accuracy
- Context limit issues



Therefore, CodeMind requires an intelligent AI architecture.



# 2. AI Architecture Goals



The AI system must provide:



## Context Understanding



AI should understand:


- Source code
- Business logic
- Architecture
- Database relationships
- Documentation
- Historical changes



---



## Token Optimization



Instead of:




Send entire repository

500,000 tokens




Use:




Retrieve relevant knowledge

5,000 tokens




---



## Evidence Based Answers



AI responses should include:




Answer

Source Files

Code References

Confidence Score




---



## Model Independence



CodeMind should not depend on a single AI provider.



# 3. AI Architecture Overview



             User


              |

              v


         AI Gateway


              |

              v


      Context Engine


              |

              v


    Knowledge Retrieval


              |

              v


          LLM Layer


              |

              v


         Response



# 4. Options Considered



# Option 1: Direct LLM Chat



Architecture:




User Question

  |

  v

LLM API

  |

  v

Answer




Advantages:


- Simple implementation
- Fast prototype



Problems:


- No repository understanding
- High token consumption
- Hallucination risk



Decision:


Rejected.



---



# Option 2: Fine-Tuning Models



Architecture:




Repository Data

   |

   v

Train Model

   |

   v

Custom AI Model




Advantages:


- Domain-specific model
- Better specialization



Problems:


- Expensive
- Requires huge datasets
- Hard to update
- Not suitable for changing repositories



Decision:


Not selected initially.



---



# Option 3: RAG Architecture



Architecture:




Repository

 |

 v

Indexing

 |

 v

Embeddings

 |

 v

Vector Search

 |

 v

LLM




Advantages:


- Lower token usage
- Dynamic knowledge
- No model training required
- Easy updates



Decision:


Selected.



# 5. Decision



CodeMind will use:




RAG Based AI Architecture

LLM Provider Abstraction

Knowledge Retrieval




# 6. AI Layer Components



## AI Gateway



Responsibility:


Central entry point for AI requests.



Example:




POST /ai/query




Responsibilities:


- Authentication
- Request validation
- Model selection
- Logging



---



## Context Engine



Responsibility:


Build the best context before asking AI.



Example:



Question:



Explain invoice calculation




Context Engine finds:




InvoiceService

Invoice Entity

Payment Rules

Documentation

Previous Changes




---



## Retrieval Engine



Responsible for:



- Vector search
- Keyword search
- Code graph traversal
- Ranking



Flow:




Question

|

v

Embedding

|

v

Search

|

v

Relevant Context




---



## Prompt Management



Prompts should not be hardcoded.



Store:




System Prompts

Task Prompts

Agent Prompts




Example:




You are a senior software architect.

Explain this module using evidence.




# 7. LLM Provider Strategy



CodeMind will support multiple providers.



Initial:



OpenAI API




Future:




Anthropic

Google Gemini

Azure OpenAI

Local Models




Architecture:




AI Service

 |

 v

LLM Adapter

 |

+---+----+

| |

OpenAI Local Model




# 8. RAG Pipeline



Complete flow:




Developer Question

    |

    v

Query Understanding

    |

    v

Generate Query Embedding

    |

    v

Search Knowledge

    |

    v

Rank Results

    |

    v

Build Context

    |

    v

Send To LLM

    |

    v

Generate Answer




# 9. Context Management Strategy



The AI should receive:



## Required Context




Relevant Code

Related Files

Business Rules

Documentation

Dependencies




Not:




Entire Repository




# 10. Token Optimization Strategy



CodeMind reduces tokens using:



## Semantic Retrieval



Find only relevant code.



## Context Compression



Summarize large sections.



## Knowledge Reuse



Store previous understanding.



## AI Memory



Remember:



- Previous explanations
- Architecture decisions
- Developer feedback



# 11. AI Memory Architecture



Memory types:



## Short Term Memory



Current conversation.



Example:




Previous messages




---



## Repository Memory



Long-term software knowledge.



Example:




Payment module handles invoices




---



## User Memory



Developer preferences.



Example:




Developer prefers TypeScript examples




# 12. AI Agents



Future architecture:




AI Manager Agent

    |

+------+------+

| |

Analysis Documentation

Agent Agent

| |

Testing Migration

Agent Agent




# 13. AI Safety



AI responses must include:



## Evidence



Example:




Source:

payment.service.ts

Line:

120-150




## Confidence



Example:




Confidence:

92%




## Human Approval



AI should not automatically:


- Change production code
- Modify business rules
- Delete data



# 14. Evaluation Strategy



Measure AI quality:



## Accuracy


Are answers correct?



## Relevance


Did AI retrieve useful context?



## Cost


How many tokens consumed?



## Feedback


Did developers accept answers?



# 15. Future AI Improvements



## Local AI Models



Support:




Llama

Mistral

CodeLlama




Benefits:


- Privacy
- Lower cost
- Enterprise deployment



---



## Agentic Development



AI can:


- Plan changes
- Create patches
- Generate tests
- Update documentation



---



## Self Improving Retrieval



System learns:


- Better chunks
- Better ranking
- Better context selection



# 16. Consequences



## Positive



### Lower Token Cost


Only relevant context is sent.



### Better Accuracy


AI receives meaningful information.



### Model Flexibility


Providers can change.



### Enterprise Friendly


Private deployment possible.



---



## Negative



### More Components


Requires:


- Retrieval system
- Embedding system
- Prompt management



### Initial Complexity


More engineering effort than simple chatbot.



### Evaluation Required


AI quality must continuously improve.



# 17. Final Decision Summary



| Area | Decision |
|---|---|
| AI Pattern | RAG |
| Model Access | Provider Abstraction |
| Context | Retrieval Based |
| Memory | Multi-layer Memory |
| Embeddings | pgvector |
| Agents | Future |
| Fine Tuning | Future |



# Conclusion



CodeMind will not be a simple AI chatbot.


It will be an AI software intelligence system built on:



Repository Understanding

    +

Knowledge Retrieval

    +

LLM Reasoning

    +

Evidence Based Answers




Final decision:


"Build intelligence first, then use AI to reason over that intelligence."