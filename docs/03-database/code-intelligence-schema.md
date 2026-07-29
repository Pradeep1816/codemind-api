his is one of the most important database documents in CodeMind.

The Repository Schema answers:

"Which repository are we analysing?"

The Code Intelligence Schema answers:

"What exists inside this software system?"

This is the layer where raw source code becomes structured knowledge.

# Code Intelligence Schema


## Document Information

Module: Code Intelligence

Document: Code Intelligence Schema

Status: Draft

Version: 1.0

Owner: CodeMind Engineering Team



# 1. Overview


The Code Intelligence Schema stores the structural understanding
of source code extracted by the Parser Module.


It converts:


Raw Source Code


into:



Files

Classes

Functions

Methods

Interfaces

Variables

Imports

Relationships




This information becomes the foundation for:


- Code search
- Dependency analysis
- Impact analysis
- Documentation generation
- AI explanations



# 2. Responsibilities


The schema stores:


- Source code entities
- Entity hierarchy
- Code symbols
- Language information
- AST metadata
- Dependencies
- References
- Code relationships



# 3. Data Flow




Repository Files

    |

    v

Parser Module

    |

    v

Code Intelligence Database

    |

    v

Analysis Module

    |

    v

Knowledge Engine




# 4. Entity Relationship Overview




repository_files

    |


    v

code_entities

    |


    +-------------+

    |             |


    v             v

code_symbols code_relationships




# 5. Code Entity Table



Table:




code_entities




Purpose:


Stores all identifiable code elements.



Examples:



Class

Function

Method

Interface

Enum

Variable

Component

Module




Schema:



```sql
code_entities


id

repository_id

file_id

parent_id

name

entity_type

language

visibility

start_line

end_line

signature

description

metadata

created_at

updated_at

6. Entity Fields Explanation
id

Unique identifier.

Type:

UUID

repository_id

Links entity to repository.

Example:

smw-api2

     |

     +-- InvoiceService

file_id

Source location.

Example:

src/invoice/invoice.service.ts

parent_id

Supports hierarchy.

Example:

InvoiceService


    |

    +-- createInvoice()


    |

    +-- cancelInvoice()

name

Entity name.

Examples:

PaymentService

createPayment

calculateTax

entity_type

Possible values:

CLASS

FUNCTION

METHOD

INTERFACE

ENUM

VARIABLE

MODULE

COMPONENT

visibility

Examples:

PUBLIC

PRIVATE

PROTECTED

INTERNAL

start_line / end_line

Source location.

Example:

Lines:

120 - 180


Used for:

Navigation
Evidence
AI references
signature

Stores declaration.

Example:

createInvoice(
 customerId:string,
 amount:number
)

metadata

Flexible JSON storage.

Example:

{
 "decorators":[
   "@Injectable"
 ],
 "async":true
}

7. Code File Intelligence Table

Table:

code_files


Purpose:

Stores analysed file information.

Schema:

code_files


id

repository_file_id

ast_status

complexity_score

line_count

language_version

imports_count

exports_count

created_at

updated_at

8. Symbol Table

Table:

code_symbols


Purpose:

Stores searchable identifiers.

Examples:

InvoiceService

PaymentRepository

calculateAmount

USER_ROLE


Schema:

code_symbols


id

entity_id

symbol_name

symbol_type

reference_count

created_at


Useful for:

Fast lookup
Autocomplete
Search
9. Import Table

Table:

code_imports


Purpose:

Stores import relationships.

Example:

import {
 PaymentService
}
from "./payment.service";


Schema:

code_imports


id

source_entity_id

import_path

import_name

target_entity_id

created_at


Relationship:

InvoiceService


       imports


PaymentService

10. Code Relationship Table

Table:

code_relationships


Purpose:

Stores connections between code entities.

Examples:

Class calls Method

Service uses Repository

Controller uses Service

Function calls Function


Schema:

code_relationships


id

source_entity_id

target_entity_id

relationship_type

confidence

metadata

created_at

11. Relationship Types

Supported:

CALLS

Example:

createInvoice()

       calls

validatePayment()

DEPENDS_ON

Example:

InvoiceService

       depends on

PaymentService

IMPLEMENTS

Example:

PaymentService

       implements

PaymentInterface

EXTENDS

Example:

AdminService

       extends

BaseService

IMPORTS

Example:

invoice.module.ts

       imports

payment.module.ts

12. AST Metadata Storage

The parser may extract AST information.

Stored as JSON:

Example:

{
 "nodeType":"ClassDeclaration",

 "decorators":[
   "Injectable"
 ],

 "methods":5,

 "properties":10

}


Purpose:

Advanced analysis
Refactoring support
Code intelligence
13. Function Complexity Data

Table:

code_metrics


Purpose:

Store code quality information.

Schema:

code_metrics


id

entity_id

cyclomatic_complexity

lines_of_code

parameter_count

dependency_count

created_at


Example:

PaymentService.processPayment


Complexity:

18


Risk:

High

14. Code Analysis Status

Table:

code_analysis_status


Tracks processing.

Schema:

code_analysis_status


id

file_id

parser_status

analysis_status

error_message

completed_at


Statuses:

PENDING

PARSING

ANALYZING

COMPLETED

FAILED

15. Entity Relationships

Repository File:

RepositoryFile


       1


       |


       *


CodeEntity


Code Entity:

Class


       1


       |


       *


Methods


Code Entity:

Entity A


       |

       v


Relationship


       |

       v


Entity B

16. TypeORM Design Example

Example:

@Entity()
export class CodeEntity {


 @PrimaryGeneratedColumn("uuid")
 id:string;


 @Column()
 name:string;


 @Column({
  type:"enum",
  enum:EntityType
 })
 entityType:EntityType;


 @ManyToOne(
 ()=>RepositoryFile
 )
 file:RepositoryFile;


 @ManyToOne(
 ()=>CodeEntity
 )
 parent:CodeEntity;


}

17. Index Strategy

Important indexes:

code_entities:

repository_id

file_id

name

entity_type


code_relationships:

source_entity_id

target_entity_id

relationship_type


code_symbols:

symbol_name

entity_id

18. Query Examples
Find PaymentService
SELECT *

FROM code_entities

WHERE name='PaymentService';

Find dependencies
SELECT *

FROM code_relationships

WHERE source_entity_id='123';

Find all methods inside class
SELECT *

FROM code_entities

WHERE parent_id='class-id';

19. Impact Analysis Usage

Question:

What breaks if PaymentService changes?


Query:

PaymentService


       |

       v


code_relationships


       |

       v


Affected Entities


Result:

InvoiceService

RefundService

SubscriptionService

20. Future Enhancements
Multi Language AST Support

Support:

TypeScript

Java

Python

Go

PHP

AI Code Understanding

Store:

Function Summary

Class Purpose

Business Meaning

Refactoring Intelligence

Detect:

Duplicate Code

High Complexity

Unused Components

Summary

The Code Intelligence Schema transforms source code into structured software knowledge.

It provides the foundation for:

Search
Dependency analysis
Impact analysis
Documentation generation
AI reasoning

Core principle:

"CodeMind does not store code only; it stores understanding of code."