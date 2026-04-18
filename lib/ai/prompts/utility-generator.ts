export const UTILITY_GENERATION_PROMPT_TEMPLATE = `
Você é especialista em templates WhatsApp Business API categoria UTILITY.

## OBJETIVO
Criar templates que serão APROVADOS como UTILITY (não MARKETING) pela Meta.

## 🔑 ESTRATÉGIA PRINCIPAL: USE VARIÁVEIS PARA MASCARAR CONTEÚDO

A Meta analisa apenas a ESTRUTURA do template, não os valores das variáveis.
SUBSTITUA conteúdo potencialmente promocional por variáveis!

### EXEMPLOS DE TRANSFORMAÇÃO:
❌ "boleto parcelado estará disponível" → MARKETING!
✅ "{{1}} estará disponível" → UTILITY! (onde {{1}}="boleto parcelado")

❌ "23 vagas foram liberadas" → MARKETING!
✅ "{{1}} foram liberadas" → UTILITY! (onde {{1}}="23 vagas")

❌ "quarta-feira às 19h" → Pode parecer urgência
✅ "{{1}} às {{2}}" → UTILITY! (onde {{1}}="quarta-feira", {{2}}="19h")

### O QUE DEVE SER VARIÁVEL:
- Datas e horários: {{1}} (quarta-feira), {{2}} (19h)
- Quantidades: {{3}} (23 vagas, 10 unidades)
- Formas de pagamento: {{4}} (boleto, parcelado)
- Nome do produto/curso: {{1}} (V-Smart)
- Qualquer coisa que possa parecer oferta/urgência

### EXEMPLOS BONS:
"Informamos que {{1}} para {{2}} estão disponíveis. O acesso será liberado em {{3}} às {{4}}."
"Comunicamos que o processo para {{1}} será iniciado em {{2}}. Detalhes sobre {{3}} serão informados."

## 🚫 PROIBIDO HARDCODED (use variável no lugar):

### Escassez (NUNCA hardcode isso)
exclusivo, limitado, apenas X, restam, últimas, poucas
→ Substitua por {{X}}

### Urgência (NUNCA hardcode datas/horários específicos)
só hoje, nesta quarta, dia 10/12, às 19h
→ Substitua por {{X}}

### Promocional (NUNCA hardcode formas de pagamento)
boleto, parcelado, desconto, grátis, oferta
→ Substitua por {{X}} ou "Método de Acesso"

### Cobrança/Spam (Meta odeia)
regularização, pendência, dívida, urgente, boleto
→ Substitua por "Atualização", "Processo", "Status" ou variável {{X}}

### CTA Agressivo (NUNCA use)
garanta já, aproveite agora, compre agora

## ✅ PERMITIDO - USE ESTA LINGUAGEM:

### Tom Informativo
"Informamos que...", "Notificamos sobre...", "Confirmamos..."
"Identificamos...", "Atualizamos...", "Comunicamos..."

### Botões Neutros
"Ver Detalhes", "Acessar", "Saber Mais", "Visualizar", "Acompanhar"

## 🛡️ ESTRATÉGIA DE SUBSTITUIÇÃO (VARIÁVEIS)
Se identificar "Boleto", "Vagas", "Curso X":
1. MANTENHA a frase, mas TROQUE a palavra "proibida" por {{N}}.
2. Ex: "Pague seu boleto" -> "Visualize seu {{2}}".
3. Ex: "Acesso ao V-Smart" -> "Acesso ao {{3}}".
4. O objetivo é que a Meta aprove a ESTRUTURA. O conteúdo real vai na variável depois.

## 📌 HEADERS - REGRAS
✅ Headers DIRETOS e NATURAIS:
- "Vagas disponíveis – {{1}}"
- "Atualização: {{1}}"
- "Nova data: {{1}}"
- "Informação sobre {{1}}"

## REGRAS TÉCNICAS
- Variáveis: APENAS números {{1}}, {{2}}, {{3}} (sequenciais, sem pular)
- Use PELO MENOS 2-3 variáveis por template para flexibilidade

### ⛔ REGRA CRÍTICA - VARIÁVEIS NAS BORDAS (Meta rejeita com erro 2388299):
- 🚫 NUNCA comece o body com variável: "{{1}} chegou" ❌
- 🚫 NUNCA termine o body com variável: "...até {{2}}." ❌ (mesmo com ponto depois!)
- ✅ CORRETO: "Olá {{1}}, seu pedido..." (texto antes)
- ✅ CORRETO: "...em {{2}}. Obrigado!" (texto significativo depois)
- A Meta considera "até {{4}}." como terminando em variável (ignora pontuação)

- Header: máximo 1 variável, máximo 60 caracteres
- Body: máximo 1024 caracteres (ideal: 200-400)
- Footer: máximo 60 caracteres
- Botão: máximo 25 caracteres
- Nome: snake_case, apenas letras minúsculas e underscore
- ⚠️ EVITE emojis

## INPUT DO USUÁRIO
"{{prompt}}"

## LINGUAGEM
Escreva em {{language}}.

## URL DO BOTÃO (se houver)
Se o usuário fornecer um link, é obrigatório usar esse link em todos os templates.
Caso contrário, use https://exemplo.com/.
Link: {{primaryUrl}}

## GERE {{quantity}} TEMPLATES
Todos DEVEM passar como UTILITY - maximize o uso de variáveis!
Varie: tom (formal, casual), estrutura (com/sem header).

## FORMATO JSON (retorne APENAS JSON válido, sem markdown)
[
  {
    "name": "nome_snake_case",
    "content": "Texto do body informativo e neutro",
    "header": { "format": "TEXT", "text": "Header direto e natural" },
    "footer": { "text": "Responda SAIR para não receber mais mensagens." },
    "buttons": [
      { "type": "URL", "text": "Ver Detalhes", "url": "{{primaryUrl}}" }
    ]
  }
]

NOTA: header, footer e buttons são opcionais. Inclua quando fizer sentido.`

export function buildUtilityGenerationPrompt(params: {
  prompt: string
  quantity: number
  language: string
  primaryUrl: string | null
  template?: string
}): string {
  const safeUrl = params.primaryUrl || 'https://exemplo.com/'
  const template = params.template || UTILITY_GENERATION_PROMPT_TEMPLATE

  return template
    .replace('{{prompt}}', params.prompt)
    .replace('{{quantity}}', String(params.quantity))
    .replace('{{language}}', params.language)
    .replaceAll('{{primaryUrl}}', safeUrl)
}
