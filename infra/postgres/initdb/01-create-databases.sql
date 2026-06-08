CREATE USER vendure WITH PASSWORD 'vendure';
CREATE DATABASE vendure_db OWNER vendure;

CREATE USER svet WITH PASSWORD 'svet';
CREATE DATABASE svet_ai_db OWNER svet;

\connect svet_ai_db
CREATE EXTENSION IF NOT EXISTS vector;

