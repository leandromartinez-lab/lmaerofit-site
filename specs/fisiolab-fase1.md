# Spec — FisioLab Fase 1 (LMAeroFit Pré-Temporada)

**Origem:** `LMAeroFit_PreTemporada_Briefing.md` + `FisioLab_Briefing_Reparos.md` (reparos testador-qa) + decisões 27/06/2026.
**Decisão de execução:** evoluir o **Physio Lab existente** → FisioLab no lugar (não construir do zero). Client-side, sem backend.
**NÃO começar a construir antes de esta spec ser aprovada.**

---

## Objetivo (1 frase)
Transformar o Physio Lab no **FisioLab** — o cadastro fisiológico central do atleta — que lê o dado que o atleta tem (nada, FC, ou FC+α1) e sempre entrega zonas individualizadas com selo de confiança, um Cartão de Zonas para colar no Garmin/TrainingPeaks/Intervals.icu, e um perfil exportável que guarda a evolução das zonas ao longo da temporada — tudo no navegador, nada sobe a servidor.

---

## Requisitos (cada um testável)

### A. Entrada progressiva e roteamento (reparo GRAVE #2 e #6 do testador-qa)
- **R1.** A tela abre na **cara Nível 1**: no máximo 4 campos visíveis de início (idade, peso, sexo, FCmax). Os blocos de Nível 2 (α1) e Nível 3 (laudo CPET) ficam recolhidos atrás de "tenho mais dados" (revelação progressiva). *Verificação: ao abrir em viewport de 360px de largura, a primeira dobra mostra ≤4 campos + 1 ação, sem rolagem horizontal.*
- **R2.** O motor roda **o nível mais profundo que o dado permite** e nunca mostra tela vazia: sem nenhum dado → conduz anamnese; só FC → Nível 1; FC+α1 → Nível 2; laudo CPET → Nível 3 (já existente). *Verificação: para cada um dos 4 estados de entrada, a ferramenta renderiza uma saída útil e não um branco/erro.*
- **R3.** Cada nível **declara explicitamente o que NÃO entrega** e o que destravaria mais profundidade (ex.: "sem limiar medido, estas zonas são estimadas por %FCmax; um teste de 20–30 min libera zonas por LTHR"). *Verificação: a saída de N1 e N2 contém um aviso textual do limite do nível.*

### B. Anamnese guiada (reparo: nunca travar)
- **R4.** Se o atleta não sobe arquivo nem preenche nada e pede para gerar, a ferramenta **conduz uma anamnese mínima**: idade, peso, sexo, FCmax (ou estima), FC repouso (opcional), objetivo, modalidade, histórico de lesão/condição. *Verificação: sem upload, a ferramenta solicita esses campos antes de gerar e gera o perfil básico ao tê-los.*
- **R5.** Se FCmax não for informada, é **estimada por Tanaka (208 − 0,7×idade)**, citada e marcada como **populacional**, com campo editável para o valor real. Fonte exibida: *Tanaka, Monahan & Seals (2001)*. *Verificação: idade 50 → FCmax sugerida 173, selo "populacional", editável.*

### C. Motor Nível 1 — só FC
- **R6.** Com FC e **LTHR** (limiar de FC, informado ou derivado de um esforço de 20–30 min num arquivo) → zonas por **%LTHR** (padrão TrainingPeaks), marcadas **estimado** (ou medido se LTHR vier de teste). *Verificação: LTHR 160 → limites das 5 zonas conferem com a tabela %LTHR documentada na metodologia.*
- **R7.** Sem LTHR, só FCmax → zonas por **%FCmax**, marcadas **populacional/estimado**, com aviso de que não substituem zonas de limiar. *Verificação: o selo de cada zona N1 sem LTHR é populacional/estimado, nunca "medido".*
- **R8.** (Reescopado no loop, iteração 1) A **distribuição de intensidade** (tempo por zona de um arquivo) é entregue pelo **Session Debrief**, não duplicada aqui — o FisioLab *define* as zonas, o Debrief *analisa* as sessões (evita sobreposição apontada na auditoria UX). O N1 traz um **link** para o Session Debrief. *Verificação: a saída do N1 contém o link para o Session Debrief; a distribuição em si é testada no Debrief.*

### D. Motor Nível 2 — FC + DFA α1 (reparo GRAVE #4 e #5)
- **R9.** O Nível 2 **ingere dados de α1 por estágio** (carga ou pace, FC, α1) — exportados de app de HRV (Kubios/Runalyze/HRV Logger) ou inseridos à mão (caminho que já existe no Physio Lab). Detecta **LT1 no cruzamento α1≈0,75** e **LT2 em α1≈0,50**. Cálculo de α1 a partir de RR bruto no navegador é **fora de escopo** (futuro). *Verificação: série de α1 decrescente cruzando 0,75 e 0,50 retorna LT1 e LT2 nos pontos corretos.*
- **R10.** **LT2 por α1 é marcado com confiança MENOR que LT1** (selo distinto + nota de que 0,50 é mais contestado na literatura). *Verificação: na saída, LT1 e LT2 por α1 têm rótulos de confiança diferentes.*
- **R11.** A UI explica o **pré-requisito**: α1 exige RR de **cinta de FC** (não óptico) com correção de artefato; diz como obter (app + cinta). *Verificação: o bloco N2 contém esse aviso de pré-requisito.*
- **R12.** Se o arquivo subido tem FC mas **não tem α1/RR**, a ferramenta diz explicitamente por que o N2 não disparou e como obter o dado — não fica em silêncio. *Verificação: upload de GPX só-FC → mensagem clara "sem batimento-a-batimento; N2 indisponível; faça assim…".*

### E. Selo de confiança
- **R13.** **Todo número** de saída traz selo **medido / estimado / populacional / indisponível**, com a fonte. *Verificação: nenhuma zona, limiar ou métrica aparece sem selo.*

### F. Cartão de Zonas (reparo GRAVE #7)
- **R14.** Gera um **Cartão de Zonas** (tela + exportável) para **Garmin Connect, TrainingPeaks e Intervals.icu**, nas métricas **FC, potência e pace** — cada uma só quando há dado para ela (FC sempre; potência se houver FTP/watts; pace se houver limiar de corrida). *Verificação: atleta só com FC → cartão mostra FC nas 3 plataformas e oculta potência/pace com nota "sem dado".*
- **R15.** Para cada plataforma, o cartão usa o **esquema vigente daquela plataforma** (nº de zonas e base: %LTHR, %FTP, pace/limiar) e traz o **passo a passo de onde colar** cada valor. **O esquema de cada plataforma deve ser confirmado por busca na web no momento da construção** (regras mudam) — sem confirmar, não publicar. *Verificação: o cartão cita, para cada plataforma, o caminho exato de configuração conferido na data da build.*
- **R16.** O cartão **nunca inventa** zona sem base: se a métrica não tem limiar medido/estimado, mostra o estado ("informe LTHR/FTP para liberar") em vez de números. *Verificação: sem FTP, a coluna de potência não exibe watts.*

### G. Persistência + perfil exportável + linha do tempo curada (reparo BLOCKER #1)
- **R17.** O perfil é **persistido localmente** (localStorage) e **exportável como arquivo `.json`** que o atleta baixa e **reimporta** (fonte de verdade portátil entre aparelhos/navegadores). *Verificação: exportar → limpar o navegador → reimportar → o perfil volta idêntico.*
- **R18.** A **linha do tempo das zonas é CURADA, não automática**: o atleta/técnico **registra manualmente** uma entrada (data + tipo [teste/prova/manual] + arquivo/origem + valores), e a ferramenta lista as entradas em ordem e mostra a **evolução das zonas**. **Não** há ingestão automática de todo treino. *Verificação: subir um treino comum não cria entrada na linha do tempo; só a ação "registrar" cria.*
- **R19.** Cada entrada da linha do tempo é **datada e ancorada na origem** (nome do arquivo/descrição), coerente com "sem dado fantasma". *Verificação: toda entrada tem data e origem; nenhuma entrada anônima.*
- **R20.** A regra de rigor é respeitada na UI: **treino comum não atualiza zona** — a ferramenta pode **sinalizar** que a zona talvez tenha mudado (deriva), mas só **atualiza** a partir de um esforço-teste, e quem confirma é o técnico/atleta. *Verificação: a ação de atualizar zona exige confirmação explícita + origem de esforço-teste; sinal sozinho não altera nada.*

