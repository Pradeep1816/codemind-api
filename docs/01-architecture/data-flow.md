# Data Flow Architecture

## Overview

This document explains how data moves through CodeMind from repository ingestion to AI response.

The main data pipeline:

Repository
    |
    v
Repository Scanner
    |
    v
File Indexer
    |
    v
Parser Engine
    |
    v
Static Analysis
    |
    v
Knowledge Builder
    |
    v
Storage Layer
    |
    v
Search Engine
    |
    v
AI Context Builder
    |
    v
AI Agent


---

# 1. Repository Import Flow

## Input

Developer connects a repository.

Example:
