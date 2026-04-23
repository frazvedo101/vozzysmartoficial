-- Fix search_embeddings: add extensions to search_path so the <=> operator
-- (installed via pgvector in the extensions schema) is resolvable.

CREATE OR REPLACE FUNCTION public.search_embeddings(
  query_embedding extensions.vector,
  agent_id_filter uuid,
  expected_dimensions integer,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 5
)
RETURNS TABLE(id uuid, content text, similarity double precision, metadata jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity,
    e.metadata
  FROM ai_embeddings e
  WHERE e.agent_id = agent_id_filter
    AND e.dimensions = expected_dimensions
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
