-- Migration 045: Template Library
CREATE TABLE IF NOT EXISTS template_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('vendas', 'suporte', 'cobranca', 'pos_venda', 'agendamento', 'boas_vindas')),
  tags TEXT[] DEFAULT '{}',
  variables TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_library_category ON template_library(category);
CREATE INDEX IF NOT EXISTS idx_template_library_is_default ON template_library(is_default);

-- Seed: Templates padrão
INSERT INTO template_library (title, content, category, tags, variables, is_default) VALUES

-- VENDAS (3+)
('Abordagem Inicial', 'Olá {{nome}}, tudo bem? 😊 Notei seu interesse em nossos serviços e gostaría de apresentar uma solução personalizada para você. Posso te chamar agora?', 'vendas', ARRAY['abordagem','prospecto'], ARRAY['nome'], true),
('Proposta Comercial', 'Oi {{nome}}! Preparei uma proposta especial para você: {{produto}} por apenas R$ {{valor}}. Essa oferta é válida até {{data}}. O que acha?', 'vendas', ARRAY['proposta','oferta'], ARRAY['nome','produto','valor','data'], true),
('Follow-up de Interesse', 'Olá {{nome}}, passando para saber se teve a oportunidade de analisar nossa proposta. Posso esclarecer alguma dúvida?', 'vendas', ARRAY['followup','interesse'], ARRAY['nome'], true),
('Desconto Especial', 'Oi {{nome}}! Tenho uma novidade: consegui aprovar um desconto especial de {{desconto}}% para você. Válido somente hoje! Vamos fechar?', 'vendas', ARRAY['desconto','urgencia'], ARRAY['nome','desconto'], true),

-- SUPORTE (3+)
('Protocolo de Atendimento', 'Obrigado pelo contato! Seu atendimento foi registrado com protocolo {{protocolo}}. Nossa equipe já está analisando sua solicitação e retornaremos em até {{prazo}}.', 'suporte', ARRAY['protocolo','abertura'], ARRAY['protocolo','prazo'], true),
('Solicitação Resolvida', 'Olá {{nome}}, informamos que sua solicitação {{protocolo}} foi resolvida com sucesso! Caso precise de algo mais, estamos à disposição. 😊', 'suporte', ARRAY['resolucao','encerramento'], ARRAY['nome','protocolo'], true),
('Aguardando Informações', 'Oi {{nome}}, para prosseguirmos com seu atendimento precisamos das seguintes informações: {{informacoes}}. Assim que enviar, daremos continuidade!', 'suporte', ARRAY['informacoes','pendente'], ARRAY['nome','informacoes'], true),

-- COBRANÇA (3+)
('Lembrete de Vencimento', 'Olá {{nome}}, sua fatura de R$ {{valor}} vence em {{data}}. Clique aqui para pagar: {{link}} 💳', 'cobranca', ARRAY['fatura','vencimento'], ARRAY['nome','valor','data','link'], true),
('Fatura em Atraso', 'Oi {{nome}}, identificamos que sua fatura de R$ {{valor}} está em atraso desde {{data_vencimento}}. Para regularizar, acesse: {{link}}', 'cobranca', ARRAY['atraso','inadimplencia'], ARRAY['nome','valor','data_vencimento','link'], true),
('Confirmação de Pagamento', 'Olá {{nome}}, confirmamos o recebimento do seu pagamento de R$ {{valor}} realizado em {{data}}. Obrigado! 🎉', 'cobranca', ARRAY['confirmacao','pagamento'], ARRAY['nome','valor','data'], true),

-- PÓS-VENDA (3+)
('Pesquisa de Satisfação', 'Olá {{nome}}, esperamos que esteja satisfeito(a) com {{produto}}! Poderia nos dar uma nota de 1 a 10? Seu feedback é muito importante para nós. 🌟', 'pos_venda', ARRAY['satisfacao','nps'], ARRAY['nome','produto'], true),
('Oferta de Upsell', 'Oi {{nome}}, que bom ter você conosco! Como cliente especial, você tem acesso antecipado à nossa nova solução {{produto_novo}}. Quer saber mais?', 'pos_venda', ARRAY['upsell','fidelidade'], ARRAY['nome','produto_novo'], true),
('Aniversário do Cliente', 'Parabéns, {{nome}}! 🎉 Em comemoração ao seu aniversário, preparamos um presente especial: {{presente}}. Aproveite!', 'pos_venda', ARRAY['aniversario','fidelidade'], ARRAY['nome','presente'], true),

-- AGENDAMENTO (3+)
('Confirmação de Agendamento', 'Olá {{nome}}, confirmando seu agendamento para {{data}} às {{hora}} com {{responsavel}}. Local: {{local}}. Qualquer dúvida, é só chamar!', 'agendamento', ARRAY['confirmacao','agenda'], ARRAY['nome','data','hora','responsavel','local'], true),
('Lembrete 24h', 'Oi {{nome}}, lembrando que amanhã, {{data}} às {{hora}}, você tem {{tipo_agendamento}} com a gente! 📅 Confirma sua presença?', 'agendamento', ARRAY['lembrete','24h'], ARRAY['nome','data','hora','tipo_agendamento'], true),
('Reagendamento', 'Olá {{nome}}, precisamos reagendar seu horário do dia {{data_anterior}}. Teria disponibilidade em {{nova_data}} às {{novo_horario}}?', 'agendamento', ARRAY['reagendamento'], ARRAY['nome','data_anterior','nova_data','novo_horario'], true),

-- BOAS-VINDAS (3+)
('Boas-vindas Novo Cliente', 'Olá {{nome}}, seja muito bem-vindo(a)! 🎉 É um prazer tê-lo(a) como cliente. Estou aqui para qualquer dúvida sobre {{produto}}. Como posso ajudar?', 'boas_vindas', ARRAY['boas-vindas','novo-cliente'], ARRAY['nome','produto'], true),
('Onboarding Passo 1', 'Oi {{nome}}! Para começar, aqui estão os primeiros passos: 1️⃣ {{passo1}} 2️⃣ {{passo2}} 3️⃣ {{passo3}}. Ficou alguma dúvida?', 'boas_vindas', ARRAY['onboarding','primeiros-passos'], ARRAY['nome','passo1','passo2','passo3'], true),
('Apresentação do Suporte', 'Olá {{nome}}, meu nome é {{agente}} e serei seu ponto de contato aqui na {{empresa}}. Estou disponível de {{horario}} para te atender. 😊', 'boas_vindas', ARRAY['apresentacao','suporte'], ARRAY['nome','agente','empresa','horario'], true);
