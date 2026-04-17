-- Bucket para armazenar mídias do inbox (imagens, vídeos, áudios, documentos)
-- Execute no Supabase Dashboard → SQL Editor, ou via CLI: supabase db push

-- Criar bucket público para mídias do inbox
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-media',
  'inbox-media',
  true,
  104857600, -- 100MB max
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/3gpp', 'video/quicktime',
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Política: leitura pública (arquivos são servidos publicamente)
CREATE POLICY "inbox_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inbox-media');

-- Política: service role pode inserir/deletar (uploads via API com service key)
CREATE POLICY "inbox_media_service_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'inbox-media');

CREATE POLICY "inbox_media_service_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'inbox-media');
