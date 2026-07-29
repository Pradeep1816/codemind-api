Parser Module Design


## Document Information

Module: Parser Engine

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Parser Module is responsible for understanding source code structure.

It transforms raw source files into structured representations that can be analysed by other CodeMind modules.


Input:



Source Code Files



Output:



Classes

Functions

Methods

Variables

Imports

Interfaces

Decorators

Relationships




The Parser Module is the foundation for:

- Dependency analysis
- Call graph generation
- Knowledge extraction
- Business rule discovery
- Documentation generation



---

# 2. Goals


The Parser Module should:


- Understand programming language syntax
- Extract meaningful code structures
- Support multiple programming languages
- Provide a consistent parsing interface
- Generate machine-readable metadata
- Handle large codebases efficiently



---

# 3. Non Goals


The Parser Module should NOT:


- Understand business rules
- Generate AI summaries
- Create embeddings
- Decide architecture quality


Those belong to:



Analysis Module

Business Engine

AI Module




---

# 4. Parser Architecture


CodeMind uses a plugin-based parser architecture.


                 Parser Engine


                       |

          ----------------------------

          |            |             |

          v            v             v


    TypeScript       Java        Python

    Parser           Parser      Parser


Each language parser follows the same contract.


Benefits:


- Add new languages easily
- Independent development
- Replace parser technology
- Consistent output format



---

# 5. Parsing Pipeline


Complete flow:



Indexed File

 |

 v

Language Detection

 |

 v

Select Parser

 |

 v

Generate AST

 |

 v

Extract Metadata

 |

 v

Store Parsed Result




---

# 6. Abstract Syntax Tree (AST)


## What is AST?


An Abstract Syntax Tree is a structured representation of source code.


Example:


Source:


```typescript
class UserService {

 createUser(){

 }

}


AST:

ClassDeclaration

      |

      +---- Name

      |       UserService

      |

      +---- Method

              createUser()


The parser works with AST instead of plain text.

7. TypeScript Parser

Initial CodeMind implementation focuses on TypeScript.

Technology options:

Option 1: ts-morph

Advantages:

TypeScript native
Easy API
Built on TypeScript compiler API
Good metadata extraction

Example:

const project = new Project();

const sourceFile =
project.addSourceFileAtPath(
"invoice.service.ts"
);

Option 2: Tree-sitter

Advantages:

Multi-language support
Fast parsing
Incremental parsing

Future architecture can combine:

TypeScript

    |

 ts-morph


Other Languages

    |

Tree-sitter

8. Parser Interface Design

All parsers implement the same interface.

Example:

interface CodeParser {


supports(language:string): boolean;


parse(
 file: ParsedFile
): ParseResult;


}


Example implementations:

TypeScriptParser

JavaParser

PythonParser

9. Language Detection

Before parsing:

File

 |

 v

Extension Detection

 |

 v

Language Resolver

 |

 v

Parser Selection


Example:

invoice.service.ts

        |

        v

TypeScriptParser


Supported mapping:

Extension	Language
.ts	TypeScript
.js	JavaScript
.java	Java
.py	Python
.go	Go
10. Metadata Extraction

The parser extracts:

Classes

Example:

class InvoiceService {}


Output:

{
"type":"class",
"name":"InvoiceService"
}

Functions

Example:

function calculateTax(){}


Output:

{
"type":"function",
"name":"calculateTax"
}

Methods

Example:

createInvoice()


Output:

{
"class":"InvoiceService",
"method":"createInvoice"
}

Imports

Example:

import {PaymentService}
from './payment';


Output:

{
"source":"./payment",
"import":"PaymentService"
}

Decorators

Important for frameworks like NestJS.

Example:

@Controller('invoice')


Output:

{
"type":"controller",
"name":"invoice"
}

11. Parser Database Model
Files Table
files

id

repository_id

path

language

hash

Classes Table
classes

id

file_id

name

type

visibility

Functions Table
functions

id

file_id

class_id

name

parameters

return_type

Imports Table
imports

id

file_id

source

target

12. Parser Result Example

Input:

@Injectable()

class PaymentService {


processPayment(){

}

}


Output:

{
"class":"PaymentService",

"decorators":[
"Injectable"
],

"methods":[
"processPayment"
]

}

13. Parser Events

Parser publishes events.

FileParsedEvent

Payload:

{
"fileId":"123",
"language":"typescript"
}


Consumers:

Analysis Module

Knowledge Module

14. Error Handling

Possible errors:

Invalid Syntax

Example:

class User {


Action:

Store parsing error

Continue processing

Unsupported Language

Action:

Mark as unsupported

Skip file

Parser Crash

Action:

Retry job

Log failure

Notify system

15. Performance Strategy

Large repositories require optimization.

Incremental Parsing

Only parse changed files.

Example:

Before:

500,000 files


Change:

invoice.service.ts


Process:

1 file

Parallel Processing

Example:

Parser Worker 1

Files 1-100


Parser Worker 2

Files 101-200

Cache AST Results

Store:

File Hash

+

Parsed Result


If hash unchanged:

Reuse Previous Result

16. Module Structure

NestJS:

src/modules/parser/


├── controllers/

├── services/

├── interfaces/

├── adapters/

│
├── typescript/

│
├── java/

│
└── python/


├── ast/

├── extractors/

├── entities/

├── events/

└── parser.module.ts

17. Dependencies

Parser Module depends on:

Indexing Module

Storage Module

Queue Module


Parser Module should NOT depend on:

AI Module

Search Module

Business Engine

18. Future Enhancements
Multi Language Support

Add:

Java
Python
C#
Go
PHP
Ruby
Semantic Parsing

Understand:

Controller

Service

Repository

Entity

Framework Detection

Examples:

NestJS

Spring Boot

Laravel

Django

Summary

The Parser Module transforms source code into structured information.

Its responsibility:

"Understand what exists inside the code."

It creates the foundation for:

Dependency analysis
Knowledge graphs
Business understanding
AI context generation