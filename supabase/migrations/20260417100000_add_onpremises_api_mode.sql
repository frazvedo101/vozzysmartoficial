-- Adiciona configurações para suporte a On-Premises API e modo de coexistência
-- api_mode: 'cloud' | 'on_premises' | 'coexistence'
INSERT INTO settings (key, value) VALUES
  ('api_mode', 'cloud'),
  ('onpremises_base_url', ''),
  ('onpremises_jwt_token', ''),
  ('onpremises_webhook_secret', '')
ON CONFLICT (key) DO NOTHING;
