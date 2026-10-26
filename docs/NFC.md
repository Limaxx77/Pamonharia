# Cartões NFC — configuração e gravação

## Como funciona

Cada comanda (ex.: **025**) tem um cartão com um **link secreto** gravado:

```
https://seu-dominio.com.br/c/Wjuud8ug2P7g7pVC_qoPIsv7t_ObxlDb
                              └──────── token aleatório de 192 bits ────────┘
```

O celular lê o link e abre o navegador; o sistema identifica a comanda **pelo token da URL**. O navegador não precisa (e não consegue, no iPhone) ler o identificador físico do chip. O número 025 aparece na tela, mas **nunca serve como autorização**: sem o token não há acesso.

## Material

- Tags **NTAG213** (144 bytes, suficiente para o link) ou **NTAG215/216**, no formato cartão PVC, chaveiro ou adesivo.
- Um celular com NFC para gravar: Android (recomendado) ou iPhone XS ou mais novo.
- App de gravação gratuito: **NFC Tools** (Android/iOS).
- Opcional: impressão do número da comanda e do **QR Code** no cartão, como alternativa para aparelhos sem NFC.

## Passo a passo da gravação

1. No sistema, entre como administrador → **Cartões NFC**.
2. Toque na comanda → **copiar URL** (ou “Testar link” para conferir que abre o cardápio da comanda certa).
3. No NFC Tools: **Gravar → Adicionar um registro → URL/URI** → cole o link inteiro (com `https://`).
4. **Gravar** e encoste o cartão no celular.
5. Confira: com a tela do celular desbloqueada, aproxime o cartão — deve abrir a comanda.
6. Recomendado depois de testar: **Outras → Bloquear tag** (deixa a tag somente leitura, evita que alguém regrave o cartão com outro link). É irreversível: se precisar trocar o link, use um cartão novo.
7. Baixe o **QR Code** na mesma tela e imprima no verso do cartão.

Para cadastrar várias comandas de uma vez: **Cadastrar comandas** → informe um intervalo (ex.: 31 a 60).

## Como o cliente usa

- **iPhone (XS em diante):** a leitura de NFC fica sempre ativa; aproximar a **parte de cima** do aparelho mostra uma notificação para abrir o link.
- **Android:** o NFC precisa estar ligado (Configurações → Conexões → NFC); aproximar o **meio das costas** do aparelho com a tela desbloqueada abre o navegador.
- **Sem NFC:** ler o QR Code com a câmera.

## Ciclo de vida da comanda

1. **Abertura:** um funcionário abre a comanda (garçom/caixa → “Abrir comanda”, informando número e mesa). Se em **Configurações** a opção “Cliente inicia o atendimento pelo cartão” estiver ligada, o próprio cliente pode iniciar ao aproximar o celular de uma comanda livre.
2. **Pedidos:** pelo cartão ou pelo garçom, sempre no mesmo atendimento.
3. **Fechamento:** ao quitar no caixa, o atendimento é fechado e não aceita mais pedidos.
4. **Reutilização:** o mesmo cartão é entregue ao próximo cliente; um **novo atendimento** é aberto, começando zerado. O anterior continua no histórico.

## Gestão de cartões

| Situação | Ação no sistema |
|---|---|
| Cartão sumiu, pode aparecer | **Perdido** (link para de funcionar) → **Reativar** se for encontrado |
| Bloqueio temporário | **Bloquear** / **Reativar** |
| Link vazou ou foi fotografado | **Revogar link** (definitivo) e **Reemitir** |
| Cartão danificado / substituição | **Reemitir** → grave o novo link em um cartão novo |

Reemitir gera um token novo e revoga automaticamente todos os anteriores daquela comanda. O histórico (cartões emitidos, atendimentos e auditoria) fica em **Ver histórico**.

## Segurança

O que o sistema garante:

- Token aleatório de 192 bits por cartão — não dá para adivinhar ou enumerar (o número da comanda não autoriza nada).
- Cartão bloqueado, perdido ou revogado não abre a comanda nem envia pedidos (validação no servidor a cada requisição).
- Atendimento fechado nunca recebe pedidos (verificado dentro da transação, com bloqueio da linha).
- O aparelho envia o id do atendimento que está vendo: um carrinho montado num atendimento antigo **não** é lançado no atendimento do próximo cliente (`SESSION_CHANGED`).
- O próximo cliente não vê o consumo do anterior (atendimentos fechados só aparecem, por até 2 h, para o aparelho que os acompanhou).
- O cliente não vê nomes de funcionários nem dados internos; limites de requisição por IP.

Limitação inerente a cartões de link fixo: **quem tiver o cartão em mãos pode copiar o link** (ler com um app e guardar). Mitigações adotadas:

- deixe “Cliente inicia o atendimento pelo cartão” **desligado** em produção: um link copiado não abre atendimento sozinho, e só funciona enquanto aquela comanda estiver aberta;
- recolha o cartão no pagamento e monitore “Último acesso” em **Cartões NFC**;
- em caso de suspeita, **Revogar link** + **Reemitir**.

Evolução possível para eliminar a cópia: tags **NTAG 424 DNA** com **SUN/SDM**, que geram uma assinatura nova (contador + CMAC) a cada leitura. O backend validaria a assinatura com a chave do cartão; a rota `/c/:token` e o modelo `nfc_cards` já isolam esse ponto. Não implementado nesta versão.
