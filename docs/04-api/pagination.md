This document defines how CodeMind handles large datasets.

Pagination is critical because CodeMind can contain:

Thousands of repositories
Millions of files
Millions of symbols
Large search results
Knowledge graph nodes
AI-generated documents

The goal:

"Never load unlimited data into memory or API responses."

# CodeMind Pagination API


## 1. Introduction


Pagination controls how large collections of data are returned
from CodeMind APIs.


Examples:




Repositories

Files

Symbols

Search Results

Knowledge Nodes

Jobs

Documents




Without pagination:



Request

|

v

Return millions of records

|

v

Memory overflow

Performance failure




With pagination:



Request

|

v

Return limited data

|

v

Client requests next page




# 2. Pagination Goals


The pagination system must provide:


## Performance


Prevent:

- Large database scans
- High memory usage
- Slow responses



## Consistency


All APIs should follow the same format.



## Scalability


Support:

- Small projects
- Enterprise repositories
- Millions of records



# 3. Supported Pagination Methods



CodeMind supports two pagination strategies:



## Offset Pagination


Used for:


- Admin screens
- Small datasets
- User lists



Example:



GET /api/v1/repositories?page=2&limit=20




---



## Cursor Pagination


Used for:


- Large repositories
- Search results
- Files
- Symbols
- Knowledge graph



Example:



GET /api/v1/files?cursor=abc123&limit=100




# 4. Offset Pagination



## Request



Example:




GET /api/v1/repositories?page=1&limit=20




Parameters:



| Parameter | Description |
|-|-|
| page | Page number |
| limit | Number of records |



Example:




page=1

limit=20




means:




Return first 20 records




# 5. Offset Response Format



Example:



```json
{
 "success":true,
 "data":[
   {
    "id":"repo_1",
    "name":"payment-service"
   }
 ],
 "pagination":{
   "page":1,
   "limit":20,
   "total":250,
   "totalPages":13
 }
}
6. Cursor Pagination

Cursor pagination is preferred for large datasets.

Example:

GET /api/v1/files?limit=100


Response:

{
 "success":true,
 "data":[
   {
    "path":"src/payment.ts"
   }
 ],
 "pagination":{
   "nextCursor":"eyJpZCI6MTAwfQ",
   "hasMore":true
 }
}

Next request:

GET /api/v1/files?cursor=eyJpZCI6MTAwfQ&limit=100

7. Why Cursor Pagination?

Offset problem:

Example:

SELECT *

FROM files

LIMIT 100

OFFSET 500000


Problems:

Database scans unnecessary rows
Slower with large offsets
Performance decreases over time

Cursor approach:

WHERE id > last_seen_id

LIMIT 100


Benefits:

Faster queries
Better scaling
Stable results
8. Pagination Standards

Default limit:

20


Maximum limit:

100


Example:

?page=1&limit=20


Invalid:

?limit=10000


Response:

{
 "code":"INVALID_LIMIT",
 "message":"Maximum limit is 100"
}
9. Repository Pagination

Endpoint:

GET /api/v1/repositories


Supports:

page

limit

status

createdAt


Example:

GET /repositories?page=1&limit=20

10. File Pagination

Large repositories may contain millions of files.

Endpoint:

GET /api/v1/repositories/{id}/files


Use cursor pagination:

GET /files?

cursor=abc

&limit=100


Response:

{
"data":[
 {
  "path":"src/auth.service.ts",
  "language":"typescript"
 }
],

"pagination":{
 "nextCursor":"xyz",
 "hasMore":true
}
}
11. Symbol Pagination

Symbols include:

Classes
Functions
Interfaces
Methods

Endpoint:

GET /api/v1/repositories/{id}/symbols


Example:

GET /symbols?cursor=abc&limit=200

12. Search Pagination

Search results can become large.

Endpoint:

GET /api/v1/search/code


Example:

?q=payment

&page=1

&limit=20


Response:

{
"results":[
 {
  "file":"payment.service.ts",
  "score":0.92
 }
],

"pagination":{
 "hasMore":true
}
}
13. Knowledge Graph Pagination

Knowledge graph may contain:

Business Rules

Modules

Dependencies

Relationships


Endpoint:

GET /api/v1/knowledge/nodes


Cursor pagination recommended.

14. Sorting With Pagination

Pagination should support sorting.

Example:

GET /repositories?

sort=createdAt

&order=desc


Allowed fields:

createdAt

updatedAt

name

15. Filtering With Pagination

Example:

GET /repositories?


status=active


&page=1


&limit=20


Common filters:

status

language

framework

createdDate

16. Pagination Consistency

Problem:

Data changes while user is paging.

Example:

Page 1 loaded


New repository created


Page 2 requested


Solution:

Cursor pagination provides more stable results.

17. API Response Metadata

Every paginated response should include:

{
"pagination":{
 "limit":20,
 "hasMore":true,
 "nextCursor":"abc123"
}
}
18. Database Considerations

Pagination queries must use indexes.

Example:

Good:

SELECT *

FROM repositories

ORDER BY created_at

LIMIT 20;


Required index:

INDEX(created_at)

19. NestJS Implementation Strategy

Common pagination DTO:

class PaginationQueryDto {

 limit:number;

 cursor?:string;

}

Response wrapper:

{
 data:[],
 pagination:{
   nextCursor:"",
   hasMore:true
 }
}
20. Pagination Security

Prevent abuse:

Rules:

Maximum limit

+

Query timeout

+

Rate limiting


Example:

Blocked:

GET /files?limit=999999

21. Pagination Strategy Summary
Resource	Strategy
Users	Offset
Organizations	Offset
Repositories	Offset/Cursor
Files	Cursor
Symbols	Cursor
Search Results	Cursor
Knowledge Graph	Cursor
Jobs	Offset
Conclusion

CodeMind uses a hybrid pagination strategy.

Small datasets:

Offset Pagination


Large intelligence datasets:

Cursor Pagination


Final principle:

"Pagination is not only a UI feature; it is a scalability requirement."