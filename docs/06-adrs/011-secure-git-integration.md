# ADR-011: Secure Git Integration

## Status

Accepted

## Date

2026-08-01

## Context

CodeMind must inspect repositories that may contain untrusted source code and
Git metadata. Git operations can consume substantial time and output, access
the network and filesystem, invoke credential helpers, and run hooks if they
are not constrained.

The repository API must never allow callers to choose filesystem destinations
or convert user input into shell commands.

## Decision

CodeMind uses the installed Git executable through Node.js `execFile` and
argument arrays. It does not invoke a shell.

The first implementation supports:

- Credential-free `https://github.com/...` repositories
- Local repositories only when they resolve inside
  `GIT_LOCAL_REPOSITORIES_ROOT`
- Internally derived workspaces under
  `<GIT_WORKSPACE_ROOT>/<organizationId>/<repositoryId>`
- Clone without checkout
- Fetch/prune updates
- Default branch, commit SHA, and remote branch discovery

Every command:

- Disables system and global Git configuration
- Removes inherited `GIT_*` variables before setting controlled values
- Disables credential helpers and interactive prompts
- Redirects hooks to the operating system null device
- Disables SSH, HTTP, Git, and external protocols
- Enables HTTPS only for validated GitHub sources
- Enables the file protocol only for a validated local source
- Enforces timeout and captured-output limits

Local source paths and workspace parent directories are canonicalized before
containment checks. This prevents `..` and symlink escapes. Failed clones are
removed only from a verified, service-created temporary directory.

Repository registration does not clone automatically. Milestone 2.5 exposes
explicit branch listing and synchronization endpoints. Synchronization
requires `repository.index`, derives the workspace identity from the
authenticated organization and repository record, and applies a stricter
endpoint rate limit.

The first synchronization clones; later synchronizations fetch and prune.
Requests for the same repository are coalesced within one Node.js process. The
resulting branch changes and detected default branch are persisted in one
short database transaction while holding a tenant-scoped repository row lock.
Git network and filesystem work happens before that transaction.

## Alternatives considered

### Shell commands

Rejected because quoting and interpolation errors could produce command
injection vulnerabilities.

### A Git wrapper dependency

Deferred. The required operation set is small, and direct process execution
keeps argument handling and security policies explicit.

### Arbitrary HTTPS Git hosts

Deferred until CodeMind has an outbound network policy that safely handles
DNS resolution, redirects, private address ranges, and provider credentials.

### Checkout during clone

Rejected for this milestone. A no-checkout clone avoids materializing
untrusted working-tree content and prevents checkout-related behavior before
the indexing sandbox is designed.

## Consequences

- The runtime image must include a supported Git executable.
- GitHub public HTTPS and development local repositories work without new npm
  dependencies.
- Private repositories require a future credential-reference design.
- GitLab, Bitbucket, generic hosts, working-tree checkout, and indexing remain
  future work.
- A shared or durable workspace strategy is required before horizontally
  scaling Git workers.
- The in-process synchronization lock does not coordinate multiple replicas;
  durable jobs or a distributed lock are required before multi-instance Git
  execution.