### H. Identidade, textos e disclaimer
- **R21.** **Reconciliar a identidade**: a ferramenta passa a se chamar **FisioLab**, rotulada no menu/home como **"Pré-Temporada · FisioLab"**; um card só (atualizar `index.html`, nav, contagem). *Verificação: não existem dois cards/duas identidades; o link aponta para a ferramenta evoluída.*
- **R22.** Colar os três textos de `LMAeroFit_PreTemporada_Textos.md` (Como Funciona, Metodologia/Referências, Disclaimer). Citar **só a ciência pública** (Seiler, Rogers/Gronwald, Brooks/San-Millán) — **nunca a marca comercial**; "estilo INSCYD" não aparece em lugar nenhum da UI. *Verificação: busca por "INSCYD" no HTML/JS da ferramenta retorna zero.*
- **R23.** Confirmar ano/periódico de Brooks & Mercier (1994) e San-Millán & Brooks (2018) por busca antes de publicar (sem dado fantasma no próprio texto de credibilidade). *Verificação: as referências exibidas batem com a fonte conferida na build.*
- **R24.** Manter o que já funciona no Physio Lab (Nível 3/CPET, energia/combustível, parser PDF, selo, handoff `lma.physio.fuel.v1` → Race Fueling, ajuda "?"). *Verificação: as saídas atuais do Physio Lab continuam idênticas após a evolução.*

---

## Casos extremos / erros a tratar
- Arquivo corrompido ou sem FC → mensagem clara, não trava; oferece anamnese.
- GPX sem RR (caso comum) → N2 indisponível com explicação (R12).
- Idade/peso fora de faixa plausível (ex.: idade 5 ou 130) → alerta de validação, pede conferência.
- α1 fornecido fora de faixa (≤0 ou >1,5) → ignora o ponto e avisa.
- LTHR > FCmax informada → alerta de inconsistência.
- `.json` de perfil de versão antiga/!= schema → importa o que reconhece, avisa o que ignorou (nunca quebra).
- Sem nenhum dado e sem anamnese → não gera número; mostra o estado guiando o próximo passo.
- Tela pequena (360px) → sem rolagem horizontal; cartão e tabelas roláveis.

## Fora de escopo (Fase 1 — NÃO fazer)
- Backend, contas, login, qualquer dado saindo do navegador.
- Cálculo de **VLamax numérico** (só leitura aeróbio×glicolítico qualitativa; número exige lactato — Fase 2).
- Cálculo de **DFA α1 a partir de RR bruto** no navegador (ingerir α1 já calculado; computar é futuro).
- **Herança ativa** do perfil pelas outras ferramentas além do handoff de combustível que já existe (Fase 3).
- Integração OAuth com Garmin/TP/Intervals (Fase 4).
- Área VIP / monetização / nuvem (registrado como visão; não construir agora).
- Ingestão automática de todo treino para a linha do tempo (é curada — R18).

## Definição de "concluído" (aceite verificável)
1. Abre em 360px mostrando a cara Nível 1 (≤4 campos) e nunca mostra tela vazia em nenhum dos 4 estados de entrada (R1, R2).
2. Gera zonas com selo de confiança correto em N1 (com e sem LTHR) e em N2 (LT2 < LT1 de confiança) (R6, R7, R10, R13).
3. Sem α1/RR, explica por que N2 não rodou (R12).
4. Cartão de Zonas sai para Garmin + TrainingPeaks + Intervals.icu, em FC/potência/pace conforme o dado, com passo a passo conferido por busca, sem inventar zona (R14, R15, R16).
5. Perfil exporta `.json`, reimporta idêntico; linha do tempo só cria entrada por ação manual, cada uma datada e ancorada (R17, R18, R19).
6. Atualizar zona exige confirmação + esforço-teste; sinal sozinho não altera (R20).
7. Um card/identidade "Pré-Temporada · FisioLab"; textos e disclaimer no lugar; zero "INSCYD" na UI; referências conferidas (R21, R22, R23).
8. Tudo que o Physio Lab já fazia continua funcionando (R24).
9. Validação com dado real: rodar com o CPET do titular (LT1 175W/114bpm, LT2 325W/151bpm) e um arquivo de prova; a saída bate com o medido dentro da margem (Etapa 4 do plano).
