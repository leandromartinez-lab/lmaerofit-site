# Spec — Race Plan (LMAeroFit) · estilo BestBikeSplit

**Origem:** auditoria do BestBikeSplit + testador-qa (sobre `race-briefing.html` + `bike-model.js`) + decisões 27/06/2026.
**Evolui** o Race Briefing; reaproveita o `bike-model.js` (Martin 1998). 100% client-side.
**NÃO começar a construir antes de aprovação.**

## Objetivo (1 frase)
Dado o percurso (GPX/FIT/TCX) + perfil (FTP, peso, CdA, Crr) + clima, distribuir a **potência de forma variável e inteligente por segmento** (mais em subida/headwind, menos em descida/tailwind), prever os **splits e o tempo**, em **dois modos de alvo** (tempo-meta → potência, ou IF/potência-alvo → tempo), com **what-if de sensibilidade**, **arquivos de execução para download** e um **veredito em português** — sempre honesto sobre a margem dos inputs.

---

## Requisitos (cada um testável)

### A. Motor de pacing variável (o coração — corrige o BLOCKER do testador-qa)
- **R1.** A potência é **variável por segmento**, não constante: sobe em rampa positiva e/ou headwind, cai em descida e/ou tailwind, dentro de limites configuráveis (default 0,70–1,20 × da potência-alvo). Reaproveita `powerAt`/`solveV`. *Verificação: num percurso com subida e descida, a potência-alvo do segmento de subida > a do segmento de descida; e a NP resultante ≈ NP-alvo (±2%).*
- **R2.** **Dois modos de alvo:** (a) **IF/potência-alvo** → calcula a distribuição e o tempo previsto; (b) **tempo-meta** → resolve por iteração a potência-alvo (NP) que atinge esse tempo, e então distribui. Os dois são consistentes: rodar (a) com a NP que (b) achou para um tempo T deve devolver ≈ T. *Verificação: ida-e-volta tempo→NP→tempo fecha em ±1%.*
- **R3.** **Saída por segmento** (tabela de splits): distância, grade, **potência-alvo (W)**, velocidade, tempo do trecho, tempo acumulado. *Verificação: a soma dos tempos de trecho = tempo total; distância acumulada = distância do curso.*
- **R4.** **Race Overview:** tempo total, **Potência Normalizada (NP)**, **Fator de Intensidade (IF)**, **Índice de Variabilidade (VI)**, **Carga (TSS)**, W/kg, trabalho (kJ), velocidade média, ganho de elevação efetivo, médias de yaw/CdA/Crr. *Verificação: NP/IF/VI/TSS conferem com a definição (NP = média móvel 30s elevada à 4ª; IF = NP/FTP; VI = NP/média; TSS = dur×I²×100). Atribuição "NP/IF/TSS são marcas da TrainingPeaks" no rodapé; UI usa nomes em português.*

### B. Inputs honestos (corrige o "garbage in")
- **R5.** **FTP herdado do FisioLab** (perfil) quando existir; senão input manual. **Sem FTP → não gera o plano de watts**, explica por quê e oferece estimar/usar o modo só-tempo. *Verificação: sem FTP, a ferramenta não inventa watts; mostra o caminho.*
- **R6.** **CdA por preset** (road tops / road drops / clip-on / TT bike), cada um com **faixa de incerteza**; **Crr por preset** (pneu/piso). Editável à mão. *Verificação: trocar o preset muda o CdA usado e o tempo; cada preset mostra a faixa.*
- **R7.** **What-if (sensibilidade):** variações de CdA, peso, Crr e potência → **Δtempo** total (e, idealmente, por segmento). *Verificação: −0,01 de CdA reduz o tempo de forma coerente e mostrada.*

### C. Robustez de dados
- **R8.** **Elevação ruidosa:** suavização robusta + **aviso** quando o ganho de elevação for implausível (ex.: > 25 m/km de média). *Verificação: GPX com ruído barométrico não gera "subidas fantasmas" e dispara o aviso quando aplicável.*
- **R9.** GPX/arquivo sem GPS ou sem elevação → mensagem clara; não quebra. *Verificação: arquivo sem coordenadas → erro tratado.*

