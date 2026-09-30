# Image to Drive & Photos

Extensão para Google Chrome (Manifest V3) que permite salvar imagens da web, capturas de área da tela e páginas completas em PDF diretamente no Google Drive e Google Fotos através do menu de contexto.

---

## Funcionalidades

- **Salvar Imagens:** Envio de imagens da web diretamente para o Google Drive ou Google Fotos com clique direito.
- **Captura de Área (Screenshot):** Seleção retangular na tela e upload da área recortada para o Drive ou Fotos.
- **Página em PDF:** Conversão da página ativa para PDF vetorial via motor nativo do Chrome e envio direto para o Google Drive.
- **Conversão de Formatos:** Conversão sob demanda de formatos como .webp e .avif para .jpg ou .png com ajuste de qualidade.
- **Proteção de Privacidade (Remoção de EXIF):** Limpeza automática de dados de localização GPS, câmera e aparelho antes do upload.
- **Templates de Nomenclatura:** Formatação de nomes de arquivo usando variáveis dinâmicas ({data}, {hora}, {dominio}, {nome_original}).
- **Menu Popup de Configurações:** Painel acessível na barra de ferramentas com prévia em tempo real das preferências.
- **Notificações:** Alertas nativos do sistema na conclusão ou em caso de erro.

---

## Privacidade e Custo

- **100% Gratuito:** Utiliza os limites gratuitos padrão da Google Cloud e das APIs do Google Workspace.
- **100% Client-Side:** Todo o processamento (download, recorte de imagem, autenticação e envio) ocorre localmente no navegador.
- **Sem Servidores Intermediários:** Nenhum dado trafega por servidores de terceiros. A comunicação é feita exclusivamente entre o navegador e as APIs oficiais do Google.
- **Sem Coleta de Dados:** A extensão não coleta telemetria, histórico de navegação ou dados pessoais.

---

## Pré-requisitos

- Navegador baseado em Chromium (Google Chrome, Brave, Microsoft Edge, Opera, etc.).
- Conta Google para autenticação e armazenamento.

---

## Instalação e Configuração

### 1. Carregar a Extensão no Chrome
1. Acesse `chrome://extensions/` no navegador.
2. Ative a opção **Modo do desenvolvedor** no canto superior direito.
3. Clique em **Carregar sem compactação** e selecione a pasta do projeto.
4. O ID fixo da extensão é:
   ```text
   booffnodchmodccjjjeoolhhknbmdcnf
   ```

### 2. Configurar Credenciais no Google Cloud Console
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie ou selecione um projeto.
3. Em **APIs e Serviços > Biblioteca**, ative:
   - **Google Drive API**
   - **Photos Library API**
4. Em **APIs e Serviços > Tela de consentimento OAuth**:
   - Selecione o tipo **Externo** e preencha as informações básicas.
   - Na etapa **Usuários de teste**, adicione o seu próprio e-mail do Google.
5. Em **APIs e Serviços > Credenciais > Criar credenciais > ID do cliente OAuth**:
   - Tipo de aplicativo: **Extensão do Chrome**.
   - Nome: `Image to Drive & Photos`.
   - ID do item: `booffnodchmodccjjjeoolhhknbmdcnf`.
   - Clique em **Criar**.
6. Copie o **ID do cliente** gerado.

### 3. Configurar o manifest.json
1. Abra o arquivo `manifest.json`.
2. Cole o seu ID do cliente no campo `client_id`:
   ```json
   "oauth2": {
     "client_id": "SEU_CLIENT_ID_AQUI.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/drive.file",
       "https://www.googleapis.com/auth/photoslibrary.appendonly"
     ]
   }
   ```
3. Salve o arquivo.
4. Volte em `chrome://extensions/` e clique no botão de recarregar da extensão.

---

## Como Usar

- **Imagens:** Clique com o botão direito em uma imagem e selecione **Salvar no Drive** ou **Salvar no Fotos**.
- **Captura de Tela:** Clique com o botão direito na página, selecione **Capturar área > Drive** ou **Fotos**, arraste para definir o retângulo e solte.
- **Página em PDF:** Clique com o botão direito na página e selecione **Salvar como PDF**.

> Nota: No primeiro uso, o Chrome abrirá uma janela solicitando autorização para conectar a sua conta Google.

---

## Licença

Este projeto é distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.
