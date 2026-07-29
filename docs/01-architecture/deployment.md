Deployment Architecture


# Development Environment



Developer Machine

    |

    v

Docker Compose

    |

| | | |

v v v v

NestJS PostgreSQL Redis Qdrant

             Neo4j


# Production Environment



Load Balancer

   |

   v

API Instances

   |

   |

| | |

Database Queue Storage



# Services


## API Service

Technology:

NestJS


Responsibilities:

- API requests
- Authentication
- Business operations


---

## Worker Service


Responsibilities:

- Indexing
- Parsing
- Embeddings
- Documentation generation


---

## Database


PostgreSQL:

Stores:

- Users
- Repository metadata
- Code metadata


Qdrant:

Stores:

- Embeddings


Neo4j:

Stores:

- Relationships


---

# CI/CD



Git Push

|

v

GitHub Actions

|

v

Tests

|

v

Docker Build

|

v

Deployment