### D. Arquivos de execução (download client-side)
- **R10.** Gerar e baixar, **com formato validado contra a spec real**: **TCX** (rota com potência por ponto), **Zwift .zwo** (workout por blocos de %FTP), **ERG (.erg)** e **MRC (.mrc)**. *Verificação: cada arquivo gerado passa por um parser/validador do formato; abre numa ferramenta compatível.* (Push OAuth = fora de escopo.)
- **R11.** Selo **"Compatível com Garmin / Wahoo / Zwift / TrainingPeaks"** com **logos oficiais dos brand kits** de cada marca, seguindo as guidelines — **nunca copiar os assets do BestBikeSplit**. *Verificação: os logos vêm do kit oficial de cada marca; nada do BBS.*

### E. Doutrina (o diferencial)
- **R12.** **Veredito em português antes do número:** ex. "largue 10–15 W abaixo no primeiro terço por causa do headwind no retorno". *Verificação: a saída traz um veredito textual acionável, não só a tabela.*
- **R13.** **Disclaimer de percepção:** a ciência aponta o plano; o dia e a sensação decidem — ajuste pelo feeling. Nota de triatlo: não estourar a IF, deixar perna pra corrida. *Verificação: o texto aparece no resultado.*

### F. Integração
- **R14.** Herda do **FisioLab** (FTP) e do **Contexto da Prova** (clima/altitude); a **duração prevista** fica disponível para a Nutrição. *Verificação: com perfil + contexto preenchidos, os campos vêm preenchidos; a duração é exportável para a Nutrição.*

---

## Casos extremos / erros a tratar
- **Tempo-meta impossível** (exige potência acima do limite plausível p/ a FTP) → avisa "tempo inatingível para a sua FTP" em vez de cuspir watts absurdos.
- Sem FTP → modo limitado + explicação (R5).
- GPX ruidoso / sem elevação / sem GPS (R8, R9).
- Descidas: velocidade limitada (cap do `solveV`, ~90 km/h) — documentar.
- Vento sem direção informada → assume 0 (headwind puro) com aviso.
- Curso muito curto (< 2 segmentos) → erro tratado.
- Potência-alvo ≤ 0 ou IF absurdo → validação.

## Fora de escopo (NÃO fazer)
- **Push OAuth** para Garmin/Wahoo/TP/Zwift (escrever na conta) — futuro VIP, exige backend.
- **AI Assistant** (chatbot do BBS).
- Copiar dados, cursos ou logos do BestBikeSplit.
- "Otimização ótima" matemática (cálculo variacional): usamos uma **heurística inteligente documentada**, não prometemos ótimo global.
- Unidades imperiais (trabalhamos em km/W/°C).
- Banco de cursos público / cursos compartilháveis por link.

## Definição de "concluído" (aceite verificável)
1. Pacing **variável** validado: subida > potência-alvo > descida; NP resultante ≈ NP-alvo ±2% (R1).
2. **Dois modos** consistentes: ida-e-volta tempo↔NP fecha ±1% (R2).
3. Tabela de splits soma corretamente (tempo e distância) (R3).
4. Overview com NP/IF/VI/TSS/kJ/W·kg corretos por definição + atribuição de marca (R4).
5. FTP herdado; sem FTP tratado; CdA/Crr por preset com incerteza; what-if responde (R5, R6, R7).
6. Elevação ruidosa tratada; arquivo inválido tratado (R8, R9).
7. TCX/.zwo/.erg/.mrc gerados e **validados contra o formato** (R10).
8. Selo "compatível com" com logos oficiais (R11).
9. Veredito + disclaimer de percepção presentes (R12, R13).
10. Herança FisioLab + Contexto + duração→Nutrição (R14).
11. **Verificado em node:** pacing variável, consistência dos dois modos, métricas (NP/IF/VI/TSS), e validação de pelo menos um arquivo de execução.
